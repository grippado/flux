import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  GATE_PENDING_EXIT,
  armGateChannel,
  closeGateChannel,
  describeGateSignal,
  effectiveExitCode,
  planGateChannel,
  readGateSignal,
  unavailableReason,
  type GateChannel,
} from "./gate.ts";
import { runHere } from "./launch.ts";
import { stageStatusForExit } from "./run.ts";
import { buildPromptBody } from "./prompt.ts";
import type { ResolvedContext } from "./resolve.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "flux-gate-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function armed(): Extract<GateChannel, { available: true }> {
  const channel = planGateChannel(null, tmp);
  if (!channel.available) throw new Error("canal deveria estar disponivel");
  armGateChannel(channel);
  return channel;
}

describe("canal do sinal: caminho novo por execucao, so criado ao armar", () => {
  it("plan nao toca o disco; arm cria o diretorio 0700; close remove", () => {
    const channel = planGateChannel(null, tmp);
    if (!channel.available) throw new Error("indisponivel");
    expect(existsSync(channel.dir)).toBe(false);
    armGateChannel(channel);
    expect(statSync(channel.dir).mode & 0o777).toBe(0o700);
    closeGateChannel(channel);
    expect(existsSync(channel.dir)).toBe(false);
  });

  it("dois canais nunca compartilham caminho, entao arquivo velho nao vira sinal de outra execucao", () => {
    const a = planGateChannel(null, tmp);
    const b = planGateChannel(null, tmp);
    if (!a.available || !b.available) throw new Error("indisponivel");
    expect(a.path).not.toBe(b.path);
  });

  it("com motivo, o canal e declarado indisponivel e nunca le nada", () => {
    const channel = planGateChannel("porque sim", tmp);
    expect(channel).toEqual({ available: false, reason: "porque sim" });
    expect(readGateSignal(channel)).toBeNull();
  });
});

describe("unavailableReason: so desliga onde o canal sabidamente nao funciona", () => {
  const base = { harness: "claude" as const, safe: false, here: true };

  it("claude, cursor e codex sem --safe: disponivel", () => {
    expect(unavailableReason(base)).toBeNull();
    expect(unavailableReason({ ...base, harness: "cursor" })).toBeNull();
    expect(unavailableReason({ ...base, harness: "codex" })).toBeNull();
  });

  it("codex com --safe: indisponivel (sandbox read-only nao grava o sinal)", () => {
    expect(unavailableReason({ ...base, harness: "codex", safe: true })).toContain("read-only");
  });

  it("claude com --safe continua disponivel: o prompt de permissao e interativo", () => {
    expect(unavailableReason({ ...base, safe: true })).toBeNull();
  });

  it("fora do modo here (--new) o fim da sessao nao e observavel", () => {
    expect(unavailableReason({ ...base, here: false })).toContain("--new");
  });
});

describe("readGateSignal", () => {
  it("sem arquivo: nenhum sinal", () => {
    expect(readGateSignal(armed())).toBeNull();
  });

  it("sinal valido: kind do vocabulario de gates, pergunta e opcoes", () => {
    const channel = armed();
    writeFileSync(
      channel.path,
      JSON.stringify({ schema: "flux-gate/1", pending: true, kind: "commit-push", question: "Aplicar correcoes?", options: ["Sim", "Nao"] }),
    );
    expect(readGateSignal(channel)).toEqual({
      kind: "commit-push",
      question: "Aplicar correcoes?",
      options: ["Sim", "Nao"],
      malformed: false,
    });
  });

  it("pending false e um recibo de gate resolvido: nao e sinal", () => {
    const channel = armed();
    writeFileSync(channel.path, JSON.stringify({ schema: "flux-gate/1", pending: false, kind: "pr-open" }));
    expect(readGateSignal(channel)).toBeNull();
  });

  for (const [name, content] of [
    ["arquivo vazio", ""],
    ["JSON invalido", "{nao e json"],
    ["JSON que nao e objeto", "[1,2]"],
    ["schema desconhecido", JSON.stringify({ schema: "outro/9", pending: true })],
    ["schema ausente", JSON.stringify({ pending: true, kind: "pr-open" })],
  ] as const) {
    it(`${name}: tratado como pendente e malformado (direcao segura)`, () => {
      const channel = armed();
      writeFileSync(channel.path, content);
      const signal = readGateSignal(channel);
      expect(signal).not.toBeNull();
      expect(signal!.malformed).toBe(true);
      expect(signal!.kind).toBe("unknown");
    });
  }

  it("kind fora do vocabulario vira unknown e malformado, sem rejeitar o sinal", () => {
    const channel = armed();
    writeFileSync(channel.path, JSON.stringify({ schema: "flux-gate/1", pending: true, kind: "inventado" }));
    expect(readGateSignal(channel)).toMatchObject({ kind: "unknown", malformed: true });
  });

  it("sanitiza controle e trunca: a pergunta vai ao terminal", () => {
    const channel = armed();
    writeFileSync(
      channel.path,
      JSON.stringify({ schema: "flux-gate/1", pending: true, kind: "pr-open", question: "a\u001b[31m\nb" + "x".repeat(500) }),
    );
    const q = readGateSignal(channel)!.question!;
    expect(q).not.toMatch(/[\u0000-\u001f]/);
    expect(q.length).toBeLessThanOrEqual(200);
  });
});

describe("effectiveExitCode", () => {
  const pending = { kind: "pr-open" as const, question: null, options: [], malformed: false };

  it("exit 0 sem sinal: sucesso", () => {
    expect(effectiveExitCode(0, null)).toBe(0);
  });

  it("exit 0 com sinal: codigo proprio de gate pendente, distinto de 0, 1, 2, 3", () => {
    expect(effectiveExitCode(0, pending)).toBe(GATE_PENDING_EXIT);
    expect([0, 1, 2, 3]).not.toContain(GATE_PENDING_EXIT);
  });

  it("exit diferente de zero com sinal: o codigo do harness vence (falha, cancelamento)", () => {
    expect(effectiveExitCode(1, pending)).toBe(1);
    expect(effectiveExitCode(130, pending)).toBe(130);
    expect(effectiveExitCode(143, pending)).toBe(143);
  });

  it("com --record a stage fecha failed com o codigo efetivo, nunca completed", () => {
    expect(stageStatusForExit(effectiveExitCode(0, pending))).toBe("failed");
  });

  it("exit nulo (nao observavel) permanece nulo", () => {
    expect(effectiveExitCode(null, pending)).toBeNull();
  });
});

describe("describeGateSignal", () => {
  it("diz o kind, a pergunta, as opcoes e que a execucao nao concluiu", () => {
    const text = describeGateSignal({ kind: "commit-push", question: "Aplicar?", options: ["Sim", "Nao"], malformed: false });
    expect(text).toContain("gate pendente (commit-push): Aplicar?");
    expect(text).toContain("1. Sim");
    expect(text).toContain("2. Nao");
    expect(text).toContain(`saida ${GATE_PENDING_EXIT}`);
  });

  it("sinal malformado e declarado como tal", () => {
    const text = describeGateSignal({ kind: "unknown", question: null, options: [], malformed: true });
    expect(text).toContain("ilegivel ou fora do contrato");
  });
});

describe("PREFLIGHT RESOLVIDO: o caminho do sinal entra no bloco, nao no ambiente", () => {
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

  it("sem canal informado, nenhuma linha gate_signal", () => {
    const body = buildPromptBody(ctx, "build", "LAB-1", { harness: "codex", harnessSource: "flag" });
    expect(body).not.toContain("gate_signal:");
  });

  it("canal disponivel: gate_signal com o caminho, dentro do bloco", () => {
    const channel = planGateChannel(null, tmp);
    const body = buildPromptBody(ctx, "build", "LAB-1", { harness: "codex", harnessSource: "flag", gateSignal: channel });
    const block = body.slice(0, body.indexOf("--- FIM PREFLIGHT RESOLVIDO ---"));
    expect(block).toContain(`gate_signal: ${(channel as { path: string }).path}`);
    expect(body.trimEnd().endsWith("/flux:build LAB-1")).toBe(true);
  });

  it("canal indisponivel: o modelo e avisado em vez de receber um caminho que nao grava", () => {
    const body = buildPromptBody(ctx, "build", "LAB-1", {
      harness: "codex",
      harnessSource: "flag",
      gateSignal: planGateChannel("codex exec em modo seguro roda em sandbox read-only", tmp),
    });
    expect(body).toContain("gate_signal: indisponivel (codex exec em modo seguro roda em sandbox read-only)");
  });
});

describe("regressao: gate pendente com exit 0 e sem DECISION REQUIRED no texto (processo real)", () => {
  const HARNESS = `#!/bin/sh
echo "resposta final sem nenhum marcador textual"
SIGNAL=$(printf '%s' "$2" | sed -n 's/^gate_signal: //p')
case "$FAKE_MODE" in
  pending) printf '{"schema":"flux-gate/1","pending":true,"kind":"pr-open","question":"Abrir a PR?"}' > "$SIGNAL" ;;
  malformed) printf 'lixo' > "$SIGNAL" ;;
  pending-fail) printf '{"schema":"flux-gate/1","pending":true,"kind":"pr-open"}' > "$SIGNAL"; exit 7 ;;
esac
exit 0
`;

  function runFlux(mode: string): { status: number; stdout: string; stderr: string } {
    const bin = join(tmp, "harness.sh");
    writeFileSync(bin, HARNESS);
    chmodSync(bin, 0o755);
    const cwd = mkdtempSync(join(tmp, "cwd-"));
    const result = spawnSync("bun", ["run", join(import.meta.dir, "index.ts"), "peek", "1", "--repo", "flux", "--yes"], {
      cwd,
      encoding: "utf8",
      input: "",
      env: { ...process.env, FLUX_CLAUDE_CMD: bin, FAKE_MODE: mode, SHELL: "/bin/sh", TMPDIR: tmp, HOME: tmp },
    });
    return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }

  it("execucao normal bem-sucedida: exit 0, saida do harness preservada, nenhum aviso de gate", () => {
    const r = runFlux("none");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("resposta final sem nenhum marcador textual");
    expect(r.stderr).not.toContain("gate pendente");
  });

  it("gate pendente, harness com exit 0 e marcador ausente: CLI sai com o codigo de gate pendente", () => {
    const r = runFlux("pending");
    expect(r.stdout).not.toContain("DECISION REQUIRED");
    expect(r.stdout).toContain("resposta final sem nenhum marcador textual");
    expect(r.status).toBe(GATE_PENDING_EXIT);
    expect(r.stderr).toContain("gate pendente (pr-open): Abrir a PR?");
  });

  it("sinal ilegivel: tambem nao e sucesso", () => {
    const r = runFlux("malformed");
    expect(r.status).toBe(GATE_PENDING_EXIT);
  });

  it("harness falhou (exit 7) alem de gravar o sinal: o codigo do harness prevalece", () => {
    const r = runFlux("pending-fail");
    expect(r.status).toBe(7);
  });

  it("o diretorio do sinal nao sobra no TMPDIR depois da execucao", () => {
    runFlux("pending");
    const leftovers = Bun.spawnSync(["ls", tmp]).stdout.toString().split("\n").filter((n) => n.startsWith("flux-gate-"));
    expect(leftovers).toEqual([]);
  });
});

describe("runHere nao foi alterado: stdout do filho continua herdado", () => {
  it("o filho real escreve o sinal e o codigo bruto continua 0 (a promocao e do CLI)", async () => {
    const channel = armed();
    const script = join(tmp, "child.sh");
    writeFileSync(script, `#!/bin/sh\nprintf '{"schema":"flux-gate/1","pending":true,"kind":"pr-open"}' > '${channel.path}'\nexit 0\n`);
    chmodSync(script, 0o755);
    const raw = await runHere(
      { command: "x", body: "b", invocation: script },
      { shell: "/bin/sh", writePromptFile: () => { const f = join(tmp, "p.txt"); writeFileSync(f, "b"); return f; } },
    );
    expect(raw).toBe(0);
    expect(readFileSync(channel.path, "utf8")).toContain("flux-gate/1");
    expect(effectiveExitCode(raw, readGateSignal(channel))).toBe(GATE_PENDING_EXIT);
  });
});
