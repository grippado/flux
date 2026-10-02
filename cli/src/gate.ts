import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Harness } from "./harness.ts";

export const GATE_SIGNAL_SCHEMA = "flux-gate/1";
export const GATE_PENDING_EXIT = 10;
export const GATE_SIGNAL_FILE = "gate.json";

export const GATE_KINDS = [
  "github-post",
  "commit-push",
  "issue-write",
  "slack-write",
  "pr-open",
  "write-outside",
  "write-manifest",
  "ambiguous-target",
] as const;

export type GateKind = (typeof GATE_KINDS)[number];

export type GateSignal = {
  kind: GateKind | "unknown";
  question: string | null;
  options: string[];
  malformed: boolean;
};

export type GateChannel =
  | { available: true; dir: string; path: string }
  | { available: false; reason: string };

const MAX_FIELD = 200;
const MAX_OPTIONS = 8;

function sanitize(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FIELD);
}

export function unavailableReason(opts: {
  harness: Harness;
  safe: boolean;
  observable: boolean;
}): string | null {
  if (!opts.observable) return "fim da sessao nao observavel fora do modo here (--new)";
  if (opts.harness === "codex" && opts.safe) {
    return "codex exec em modo seguro roda em sandbox read-only e nao consegue gravar o sinal";
  }
  return null;
}

export function planGateChannel(reason: string | null, base: string = tmpdir()): GateChannel {
  if (reason !== null) return { available: false, reason };
  const dir = join(base, `flux-gate-${randomBytes(8).toString("hex")}`);
  return { available: true, dir, path: join(dir, GATE_SIGNAL_FILE) };
}

export function armGateChannel(channel: GateChannel): GateChannel {
  if (!channel.available) return channel;
  try {
    mkdirSync(channel.dir, { mode: 0o700 });
    return channel;
  } catch (err) {
    return {
      available: false,
      reason: `nao foi possivel criar o diretorio do sinal: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function closeGateChannel(channel: GateChannel): void {
  if (!channel.available) return;
  try {
    rmSync(channel.dir, { recursive: true, force: true });
  } catch {}
}

export function readGateSignal(channel: GateChannel): GateSignal | null {
  if (!channel.available) return null;
  if (!existsSync(channel.path)) return null;

  const malformed: GateSignal = { kind: "unknown", question: null, options: [], malformed: true };
  let parsed: unknown;
  try {
    if (statSync(channel.path).size === 0) return malformed;
    parsed = JSON.parse(readFileSync(channel.path, "utf8"));
  } catch {
    return malformed;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return malformed;

  const obj = parsed as Record<string, unknown>;
  if (obj["schema"] !== GATE_SIGNAL_SCHEMA) return malformed;
  if (obj["pending"] !== true) return malformed;

  const kind = (GATE_KINDS as readonly unknown[]).includes(obj["kind"]) ? (obj["kind"] as GateKind) : "unknown";
  const question = typeof obj["question"] === "string" && obj["question"].trim() !== "" ? sanitize(obj["question"]) : null;
  const options = Array.isArray(obj["options"])
    ? obj["options"].filter((o): o is string => typeof o === "string").slice(0, MAX_OPTIONS).map(sanitize)
    : [];
  return { kind, question, options, malformed: kind === "unknown" };
}

export function effectiveExitCode(harnessExit: number | null, signal: GateSignal | null): number | null {
  if (signal === null) return harnessExit;
  if (harnessExit === 0) return GATE_PENDING_EXIT;
  return harnessExit;
}

export function describeGateSignal(signal: GateSignal): string {
  const head = signal.malformed
    ? "[flux] gate pendente (sinal ilegivel ou fora do contrato flux-gate/1, tratado como pendente)"
    : `[flux] gate pendente (${signal.kind})`;
  const lines = [signal.question ? `${head}: ${signal.question}` : head];
  signal.options.forEach((o, i) => lines.push(`[flux]   ${i + 1}. ${o}`));
  lines.push(`[flux] saida ${GATE_PENDING_EXIT}: a execucao parou aguardando decisao humana, nao concluiu.`);
  return lines.join("\n");
}
