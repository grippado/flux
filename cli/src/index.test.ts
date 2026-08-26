import { describe, it, expect, afterEach } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildRemoteSshArgv } from "./launch.ts";
import { promptForRepo } from "./index.ts";

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
