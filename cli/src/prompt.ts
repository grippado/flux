import type { ResolvedContext } from "./resolve.ts";
import pkg from "../package.json";

const CLI_VERSION: string = pkg.version;

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

export type CommandOptions = {
  safe?: boolean;
  claudeCmd?: string;
  harness?: string;
};

export function resolveInvocation(opts: CommandOptions = {}): string {
  const harness = opts.harness ?? "claude";
  const override = opts.claudeCmd ?? process.env["FLUX_CLAUDE_CMD"];
  if (override) return override;

  if (harness === "cursor") {
    const permFlags = opts.safe ? "" : " --force";
    return `cursor agent --print${permFlags}`;
  }
  if (harness === "codex") {
    const permFlags = opts.safe ? "" : " --dangerously-bypass-approvals-and-sandbox";
    return `codex exec${permFlags}`;
  }
  return opts.safe ? "claude" : "claude --dangerously-skip-permissions";
}

export function buildCommand(body: string, opts: CommandOptions = {}): string {
  return `${resolveInvocation(opts)} "${escapeForArgv(body)}"`;
}

export type PromptBodyOpts = {
  harness?: string;
  harnessSource?: string;
};

export function buildPrompt(ctx: ResolvedContext, verb: string, args: string, opts: CommandOptions = {}): string {
  return buildCommand(buildPromptBody(ctx, verb, args, opts), opts);
}

export function buildPromptBody(ctx: ResolvedContext, verb: string, args: string, opts: PromptBodyOpts = {}): string {
  const lines: string[] = [];
  const harness = opts.harness ?? "claude";
  const harnessSource = opts.harnessSource ?? "desconhecido";

  lines.push(`--- PREFLIGHT RESOLVIDO (flux-cli v${CLI_VERSION}) ---`);
  lines.push(`perfil: ${ctx.profile}`);
  lines.push(`manifesto: ${ctx.manifest_path ?? "ausente"}`);
  lines.push(`ancora: ${ctx.anchor}`);
  lines.push(`flux_root: ${ctx.flux_root}`);
  lines.push(`flux_root_source: ${ctx.flux_root_source}`);
  lines.push(`exec_command: ${ctx.exec_command}`);
  lines.push(`exec_fallback: ${ctx.exec_fallback ?? "ausente"}`);
  lines.push(`harness: ${harness}`);
  lines.push(`harness_source: ${harnessSource}`);
  lines.push(`lentes:`);
  lines.push(`  l2_paths: ${ctx.lenses.l2_paths.length > 0 ? ctx.lenses.l2_paths.join(", ") : "ausente"}`);
  lines.push(`  l3_paths: ${ctx.lenses.l3_paths.length > 0 ? ctx.lenses.l3_paths.join(", ") : "ausente"}`);
  if (ctx.warnings.length > 0) {
    lines.push(`avisos:`);
    for (const w of ctx.warnings) lines.push(`  - ${w}`);
  }
  lines.push(`flux_cmd: /flux: (session_revalidation_required)`);
  lines.push(ADVISORY_SENTENCE);
  lines.push(`--- FIM PREFLIGHT RESOLVIDO ---`);
  lines.push(`${FLUX_CMD_PREFIX}${verb} ${args}`);

  return lines.join("\n");
}
