import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import type { PreflightResult } from "./preflight.ts";
import { UNKNOWN_HARNESS, type Harness, type HarnessResolution } from "./harness.ts";
import pkg from "../package.json";

const CLI_VERSION: string = pkg.version;

export type RunExecResult = { exitCode: number; stdout: string; stderr: string };
export type RunExec = (argv: string[]) => RunExecResult;

export type RunHandle = {
  runId: string;
  sequence: string;
  root: string;
  runDir: string;
  script: string;
};

export type RunPromptInfo = {
  runId: string;
  sequence: string;
  root: string;
};

export type StageStatus = "completed" | "failed" | "cancelled";

export type RunHarness = {
  value: "claude-code" | "cursor" | "codex" | "unknown";
  source: "cli-launch" | "default";
};

const SIGINT_EXIT = 130;
const SIGTERM_EXIT = 143;

function defaultExec(argv: string[]): RunExecResult {
  const proc = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: proc.exitCode ?? 1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

export function runsRoot(env: Record<string, string | undefined> = process.env): string {
  return resolve(env["FLUX_RUNS_ROOT"] || join(homedir(), ".flux", "runs"));
}

export function runScriptPath(fluxRoot: string): string {
  return join(fluxRoot, "scripts", "run.sh");
}

export function stageStatusForExit(exitCode: number | null): StageStatus {
  if (exitCode === 0) return "completed";
  if (exitCode === SIGINT_EXIT || exitCode === SIGTERM_EXIT) return "cancelled";
  return "failed";
}

export function harnessForRun(harness: Harness, resolution: HarnessResolution["source"] = "flag"): RunHarness {
  const source = resolution === "default" ? "default" : "cli-launch";
  switch (harness) {
    case "claude":
      return { value: "claude-code", source };
    case "cursor":
      return { value: "cursor", source };
    case "codex":
      return { value: "codex", source };
    case UNKNOWN_HARNESS:
      return { value: "unknown", source: "cli-launch" };
  }
}

function prNumber(target: string | null): string | null {
  if (!target) return null;
  if (/^\d+$/.test(target)) return target;
  return target.match(/^https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/)?.[1] ?? null;
}

export function slugForTarget(verb: string, target: string | null): string {
  const number = prNumber(target);
  return number ? `${verb}-pr-${number}` : verb;
}

export function targetForRun(target: string | null): string | null {
  const number = prNumber(target);
  return number ? `github:pr/${number}` : null;
}

export function capabilityArgs(preflight: PreflightResult): string[] {
  const args: string[] = ["--cap-hint", preflight.capability_level_hint];
  for (const r of preflight.requirements.hard) if (!r.ok) args.push("--cap-missing", `${r.name}:hard`);
  for (const r of preflight.requirements.soft) if (!r.ok) args.push("--cap-missing", `${r.name}:soft`);
  for (const d of preflight.degradations) args.push("--cap-degradation", d);
  return args;
}

function runScript(script: string, root: string, args: string[], exec: RunExec): RunExecResult {
  return exec(["bash", script, ...args, "--root", root]);
}

function failure(step: string, result: RunExecResult): Error {
  const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`;
  return new Error(`[flux] run.sh ${step} falhou: ${detail}`);
}

export type BeginRecordingInput = {
  fluxRoot: string;
  verb: string;
  target: string | null;
  harness: Harness;
  harnessSource?: HarnessResolution["source"];
  sessionId: string | null;
  preflight: PreflightResult;
  root?: string;
  exec?: RunExec;
};

export function scriptAvailable(fluxRoot: string): boolean {
  return fluxRoot !== "UNAVAILABLE" && existsSync(runScriptPath(fluxRoot));
}

export function beginRecording(input: BeginRecordingInput): RunHandle {
  const exec = input.exec ?? defaultExec;
  const root = input.root ?? runsRoot();
  const script = runScriptPath(input.fluxRoot);
  const harness = harnessForRun(input.harness, input.harnessSource);

  const started = runScript(
    script,
    root,
    ["start", "--slug", slugForTarget(input.verb, input.target), "--cli-version", CLI_VERSION],
    exec,
  );
  if (started.exitCode !== 0) throw failure("start", started);
  const runId = started.stdout.trim();

  const stageArgs = [
    "stage-start",
    "--run",
    runId,
    "--verb",
    input.verb,
    "--writer",
    "cli",
    "--harness-value",
    harness.value,
    "--harness-source",
    harness.source,
  ];
  if (input.sessionId) stageArgs.push("--session-id", input.sessionId);
  const target = targetForRun(input.target);
  if (target) stageArgs.push("--target", target);
  stageArgs.push(...capabilityArgs(input.preflight));

  const staged = runScript(script, root, stageArgs, exec);
  if (staged.exitCode !== 0) {
    runScript(script, root, ["end", "--run", runId, "--result", "failed"], exec);
    throw failure("stage-start", staged);
  }

  return { runId, sequence: staged.stdout.trim(), root, runDir: join(root, runId), script };
}

export type FinishRecordingResult = { ok: boolean; warnings: string[] };

export function finishRecording(
  handle: RunHandle,
  exitCode: number | null,
  exec: RunExec = defaultExec,
): FinishRecordingResult {
  const warnings: string[] = [];
  const status = stageStatusForExit(exitCode);
  const endArgs = ["stage-end", "--run", handle.runId, "--seq", handle.sequence, "--status", status];
  if (exitCode !== null) endArgs.push("--exit-code", String(exitCode));

  const ended = runScript(handle.script, handle.root, endArgs, exec);
  if (ended.exitCode !== 0) warnings.push(failure("stage-end", ended).message);

  const closed = runScript(handle.script, handle.root, ["end", "--run", handle.runId], exec);
  if (closed.exitCode !== 0) warnings.push(failure("end", closed).message);

  return { ok: warnings.length === 0, warnings };
}
