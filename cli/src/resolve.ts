import { existsSync, readFileSync, readdirSync } from "fs";
import { join, dirname, basename, resolve as resolvePath } from "path";
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
  repos?: string[];
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

export interface ManifestRecord {
  path: string;
  dir: string;
  manifest: FluxManifest;
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

export function resolveFluxRootHeuristic(homeDir?: string): { root: string; source: string } | null {
  const home = homeDir ?? homedir();

  const basePaths: string[] = [];
  try {
    const entries = readdirSync(home);
    for (const entry of entries) {
      if (/^\.claude/.test(entry) || entry === ".cursor") {
        basePaths.push(join(home, entry, "plugins", "cache", "flux", "flux"));
      }
    }
  } catch {}

  let bestParts: number[] | null = null;
  let bestPath: string | null = null;

  for (const base of basePaths) {
    if (!existsSync(base)) continue;
    try {
      const versions = readdirSync(base);
      const valid = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v));
      for (const v of valid) {
        const parts = v.split(".").map(Number);
        if (
          !bestParts ||
          parts[0] > bestParts[0] ||
          (parts[0] === bestParts[0] && parts[1] > bestParts[1]) ||
          (parts[0] === bestParts[0] && parts[1] === bestParts[1] && parts[2] > bestParts[2])
        ) {
          bestParts = parts;
          bestPath = join(base, v);
        }
      }
    } catch {}
  }

  if (bestPath) return { root: bestPath, source: "heuristica-cli" };
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

function scanForManifests(searchRoots: string[]): ManifestRecord[] {
  const results: ManifestRecord[] = [];
  const seen = new Set<string>();
  const SKIP = new Set([".git", "node_modules", ".cache", ".npm", ".yarn"]);

  function scan(dir: string, depth: number): void {
    if (depth > 4) return;
    try {
      for (const configDir of [".claude", ".cursor"]) {
        const manifestPath = join(dir, configDir, "flux-context.json");
        if (!seen.has(manifestPath) && existsSync(manifestPath)) {
          seen.add(manifestPath);
          try {
            const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
            if (raw && typeof raw === "object") {
              results.push({ path: manifestPath, dir, manifest: raw as FluxManifest });
            }
          } catch {}
        }
      }
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP.has(entry.name)) continue;
        scan(join(dir, entry.name), depth + 1);
      }
    } catch {}
  }

  for (const root of searchRoots) {
    scan(root, 0);
  }
  return results;
}

export function filterManifestsClaimingSlug(slug: string, records: ManifestRecord[]): ManifestRecord[] {
  return records.filter((r) => {
    const m = r.manifest;
    if (Array.isArray(m.repos) && (m.repos as string[]).includes(slug)) return true;
    if (m.workspace_root) {
      const ws = expandHome(m.workspace_root);
      if (existsSync(join(ws, slug, ".git"))) return true;
    }
    return false;
  });
}

function anchorFromManifestRecord(record: ManifestRecord, slug: string): string {
  const m = record.manifest;
  if (m.workspace_root) {
    const ws = expandHome(m.workspace_root);
    const candidate = join(ws, slug);
    if (existsSync(join(candidate, ".git"))) return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return record.dir;
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
  const MAX_ATTEMPTS = 3;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });

  return new Promise((resolve) => {
    let attempt = 0;

    const ask = () => {
      attempt++;
      rl.question(
        `Mais de um manifesto reivindica este slug. Qual contexto usar?\n${candidates.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}\n> `,
        (answer) => {
          const idx = parseInt(answer.trim(), 10) - 1;
          if (idx >= 0 && idx < candidates.length) {
            rl.close();
            resolve(candidates[idx]);
          } else if (attempt >= MAX_ATTEMPTS) {
            rl.close();
            process.stderr.write(`Entrada inválida após ${MAX_ATTEMPTS} tentativas. Abortando.\n`);
            process.exit(1);
          } else {
            process.stderr.write(`Entrada inválida. Digite um número entre 1 e ${candidates.length}.\n`);
            ask();
          }
        }
      );
    };

    ask();
  });
}

export async function resolveContext(opts: {
  repoSlug?: string | null;
  targetPath?: string | null;
  cwd?: string;
  searchRoots?: string[];
}): Promise<ResolvedContext> {
  const cwd = opts.cwd ?? process.cwd();
  const repoSlug = opts.repoSlug ?? null;
  const targetPath = opts.targetPath ?? null;
  const searchRoots = opts.searchRoots ?? [homedir()];
  const warnings: string[] = [];

  let anchor = resolveAnchor(targetPath, cwd, repoSlug);

  let unresolvedSlug: string | null = null;
  if (targetPath) {
    const abs = resolvePath(cwd, targetPath);
    if (!existsSync(abs)) unresolvedSlug = targetPath;
  }
  if (!unresolvedSlug && repoSlug) {
    const simpleCandidates = [join(cwd, repoSlug), join(cwd, "..", repoSlug)];
    if (!simpleCandidates.some((c) => existsSync(join(c, ".git")))) {
      unresolvedSlug = repoSlug;
    }
  }

  if (unresolvedSlug) {
    const slug = unresolvedSlug;

    const nearbyManifest = findManifestUpward(cwd);
    if (nearbyManifest) {
      try {
        const raw = JSON.parse(readFileSync(nearbyManifest.path, "utf-8")) as FluxManifest;
        if (raw?.workspace_root) {
          const ws = expandHome(raw.workspace_root);
          const candidate = join(ws, slug);
          if (existsSync(join(candidate, ".git"))) {
            anchor = candidate;
            unresolvedSlug = null;
          }
        }
      } catch {}
    }

    if (unresolvedSlug) {
      const allManifests = scanForManifests(searchRoots);
      const claiming = filterManifestsClaimingSlug(slug, allManifests);

      if (claiming.length === 1) {
        anchor = anchorFromManifestRecord(claiming[0], slug);
        unresolvedSlug = null;
      } else if (claiming.length > 1) {
        const labels = claiming.map((r) => r.manifest.name ?? r.dir);
        const chosen = await promptDisambiguation(labels);
        const chosenRecord = claiming.find((r) => (r.manifest.name ?? r.dir) === chosen) ?? claiming[0];
        anchor = anchorFromManifestRecord(chosenRecord, slug);
        unresolvedSlug = null;
      } else {
        warnings.push(`slug "${slug}" não encontrado em nenhum manifesto — ancorando no cwd`);
      }
    }
  }

  const effectiveRepoSlug = repoSlug ?? (existsSync(join(anchor, ".git")) ? basename(anchor) : null);

  const { manifest, path: manifestPath, dir: _manifestDir } = resolveManifestFromCandidates(anchor, warnings);

  const { root: fluxRoot, source: fluxRootSource } = resolveFluxRoot();
  if (fluxRootSource === "heuristica-cli") {
    warnings.push("FLUX_ROOT resolvido por heuristica-cli: instalação formal recomendada");
  }

  const profile = manifest?.name ?? "generico";
  const execCommand = manifest?.exec_command ?? "workflow";
  const execFallback = resolveExecFallback(manifest, effectiveRepoSlug);

  const repoCheckout = effectiveRepoSlug
    ? (() => {
        if (!repoSlug && existsSync(join(anchor, ".git"))) return anchor;
        const wsRoot = manifest?.workspace_root ? expandHome(manifest.workspace_root) : dirname(manifestPath ?? cwd);
        const candidates = [join(cwd, effectiveRepoSlug), join(wsRoot, effectiveRepoSlug)];
        return candidates.find((c) => existsSync(join(c, ".git"))) ?? null;
      })()
    : null;

  const l2Paths = resolveL2Paths(manifest, effectiveRepoSlug);
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
