import type { ResolvedContext } from "./resolve.ts";

const CLI_VERSION = "1.23.2";

export const FLUX_CMD_PREFIX = "/flux:";

const ADVISORY_SENTENCE =
  "Este bloco é ADVISORY. A skill o recebe como ponto de partida e revalida barato os campos que dependem de estado de sessão (registro de agente, FLUX_CMD, ADDDIR_CMD, nível FULL/REDUCED/THIN, MCPs, campo lentes: do banner).";

function escapeForArgv(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"');
}

export function buildPrompt(ctx: ResolvedContext, verb: string, args: string): string {
  const lines: string[] = [];

  lines.push(`--- PREFLIGHT RESOLVIDO (flux-cli v${CLI_VERSION}) ---`);
  lines.push(`perfil: ${ctx.profile}`);
  lines.push(`manifesto: ${ctx.manifest_path ?? "ausente"}`);
  lines.push(`ancora: ${ctx.anchor}`);
  lines.push(`flux_root: ${ctx.flux_root}`);
  lines.push(`flux_root_source: ${ctx.flux_root_source}`);
  lines.push(`exec_command: ${ctx.exec_command}`);
  lines.push(`exec_fallback: ${ctx.exec_fallback ?? "ausente"}`);
  lines.push(`lentes:`);
  lines.push(`  l2_paths: ${ctx.lenses.l2_paths.length > 0 ? ctx.lenses.l2_paths.join(", ") : "ausente"}`);
  lines.push(`  l3_paths: ${ctx.lenses.l3_paths.length > 0 ? ctx.lenses.l3_paths.join(", ") : "ausente"}`);
  if (ctx.warnings.length > 0) {
    lines.push(`avisos:`);
    for (const w of ctx.warnings) lines.push(`  - ${w}`);
  }
  lines.push(`flux_cmd: /flux: (Claude-only v0; revalide com a forma que sua sessao expoe)`);
  lines.push(ADVISORY_SENTENCE);
  lines.push(`--- FIM PREFLIGHT RESOLVIDO ---`);
  lines.push(`${FLUX_CMD_PREFIX}${verb} ${args}`);

  const body = lines.join("\n");
  return `claude "${escapeForArgv(body)}"`;
}
