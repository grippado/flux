import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  runPreflight,
  resolveKitRoots,
  resolveHolisticFromDisk,
  findKitsInRoot,
  classifyCapabilityHint,
  PREFLIGHT_SCHEMA_VERSION,
  SESSION_REVALIDATION_FIELDS,
  GENERIC_HOLISTIC_FORMS,
} from "./preflight.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "flux-preflight-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeFluxRoot(withShared = true): string {
  const root = join(tmp, "flux-root");
  mkdirSync(root, { recursive: true });
  if (withShared) {
    mkdirSync(join(root, "shared"), { recursive: true });
    writeFileSync(join(root, "shared", "review-legend.md"), "# legenda");
    writeFileSync(join(root, "shared", "review-artifact-template.md"), "# template");
  }
  return root;
}

function makeRepo(withManifest: Record<string, unknown> | null = null): string {
  const repo = join(tmp, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  if (withManifest) {
    mkdirSync(join(repo, ".claude"), { recursive: true });
    writeFileSync(join(repo, ".claude", "flux-context.json"), JSON.stringify(withManifest));
  }
  return repo;
}

describe("findKitsInRoot", () => {
  test("acha kit na raiz e em ate 2 niveis", () => {
    const root = join(tmp, "kits");
    mkdirSync(join(root, "a", "kit-x"), { recursive: true });
    writeFileSync(join(root, "a", "kit-x", "flux-kit.json"), "{}");
    mkdirSync(join(root, "kit-y"), { recursive: true });
    writeFileSync(join(root, "kit-y", "flux-kit.json"), "{}");
    const found = findKitsInRoot(root);
    expect(found.sort()).toEqual([join(root, "a", "kit-x"), join(root, "kit-y")].sort());
  });

  test("nao desce alem da profundidade 2", () => {
    const root = join(tmp, "kits-deep");
    mkdirSync(join(root, "a", "b", "c"), { recursive: true });
    writeFileSync(join(root, "a", "b", "c", "flux-kit.json"), "{}");
    expect(findKitsInRoot(root)).toEqual([]);
  });

  test("raiz inexistente retorna vazio", () => {
    expect(findKitsInRoot(join(tmp, "nao-existe"))).toEqual([]);
  });
});

describe("resolveKitRoots", () => {
  test("uniao de kits do manifesto e prefixo de kits_root, deduplicada", () => {
    const kitDir = join(tmp, "meus-kits", "kit-a");
    mkdirSync(kitDir, { recursive: true });
    writeFileSync(join(kitDir, "flux-kit.json"), "{}");
    const { kit_roots } = resolveKitRoots({
      manifest: {
        kits: [join(tmp, "meus-kits")],
        kits_root: join(tmp, "meus-kits") + "/{repo}",
      },
      fluxRoot: join(tmp, "flux-root"),
      fluxRootSource: "two-levels-up",
    });
    expect(kit_roots).toEqual([kitDir]);
  });

  test("irmaos de FLUX_ROOT so quando a origem e env de plugin", () => {
    const pluginsDir = join(tmp, "plugins");
    const fluxRoot = join(pluginsDir, "flux");
    const siblingKit = join(pluginsDir, "kit-b");
    mkdirSync(fluxRoot, { recursive: true });
    mkdirSync(siblingKit, { recursive: true });
    writeFileSync(join(siblingKit, "flux-kit.json"), "{}");

    const viaEnv = resolveKitRoots({ manifest: null, fluxRoot, fluxRootSource: "env:CLAUDE_PLUGIN_ROOT" });
    expect(viaEnv.kit_roots).toEqual([siblingKit]);
    expect(viaEnv.sibling_origin_consulted).toBe(true);

    const viaCheckout = resolveKitRoots({ manifest: null, fluxRoot, fluxRootSource: "two-levels-up" });
    expect(viaCheckout.kit_roots).toEqual([]);
    expect(viaCheckout.sibling_origin_consulted).toBe(false);
  });
});

describe("resolveHolisticFromDisk", () => {
  test("manifesto vence tudo", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, ".claude", "agents"), { recursive: true });
    writeFileSync(join(repo, ".claude", "agents", "reviewer.md"), "# reviewer");
    const r = resolveHolisticFromDisk({ manifest: { holistic_reviewer: "acme-reviewer" }, repoCheckout: repo });
    expect(r.candidate).toBe("acme-reviewer");
    expect(r.source).toBe("manifesto");
  });

  test("override local em .claude/agents/reviewer.md", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, ".claude", "agents"), { recursive: true });
    writeFileSync(join(repo, ".claude", "agents", "reviewer.md"), "# reviewer");
    const r = resolveHolisticFromDisk({ manifest: null, repoCheckout: repo });
    expect(r.source).toBe("override-local");
    expect(r.candidate).toContain("reviewer.md");
  });

  test("cai no generico com as 3 formas declaradas", () => {
    const r = resolveHolisticFromDisk({ manifest: null, repoCheckout: null });
    expect(r.source).toBe("generico");
    expect(r.candidate).toBe("flux:pr-reviewer");
    expect(r.generic_forms).toEqual([...GENERIC_HOLISTIC_FORMS]);
  });
});

describe("classifyCapabilityHint", () => {
  test("THIN sem checkout", () => {
    expect(classifyCapabilityHint({ manifestPresent: true, hasCheckout: false, hasSpecialists: true })).toBe("THIN");
  });
  test("REDUCED com checkout sem specialists", () => {
    expect(classifyCapabilityHint({ manifestPresent: true, hasCheckout: true, hasSpecialists: false })).toBe("REDUCED");
  });
  test("FULL-tentativo com manifesto + specialists + checkout", () => {
    expect(classifyCapabilityHint({ manifestPresent: true, hasCheckout: true, hasSpecialists: true })).toBe("FULL-tentativo");
  });
});

describe("runPreflight", () => {
  test("abort quando hard file falta no FLUX_ROOT", async () => {
    const fluxRoot = makeFluxRoot(false);
    process.env["CLAUDE_PLUGIN_ROOT"] = fluxRoot;
    try {
      const repo = makeRepo({ name: "perfil-teste" });
      const result = await runPreflight({ verb: "review", cwd: repo });
      expect(result.status).toBe("abort");
      expect(result.abort_message).toContain("review-legend.md");
      expect(result.session_revalidation_required).toEqual([]);
    } finally {
      delete process.env["CLAUDE_PLUGIN_ROOT"];
    }
  });

  test("ok/degraded com hard satisfeitos, shape completo do JSON", async () => {
    const fluxRoot = makeFluxRoot(true);
    process.env["CLAUDE_PLUGIN_ROOT"] = fluxRoot;
    try {
      const repo = makeRepo({
        name: "perfil-teste",
        holistic_reviewer: "acme-reviewer",
        vault_root: tmp,
      });
      const result = await runPreflight({ verb: "review", cwd: repo, now: new Date("2026-08-23T12:00:00Z") });
      expect(result.status).not.toBe("abort");
      expect(result.schema_version).toBe(PREFLIGHT_SCHEMA_VERSION);
      expect(result.abort_message).toBeNull();
      expect(result.profile).toBe("perfil-teste");
      expect(result.holistic.candidate).toBe("acme-reviewer");
      expect(result.resolved_at).toBe("2026-08-23T12:00:00.000Z");
      expect(result.session_revalidation_required).toEqual([...SESSION_REVALIDATION_FIELDS]);
      expect(result.requirements.hard.every((r) => r.ok)).toBe(true);
      expect(["FULL-tentativo", "REDUCED"]).toContain(result.capability_level_hint);
    } finally {
      delete process.env["CLAUDE_PLUGIN_ROOT"];
    }
  });

  test("soft ausente degrada e declara a perda", async () => {
    const fluxRoot = makeFluxRoot(true);
    process.env["CLAUDE_PLUGIN_ROOT"] = fluxRoot;
    try {
      const repo = makeRepo({ name: "perfil-teste", vault_root: join(tmp, "vault-que-nao-existe") });
      const result = await runPreflight({ verb: "review", cwd: repo });
      expect(result.status).toBe("degraded");
      expect(result.degradations.some((d) => d.includes("vault"))).toBe(true);
    } finally {
      delete process.env["CLAUDE_PLUGIN_ROOT"];
    }
  });

  test("verbo sem tabela propria usa requisitos default", async () => {
    const fluxRoot = makeFluxRoot(true);
    process.env["CLAUDE_PLUGIN_ROOT"] = fluxRoot;
    try {
      const repo = makeRepo({ name: "perfil-teste" });
      const result = await runPreflight({ verb: "map", cwd: repo });
      expect(result.requirements.hard.map((r) => r.name)).toEqual(["git"]);
    } finally {
      delete process.env["CLAUDE_PLUGIN_ROOT"];
    }
  });

  test("family vem da flag, do manifesto, ou default flux", async () => {
    const fluxRoot = makeFluxRoot(true);
    process.env["CLAUDE_PLUGIN_ROOT"] = fluxRoot;
    try {
      const repo = makeRepo({ name: "perfil-teste", family: "core" });
      const fromManifest = await runPreflight({ verb: "peek", cwd: repo });
      expect(fromManifest.family).toBe("core");
      const fromFlag = await runPreflight({ verb: "peek", cwd: repo, family: "sdd" });
      expect(fromFlag.family).toBe("sdd");
    } finally {
      delete process.env["CLAUDE_PLUGIN_ROOT"];
    }
  });
});
