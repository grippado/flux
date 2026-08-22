import { existsSync, readFileSync } from "fs";
import { join, dirname, resolve as resolvePath } from "path";
import { homedir } from "os";
import * as readline from "readline";

export interface FluxManifest {
  name?: string;
  exec_command?: string;
  exec_fallback?: string | Record<string, string>;
  specialists_root?: string;
  workspace_root?: string;
  vault_root?: string;
  vault_context?: string;
  linear_org?: string;
  no_emdash?: boolean;
  [key: string]: unknown;
}

export interface Lens {
  l2_paths: string[];
  l3_paths: string[];
}

export interface ResolvedContext {
  profile: string;
  manifest_path: string | null;
  anchor: string;
  flux_root: string;
  flux_root_source: string;
  exec_command: string;
  exec_fallback: string | null;
  lenses: Lens;
  warnings: string[];
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function findManifestUpward(anchor: string): { path: string; dir: string } | null {
  let current = anchor;
  const root = "/";
  while (current !== root) {
    const claudePath = join(current, ".claude", "flux-context.json");
    if (existsSync(claudePath)) return { path: claudePath, dir: current };
    const cursorPath = join(current, ".cursor", "flux-context.json");
    if (existsSync(cursorPath)) return { path: cursorPath, dir: current };
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function resolveFluxRoot(): { root: string; source: string } {
  const candidateEnvs = [
    ["CLAUDE_PLUGIN_ROOT", "env:CLAUDE_PLUGIN_ROOT"],
    ["CURSOR_PLUGIN_ROOT", "env:CURSOR_PLUGIN_ROOT"],
    ["CODEX_PLUGIN_ROOT", "env:CODEX_PLUGIN_ROOT"],
  ] as const;

  for (const [env, source] of candidateEnvs) {
    const val = process.env[env];
    if (val && existsSync(val)) return { root: val, source };
  }

  const pluginMarker = findCodexPluginMarker();
  if (pluginMarker) return { root: pluginMarker, source: "codex-plugin-marker" };

  const selfDir = dirname(import.meta.path ?? __filename);
  const twoUp = resolvePath(selfDir, "..", "..");
  if (existsSync(join(twoUp, "shared"))) return { root: twoUp, source: "two-levels-up" };

  const fluxHome = process.env["FLUX_HOME"];
  if (fluxHome && existsSync(fluxHome)) return { root: fluxHome, source: "env:FLUX_HOME" };

  const heuristic = resolveFluxRootHeuristic();
  if (heuristic) return heuristic;

  return { root: "UNAVAILABLE", source: "nenhum" };
}

function findCodexPluginMarker(): string | null {
  try {
    const selfDir = dirname(import.meta.path ?? __filename);
    let current = selfDir;
    const root = "/";
    while (current !== root) {
      if (existsSync(join(current, ".codex-plugin", "plugin.json"))) return current;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {}
  return null;
}

function resolveFluxRootHeuristic(): { root: string; source: string } | null {
  const home = homedir();
  const candidates = [
    join(home, ".claude", "plugins", "cache", "flux", "flux"),
    join(home, ".cursor", "plugins", "cache", "flux", "flux"),
  ];
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    try {
      const versions = Bun.spawnSync(["ls", base]).stdout.toString().trim().split("\n").filter(Boolean);
      const sorted = versions
        .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
        .sort((a, b) => {
          const pa = a.split(".").map(Number);
          const pb = b.split(".").map(Number);
          for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
          return 0;
        });
      if (sorted.length > 0) {
        return { root: join(base, sorted[0]), source: "heuristica-cli" };
      }
    } catch {}
  }
  return null;
}

function resolveAnchor(targetArg: string | null, cwd: string, repo: string | null): string {
  if (targetArg) {
    const abs = resolvePath(cwd, targetArg);
    if (existsSync(abs)) return abs;
  }
  if (repo) {
    const candidates = [join(cwd, repo), join(cwd, "..", repo)];
    for (const c of candidates) {
      if (existsSync(join(c, ".git"))) return c;
    }
  }
  return cwd;
}

function resolveManifestFromCandidates(
  anchor: string,
  warnings: string[]
): { manifest: FluxManifest | null; path: string | null; dir: string | null } {
  const found = findManifestUpward(anchor);
  if (!found) return { manifest: null, path: null, dir: null };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(found.path, "utf-8"));
  } catch (e) {
    warnings.push(`manifesto malformado em ${found.path}: ${(e as Error).message} — usando perfil generico`);
    return { manifest: null, path: found.path, dir: found.dir };
  }

  if (!raw || typeof raw !== "object") {
    warnings.push(`manifesto malformado em ${found.path}: não é objeto JSON — usando perfil generico`);
    return { manifest: null, path: found.path, dir: found.dir };
  }

  return { manifest: raw as FluxManifest, path: found.path, dir: found.dir };
}

function resolveExecFallback(
  raw: FluxManifest | null,
  repoSlug: string | null
): string | null {
  if (!raw?.exec_fallback) return null;
  const fb = raw.exec_fallback;
  if (typeof fb === "string") return fb;
  if (typeof fb === "object") {
    if (repoSlug && fb[repoSlug]) return fb[repoSlug];
    if (fb["default"]) return fb["default"];
  }
  return null;
}

function resolveL2Paths(manifest: FluxManifest | null, repoSlug: string | null): string[] {
  if (!manifest?.specialists_root || !repoSlug) return [];
  const template = expandHome(manifest.specialists_root);
  const resolved = template.replace("{repo}", repoSlug);
  const dir = resolved.endsWith(".md") ? dirname(resolved) : resolved;
  if (existsSync(dir)) return [dir];
  return [];
}

function resolveL3Paths(repoCheckout: string | null): string[] {
  if (!repoCheckout) return [];
  const agentsDir = join(repoCheckout, ".claude", "agents");
  if (existsSync(agentsDir)) return [agentsDir];
  return [];
}

async function promptDisambiguation(candidates: string[]): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(
      `Mais de um manifesto reivindica este slug. Qual contexto usar?\n${candidates.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}\n> `,
      (answer) => {
        rl.close();
        const idx = parseInt(answer.trim(), 10) - 1;
        if (idx >= 0 && idx < candidates.length) resolve(candidates[idx]);
        else resolve(candidates[0]);
      }
    );
  });
}

export async function resolveContext(opts: {
  repoSlug?: string | null;
  targetPath?: string | null;
  cwd?: string;
}): Promise<ResolvedContext> {
  const cwd = opts.cwd ?? process.cwd();
  const repoSlug = opts.repoSlug ?? null;
  const targetPath = opts.targetPath ?? null;
  const warnings: string[] = [];

  const anchor = resolveAnchor(targetPath, cwd, repoSlug);

  const { manifest, path: manifestPath, dir: _manifestDir } = resolveManifestFromCandidates(anchor, warnings);

  const { root: fluxRoot, source: fluxRootSource } = resolveFluxRoot();
  if (fluxRootSource === "heuristica-cli") {
    warnings.push("FLUX_ROOT resolvido por heuristica-cli: instalação formal recomendada");
  }

  const profile = manifest?.name ?? "generico";
  const execCommand = manifest?.exec_command ?? "workflow";
  const execFallback = resolveExecFallback(manifest, repoSlug);

  const repoCheckout = repoSlug
    ? (() => {
        const wsRoot = manifest?.workspace_root ? expandHome(manifest.workspace_root) : dirname(manifestPath ?? cwd);
        const candidates = [join(cwd, repoSlug), join(wsRoot, repoSlug)];
        return candidates.find((c) => existsSync(join(c, ".git"))) ?? null;
      })()
    : null;

  const l2Paths = resolveL2Paths(manifest, repoSlug);
  const l3Paths = resolveL3Paths(repoCheckout);

  return {
    profile,
    manifest_path: manifestPath,
    anchor,
    flux_root: fluxRoot,
    flux_root_source: fluxRootSource,
    exec_command: execCommand,
    exec_fallback: execFallback,
    lenses: { l2_paths: l2Paths, l3_paths: l3Paths },
    warnings,
  };
}
