import { resolveContext } from "./resolve.ts";
import { buildPromptBody, buildCommand, resolveInvocation } from "./prompt.ts";
import { launchClaude, runHere, runRemote, buildRemoteSshArgv, listSshHostAliases, checkRemotesReachable } from "./launch.ts";
import { runPreflight } from "./preflight.ts";
import { gatherPr } from "./gather.ts";
import { repoSlugFromTarget } from "./github-url.ts";

export const SUPPORTED_VERBS = ["review", "refine", "issue", "build", "peek", "iterate", "land", "reply", "map", "equip"] as const;
type Verb = typeof SUPPORTED_VERBS[number];

export const TICKET_PATTERN = /^[A-Z]{2,5}-\d+$/;
export const LINEAR_URL_PATTERN = /^https?:\/\/linear\.app\//;

function isTicket(s: string): boolean {
  return TICKET_PATTERN.test(s) || LINEAR_URL_PATTERN.test(s);
}

function isSupportedVerb(s: string): s is Verb {
  return (SUPPORTED_VERBS as readonly string[]).includes(s);
}

function printUsage(): void {
  console.error("Uso: flux resolve [alvo] [--repo <slug>] --json");
  console.error("     flux preflight <verbo> [alvo] [--repo <slug>] [--family <f>] --json");
  console.error("     flux gather pr <n|URL> [--repo owner/repo] [--threads] [--out <dir>] --json");
  console.error("     flux <verbo> [alvo] [--repo <slug>] [--dry] [--safe] [--new] [--remote [alias]]");
  console.error("     flux <verbo> ... --remote  (sem alias: pergunta interativamente qual máquina alcançável usar)");
  console.error("");
  console.error(`Verbos suportados: ${SUPPORTED_VERBS.join(", ")}`);
}

function parseArgs(argv: string[]): {
  subcommand: string | null;
  target: string | null;
  repo: string | null;
  family: string | null;
  out: string | null;
  json: boolean;
  dry: boolean;
  safe: boolean;
  openNew: boolean;
  remote: string | null;
  remotePrompt: boolean;
  threads: boolean;
  rest: string[];
} {
  const args = [...argv];
  let subcommand: string | null = null;
  let target: string | null = null;
  let repo: string | null = null;
  let family: string | null = null;
  let out: string | null = null;
  let json = false;
  let dry = false;
  let safe = false;
  let openNew = false;
  let remote: string | null = null;
  let remotePrompt = false;
  let threads = false;
  const rest: string[] = [];

  if (args.length > 0) {
    subcommand = args.shift()!;
  }

  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === "--repo" && i + 1 < args.length) {
      repo = args[i + 1];
      i += 2;
    } else if (a === "--remote") {
      if (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
        remote = args[i + 1];
        i += 2;
      } else {
        // --remote sem valor: pede pra descobrir/escolher interativamente.
        remotePrompt = true;
        i++;
      }
    } else if (a === "--family" && i + 1 < args.length) {
      family = args[i + 1];
      i += 2;
    } else if (a === "--out" && i + 1 < args.length) {
      out = args[i + 1];
      i += 2;
    } else if (a === "--json") {
      json = true;
      i++;
    } else if (a === "--dry") {
      dry = true;
      i++;
    } else if (a === "--safe") {
      safe = true;
      i++;
    } else if (a === "--here") {
      // --here virou o padrão (ver --new); aceita e ignora, pra não quebrar
      // quem já digita a flag por hábito.
      i++;
    } else if (a === "--new") {
      openNew = true;
      i++;
    } else if (a === "--threads") {
      threads = true;
      i++;
    } else if (!target && !a.startsWith("--")) {
      target = a;
      i++;
    } else {
      rest.push(a);
      i++;
    }
  }

  return { subcommand, target, repo, family, out, json, dry, safe, openNew, remote, remotePrompt, threads, rest };
}

async function runResolve(opts: {
  target: string | null;
  repo: string | null;
  json: boolean;
}): Promise<void> {
  const ctx = await resolveContext({
    repoSlug: opts.repo ?? repoSlugFromTarget(opts.target) ?? (opts.target && !opts.target.startsWith("/") ? opts.target : null),
    targetPath: opts.target,
    cwd: process.cwd(),
  });

  if (opts.json) {
    const out = {
      profile: ctx.profile,
      manifest_path: ctx.manifest_path,
      anchor: ctx.anchor,
      flux_root: ctx.flux_root,
      flux_root_source: ctx.flux_root_source,
      exec_command: ctx.exec_command,
      exec_fallback: ctx.exec_fallback,
      lenses: ctx.lenses,
      warnings: ctx.warnings,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else {
    console.log(`perfil: ${ctx.profile}`);
    console.log(`manifesto: ${ctx.manifest_path ?? "ausente"}`);
    console.log(`ancora: ${ctx.anchor}`);
    console.log(`flux_root: ${ctx.flux_root} (${ctx.flux_root_source})`);
    console.log(`exec_command: ${ctx.exec_command}`);
    console.log(`exec_fallback: ${ctx.exec_fallback ?? "ausente"}`);
    console.log(`lentes: l2=${ctx.lenses.l2_paths.join(",") || "ausente"} l3=${ctx.lenses.l3_paths.join(",") || "ausente"}`);
    if (ctx.warnings.length > 0) {
      for (const w of ctx.warnings) console.warn(`aviso: ${w}`);
    }
  }
}

async function runVerb(opts: {
  verb: Verb;
  target: string | null;
  repo: string | null;
  dry: boolean;
  safe: boolean;
  openNew: boolean;
  remote: string | null;
  remotePrompt: boolean;
  rest: string[];
  argv: string[];
}): Promise<void> {
  const { verb, target, repo, dry, safe, openNew, rest, argv } = opts;
  let remote = opts.remote;

  if (opts.remotePrompt) {
    remote = await pickRemoteInteractively();
    if (!remote) {
      console.error("[flux] nenhuma máquina selecionada — abortando.");
      process.exit(1);
    }
  }

  if (remote) {
    // Execução remota é sempre inline (equivalente a --here) — abrir aba nova
    // do outro lado da conexão SSH não faz sentido, então --new é descartado.
    const forwarded: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === "--remote") {
        // pula o valor também só quando ele existia (mesma regra do parseArgs)
        if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) i++;
        continue;
      }
      if (a === "--dry" || a === "--new") continue;
      forwarded.push(a);
    }

    if (dry) {
      console.log(buildRemoteSshArgv(remote, forwarded).join(" "));
      return;
    }

    const exitCode = runRemote({ remote, argv: forwarded });
    process.exit(exitCode);
  }

  let effectiveTarget = target;
  let effectiveRepo = repo;
  if (target && LINEAR_URL_PATTERN.test(target)) {
    const idMatch = target.match(/\/issue\/([A-Z]{2,5}-\d+)/i);
    const ticketId = idMatch ? idMatch[1].toUpperCase() : null;
    if (!effectiveRepo) {
      const hint = ticketId ?? "<ID>";
      effectiveRepo = promptForRepo(`Alvo de ticket Linear "${hint}" requer --repo`);
      if (!effectiveRepo) {
        console.error(`Alvo de ticket Linear requer --repo. Exemplo: flux ${verb} ${hint} --repo <slug-do-repo>`);
        process.exit(1);
      }
    }
    effectiveTarget = ticketId ?? target;
  } else if (target && TICKET_PATTERN.test(target)) {
    if (!effectiveRepo) {
      effectiveRepo = promptForRepo(`Alvo de ticket "${target}" requer --repo`);
      if (!effectiveRepo) {
        console.error(`Alvo de ticket Linear requer --repo. Exemplo: flux ${verb} ${target} --repo <slug-do-repo>`);
        process.exit(1);
      }
    }
  }

  const repoSlug = effectiveRepo ?? repoSlugFromTarget(effectiveTarget);
  const ctx = await resolveContext({
    repoSlug,
    targetPath: effectiveTarget,
    cwd: process.cwd(),
  });

  const targetArg = effectiveTarget ?? "";
  const repoFlag = repoSlug ? `--repo ${repoSlug}` : "";
  const extraArgs = rest.join(" ");
  const args = [targetArg, repoFlag, extraArgs].filter(Boolean).join(" ").trim();

  const body = buildPromptBody(ctx, verb, args);
  const invocation = resolveInvocation({ safe });
  const command = buildCommand(body, { safe });

  if (dry) {
    console.log(command);
    return;
  }

  const binary = invocation.split(" ")[0]!;
  if (binary === "claude" && !commandExists("claude")) {
    console.error("claude não encontrado no PATH. Instale via: npm install -g @anthropic-ai/claude-code");
    process.exit(1);
  }

  if (!openNew) {
    const exitCode = runHere({ command, body, invocation });
    process.exit(exitCode);
  }

  await launchClaude({ command, body, invocation });
}

export function promptForRepo(question: string): string | null {
  if (!process.stdin.isTTY) return null;
  const answer = prompt(`${question}. Qual o slug do repo?`);
  const trimmed = answer?.trim();
  return trimmed ? trimmed : null;
}

export async function pickRemoteInteractively(): Promise<string | null> {
  if (!process.stdin.isTTY) return null;

  const candidates = listSshHostAliases();
  if (candidates.length === 0) {
    console.error("[flux] nenhum Host em ~/.ssh/config pra escolher — passe --remote <alias> direto.");
    return null;
  }

  console.error("[flux] verificando quais máquinas estão acessíveis agora...");
  const reachable = await checkRemotesReachable(candidates);
  if (reachable.length === 0) {
    console.error("[flux] nenhuma máquina de ~/.ssh/config está acessível na rede agora.");
    return null;
  }

  if (reachable.length === 1) {
    const answer = prompt(`[flux] só "${reachable[0]}" está acessível agora. Rodar aí? [Y/n]`);
    const yes = !answer || /^y/i.test(answer.trim());
    return yes ? reachable[0]! : null;
  }

  console.error("[flux] máquinas acessíveis:");
  reachable.forEach((alias, i) => console.error(`  ${i + 1}. ${alias}`));
  const answer = prompt(`Qual? [1-${reachable.length}]`);
  const idx = Number(answer?.trim());
  if (!Number.isInteger(idx) || idx < 1 || idx > reachable.length) return null;
  return reachable[idx - 1]!;
}

// `flux` sem nenhum argumento, num terminal de verdade: em vez de só mostrar
// o uso, pergunta o que fazer e monta o argv equivalente ao que o usuário
// teria digitado — daí em diante segue o pipeline normal (parseArgs/runVerb),
// sem duplicar nenhuma lógica de resolução de repo/alvo/remoto.
export async function runWizard(): Promise<string[] | null> {
  console.error("flux — modo interativo (sem argumentos)\n");
  console.error("Comandos disponíveis:");
  SUPPORTED_VERBS.forEach((v, i) => console.error(`  ${i + 1}. ${v}`));

  let verb: Verb | null = null;
  while (!verb) {
    const answer = prompt("Qual comando? [número ou nome]")?.trim();
    if (!answer) return null;
    const asIndex = Number(answer);
    if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= SUPPORTED_VERBS.length) {
      verb = SUPPORTED_VERBS[asIndex - 1]!;
    } else if (isSupportedVerb(answer)) {
      verb = answer;
    } else {
      console.error(`"${answer}" não é um comando válido — tente de novo (Enter em branco cancela).`);
    }
  }

  const target = prompt("PR/URL/ticket/path (opcional — Enter usa o diretório atual):")?.trim();
  const repo = prompt("Repo (slug, opcional — Enter deixa o flux resolver):")?.trim();

  let remoteAlias: string | null = null;
  const wantsRemote = /^y/i.test(prompt("Rodar numa máquina remota via SSH? [y/N]")?.trim() ?? "");
  if (wantsRemote) {
    remoteAlias = await pickRemoteInteractively();
    if (!remoteAlias) {
      console.error("[flux] nenhuma máquina escolhida — seguindo local.");
    }
  }

  const argv: string[] = [verb];
  if (target) argv.push(target);
  if (repo) argv.push("--repo", repo);
  if (remoteAlias) argv.push("--remote", remoteAlias);
  return argv;
}

function commandExists(cmd: string): boolean {
  try {
    const result = Bun.spawnSync(["/usr/bin/which", cmd], { stderr: "ignore" });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  let argv = process.argv.slice(2);

  if (argv.length === 0 && process.stdin.isTTY) {
    const wizardArgv = await runWizard();
    if (wizardArgv) argv = wizardArgv;
  }

  if (argv.length === 0) {
    printUsage();
    process.exit(1);
  }

  const { subcommand, target, repo, family, out, json, dry, safe, openNew, remote, remotePrompt, threads, rest } = parseArgs(argv);

  if (!subcommand) {
    printUsage();
    process.exit(1);
  }

  if (subcommand === "resolve") {
    await runResolve({ target, repo, json });
    return;
  }

  if (subcommand === "preflight") {
    if (!target) {
      console.error("Uso: flux preflight <verbo> [alvo] [--repo <slug>] [--family <f>] --json");
      process.exit(2);
    }
    const result = await runPreflight({
      verb: target,
      target: rest[0] ?? null,
      repo,
      family,
      cwd: process.cwd(),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.status === "abort" ? 3 : 0);
  }

  if (subcommand === "gather") {
    if (target !== "pr" || !rest[0]) {
      console.error("Uso: flux gather pr <n|URL> [--repo owner/repo] [--threads] [--out <dir>] --json");
      process.exit(2);
    }
    const result = await gatherPr({
      target: rest[0],
      repo,
      cwd: process.cwd(),
      threads,
      outDir: out,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.status === "abort" ? 3 : 0);
  }

  if (!isSupportedVerb(subcommand)) {
    console.error(`Verbo desconhecido: "${subcommand}"`);
    console.error(`Verbos suportados: ${SUPPORTED_VERBS.join(", ")}`);
    process.exit(1);
  }

  await runVerb({ verb: subcommand, target, repo, dry, safe, openNew, remote, remotePrompt, rest, argv });
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
