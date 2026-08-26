import { describe, it, expect, afterEach } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildRemoteSshArgv } from "./launch.ts";
import { promptForRepo, runWizard } from "./index.ts";

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

  it("verbo por numero + alvo + repo, remoto recusado: monta [verbo, alvo, --repo, slug]", async () => {
    queuePrompts(["5", "123", "flux", "n"]);
    const argv = await runWizard();
    expect(argv).toEqual(["peek", "123", "--repo", "flux"]);
  });

  it("verbo por nome, alvo/repo em branco: monta so [verbo]", async () => {
    queuePrompts(["peek", "", "", "n"]);
    const argv = await runWizard();
    expect(argv).toEqual(["peek"]);
  });

  it("verbo invalido seguido de cancelamento (Enter em branco): retorna null", async () => {
    queuePrompts(["nao-existe", ""]);
    const argv = await runWizard();
    expect(argv).toBeNull();
  });

  it("cancelado de cara (Enter em branco no primeiro prompt): retorna null", async () => {
    queuePrompts([""]);
    const argv = await runWizard();
    expect(argv).toBeNull();
  });
});
