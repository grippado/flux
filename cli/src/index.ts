import { resolveContext } from "./resolve.ts";
import { buildPrompt } from "./prompt.ts";

const SUPPORTED_VERBS = ["review", "refine", "issue", "build", "peek", "iterate", "land", "reply", "map", "equip"] as const;
type Verb = typeof SUPPORTED_VERBS[number];

const TICKET_PATTERN = /^[A-Z]{2,5}-\d+$/;
const LINEAR_URL_PATTERN = /^https?:\/\/linear\.app\//;

function isTicket(s: string): boolean {
  return TICKET_PATTERN.test(s) || LINEAR_URL_PATTERN.test(s);
}

function isSupportedVerb(s: string): s is Verb {
  return (SUPPORTED_VERBS as readonly string[]).includes(s);
}

function printUsage(): void {
  console.error("Uso: flux resolve [alvo] [--repo <slug>] --json");
  console.error("     flux <verbo> [alvo] [--repo <slug>] [--dry]");
  console.error("");
  console.error(`Verbos suportados: ${SUPPORTED_VERBS.join(", ")}`);
}

function parseArgs(argv: string[]): {
  subcommand: string | null;
  target: string | null;
  repo: string | null;
  json: boolean;
  dry: boolean;
  rest: string[];
} {
  const args = [...argv];
  let subcommand: string | null = null;
  let target: string | null = null;
  let repo: string | null = null;
  let json = false;
  let dry = false;
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
    } else if (a === "--json") {
      json = true;
      i++;
    } else if (a === "--dry") {
      dry = true;
      i++;
    } else if (!target && !a.startsWith("--")) {
      target = a;
      i++;
    } else {
      rest.push(a);
      i++;
    }
  }

  return { subcommand, target, repo, json, dry, rest };
}

async function runResolve(opts: {
  target: string | null;
  repo: string | null;
  json: boolean;
}): Promise<void> {
  const ctx = await resolveContext({
    repoSlug: opts.repo ?? (opts.target && !opts.target.startsWith("/") ? opts.target : null),
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
  rest: string[];
}): Promise<void> {
  const { verb, target, repo, dry, rest } = opts;

  if (target && isTicket(target)) {
    console.error(`Alvo de ticket (${target}) fora do escopo da v0. Use a interface web do Linear ou aguarde a fatia 2.`);
    process.exit(1);
  }

  const repoSlug = repo ?? null;
  const ctx = await resolveContext({
    repoSlug,
    targetPath: target,
    cwd: process.cwd(),
  });

  const targetArg = target ?? "";
  const repoFlag = repoSlug ? `--repo ${repoSlug}` : "";
  const extraArgs = rest.join(" ");
  const args = [targetArg, repoFlag, extraArgs].filter(Boolean).join(" ").trim();

  const command = buildPrompt(ctx, verb, args);

  if (dry) {
    console.log(command);
    return;
  }

  if (!commandExists("claude")) {
    console.error('claude não encontrado no PATH. Instale via: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }

  console.log(command);
  console.warn("(abertura de aba chega na fatia 2 — copie e execute o comando acima para abrir o Claude)");
}

function commandExists(cmd: string): boolean {
  try {
    const result = Bun.spawnSync(["command", "-v", cmd], { stderr: "ignore" });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printUsage();
    process.exit(1);
  }

  const { subcommand, target, repo, json, dry, rest } = parseArgs(argv);

  if (!subcommand) {
    printUsage();
    process.exit(1);
  }

  if (subcommand === "resolve") {
    await runResolve({ target, repo, json });
    return;
  }

  if (!isSupportedVerb(subcommand)) {
    console.error(`Verbo desconhecido: "${subcommand}"`);
    console.error(`Verbos suportados: ${SUPPORTED_VERBS.join(", ")}`);
    process.exit(1);
  }

  await runVerb({ verb: subcommand, target, repo, dry, rest });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
