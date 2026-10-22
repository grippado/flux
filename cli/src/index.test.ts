import { describe, it, expect, afterEach } from "bun:test";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildRemoteSshArgv } from "./launch.ts";
import { promptForRepo, runWizard, interpretMenuKey, reviewBanner } from "./index.ts";
import { generateSessionId, isValidSessionId, readSessionFile, writeSessionFile } from "./session.ts";

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

describe("flux session end: subcomando idempotente contra o estado em ~/.flux/sessions (HOME isolado)", () => {
  const tmpHomes: string[] = [];

  function makeHome(): { home: string; dir: string } {
    const home = mkdtempSync(join(tmpdir(), "flux-cli-home-"));
    tmpHomes.push(home);
    return { home, dir: join(home, ".flux", "sessions") };
  }

  afterEach(() => {
    for (const home of tmpHomes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("id via argumento: marca ended e sai com exit 0", () => {
    const { home, dir } = makeHome();
    const id = generateSessionId();
    writeSessionFile({ sessionId: id, verb: "peek", pid: 1, terminalApp: null, startedAt: new Date().toISOString(), status: "running" }, dir);

    const result = runCli(["session", "end", id], { HOME: home });
    expect(result.status).toBe(0);
    expect(readSessionFile(id, dir)?.status).toBe("ended");
  });

  it("id via FLUX_SESSION_ID do ambiente: marca ended e sai com exit 0", () => {
    const { home, dir } = makeHome();
    const id = generateSessionId();
    writeSessionFile({ sessionId: id, verb: "reply", pid: 2, terminalApp: null, startedAt: new Date().toISOString(), status: "running" }, dir);

    const result = runCli(["session", "end"], { HOME: home, FLUX_SESSION_ID: id });
    expect(result.status).toBe(0);
    expect(readSessionFile(id, dir)?.status).toBe("ended");
  });

  it("sem id nenhum (nem argumento nem ambiente): exit 2 com uso", () => {
    const { home } = makeHome();
    const { FLUX_SESSION_ID: _dropped, ...cleanEnv } = process.env;
    const dir = mkdtempSync(join(tmpdir(), "flux-cli-test-"));
    const result = spawnSync("bun", ["run", join(import.meta.dir, "index.ts"), "session", "end"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...cleanEnv, HOME: home },
    });
    expect(result.status).toBe(2);
    expect(result.stderr ?? "").toContain("Uso: flux session end");
  });

  it("id valido mas sem sessao correspondente: idempotente, exit 0", () => {
    const { home } = makeHome();
    const result = runCli(["session", "end", generateSessionId()], { HOME: home });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("não encontrada");
  });

  it("id malformado: imprime o uso e sai com exit 2, sem stack trace", () => {
    const { home } = makeHome();
    const result = runCli(["session", "end", "../etc/passwd"], { HOME: home });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("sessionId inválido");
    expect(result.stderr).toContain("Uso: flux session end");
    expect(result.stderr).not.toContain("    at ");
  });
});

describe("isValidSessionId", () => {
  it("aceita o formato gerado e rejeita o resto", () => {
    expect(isValidSessionId(generateSessionId())).toBe(true);
    expect(isValidSessionId("abc")).toBe(false);
    expect(isValidSessionId("")).toBe(false);
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

describe("flux resume <uuid>", () => {
  const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function resumeEnv(): { env: Record<string, string>; marker: string; home: string } {
    const root = mkdtempSync(join(tmpdir(), "flux-resume-"));
    tmpDirs.push(root);
    const home = join(root, "home");
    const bin = join(root, "bin");
    mkdirSync(home);
    mkdirSync(bin);
    const marker = join(root, "spawned");
    const fakeShell = join(root, "fake-shell");
    writeFileSync(fakeShell, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(marker)}\nexit "\${FAKE_EXIT:-0}"\n`, { mode: 0o755 });
    writeFileSync(join(bin, "claude"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    return {
      env: {
        HOME: home,
        SHELL: fakeShell,
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        FLUX_CLAUDE_CMD: "",
        FLUX_HARNESS: "",
      },
      marker,
      home,
    };
  }

  it("--dry: stdout só com a linha (bypass, --resume, --fork-session, sem /flux:), aviso no stderr, exit 0, sem spawn", () => {
    const { env, marker } = resumeEnv();
    const r = runCli(["resume", uuid, "--repo", "flux", "--dry"], env);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(`claude --dangerously-skip-permissions --resume '${uuid}' --fork-session`);
    expect(r.stdout).not.toContain("/flux:");
    expect(r.stderr).toContain(`[flux] retomando a sessão ${uuid} como fork (--fork-session)`);
    expect(existsSync(marker)).toBe(false);
  });

  it("--dry --safe: tira o bypass", () => {
    const { env } = resumeEnv();
    const r = runCli(["resume", uuid, "--dry", "--safe"], env);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(`claude --resume '${uuid}' --fork-session`);
  });

  it("FLUX_CLAUDE_CMD=wrapper: a linha começa pelo override e termina nos argumentos de resume", () => {
    const { env } = resumeEnv();
    const r = runCli(["resume", uuid, "--dry"], { ...env, FLUX_CLAUDE_CMD: "wrapper" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(`wrapper --resume '${uuid}' --fork-session`);
  });

  it("uuid malformado sai != 0 sem spawn", () => {
    for (const bad of [uuid.slice(0, -1), `${uuid}x`, "-x", "nao-uuid"]) {
      const { env, marker } = resumeEnv();
      const r = runCli(["resume", bad], env);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("id de sessão inválido");
      expect(existsSync(marker)).toBe(false);
    }
  });

  it("--help e ausência de uuid saem 2 com o uso, sem spawn", () => {
    for (const args of [["resume"], ["resume", "--help"], ["resume", uuid, "extra"]]) {
      const { env, marker } = resumeEnv();
      const r = runCli(args, env);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("Uso: flux resume <uuid>");
      expect(existsSync(marker)).toBe(false);
    }
  });

  it("--harness cursor e codex saem 1 com mensagem e sem spawn", () => {
    for (const h of ["cursor", "codex"]) {
      const { env, marker } = resumeEnv();
      const r = runCli(["resume", uuid, "--harness", h], env);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`[flux] resume só existe no harness claude (resolvido: ${h}).`);
      expect(existsSync(marker)).toBe(false);
    }
  });

  it("--remote, --new e --record saem 1 com a mensagem de cada um, sem spawn", () => {
    const cases: [string[], string][] = [
      [["--remote", "personal"], "[flux] resume não suporta --remote: a sessão mora no config dir desta máquina."],
      [["--remote"], "[flux] resume não suporta --remote: a sessão mora no config dir desta máquina."],
      [["--new"], "[flux] resume não suporta --new: roda sempre na aba atual."],
      [["--record"], '[flux] --record só vale em "flux review <PR>" (recebido: "resume").'],
    ];
    for (const [args, message] of cases) {
      const { env, marker } = resumeEnv();
      const r = runCli(["resume", uuid, ...args], env);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(message);
      expect(existsSync(marker)).toBe(false);
    }
  });

  it("FLUX_HARNESS=cursor sem --harness sai 1 com a recusa de harness, sem spawn", () => {
    const { env, marker } = resumeEnv();
    const r = runCli(["resume", uuid], { ...env, FLUX_HARNESS: "cursor" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("[flux] resume só existe no harness claude (resolvido: cursor).");
    expect(existsSync(marker)).toBe(false);
  });

  it("FLUX_CLAUDE_CMD com metacaractere de shell e --dry sai 1 sem imprimir a linha", () => {
    const { env, marker } = resumeEnv();
    const r = runCli(["resume", uuid, "--dry"], { ...env, FLUX_CLAUDE_CMD: "x; y" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("metacaractere de shell não permitido");
    expect(r.stdout).toBe("");
    expect(existsSync(marker)).toBe(false);
  });

  it("binário claude ausente no PATH sai 1 sem spawn", () => {
    const { env, marker } = resumeEnv();
    const onlyBun = mkdtempSync(join(tmpdir(), "flux-resume-path-"));
    tmpDirs.push(onlyBun);
    symlinkSync(process.execPath, join(onlyBun, "bun"));
    const r = runCli(["resume", uuid], { ...env, PATH: `${onlyBun}:/usr/bin:/bin` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("claude não encontrado no PATH");
    expect(existsSync(marker)).toBe(false);
  });

  it("spawn real: [$SHELL, -i, -c, linha], exit do filho repassado, aviso com e sem --yes, nada em ~/.flux/sessions", () => {
    for (const [code, extra] of [["0", []], ["1", ["--yes"]], ["7", ["-y"]]] as const) {
      const { env, marker, home } = resumeEnv();
      const r = runCli(["resume", uuid, ...extra], { ...env, FAKE_EXIT: code });
      expect(r.status).toBe(Number(code));
      expect(r.stderr).toContain(`[flux] retomando a sessão ${uuid} como fork (--fork-session)`);
      expect(readFileSync(marker, "utf8").split("\n").filter(Boolean)).toEqual([
        "-i",
        "-c",
        `claude --dangerously-skip-permissions --resume '${uuid}' --fork-session`,
      ]);
      const sessions = join(home, ".flux", "sessions");
      expect(existsSync(sessions) ? readdirSync(sessions) : []).toEqual([]);
    }
  });
});
