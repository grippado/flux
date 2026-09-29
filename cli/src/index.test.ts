import { describe, it, expect, afterEach } from "bun:test";
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildRemoteSshArgv } from "./launch.ts";
import { promptForRepo, runWizard, interpretMenuKey, reviewBanner } from "./index.ts";
import { generateSessionId, readSessionFile, sessionFilePath, sessionsDir, writeSessionFile } from "./session.ts";

function runCli(args: string[], extraEnv: Record<string, string> = {}): { stdout: string; stderr: string; status: number } {
  const dir = mkdtempSync(join(tmpdir(), "flux-cli-test-"));
  const result = spawnSync("bun", ["run", join(import.meta.dir, "index.ts"), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status ?? 1 };
}

describe("flux --remote --dry: reencaminha o comando sem levar --dry/--remote/--new junto", () => {
  it("--remote combinado com --dry imprime o comando ssh esperado (--here nao e mais forcado, e um no-op)", () => {
    const dir = mkdtempSync(join(tmpdir(), "flux-remote-dry-"));
    const out = execFileSync(
      "bun",
      ["run", join(import.meta.dir, "index.ts"), "peek", "--repo", "flux", "--remote", "personal", "--dry"],
      { cwd: dir, encoding: "utf8" },
    ).trim();

    const expected = buildRemoteSshArgv("personal", ["peek", "--repo", "flux"]).join(" ");
    expect(out).toBe(expected);
  });

  it("--new e descartado ao reencaminhar (abrir aba nova nao faz sentido sobre ssh)", () => {
    const dir = mkdtempSync(join(tmpdir(), "flux-remote-dry-"));
    const out = execFileSync(
      "bun",
      ["run", join(import.meta.dir, "index.ts"), "peek", "--repo", "flux", "--new", "--remote", "arco", "--dry"],
      { cwd: dir, encoding: "utf8" },
    ).trim();

    const expected = buildRemoteSshArgv("arco", ["peek", "--repo", "flux"]).join(" ");
    expect(out).toBe(expected);
  });
});

describe("promptForRepo: fallback interativo quando falta --repo", () => {
  const origIsTTY = process.stdin.isTTY;
  const origPrompt = globalThis.prompt;

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    globalThis.prompt = origPrompt;
  });

  it("sem TTY (ex.: CI, pipe): retorna null sem perguntar nada", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    let called = false;
    globalThis.prompt = (() => { called = true; return "flux"; }) as typeof prompt;
    expect(promptForRepo("teste")).toBeNull();
    expect(called).toBe(false);
  });

  it("com TTY e resposta valida: retorna o slug sem espacos nas pontas", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    globalThis.prompt = (() => "  flux  ") as typeof prompt;
    expect(promptForRepo("teste")).toBe("flux");
  });

  it("com TTY e resposta vazia/cancelada: retorna null", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    globalThis.prompt = (() => null) as typeof prompt;
    expect(promptForRepo("teste")).toBeNull();
  });
});

describe("runWizard: flux sem argumentos monta o argv equivalente", () => {
  const origPrompt = globalThis.prompt;

  afterEach(() => {
    globalThis.prompt = origPrompt;
  });

  function queuePrompts(answers: (string | null)[]): void {
    let i = 0;
    globalThis.prompt = (() => (i < answers.length ? answers[i++]! : null)) as typeof prompt;
  }

  it("verbo escolhido no menu + alvo + repo, remoto recusado: monta [verbo, alvo, --repo, slug]", async () => {
    queuePrompts(["123", "flux", "n"]);
    const argv = await runWizard({ selectVerb: async () => "peek" });
    expect(argv).toEqual(["peek", "123", "--repo", "flux"]);
  });

  it("alvo/repo em branco: monta so [verbo]", async () => {
    queuePrompts(["", "", "n"]);
    const argv = await runWizard({ selectVerb: async () => "peek" });
    expect(argv).toEqual(["peek"]);
  });

  it("menu cancelado (Esc/Ctrl+C): retorna null sem perguntar mais nada", async () => {
    let promptCalled = false;
    globalThis.prompt = (() => { promptCalled = true; return ""; }) as typeof prompt;
    const argv = await runWizard({ selectVerb: async () => null });
    expect(argv).toBeNull();
    expect(promptCalled).toBe(false);
  });
});

describe("interpretMenuKey: parser puro de tecla do menu interativo", () => {
  it("seta pra cima/baixo (ou j/k)", () => {
    expect(interpretMenuKey("\x1b[A", 5)).toEqual({ type: "up" });
    expect(interpretMenuKey("k", 5)).toEqual({ type: "up" });
    expect(interpretMenuKey("\x1b[B", 5)).toEqual({ type: "down" });
    expect(interpretMenuKey("j", 5)).toEqual({ type: "down" });
  });

  it("Enter/retorno confirma a selecao atual", () => {
    expect(interpretMenuKey("\r", 5)).toEqual({ type: "confirm" });
    expect(interpretMenuKey("\n", 5)).toEqual({ type: "confirm" });
  });

  it("Esc e Ctrl+C cancelam", () => {
    expect(interpretMenuKey("\x1b", 5)).toEqual({ type: "cancel" });
    expect(interpretMenuKey("\x03", 5)).toEqual({ type: "cancel" });
  });

  it("digito dentro do range pula direto pro item (0-based)", () => {
    expect(interpretMenuKey("1", 5)).toEqual({ type: "jump", index: 0 });
    expect(interpretMenuKey("5", 5)).toEqual({ type: "jump", index: 4 });
  });

  it("digito fora do range e qualquer outra tecla: ignora", () => {
    expect(interpretMenuKey("0", 5)).toEqual({ type: "ignore" });
    expect(interpretMenuKey("6", 5)).toEqual({ type: "ignore" });
    expect(interpretMenuKey("a", 5)).toEqual({ type: "ignore" });
  });
});

describe("reviewBanner: previa do banner antes de disparar o Claude Code", () => {
  const origPrompt = globalThis.prompt;

  afterEach(() => {
    globalThis.prompt = origPrompt;
  });

  it("escolha 'send': retorna { type: 'send' } sem chamar prompt() de texto", async () => {
    let promptCalled = false;
    globalThis.prompt = (() => { promptCalled = true; return "nunca deveria chamar"; }) as typeof prompt;
    const result = await reviewBanner("--- corpo do banner ---", { selectChoice: async () => "send" });
    expect(result).toEqual({ type: "send" });
    expect(promptCalled).toBe(false);
  });

  it("escolha 'comment': pergunta o texto e retorna { type: 'comment', text }", async () => {
    globalThis.prompt = (() => "adiciona um teste unitário pra isso também") as typeof prompt;
    const result = await reviewBanner("--- corpo ---", { selectChoice: async () => "comment" });
    expect(result).toEqual({ type: "comment", text: "adiciona um teste unitário pra isso também" });
  });

  it("escolha 'cancel' (ou menu cancelado com Esc/Ctrl+C, que retorna null): retorna { type: 'cancel' }", async () => {
    const asCancel = await reviewBanner("--- corpo ---", { selectChoice: async () => "cancel" });
    expect(asCancel).toEqual({ type: "cancel" });

    const asEsc = await reviewBanner("--- corpo ---", { selectChoice: async () => null });
    expect(asEsc).toEqual({ type: "cancel" });
  });
});

describe("flux session end: subcomando idempotente contra o estado real em ~/.flux/sessions", () => {
  const createdIds: string[] = [];

  afterEach(() => {
    for (const id of createdIds.splice(0)) {
      rmSync(sessionFilePath(id), { force: true });
    }
  });

  it("id via argumento: marca ended e sai com exit 0", () => {
    const id = generateSessionId();
    createdIds.push(id);
    writeSessionFile({ sessionId: id, verb: "peek", pid: 1, terminalApp: null, startedAt: new Date().toISOString(), status: "running" });

    const result = runCli(["session", "end", id]);
    expect(result.status).toBe(0);
    expect(readSessionFile(id)?.status).toBe("ended");
  });

  it("id via FLUX_SESSION_ID do ambiente: marca ended e sai com exit 0", () => {
    const id = generateSessionId();
    createdIds.push(id);
    writeSessionFile({ sessionId: id, verb: "reply", pid: 2, terminalApp: null, startedAt: new Date().toISOString(), status: "running" });

    const result = runCli(["session", "end"], { FLUX_SESSION_ID: id });
    expect(result.status).toBe(0);
    expect(readSessionFile(id)?.status).toBe("ended");
  });

  it("sem id nenhum (nem argumento nem ambiente): exit 2 com uso", () => {
    const { FLUX_SESSION_ID: _dropped, ...cleanEnv } = process.env;
    const dir = mkdtempSync(join(tmpdir(), "flux-cli-test-"));
    const result = spawnSync("bun", ["run", join(import.meta.dir, "index.ts"), "session", "end"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...cleanEnv },
    });
    expect(result.status).toBe(2);
    expect(result.stderr ?? "").toContain("Uso: flux session end");
  });

  it("id valido mas sem sessao correspondente: idempotente, exit 0", () => {
    const id = generateSessionId();
    const result = runCli(["session", "end", id]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("não encontrada");
  });
});

describe("flux --dry: nunca aciona a previa do banner (reviewBanner), mesmo com TTY", () => {
  it("--dry imprime o comando e retorna sem chamar prompt()", () => {
    const dir = mkdtempSync(join(tmpdir(), "flux-dry-no-review-"));
    const { FLUX_CLAUDE_CMD: _dropped, ...cleanEnv } = process.env;
    const out = execFileSync(
      "bun",
      ["run", join(import.meta.dir, "index.ts"), "peek", "--repo", "flux", "--dry", "--harness", "claude"],
      { cwd: dir, encoding: "utf8", input: "", env: { ...cleanEnv } },
    );
    expect(out).toContain("/flux:peek --repo flux");
  });
});
