import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  beginRecording,
  capabilityArgs,
  finishRecording,
  harnessForRun,
  runScriptPath,
  runsRoot,
  scriptAvailable,
  slugForTarget,
  stageStatusForExit,
  targetForRun,
  type RunExec,
} from "./run.ts";
import { buildPromptBody } from "./prompt.ts";
import type { PreflightResult } from "./preflight.ts";
import type { ResolvedContext } from "./resolve.ts";

const FLUX_ROOT = join(import.meta.dir, "..", "..", "plugins", "flux");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "flux-run-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makePreflight(overrides: Partial<PreflightResult> = {}): PreflightResult {
  return {
    schema_version: "1.0.0",
    status: "degraded",
    abort_message: null,
    verb: "review",
    target: "184",
    family: "flux",
    resolved_at: "2026-10-01T00:00:00.000Z",
    flux_root: FLUX_ROOT,
    flux_root_source: "env:CLAUDE_PLUGIN_ROOT",
    manifest_path: "/Users/someone/.claude/flux-context.json",
    anchor: "/Users/someone/www/flux",
    profile: "pessoal",
    exec_command: "/workflow",
    exec_fallback: null,
    holistic: { candidate: "/Users/someone/.claude/agents/reviewer.md", source: "override-local", generic_forms: [] },
    kit_roots: ["/Users/someone/kits/flux"],
    capability_level_hint: "FULL-tentativo",
    lenses: { l2_paths: ["/Users/someone/.claude/flux-specialists/flux"], l3_paths: [] },
    requirements: {
      hard: [
        { type: "file", name: "shared/review-legend.md", ok: true, path: "/Users/someone/flux/plugins/flux/shared/review-legend.md" },
        { type: "bin", name: "git", ok: true },
      ],
      soft: [
        { type: "bin", name: "gh", ok: true },
        { type: "vault", name: "vault", ok: false, reason: "vault_root ausente no manifesto" },
      ],
    },
    degradations: ["vault indisponivel — rodadas anteriores nao consultadas; artefato nao persistido"],
    session_revalidation_required: ["flux_cmd"],
    warnings: [],
    ...overrides,
  };
}

function fm(file: string): string {
  const text = readFileSync(file, "utf8");
  const end = text.indexOf("\n---", 4);
  return text.slice(0, end + 4);
}

function fmValue(file: string, key: string): string | null {
  const line = fm(file)
    .split("\n")
    .find((l) => l.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim() : null;
}

describe("slugForTarget / targetForRun", () => {
  it("numero de PR vira review-pr-N", () => {
    expect(slugForTarget("review", "184")).toBe("review-pr-184");
    expect(targetForRun("184")).toBe("github:pr/184");
  });

  it("URL de PR do GitHub vira review-pr-N sem carregar dono nem repo", () => {
    expect(slugForTarget("review", "https://github.com/acme/segredo/pull/77")).toBe("review-pr-77");
    expect(targetForRun("https://github.com/acme/segredo/pull/77")).toBe("github:pr/77");
  });

  it("alvo sem forma conhecida nunca entra no slug nem no target: caminhos e nomes ficam de fora", () => {
    expect(slugForTarget("review", "Minha Branch/feature_X")).toBe("review");
    expect(slugForTarget("review", "/Users/alguem/segredo/doc.md")).toBe("review");
    expect(slugForTarget("review", "https://example.com/acme/x/pull/9")).toBe("review");
    expect(targetForRun("Minha Branch/feature_X")).toBeNull();
    expect(targetForRun("/Users/alguem/segredo/doc.md")).toBeNull();
  });

  it("sem alvo usa so o verbo", () => {
    expect(slugForTarget("review", null)).toBe("review");
    expect(targetForRun(null)).toBeNull();
  });
});

describe("stageStatusForExit", () => {
  it("0 completa, 130 e 143 cancelam, o resto falha, desconhecido falha", () => {
    expect(stageStatusForExit(0)).toBe("completed");
    expect(stageStatusForExit(130)).toBe("cancelled");
    expect(stageStatusForExit(143)).toBe("cancelled");
    expect(stageStatusForExit(1)).toBe("failed");
    expect(stageStatusForExit(137)).toBe("failed");
    expect(stageStatusForExit(null)).toBe("failed");
  });
});

describe("harnessForRun: vocabulario do run, origem sempre cli-launch", () => {
  it("mapeia os canonicos e marca override como unknown", () => {
    expect(harnessForRun("claude")).toEqual({ value: "claude-code", source: "cli-launch" });
    expect(harnessForRun("cursor")).toEqual({ value: "cursor", source: "cli-launch" });
    expect(harnessForRun("codex")).toEqual({ value: "codex", source: "cli-launch" });
    expect(harnessForRun("desconhecido")).toEqual({ value: "unknown", source: "cli-launch" });
  });
});

describe("capabilityArgs: projecao do PreflightResult sem nenhum path", () => {
  it("leva nome e estado, nunca path, manifesto, ancora, kits nem lentes", () => {
    const args = capabilityArgs(makePreflight());
    expect(args).toEqual([
      "--cap-hint",
      "FULL-tentativo",
      "--cap-hard",
      "shared/review-legend.md:ok",
      "--cap-hard",
      "git:ok",
      "--cap-soft",
      "gh:ok",
      "--cap-soft",
      "vault:fail",
      "--cap-degradation",
      "vault indisponivel — rodadas anteriores nao consultadas; artefato nao persistido",
    ]);
    expect(args.join(" ")).not.toContain("/Users/");
  });
});

describe("runsRoot / scriptAvailable", () => {
  it("usa FLUX_RUNS_ROOT quando definido e ~/.flux/runs por padrao", () => {
    expect(runsRoot({ FLUX_RUNS_ROOT: "/x/y" })).toBe("/x/y");
    expect(runsRoot({})).toMatch(/\.flux\/runs$/);
  });

  it("raiz relativa vira absoluta, para o modelo nao resolver em outro cwd", () => {
    const root = runsRoot({ FLUX_RUNS_ROOT: "relativa/runs" });
    expect(root.startsWith("/")).toBe(true);
    expect(root.endsWith("relativa/runs")).toBe(true);
  });

  it("encontra run.sh na raiz real do plugin e recusa UNAVAILABLE", () => {
    expect(scriptAvailable(FLUX_ROOT)).toBe(true);
    expect(scriptAvailable("UNAVAILABLE")).toBe(false);
    expect(scriptAvailable(join(tmp, "nao-existe"))).toBe(false);
  });
});

describe("buildPromptBody: run entra explicitamente no PREFLIGHT RESOLVIDO", () => {
  const ctx = {
    profile: "generico",
    manifest_path: null,
    anchor: "/tmp/x",
    flux_root: "/tmp/flux",
    flux_root_source: "env:CLAUDE_PLUGIN_ROOT",
    exec_command: "/workflow",
    exec_fallback: null,
    lenses: { l2_paths: [], l3_paths: [] },
    warnings: [],
    preferred_harness: null,
  } as unknown as ResolvedContext;

  it("sem run, o bloco nao tem as linhas de run", () => {
    const body = buildPromptBody(ctx, "review", "184", { harness: "claude", harnessSource: "flag" });
    expect(body).not.toContain("run_id:");
    expect(body).not.toContain("run_stage:");
  });

  it("com run, traz run_id, run_stage e run_root dentro do bloco", () => {
    const body = buildPromptBody(ctx, "review", "184", {
      harness: "claude",
      harnessSource: "flag",
      run: { runId: "20261001T200000Z_review-pr-184_ab12", sequence: "01", root: "/r" },
    });
    const block = body.slice(0, body.indexOf("--- FIM PREFLIGHT RESOLVIDO ---"));
    expect(block).toContain("run_id: 20261001T200000Z_review-pr-184_ab12");
    expect(block).toContain("run_stage: 01");
    expect(block).toContain("run_root: /r");
    expect(body.trimEnd().endsWith("/flux:review 184")).toBe(true);
  });
});

describe("beginRecording com exec falso: argumentos passados ao writer", () => {
  it("start, stage-start e depois stage-end/end, sempre com --root", () => {
    const calls: string[][] = [];
    const exec: RunExec = (argv) => {
      calls.push(argv);
      if (argv[2] === "start") return { exitCode: 0, stdout: "20261001T200000Z_review-pr-184_ab12\n", stderr: "" };
      if (argv[2] === "stage-start") return { exitCode: 0, stdout: "01\n", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const handle = beginRecording({
      fluxRoot: FLUX_ROOT,
      verb: "review",
      target: "184",
      harness: "claude",
      sessionId: "lq1x2y3z-9f8e7d6c",
      preflight: makePreflight(),
      pid: 4242,
      root: "/r",
      exec,
    });
    expect(handle).toEqual({
      runId: "20261001T200000Z_review-pr-184_ab12",
      sequence: "01",
      root: "/r",
      runDir: "/r/20261001T200000Z_review-pr-184_ab12",
      script: runScriptPath(FLUX_ROOT),
    });
    const stage = calls[1]!;
    expect(stage.slice(0, 3)).toEqual(["bash", runScriptPath(FLUX_ROOT), "stage-start"]);
    expect(stage).toContain("--writer");
    expect(stage[stage.indexOf("--writer") + 1]).toBe("cli");
    expect(stage[stage.indexOf("--harness-value") + 1]).toBe("claude-code");
    expect(stage[stage.indexOf("--harness-source") + 1]).toBe("cli-launch");
    expect(stage[stage.indexOf("--session-id") + 1]).toBe("lq1x2y3z-9f8e7d6c");
    expect(stage[stage.indexOf("--target") + 1]).toBe("github:pr/184");
    expect(stage[stage.indexOf("--pid") + 1]).toBe("4242");
    for (const c of calls) expect(c.slice(-2)).toEqual(["--root", "/r"]);
    expect(stage.slice(3).join(" ")).not.toContain("/Users/");
  });

  it("falha do writer no start vira erro explicito, sem seguir", () => {
    const exec: RunExec = () => ({ exitCode: 4, stdout: "", stderr: "valor recusado" });
    expect(() =>
      beginRecording({ fluxRoot: FLUX_ROOT, verb: "review", target: "1", harness: "claude", sessionId: null, preflight: makePreflight(), root: "/r", exec }),
    ).toThrow("run.sh start falhou: valor recusado");
  });

  it("falha no stage-start encerra o run como failed e propaga o erro", () => {
    const calls: string[][] = [];
    const exec: RunExec = (argv) => {
      calls.push(argv);
      if (argv[2] === "start") return { exitCode: 0, stdout: "20261001T200000Z_review_ab12\n", stderr: "" };
      if (argv[2] === "stage-start") return { exitCode: 4, stdout: "", stderr: "path absoluto" };
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    expect(() =>
      beginRecording({ fluxRoot: FLUX_ROOT, verb: "review", target: null, harness: "claude", sessionId: null, preflight: makePreflight(), root: "/r", exec }),
    ).toThrow("run.sh stage-start falhou: path absoluto");
    const closing = calls[calls.length - 1]!;
    expect(closing.slice(2, 4)).toEqual(["end", "--run"]);
    expect(closing).toContain("failed");
  });
});

describe("beginRecording/finishRecording contra o run.sh real", () => {
  const run = (exitCode: number | null) => {
    const root = join(tmp, "runs");
    const handle = beginRecording({
      fluxRoot: FLUX_ROOT,
      verb: "review",
      target: "https://github.com/acme/flux/pull/184",
      harness: "claude",
      sessionId: "lq1x2y3z-9f8e7d6c",
      preflight: makePreflight(),
      root,
    });
    const finished = finishRecording(handle, exitCode);
    return { root, handle, finished };
  };

  it("grava run.md, 01-review.md e outcome.md, completed com exit 0", () => {
    const { handle, finished } = run(0);
    expect(finished).toEqual({ ok: true, warnings: [] });
    expect(readdirSync(handle.runDir).sort()).toEqual(["01-review.md", "outcome.md", "run.md"]);

    const stage = join(handle.runDir, "01-review.md");
    expect(fmValue(stage, "schema")).toBe("flux-run/1");
    expect(fmValue(stage, "writer")).toBe("cli");
    expect(fmValue(stage, "status")).toBe("completed");
    expect(fmValue(stage, "exit_code")).toBe("0");
    expect(fmValue(stage, "session_id")).toBe("lq1x2y3z-9f8e7d6c");
    expect(fmValue(stage, "target")).toBe('"github:pr/184"');
    expect(fm(stage)).toContain("  value: claude-code");
    expect(fm(stage)).toContain("  source: cli-launch");
    expect(fm(stage)).toContain("    - {name: vault, ok: false}");
    expect(fm(stage)).not.toContain("/Users/");
    expect(fmValue(join(handle.runDir, "run.md"), "status")).toBe("completed");
    expect(fmValue(join(handle.runDir, "outcome.md"), "result")).toBe("completed");
    expect(fmValue(join(handle.runDir, "run.md"), "cli_version")).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("permissoes 0700 no diretorio e 0600 nos arquivos", () => {
    const { handle } = run(0);
    expect((statSync(handle.runDir).mode & 0o777).toString(8)).toBe("700");
    for (const f of readdirSync(handle.runDir)) {
      expect((statSync(join(handle.runDir, f)).mode & 0o777).toString(8)).toBe("600");
    }
  });

  it("exit 1 vira failed; 130 vira cancelled; exit desconhecido vira failed sem exit_code", () => {
    const failed = run(1);
    expect(fmValue(join(failed.handle.runDir, "01-review.md"), "status")).toBe("failed");
    expect(fmValue(join(failed.handle.runDir, "01-review.md"), "exit_code")).toBe("1");
    expect(fmValue(join(failed.handle.runDir, "outcome.md"), "result")).toBe("failed");

    const cancelled = run(130);
    expect(fmValue(join(cancelled.handle.runDir, "01-review.md"), "status")).toBe("cancelled");
    expect(fmValue(join(cancelled.handle.runDir, "01-review.md"), "exit_code")).toBe("130");
    expect(fmValue(join(cancelled.handle.runDir, "outcome.md"), "result")).toBe("cancelled");

    const unknown = run(null);
    expect(fmValue(join(unknown.handle.runDir, "01-review.md"), "status")).toBe("failed");
    expect(fmValue(join(unknown.handle.runDir, "01-review.md"), "exit_code")).toBe("null");
  });

  it("nao existe nenhum arquivo alem dos tres e nenhum tmp ou lock sobrando", () => {
    const { handle } = run(0);
    expect(readdirSync(handle.runDir).every((f) => !f.startsWith("."))).toBe(true);
    expect(existsSync(join(handle.runDir, ".lock"))).toBe(false);
  });
});

describe("flux review --record de ponta a ponta (harness substituido por FLUX_CLAUDE_CMD)", () => {
  function cli(args: string[], envExtra: Record<string, string>, home: string) {
    const cwd = mkdtempSync(join(tmpdir(), "flux-cli-record-"));
    const { FLUX_HARNESS: _h, FLUX_SESSION_ID: _s, ...clean } = process.env;
    const result = spawnSync("bun", ["run", join(import.meta.dir, "index.ts"), ...args], {
      cwd,
      encoding: "utf8",
      env: { ...clean, HOME: home, SHELL: "/bin/bash", CLAUDE_PLUGIN_ROOT: FLUX_ROOT, ...envExtra },
    });
    rmSync(cwd, { recursive: true, force: true });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status ?? 1 };
  }

  function onlyRunDir(home: string): string {
    const root = join(home, ".flux", "runs");
    const dirs = readdirSync(root);
    expect(dirs.length).toBe(1);
    return join(root, dirs[0]!);
  }

  it("exit 0: run completed, writer cli, harness unknown por causa do override, sessao ligada", () => {
    const home = join(tmp, "home-ok");
    const result = cli(["review", "184", "--record", "--yes", "--repo", "flux"], { FLUX_CLAUDE_CMD: "true" }, home);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("gravando o run");
    expect(result.stderr).toContain("run gravado em");

    const dir = onlyRunDir(home);
    const stage = join(dir, "01-review.md");
    expect(readdirSync(dir).sort()).toEqual(["01-review.md", "outcome.md", "run.md"]);
    expect(fmValue(stage, "writer")).toBe("cli");
    expect(fmValue(stage, "status")).toBe("completed");
    expect(fmValue(stage, "exit_code")).toBe("0");
    expect(fm(stage)).toContain("  value: unknown");
    expect(fm(stage)).toContain("  source: cli-launch");
    expect(fmValue(stage, "target")).toBe('"github:pr/184"');

    const sessionId = fmValue(stage, "session_id")!;
    expect(sessionId).toMatch(/^[a-z0-9]+-[0-9a-f]{8}$/);
    const session = JSON.parse(readFileSync(join(home, ".flux", "sessions", `${sessionId}.json`), "utf8"));
    expect(session.status).toBe("ended");
    expect(fm(stage)).not.toContain(home);
  });

  it("exit 1 do harness: run failed e o exit code do flux acompanha", () => {
    const home = join(tmp, "home-fail");
    const result = cli(["review", "184", "--record", "--yes", "--repo", "flux"], { FLUX_CLAUDE_CMD: "false" }, home);
    expect(result.status).toBe(1);
    const dir = onlyRunDir(home);
    expect(fmValue(join(dir, "01-review.md"), "status")).toBe("failed");
    expect(fmValue(join(dir, "01-review.md"), "exit_code")).toBe("1");
    expect(fmValue(join(dir, "outcome.md"), "result")).toBe("failed");
  });

  it("exit 130 do harness: stage cancelled", () => {
    const home = join(tmp, "home-cancel");
    const result = cli(["review", "184", "--record", "--yes", "--repo", "flux"], { FLUX_CLAUDE_CMD: "sh -c 'exit 130'" }, home);
    expect(result.status).toBe(130);
    const dir = onlyRunDir(home);
    expect(fmValue(join(dir, "01-review.md"), "status")).toBe("cancelled");
    expect(fmValue(join(dir, "01-review.md"), "exit_code")).toBe("130");
  });

  it("FLUX_RUNS_ROOT muda a raiz e nada vai para ~/.flux/runs", () => {
    const home = join(tmp, "home-root");
    const root = join(tmp, "outra-raiz");
    const result = cli(["review", "184", "--record", "--yes", "--repo", "flux"], { FLUX_CLAUDE_CMD: "true", FLUX_RUNS_ROOT: root }, home);
    expect(result.status).toBe(0);
    expect(readdirSync(root).length).toBe(1);
    expect(existsSync(join(home, ".flux", "runs"))).toBe(false);
  });

  it("sem --record nenhum run e criado", () => {
    const home = join(tmp, "home-norecord");
    const result = cli(["review", "184", "--yes", "--repo", "flux"], { FLUX_CLAUDE_CMD: "true" }, home);
    expect(result.status).toBe(0);
    expect(existsSync(join(home, ".flux", "runs"))).toBe(false);
  });

  it("--record com --dry imprime o comando e nao cria run", () => {
    const home = join(tmp, "home-dry");
    const result = cli(["review", "184", "--record", "--dry", "--repo", "flux"], { FLUX_CLAUDE_CMD: "true" }, home);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("nenhum run foi criado");
    expect(result.stdout).toContain("/flux:review");
    expect(existsSync(join(home, ".flux", "runs"))).toBe(false);
  });

  it("--record em outro verbo e recusado", () => {
    const home = join(tmp, "home-verb");
    const result = cli(["peek", "184", "--record", "--yes", "--repo", "flux"], { FLUX_CLAUDE_CMD: "true" }, home);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--record só é suportado em "review"');
    expect(existsSync(join(home, ".flux", "runs"))).toBe(false);
  });

  it("--record com --remote e recusado, com e sem alias, inclusive em --dry", () => {
    const home = join(tmp, "home-remote");
    const comAlias = cli(["review", "184", "--record", "--remote", "box", "--dry", "--repo", "flux"], { FLUX_CLAUDE_CMD: "true" }, home);
    expect(comAlias.status).toBe(1);
    expect(comAlias.stderr).toContain("--record ainda não suporta --remote");
    expect(comAlias.stdout).not.toContain("ssh");
    const semAlias = cli(["review", "184", "--record", "--remote", "--yes", "--repo", "flux"], { FLUX_CLAUDE_CMD: "true" }, home);
    expect(semAlias.status).toBe(1);
    expect(semAlias.stderr).toContain("--record ainda não suporta --remote");
    expect(existsSync(join(home, ".flux", "runs"))).toBe(false);
  });

  it("--record fora de um verbo (resolve, preflight, session) e recusado em vez de ignorado", () => {
    const home = join(tmp, "home-sub");
    for (const args of [["resolve", ".", "--record", "--json"], ["preflight", "review", "--record", "--json"], ["session", "end", "--record"]]) {
      const result = cli(args, {}, home);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--record só vale em");
    }
  });

  it("--record com alvo que e caminho nao vaza o caminho para o run", () => {
    const home = join(tmp, "home-path");
    const result = cli(["review", "/Users/alguem/segredo/doc.md", "--record", "--yes"], { FLUX_CLAUDE_CMD: "true" }, home);
    expect(result.status).toBe(0);
    const dir = onlyRunDir(home);
    expect(dir).not.toContain("segredo");
    expect(readFileSync(join(dir, "01-review.md"), "utf8")).not.toContain("segredo");
    expect(readFileSync(join(dir, "run.md"), "utf8")).not.toContain("segredo");
  });

  it("--record com --new e recusado", () => {
    const home = join(tmp, "home-new");
    const result = cli(["review", "184", "--record", "--new", "--yes", "--repo", "flux"], { FLUX_CLAUDE_CMD: "true" }, home);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--record ainda não suporta --new");
    expect(existsSync(join(home, ".flux", "runs"))).toBe(false);
  });
});
