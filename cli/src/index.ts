import { resolveContext } from "./resolve.ts";
import { buildPromptBody, buildCommand, resolveInvocation } from "./prompt.ts";
import { resolveHarness, harnessInstallHint, CANONICAL_HARNESSES } from "./harness.ts";
import { launchClaude, runHere, runRemote, buildRemoteSshArgv, listSshHostAliases, checkRemotesReachable } from "./launch.ts";
import { runPreflight } from "./preflight.ts";
import { gatherPr } from "./gather.ts";
import { repoSlugFromTarget } from "./github-url.ts";

export const SUPPORTED_VERBS = ["review", "refine", "issue", "build", "peek", "iterate", "land", "reply", "map", "equip"] as const;
type Verb = typeof SUPPORTED_VERBS[number];

const VERB_HINTS: Record<Verb, string> = {
  review: "revisão formal de PR/doc (specialists + reviewer)",
  refine: "PRD + plano numa rodada, a partir de ideia/thread/bug",
  issue: "cria issue embasada em código a partir de qualquer fonte",
  build: "implementa um ticket, entrega PR draft",
  peek: "relance rápido e read-only de PR/diff/doc",
  iterate: "fecha o loop de uma PR (threads, CI, push)",
  land: "orquestra entrega multi-PR até o merge",
  reply: "acompanha um caso do Slack embasado em código",
  map: "levanta a instalação da família nesta máquina",
  equip: "equipa um repo com motor de execução + specialists",
};

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
  console.error("     flux <verbo> [alvo] [--repo <slug>] [--dry] [--safe] [--new] [--remote [alias]] [--yes|-y] [--harness <claude|cursor|codex>]");
  console.error("     flux <verbo> ... --remote  (sem alias: pergunta interativamente qual máquina alcançável usar)");
  console.error("     flux <verbo> ... --yes     (pula a prévia do banner antes de disparar o Claude Code)");
  console.error("     flux <verbo> ... --harness <valor>  (harness de agente; valores: claude, cursor, codex)");
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
  yes: boolean;
  threads: boolean;
  harness: string | null;
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
  let yes = false;
  let threads = false;
  let harness: string | null = null;
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
    } else if (a === "--yes" || a === "-y") {
      yes = true;
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
    } else if (a === "--harness") {
      if (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
        const val = args[i + 1]!;
        const valid: string[] = [...CANONICAL_HARNESSES];
        if (!valid.includes(val)) {
          console.error(`[flux] --harness: valor inválido "${val}". Valores canônicos: ${valid.join(", ")}`);
          process.exit(1);
        }
        harness = val;
        i += 2;
      } else {
        console.error(`[flux] --harness requer um valor explícito. Valores canônicos: ${[...CANONICAL_HARNESSES].join(", ")}`);
        process.exit(1);
      }
    } else if (!target && !a.startsWith("--")) {
      target = a;
      i++;
    } else {
      rest.push(a);
      i++;
    }
  }

  return { subcommand, target, repo, family, out, json, dry, safe, openNew, remote, remotePrompt, yes, threads, harness, rest };
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
  yes: boolean;
  rest: string[];
  argv: string[];
  harnessFlag: string | null;
}): Promise<void> {
  const { verb, target, repo, dry, safe, openNew, yes, rest, argv } = opts;
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

  let harnessResolution: { harness: string; source: string };
  try {
    harnessResolution = resolveHarness({
      harness: opts.harnessFlag,
      preferredHarness: ctx.preferred_harness,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const { harness, source: harnessSource } = harnessResolution;

  let body = buildPromptBody(ctx, verb, args, { harness, harnessSource });
  const invocation = resolveInvocation({ safe, harness });
  let command = buildCommand(body, { safe, harness });

  if (dry) {
    console.log(command);
    return;
  }

  if (!yes && process.stdin.isTTY) {
    const review = await reviewBanner(body);
    if (review.type === "cancel") {
      console.error("[flux] cancelado.");
      process.exit(1);
    }
    if (review.type === "comment" && review.text) {
      body = `${body}\n\n---\nComentário adicional do usuário:\n${review.text}`;
      command = buildCommand(body, { safe, harness });
    }
  }

  const binary = invocation.split(" ")[0]!;
  if (!commandExists(binary)) {
    const hint = harnessInstallHint(harness);
    console.error(`[flux] ${binary} não encontrado no PATH.`);
    console.error(`Instale o harness "${harness}": ${hint}`);
    process.exit(1);
  }

  if (harness !== "claude" && openNew) {
    console.error(`[flux] --new não é suportado para o harness "${harness}" ainda. Rodando na aba atual.`);
  }

  if (!openNew || harness !== "claude") {
    const exitCode = runHere({ command, body, invocation });
    process.exit(exitCode);
  }

  await launchClaude({ command, body, invocation });
}

export type MenuItem = { value: string; label: string; hint?: string };

function renderMenuLines(items: MenuItem[], selected: number): string[] {
  return items.map((item, i) => {
    const marker = i === selected ? "❯" : " ";
    const label = i === selected ? `\x1b[36m${item.label}\x1b[0m` : item.label;
    const hint = item.hint ? `  \x1b[2m${item.hint}\x1b[0m` : "";
    return `${marker} ${label}${hint}`;
  });
}

export type MenuKeyAction =
  | { type: "up" | "down" | "cancel" | "confirm" | "ignore" }
  | { type: "jump"; index: number };

// Parser puro de tecla -> ação. Separado do I/O de stdin pra ser testável
// sem precisar de um TTY/raw-mode de verdade.
export function interpretMenuKey(chunk: string, itemCount: number): MenuKeyAction {
  if (chunk === "\x03" || chunk === "\x1b") return { type: "cancel" };
  if (chunk === "\r" || chunk === "\n") return { type: "confirm" };
  if (chunk === "\x1b[A" || chunk === "k") return { type: "up" };
  if (chunk === "\x1b[B" || chunk === "j") return { type: "down" };
  const digit = Number(chunk);
  if (Number.isInteger(digit) && digit >= 1 && digit <= itemCount) {
    return { type: "jump", index: digit - 1 };
  }
  return { type: "ignore" };
}

// Menu navegavel por seta (up/down), atalho numerico, e Enter/Esc - sem lib
// externa (mesma filosofia zero-deps do resto do CLI). Degrada pra null
// fora de um TTY real; quem chama decide o que fazer sem selecao.
export function selectFromMenu(title: string, items: MenuItem[]): Promise<string | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || items.length === 0) {
    return Promise.resolve(null);
  }

  console.error(title);
  console.error("(setas ou j/k pra navegar, numero ou Enter pra confirmar, Esc cancela)\n");

  let selected = 0;
  for (const line of renderMenuLines(items, selected)) console.error(line);

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw ?? false;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.setRawMode?.(wasRaw);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    const redraw = () => {
      process.stderr.write(`\x1b[${items.length}A`);
      for (const line of renderMenuLines(items, selected)) {
        process.stderr.write(`\r\x1b[2K${line}\n`);
      }
    };

    const onData = (chunk: string) => {
      const action = interpretMenuKey(chunk, items.length);
      switch (action.type) {
        case "cancel":
          cleanup();
          resolve(null);
          break;
        case "confirm":
          cleanup();
          resolve(items[selected]!.value);
          break;
        case "up":
          selected = (selected - 1 + items.length) % items.length;
          redraw();
          break;
        case "down":
          selected = (selected + 1) % items.length;
          redraw();
          break;
        case "jump":
          selected = action.index;
          cleanup();
          resolve(items[selected]!.value);
          break;
        case "ignore":
          break;
      }
    };

    stdin.on("data", onData);
  });
}


export type BannerReview =
  | { type: "send" }
  | { type: "comment"; text: string }
  | { type: "cancel" };

export type ReviewBannerDeps = {
  selectChoice?: () => Promise<string | null>;
};

// Mostra o banner (o prompt de verdade que vai pro Claude Code) antes de
// disparar, e deixa escolher: enviar como está, anexar um comentário
// extra, ou cancelar. Usa o menu de seta (não prompt() puro) porque o
// prompt() do Bun retorna null tanto pro Enter vazio quanto pro Ctrl+D —
// não dá pra distinguir "confirmar" de "cancelar" só pelo valor.
export async function reviewBanner(body: string, deps: ReviewBannerDeps = {}): Promise<BannerReview> {
  console.error("\n--- banner que será enviado pro Claude Code ---");
  console.error(body);
  console.error("--- fim do banner ---\n");

  const selectChoice = deps.selectChoice ?? (() => selectFromMenu("O que fazer com esse banner?", [
    { value: "send", label: "Enviar assim" },
    { value: "comment", label: "Anexar um comentário extra" },
    { value: "cancel", label: "Cancelar" },
  ]));
  const choice = await selectChoice();

  if (choice === "comment") {
    const text = prompt("Comentário a anexar:")?.trim() ?? "";
    return { type: "comment", text };
  }
  if (choice === "send") return { type: "send" };
  return { type: "cancel" };
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

  return selectFromMenu(
    "[flux] máquinas acessíveis:",
    reachable.map((alias) => ({ value: alias, label: alias })),
  );
}

// `flux` sem nenhum argumento, num terminal de verdade: em vez de só mostrar
// o uso, pergunta o que fazer e monta o argv equivalente ao que o usuário
// teria digitado — daí em diante segue o pipeline normal (parseArgs/runVerb),
// sem duplicar nenhuma lógica de resolução de repo/alvo/remoto.
export type WizardDeps = {
  selectVerb?: () => Promise<string | null>;
};

export async function runWizard(deps: WizardDeps = {}): Promise<string[] | null> {
  const selectVerb = deps.selectVerb ?? (() => selectFromMenu(
    "flux — modo interativo (sem argumentos). Qual comando?",
    SUPPORTED_VERBS.map((v) => ({ value: v, label: v, hint: VERB_HINTS[v] })),
  ));
  const picked = await selectVerb();
  if (!picked || !isSupportedVerb(picked)) return null;
  const verb: Verb = picked;

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

  const { subcommand, target, repo, family, out, json, dry, safe, openNew, remote, remotePrompt, yes, threads, harness, rest } = parseArgs(argv);

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

  await runVerb({ verb: subcommand, target, repo, dry, safe, openNew, remote, remotePrompt, yes, rest, argv, harnessFlag: harness });
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
