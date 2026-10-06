import { existsSync } from "fs";
import { resolve as resolvePath } from "path";
import { expandHome, type ManifestRecord } from "./resolve.ts";

export interface AliasResult {
  script: string;
  warnings: string[];
}

export interface AliasOptions {
  repos?: boolean;
}

const SAFE_NAME = /^[A-Za-z0-9_-]+$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function sanitizeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function describe(record: ManifestRecord): string {
  return JSON.stringify(record.path);
}

export function generateAliases(
  records: ManifestRecord[],
  verbs: readonly string[],
  options: AliasOptions = {},
): AliasResult {
  const warnings: string[] = [];
  const safeVerbs = verbs.filter((v) => {
    if (SAFE_NAME.test(v)) return true;
    warnings.push(`verbo ignorado, nome fora do whitelist: ${JSON.stringify(v)}`);
    return false;
  });

  const sorted = [...records].sort((a, b) => a.path.localeCompare(b.path));
  const contexts: { prefix: string; dir: string; repos: string[] }[] = [];
  const usedPrefixes = new Set<string>();

  for (const record of sorted) {
    const m = record.manifest;
    const rawPrefix =
      typeof m.alias_prefix === "string" && m.alias_prefix !== ""
        ? m.alias_prefix
        : typeof m.name === "string" && m.name !== ""
          ? m.name
          : null;
    if (rawPrefix === null) {
      warnings.push(`manifesto ignorado, sem alias_prefix nem name: ${describe(record)}`);
      continue;
    }
    const prefix = sanitizeName(rawPrefix);
    if (prefix === "") {
      warnings.push(`manifesto ignorado, prefixo sem caracteres válidos (${JSON.stringify(rawPrefix)}): ${describe(record)}`);
      continue;
    }
    if (prefix !== rawPrefix) {
      warnings.push(`prefixo ${JSON.stringify(rawPrefix)} sanitizado para "${prefix}": ${describe(record)}`);
    }
    if (usedPrefixes.has(prefix)) {
      warnings.push(`manifesto ignorado, prefixo "${prefix}" já usado por outro contexto: ${describe(record)}`);
      continue;
    }

    const rawRoot = typeof m.workspace_root === "string" && m.workspace_root !== "" ? m.workspace_root : record.dir;
    const dir = resolvePath(record.dir, expandHome(rawRoot));
    if (CONTROL_CHARS.test(dir)) {
      warnings.push(`manifesto ignorado, workspace_root com caractere de controle: ${describe(record)}`);
      continue;
    }
    if (!existsSync(dir)) {
      warnings.push(`manifesto ignorado, workspace_root inexistente (${dir}): ${describe(record)}`);
      continue;
    }

    usedPrefixes.add(prefix);
    const repos = Array.isArray(m.repos) ? m.repos.filter((r): r is string => typeof r === "string" && r !== "") : [];
    contexts.push({ prefix, dir, repos });
  }

  const emitted = new Set<string>();
  const lines: string[] = [];

  for (const ctx of contexts) {
    for (const verb of safeVerbs) {
      const name = `${ctx.prefix}-flux-${verb}`;
      if (emitted.has(name)) continue;
      emitted.add(name);
      lines.push(`${name}() { ( cd ${shellQuote(ctx.dir)} && flux ${verb} "$@" ) }`);
    }
  }

  if (options.repos) {
    for (const ctx of contexts) {
      for (const repo of ctx.repos) {
        if (CONTROL_CHARS.test(repo)) {
          warnings.push(`repo ignorado, slug com caractere de controle em "${ctx.prefix}": ${JSON.stringify(repo)}`);
          continue;
        }
        const slug = sanitizeName(repo);
        if (slug === "") {
          warnings.push(`repo ignorado, slug sem caracteres válidos em "${ctx.prefix}": ${JSON.stringify(repo)}`);
          continue;
        }
        if (slug !== repo) {
          warnings.push(`slug de repo ${JSON.stringify(repo)} sanitizado para "${slug}" em "${ctx.prefix}"`);
        }
        for (const verb of safeVerbs) {
          const name = `${ctx.prefix}-${slug}-${verb}`;
          if (emitted.has(name)) {
            warnings.push(`colisão: "${name}" já existe, função de repo ignorada (a de contexto ou a primeira vence)`);
            continue;
          }
          emitted.add(name);
          lines.push(`${name}() { ( cd ${shellQuote(ctx.dir)} && flux ${verb} --repo ${shellQuote(repo)} "$@" ) }`);
        }
      }
    }
  }

  return { script: lines.length > 0 ? lines.join("\n") + "\n" : "", warnings };
}
