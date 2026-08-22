import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveFluxRootHeuristic } from "./resolve.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "flux-heuristic-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeVersionDir(base: string, version: string): string {
  const p = join(base, "plugins", "cache", "flux", "flux", version);
  mkdirSync(p, { recursive: true });
  return p;
}

describe("heuristicaMultiConta: maior versao entre todas as bases", () => {
  it("escolhe a maior versao entre .claude e .claude-personal", () => {
    const claudeBase = join(tmpDir, ".claude");
    const claudePersonalBase = join(tmpDir, ".claude-personal");
    makeVersionDir(claudeBase, "1.23.1");
    makeVersionDir(claudePersonalBase, "1.23.2");

    const result = resolveFluxRootHeuristic(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.root).toContain("1.23.2");
    expect(result!.root).toContain(".claude-personal");
  });

  it("retorna a versao de .claude quando e a maior", () => {
    const claudeBase = join(tmpDir, ".claude");
    const claudePersonalBase = join(tmpDir, ".claude-personal");
    makeVersionDir(claudeBase, "2.0.0");
    makeVersionDir(claudePersonalBase, "1.99.9");

    const result = resolveFluxRootHeuristic(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.root).toContain("2.0.0");
  });

  it("retorna null quando nenhuma base existe", () => {
    const isolated = mkdtempSync(join(tmpdir(), "flux-empty-"));
    try {
      expect(resolveFluxRootHeuristic(isolated)).toBeNull();
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("ignora entradas que nao sao versao semver valida", () => {
    const claudeBase = join(tmpDir, ".claude");
    makeVersionDir(claudeBase, "1.2.3");
    mkdirSync(join(claudeBase, "plugins", "cache", "flux", "flux", "nao-versao"), { recursive: true });
    mkdirSync(join(claudeBase, "plugins", "cache", "flux", "flux", "1.2"), { recursive: true });

    const result = resolveFluxRootHeuristic(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.root).toContain("1.2.3");
  });

  it("combina patch de bases diferentes corretamente", () => {
    makeVersionDir(join(tmpDir, ".claude"), "1.0.0");
    makeVersionDir(join(tmpDir, ".claude-work"), "1.0.1");
    makeVersionDir(join(tmpDir, ".claude-personal"), "1.0.2");

    const result = resolveFluxRootHeuristic(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.root).toContain("1.0.2");
  });
});
