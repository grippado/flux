import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveContext } from "./resolve.ts";
import { buildPrompt } from "./prompt.ts";
import { SUPPORTED_VERBS, TICKET_PATTERN, LINEAR_URL_PATTERN } from "./index.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "flux-cli-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeGitRepo(base: string, name: string): string {
  const repoDir = join(base, name);
  mkdirSync(join(repoDir, ".git"), { recursive: true });
  return repoDir;
}

function makeManifest(dir: string, configDir: ".claude" | ".cursor", content: object): void {
  const d = join(dir, configDir);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "flux-context.json"), JSON.stringify(content));
}

describe("resolve: ancora por path", () => {
  it("usa path existente como ancora", async () => {
    const repoDir = makeGitRepo(tmpDir, "meu-repo");
    makeManifest(tmpDir, ".claude", { name: "workspace-ctx", workspace_root: tmpDir });

    const ctx = await resolveContext({
      targetPath: repoDir,
      cwd: tmpDir,
    });

    expect(ctx.anchor).toBe(repoDir);
  });

  it("usa cwd como ancora quando path nao existe", async () => {
    makeManifest(tmpDir, ".claude", { name: "ctx" });

    const ctx = await resolveContext({
      targetPath: null,
      cwd: tmpDir,
    });

    expect(ctx.anchor).toBe(tmpDir);
  });

  it("deriva o slug do basename da ancora quando --repo esta ausente", async () => {
    const repoDir = makeGitRepo(tmpDir, "meu-repo");
    const specialistsBase = join(tmpDir, "agents");
    const specialistsDir = join(specialistsBase, "meu-repo");
    mkdirSync(specialistsDir, { recursive: true });
    writeFileSync(join(specialistsDir, "repo-owner.md"), "persona");
    makeManifest(tmpDir, ".claude", {
      name: "workspace-ctx",
      workspace_root: tmpDir,
      specialists_root: join(specialistsBase, "{repo}", "repo-owner.md"),
    });

    const ctx = await resolveContext({
      targetPath: repoDir,
      cwd: tmpDir,
    });

    expect(ctx.lenses.l2_paths.length).toBeGreaterThan(0);
    expect(ctx.lenses.l2_paths[0]).toContain("meu-repo");
  });

  it("nao deriva slug quando a ancora nao e repo git", async () => {
    makeManifest(tmpDir, ".claude", {
      name: "ctx",
      specialists_root: join(tmpDir, "agents", "{repo}", "repo-owner.md"),
    });

    const ctx = await resolveContext({ targetPath: null, cwd: tmpDir });

    expect(ctx.lenses.l2_paths).toEqual([]);
  });
});

describe("resolve: .claude vence .cursor no mesmo nivel", () => {
  it("prefere .claude sobre .cursor", async () => {
    makeManifest(tmpDir, ".claude", { name: "claude-ctx" });
    makeManifest(tmpDir, ".cursor", { name: "cursor-ctx" });

    const ctx = await resolveContext({ cwd: tmpDir });

    expect(ctx.profile).toBe("claude-ctx");
    expect(ctx.manifest_path).toContain(".claude");
  });
});

describe("resolve: perfil generico sem manifesto", () => {
  it("retorna perfil generico quando nao ha manifesto", async () => {
    const isolatedDir = mkdtempSync(join(tmpdir(), "flux-isolated-"));
    try {
      const ctx = await resolveContext({ cwd: isolatedDir });
      expect(ctx.profile).toBe("generico");
      expect(ctx.manifest_path).toBeNull();
      expect(ctx.exec_command).toBe("workflow");
      expect(ctx.exec_fallback).toBeNull();
    } finally {
      rmSync(isolatedDir, { recursive: true, force: true });
    }
  });
});

describe("resolve: manifesto malformado nao aborta", () => {
  it("declara warning e usa generico quando manifesto e invalido", async () => {
    const d = join(tmpDir, ".claude");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "flux-context.json"), "{ invalid json !!!!");

    const ctx = await resolveContext({ cwd: tmpDir });

    expect(ctx.profile).toBe("generico");
    expect(ctx.warnings.length).toBeGreaterThan(0);
    expect(ctx.warnings[0]).toMatch(/malformado/);
    expect(ctx.warnings[0]).toContain("flux-context.json");
  });

  it("declara warning e usa generico quando manifesto nao e objeto", async () => {
    const d = join(tmpDir, ".claude");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "flux-context.json"), '"apenas uma string"');

    const ctx = await resolveContext({ cwd: tmpDir });

    expect(ctx.profile).toBe("generico");
    expect(ctx.warnings.some((w) => w.includes("malformado"))).toBe(true);
  });
});

describe("resolve: shape do JSON --json", () => {
  it("retorna todas as chaves exigidas", async () => {
    makeManifest(tmpDir, ".claude", {
      name: "test-ctx",
      exec_command: "workflow",
      exec_fallback: "core:implement-task",
    });

    const ctx = await resolveContext({ cwd: tmpDir });

    const keys: (keyof typeof ctx)[] = [
      "profile",
      "manifest_path",
      "anchor",
      "flux_root",
      "flux_root_source",
      "exec_command",
      "exec_fallback",
      "lenses",
      "warnings",
    ];

    for (const key of keys) {
      expect(ctx).toHaveProperty(key);
    }
    expect(ctx.lenses).toHaveProperty("l2_paths");
    expect(ctx.lenses).toHaveProperty("l3_paths");
    expect(Array.isArray(ctx.lenses.l2_paths)).toBe(true);
    expect(Array.isArray(ctx.lenses.l3_paths)).toBe(true);
    expect(Array.isArray(ctx.warnings)).toBe(true);
  });
});

describe("prompt: contem frase advisory e escape de aspas", () => {
  it("contem a frase advisory obrigatoria", async () => {
    const ctx = await resolveContext({ cwd: tmpDir });
    const cmd = buildPrompt(ctx, "review", "meu-repo");

    expect(cmd).toContain("ADVISORY");
    expect(cmd).toContain("revalida barato");
  });

  it("escapa aspas duplas no argv", async () => {
    const ctx = await resolveContext({ cwd: tmpDir });
    const cmd = buildPrompt(ctx, "review", 'arg "com aspas"');

    expect(cmd).toContain('\\"com aspas\\"');
    expect(cmd.startsWith('claude "')).toBe(true);
  });

  it("escapa subshell $(...) no argv", async () => {
    const ctx = await resolveContext({ cwd: tmpDir });
    const cmd = buildPrompt(ctx, "review", "$(rm -rf /)");

    expect(cmd).toContain("\\$(");
  });

  it("escapa backtick no argv", async () => {
    const ctx = await resolveContext({ cwd: tmpDir });
    const cmd = buildPrompt(ctx, "review", "`id`");

    expect(cmd).toContain("\\`");
  });

  it("escapa backslash no argv", async () => {
    const ctx = await resolveContext({ cwd: tmpDir });
    const cmd = buildPrompt(ctx, "review", "path\\to\\file");

    expect(cmd).toContain("\\\\");
  });

  it("contem linha flux_cmd no bloco preflight", async () => {
    const ctx = await resolveContext({ cwd: tmpDir });
    const cmd = buildPrompt(ctx, "review", "meu-repo");

    expect(cmd).toContain("flux_cmd:");
  });

  it("contem delimitadores de bloco preflight", async () => {
    const ctx = await resolveContext({ cwd: tmpDir });
    const cmd = buildPrompt(ctx, "build", "meu-repo");

    expect(cmd).toContain("PREFLIGHT RESOLVIDO");
    expect(cmd).toContain("FIM PREFLIGHT RESOLVIDO");
  });

  it("termina com o slash-command do verbo", async () => {
    const ctx = await resolveContext({ cwd: tmpDir });
    const cmd = buildPrompt(ctx, "refine", "meu-repo");

    expect(cmd).toContain("/flux:refine meu-repo");
  });
});

describe("verbo desconhecido: exit 1", () => {
  it("lista dos verbos suportados inclui todos os 10", () => {
    expect(SUPPORTED_VERBS).toHaveLength(10);
    for (const v of SUPPORTED_VERBS) {
      expect(typeof v).toBe("string");
    }
  });
});

describe("ticket como alvo: fora da v0", () => {
  it("detecta padrao XXYY-123", () => {
    expect(TICKET_PATTERN.test("LAB-126")).toBe(true);
    expect(TICKET_PATTERN.test("ENG-1234")).toBe(true);
    expect(TICKET_PATTERN.test("AB-1")).toBe(true);
    expect(TICKET_PATTERN.test("meu-repo")).toBe(false);
    expect(TICKET_PATTERN.test("ABCDEF-1")).toBe(false);
    expect(TICKET_PATTERN.test("abc-1")).toBe(false);
  });

  it("detecta URL do Linear", () => {
    expect(LINEAR_URL_PATTERN.test("https://linear.app/g-lab-s/issue/LAB-126/foo")).toBe(true);
    expect(LINEAR_URL_PATTERN.test("https://github.com/foo")).toBe(false);
  });
});
