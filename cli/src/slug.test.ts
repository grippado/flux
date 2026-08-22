import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { filterManifestsClaimingSlug, resolveContext, type ManifestRecord } from "./resolve.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "flux-slug-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeManifestRecord(dir: string, manifest: object): ManifestRecord {
  return {
    path: join(dir, ".claude", "flux-context.json"),
    dir,
    manifest,
  };
}

function makeGitRepo(base: string, name: string): string {
  const p = join(base, name);
  mkdirSync(join(p, ".git"), { recursive: true });
  return p;
}

function writeManifest(dir: string, content: object): void {
  const d = join(dir, ".claude");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "flux-context.json"), JSON.stringify(content));
}

describe("filterManifestsClaimingSlug: declaracao via repos[]", () => {
  it("retorna manifesto que declara o slug em repos[]", () => {
    const records = [makeManifestRecord("/fake", { name: "ctx-a", repos: ["meu-repo"] })];
    const result = filterManifestsClaimingSlug("meu-repo", records);
    expect(result).toHaveLength(1);
    expect(result[0].manifest.name).toBe("ctx-a");
  });

  it("retorna vazio quando repos[] nao contem o slug", () => {
    const records = [makeManifestRecord("/fake", { repos: ["outro-repo"] })];
    const result = filterManifestsClaimingSlug("meu-repo", records);
    expect(result).toHaveLength(0);
  });

  it("retorna multiplos quando mais de um reivindica via repos[]", () => {
    const records = [
      makeManifestRecord("/ws-a", { name: "ctx-a", repos: ["meu-repo"] }),
      makeManifestRecord("/ws-b", { name: "ctx-b", repos: ["meu-repo", "outro"] }),
    ];
    const result = filterManifestsClaimingSlug("meu-repo", records);
    expect(result).toHaveLength(2);
  });

  it("nao reivindica quando repos[] esta ausente", () => {
    const records = [makeManifestRecord("/fake", { name: "sem-repos" })];
    const result = filterManifestsClaimingSlug("meu-repo", records);
    expect(result).toHaveLength(0);
  });
});

describe("filterManifestsClaimingSlug: declaracao via workspace_root + .git", () => {
  it("reivindica quando workspace_root/slug/.git existe", () => {
    const repoDir = makeGitRepo(tmpDir, "meu-repo");
    const records = [makeManifestRecord("/ws", { name: "ctx", workspace_root: tmpDir })];
    const result = filterManifestsClaimingSlug("meu-repo", records);
    expect(result).toHaveLength(1);
    // repoDir used to satisfy TypeScript
    expect(repoDir).toContain("meu-repo");
  });

  it("nao reivindica quando workspace_root/slug/.git nao existe", () => {
    mkdirSync(join(tmpDir, "outro-repo"), { recursive: true });
    const records = [makeManifestRecord("/ws", { name: "ctx", workspace_root: tmpDir })];
    const result = filterManifestsClaimingSlug("meu-repo", records);
    expect(result).toHaveLength(0);
  });
});

describe("resolucao por slug no resolveContext: 1 candidato", () => {
  it("resolve a ancora via manifesto que declara o slug em repos[]", async () => {
    const wsDir = mkdtempSync(join(tmpdir(), "flux-slug-ws-"));
    try {
      makeGitRepo(wsDir, "meu-repo");
      writeManifest(wsDir, { name: "ws-ctx", repos: ["meu-repo"], workspace_root: wsDir });

      const ctx = await resolveContext({
        targetPath: "meu-repo",
        cwd: tmpDir,
        searchRoots: [wsDir],
      });

      expect(ctx.anchor).toContain("meu-repo");
      expect(ctx.anchor).not.toBe(tmpDir);
    } finally {
      rmSync(wsDir, { recursive: true, force: true });
    }
  });
});

describe("resolucao por slug no resolveContext: 0 candidatos", () => {
  it("adiciona warning e ancora no cwd quando nenhum manifesto reivindica", async () => {
    const isolatedSearch = mkdtempSync(join(tmpdir(), "flux-empty-search-"));
    try {
      const ctx = await resolveContext({
        targetPath: "slug-inexistente",
        cwd: tmpDir,
        searchRoots: [isolatedSearch],
      });

      expect(ctx.anchor).toBe(tmpDir);
      expect(ctx.warnings.some((w) => w.includes("slug-inexistente"))).toBe(true);
    } finally {
      rmSync(isolatedSearch, { recursive: true, force: true });
    }
  });
});
