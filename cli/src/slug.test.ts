import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, symlinkSync } from "fs";
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

describe("resolucao por slug no resolveContext: repoSlug tem prioridade sobre targetPath nao-git", () => {
  it("usa repoSlug (nao a URL da PR) para casar contra repos[] do manifesto", async () => {
    const wsDir = mkdtempSync(join(tmpdir(), "flux-slug-ws-"));
    try {
      makeGitRepo(wsDir, "rf-monorepo");
      writeManifest(wsDir, { name: "arco", repos: ["rf-monorepo"], workspace_root: wsDir });

      const ctx = await resolveContext({
        repoSlug: "rf-monorepo",
        targetPath: "https://github.com/OlaIsaac/rf-monorepo/pull/4742",
        cwd: tmpDir,
        searchRoots: [wsDir],
      });

      expect(ctx.profile).toBe("arco");
      expect(ctx.anchor).toContain("rf-monorepo");
      expect(ctx.warnings.some((w) => w.includes("pull/4742"))).toBe(false);
    } finally {
      rmSync(wsDir, { recursive: true, force: true });
    }
  });
});

describe("resolucao por slug no resolveContext: manifesto alcancado por dois caminhos nao duplica candidato", () => {
  it("deduplica via realpath quando um symlink de diretorio expoe o mesmo manifesto sob outro caminho", async () => {
    const realRoot = mkdtempSync(join(tmpdir(), "flux-real-"));
    const searchRoot = mkdtempSync(join(tmpdir(), "flux-search-"));
    try {
      makeGitRepo(realRoot, "rf-monorepo");
      writeManifest(realRoot, { name: "arco", repos: ["rf-monorepo"], workspace_root: realRoot });

      const linkedDir = join(searchRoot, "isaac-link");
      mkdirSync(linkedDir, { recursive: true });
      symlinkSync(join(realRoot, ".claude"), join(linkedDir, ".claude"));

      const ctx = await resolveContext({
        targetPath: "rf-monorepo",
        cwd: tmpDir,
        searchRoots: [realRoot, searchRoot],
      });

      expect(ctx.profile).toBe("arco");
      expect(ctx.anchor).toContain("rf-monorepo");
    } finally {
      rmSync(realRoot, { recursive: true, force: true });
      rmSync(searchRoot, { recursive: true, force: true });
    }
  });
});

describe("resolucao por slug no resolveContext: diretorio intermediario symlink", () => {
  it("acha manifesto alcancavel so por symlink de diretorio intermediario", async () => {
    const realRoot = mkdtempSync(join(tmpdir(), "flux-real-"));
    const searchRoot = mkdtempSync(join(tmpdir(), "flux-search-"));
    try {
      const workspace = join(realRoot, "workspace");
      makeGitRepo(workspace, "rf-monorepo");
      writeManifest(workspace, { name: "arco", repos: ["rf-monorepo"], workspace_root: workspace });
      symlinkSync(realRoot, join(searchRoot, "link"));

      const ctx = await resolveContext({
        targetPath: "rf-monorepo",
        cwd: tmpDir,
        searchRoots: [searchRoot],
      });

      expect(ctx.profile).toBe("arco");
      expect(ctx.anchor).toContain("rf-monorepo");
    } finally {
      rmSync(realRoot, { recursive: true, force: true });
      rmSync(searchRoot, { recursive: true, force: true });
    }
  });

  it("termina em ciclo de symlink e devolve um candidato so", async () => {
    const realRoot = mkdtempSync(join(tmpdir(), "flux-real-"));
    const searchRoot = mkdtempSync(join(tmpdir(), "flux-search-"));
    try {
      const workspace = join(realRoot, "workspace");
      makeGitRepo(workspace, "rf-monorepo");
      writeManifest(workspace, { name: "arco", repos: ["rf-monorepo"], workspace_root: workspace });
      symlinkSync(realRoot, join(searchRoot, "link"));
      symlinkSync(searchRoot, join(realRoot, "volta"));
      symlinkSync(workspace, join(workspace, "eu-mesmo"));

      const ctx = await resolveContext({
        targetPath: "rf-monorepo",
        cwd: tmpDir,
        searchRoots: [searchRoot],
      });

      expect(ctx.profile).toBe("arco");
      expect(ctx.anchor).toContain("rf-monorepo");
    } finally {
      rmSync(realRoot, { recursive: true, force: true });
      rmSync(searchRoot, { recursive: true, force: true });
    }
  });
});

describe("resolucao por slug no resolveContext: diretorio visto primeiro fundo, depois raso", () => {
  for (const [deep, shallow] of [["a", "z"], ["zz", "aa"]] as const) {
    it(`acha o manifesto em ${shallow}/w quando ${deep}/b/c/link aponta para ${shallow}`, async () => {
      const searchRoot = mkdtempSync(join(tmpdir(), "flux-search-"));
      try {
        const target = join(searchRoot, shallow);
        const workspace = join(target, "w");
        makeGitRepo(workspace, "rf-monorepo");
        writeManifest(workspace, { name: "arco", repos: ["rf-monorepo"], workspace_root: workspace });
        const linkParent = join(searchRoot, deep, "b", "c");
        mkdirSync(linkParent, { recursive: true });
        symlinkSync(target, join(linkParent, "link"));

        const ctx = await resolveContext({
          targetPath: "rf-monorepo",
          cwd: tmpDir,
          searchRoots: [searchRoot],
        });

        expect(ctx.profile).toBe("arco");
        expect(ctx.anchor).toContain("rf-monorepo");
      } finally {
        rmSync(searchRoot, { recursive: true, force: true });
      }
    });
  }
});

describe("resolucao por slug no resolveContext: poda de diretorios do sistema so na raiz", () => {
  it("acha manifesto sob go e .local aninhados", async () => {
    for (const nested of [["www", "go"], ["x", ".local", "y"]]) {
      const searchRoot = mkdtempSync(join(tmpdir(), "flux-search-"));
      try {
        const workspace = join(searchRoot, ...nested);
        makeGitRepo(workspace, "rf-monorepo");
        writeManifest(workspace, { name: "arco", repos: ["rf-monorepo"], workspace_root: workspace });

        const ctx = await resolveContext({
          targetPath: "rf-monorepo",
          cwd: tmpDir,
          searchRoots: [searchRoot],
        });

        expect(ctx.profile).toBe("arco");
        expect(ctx.anchor).toContain("rf-monorepo");
      } finally {
        rmSync(searchRoot, { recursive: true, force: true });
      }
    }
  });

  it("nao acha manifesto sob Library na raiz da varredura", async () => {
    const searchRoot = mkdtempSync(join(tmpdir(), "flux-search-"));
    try {
      const workspace = join(searchRoot, "Library", "ws");
      makeGitRepo(workspace, "rf-monorepo");
      writeManifest(workspace, { name: "arco", repos: ["rf-monorepo"], workspace_root: workspace });

      const ctx = await resolveContext({
        targetPath: "rf-monorepo",
        cwd: tmpDir,
        searchRoots: [searchRoot],
      });

      expect(ctx.profile).not.toBe("arco");
      expect(ctx.anchor).toBe(tmpDir);
    } finally {
      rmSync(searchRoot, { recursive: true, force: true });
    }
  });

  it("nao acha manifesto sob node_modules aninhado", async () => {
    const searchRoot = mkdtempSync(join(tmpdir(), "flux-search-"));
    try {
      const workspace = join(searchRoot, "www", "node_modules", "ws");
      makeGitRepo(workspace, "rf-monorepo");
      writeManifest(workspace, { name: "arco", repos: ["rf-monorepo"], workspace_root: workspace });

      const ctx = await resolveContext({
        targetPath: "rf-monorepo",
        cwd: tmpDir,
        searchRoots: [searchRoot],
      });

      expect(ctx.profile).not.toBe("arco");
      expect(ctx.anchor).toBe(tmpDir);
    } finally {
      rmSync(searchRoot, { recursive: true, force: true });
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
