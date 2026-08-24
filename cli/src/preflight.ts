import { existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname, resolve as resolvePath } from "path";
import { homedir } from "os";
import { resolveContext, type FluxManifest, type ResolvedContext } from "./resolve.ts";

export const PREFLIGHT_SCHEMA_VERSION = "1.0.0";

export const SESSION_REVALIDATION_FIELDS = [
  "flux_cmd",
  "adddir_cmd",
  "holistic_verification",
  "capability_level",
] as const;

export const GENERIC_HOLISTIC_FORMS = ["flux:pr-reviewer", "flux-pr-reviewer", "pr-reviewer"] as const;

const PLUGIN_ENV_SOURCES = new Set([
  "env:CLAUDE_PLUGIN_ROOT",
  "env:CURSOR_PLUGIN_ROOT",
  "env:CODEX_PLUGIN_ROOT",
]);

export type RequirementType = "file" | "bin" | "vault" | "checkout_local";

export interface RequirementSpec {
  type: RequirementType;
  name: string;
}

export interface RequirementResult extends RequirementSpec {
  ok: boolean;
  path?: string;
  reason?: string;
}

export interface VerbRequirements {
  hard: RequirementSpec[];
  soft: RequirementSpec[];
}

export const VERB_REQUIREMENTS: Record<string, VerbRequirements> = {
  review: {
    hard: [
      { type: "file", name: "shared/review-legend.md" },
      { type: "file", name: "shared/review-artifact-template.md" },
      { type: "bin", name: "git" },
    ],
    soft: [
      { type: "bin", name: "gh" },
      { type: "vault", name: "vault" },
      { type: "checkout_local", name: "checkout_local" },
    ],
  },
  peek: {
    hard: [
      { type: "file", name: "shared/review-legend.md" },
      { type: "bin", name: "git" },
    ],
    soft: [{ type: "bin", name: "gh" }],
  },
  iterate: {
    hard: [
      { type: "bin", name: "git" },
      { type: "bin", name: "gh" },
    ],
    soft: [
      { type: "vault", name: "vault" },
      { type: "checkout_local", name: "checkout_local" },
    ],
  },
};

const DEFAULT_REQUIREMENTS: VerbRequirements = {
  hard: [{ type: "bin", name: "git" }],
  soft: [
    { type: "bin", name: "gh" },
    { type: "vault", name: "vault" },
  ],
};

const SOFT_LOSS: Record<string, string> = {
  gh: "gh indisponivel — sem coleta de PR/threads via GitHub",
  vault: "vault indisponivel — rodadas anteriores nao consultadas; artefato nao persistido",
  checkout_local: "sem checkout local — contexto de repo nao verificavel (vies para question)",
};

export interface HolisticResolution {
  candidate: string | null;
  source: "manifesto" | "override-local" | "generico" | "nenhum";
  generic_forms: string[];
}

export interface PreflightResult {
  schema_version: string;
  status: "ok" | "degraded" | "abort";
  abort_message: string | null;
  verb: string;
  target: string | null;
  family: string;
  resolved_at: string;
  flux_root: string;
  flux_root_source: string;
  manifest_path: string | null;
  anchor: string;
  profile: string;
  exec_command: string;
  exec_fallback: string | null;
  holistic: HolisticResolution;
  kit_roots: string[];
  capability_level_hint: "FULL-tentativo" | "REDUCED" | "THIN" | "UNAVAILABLE";
  lenses: ResolvedContext["lenses"];
  requirements: { hard: RequirementResult[]; soft: RequirementResult[] };
  degradations: string[];
  session_revalidation_required: string[];
  warnings: string[];
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function binExists(name: string): boolean {
  try {
    return Bun.which(name) !== null;
  } catch {
    try {
      const result = Bun.spawnSync(["/usr/bin/which", name], { stderr: "ignore" });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
}

export function findKitsInRoot(root: string, maxDepth = 2): string[] {
  const found: string[] = [];
  function scan(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    if (existsSync(join(dir, "flux-kit.json"))) {
      found.push(dir);
      return;
    }
    if (depth === maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      scan(join(dir, entry.name), depth + 1);
    }
  }
  if (existsSync(root)) scan(root, 0);
  return found;
}

export function resolveKitRoots(opts: {
  manifest: FluxManifest | null;
  fluxRoot: string;
  fluxRootSource: string;
}): { kit_roots: string[]; sibling_origin_consulted: boolean } {
  const origins: string[] = [];

  const kits = opts.manifest?.["kits"];
  if (Array.isArray(kits)) {
    for (const entry of kits) {
      if (typeof entry === "string") origins.push(expandHome(entry));
    }
  }

  const kitsRoot = opts.manifest?.["kits_root"];
  if (typeof kitsRoot === "string") {
    const idx = kitsRoot.indexOf("{repo}");
    const prefix = idx >= 0 ? kitsRoot.slice(0, idx) : kitsRoot;
    const trimmed = prefix.replace(/\/+$/, "");
    if (trimmed) origins.push(expandHome(trimmed));
  }

  const siblingConsulted = PLUGIN_ENV_SOURCES.has(opts.fluxRootSource);
  if (siblingConsulted && opts.fluxRoot !== "UNAVAILABLE") {
    origins.push(dirname(opts.fluxRoot));
  }

  const seen = new Set<string>();
  const kitRoots: string[] = [];
  for (const origin of origins) {
    for (const kit of findKitsInRoot(origin)) {
      const canonical = resolvePath(kit);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        kitRoots.push(canonical);
      }
    }
  }
  return { kit_roots: kitRoots, sibling_origin_consulted: siblingConsulted };
}

export function resolveHolisticFromDisk(opts: {
  manifest: FluxManifest | null;
  repoCheckout: string | null;
}): HolisticResolution {
  const fromManifest = opts.manifest?.["holistic_reviewer"];
  if (typeof fromManifest === "string" && fromManifest.trim()) {
    return { candidate: fromManifest.trim(), source: "manifesto", generic_forms: [...GENERIC_HOLISTIC_FORMS] };
  }
  if (opts.repoCheckout) {
    for (const configDir of [".claude", ".cursor"]) {
      const override = join(opts.repoCheckout, configDir, "agents", "reviewer.md");
      if (existsSync(override)) {
        return { candidate: override, source: "override-local", generic_forms: [...GENERIC_HOLISTIC_FORMS] };
      }
    }
  }
  return { candidate: GENERIC_HOLISTIC_FORMS[0], source: "generico", generic_forms: [...GENERIC_HOLISTIC_FORMS] };
}

function checkRequirement(
  spec: RequirementSpec,
  env: { fluxRoot: string; manifest: FluxManifest | null; anchor: string }
): RequirementResult {
  if (spec.type === "file") {
    if (env.fluxRoot === "UNAVAILABLE") {
      return { ...spec, ok: false, reason: "FLUX_ROOT nao resolvido" };
    }
    const path = join(env.fluxRoot, spec.name);
    return existsSync(path)
      ? { ...spec, ok: true, path }
      : { ...spec, ok: false, path, reason: "arquivo nao encontrado" };
  }
  if (spec.type === "bin") {
    return binExists(spec.name)
      ? { ...spec, ok: true }
      : { ...spec, ok: false, reason: `command -v ${spec.name} falhou` };
  }
  if (spec.type === "vault") {
    const vaultRoot = env.manifest?.vault_root;
    if (typeof vaultRoot !== "string" || !vaultRoot) {
      return { ...spec, ok: false, reason: "vault_root ausente no manifesto" };
    }
    const path = expandHome(vaultRoot);
    return existsSync(path)
      ? { ...spec, ok: true, path }
      : { ...spec, ok: false, path, reason: "diretorio do vault nao existe" };
  }
  const gitDir = join(env.anchor, ".git");
  return existsSync(gitDir)
    ? { ...spec, ok: true, path: env.anchor }
    : { ...spec, ok: false, reason: "alvo sem checkout local com .git" };
}

export function classifyCapabilityHint(opts: {
  manifestPresent: boolean;
  hasCheckout: boolean;
  hasSpecialists: boolean;
}): PreflightResult["capability_level_hint"] {
  if (!opts.hasCheckout) return "THIN";
  if (opts.manifestPresent && opts.hasSpecialists) return "FULL-tentativo";
  return "REDUCED";
}

function buildAbortMessage(verb: string, failed: RequirementResult[], fluxRoot: string): string {
  const parts = failed.map((r) => {
    if (r.type === "file") return `arquivo ${r.name} nao encontrado em ${dirname(r.path ?? fluxRoot)}/`;
    if (r.type === "bin") return `binario \`${r.name}\` ausente no PATH`;
    return `${r.name}: ${r.reason}`;
  });
  return [
    `O verbo \`${verb}\` nao pode rodar nesta maquina: ${parts.join("; ")}.`,
    fluxRoot === "UNAVAILABLE"
      ? "A instalacao da familia flux nao foi localizada — instale o plugin ou exporte FLUX_HOME."
      : `Verifique a instalacao da familia em ${fluxRoot} e rode o verbo novamente.`,
  ].join(" ");
}

export async function runPreflight(opts: {
  verb: string;
  target?: string | null;
  repo?: string | null;
  family?: string | null;
  cwd?: string;
  now?: Date;
}): Promise<PreflightResult> {
  const cwd = opts.cwd ?? process.cwd();
  const ctx = await resolveContext({
    repoSlug: opts.repo ?? null,
    targetPath: opts.target ?? null,
    cwd,
  });

  let manifest: FluxManifest | null = null;
  if (ctx.manifest_path) {
    try {
      manifest = JSON.parse(readFileSync(ctx.manifest_path, "utf-8")) as FluxManifest;
    } catch {}
  }

  const family =
    opts.family ??
    (typeof manifest?.["family"] === "string" ? (manifest["family"] as string) : "flux");

  const hasCheckout = existsSync(join(ctx.anchor, ".git"));
  const repoCheckout = hasCheckout ? ctx.anchor : null;

  const holistic = resolveHolisticFromDisk({ manifest, repoCheckout });
  const { kit_roots, sibling_origin_consulted } = resolveKitRoots({
    manifest,
    fluxRoot: ctx.flux_root,
    fluxRootSource: ctx.flux_root_source,
  });

  const specs = VERB_REQUIREMENTS[opts.verb] ?? DEFAULT_REQUIREMENTS;
  const env = { fluxRoot: ctx.flux_root, manifest, anchor: ctx.anchor };
  const hard = specs.hard.map((s) => checkRequirement(s, env));
  const soft = specs.soft.map((s) => checkRequirement(s, env));

  const hardFailed = hard.filter((r) => !r.ok);
  const softFailed = soft.filter((r) => !r.ok);

  const degradations: string[] = softFailed.map(
    (r) => SOFT_LOSS[r.name] ?? `${r.name} indisponivel — ${r.reason}`
  );
  if (!sibling_origin_consulted) degradations.push("kit origem nao consultada");

  const fluxRootUnavailable = ctx.flux_root === "UNAVAILABLE";
  const aborted = hardFailed.length > 0 || fluxRootUnavailable;

  const capability = aborted
    ? "UNAVAILABLE"
    : classifyCapabilityHint({
        manifestPresent: manifest !== null,
        hasCheckout,
        hasSpecialists: ctx.lenses.l2_paths.length > 0,
      });

  return {
    schema_version: PREFLIGHT_SCHEMA_VERSION,
    status: aborted ? "abort" : softFailed.length > 0 || !sibling_origin_consulted ? "degraded" : "ok",
    abort_message: aborted
      ? buildAbortMessage(
          opts.verb,
          hardFailed.length > 0
            ? hardFailed
            : [{ type: "file", name: "FLUX_ROOT", ok: false, reason: "instalacao nao localizada" }],
          ctx.flux_root
        )
      : null,
    verb: opts.verb,
    target: opts.target ?? null,
    family,
    resolved_at: (opts.now ?? new Date()).toISOString(),
    flux_root: ctx.flux_root,
    flux_root_source: ctx.flux_root_source,
    manifest_path: ctx.manifest_path,
    anchor: ctx.anchor,
    profile: ctx.profile,
    exec_command: ctx.exec_command,
    exec_fallback: ctx.exec_fallback,
    holistic,
    kit_roots,
    capability_level_hint: capability,
    lenses: ctx.lenses,
    requirements: { hard, soft },
    degradations,
    session_revalidation_required: aborted ? [] : [...SESSION_REVALIDATION_FIELDS],
    warnings: ctx.warnings,
  };
}
