import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveContext, type FluxManifest } from "./resolve.ts";

export const GATHER_SCHEMA_VERSION = "1.0.0";

const TICKET_PATTERN = /[A-Z]{2,5}-\d+/;
const PR_URL_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
const INLINE_DIFF_MAX_BYTES = 32768;

export interface PrTargetParse {
  pr_number: number | null;
  repo_full: string | null;
  error: string | null;
}

export function parsePrTarget(target: string, repoFlag: string | null): PrTargetParse {
  const urlMatch = target.match(PR_URL_PATTERN);
  if (urlMatch) {
    return { pr_number: Number(urlMatch[3]), repo_full: `${urlMatch[1]}/${urlMatch[2]}`, error: null };
  }
  if (/^\d+$/.test(target)) {
    return { pr_number: Number(target), repo_full: repoFlag, error: null };
  }
  return { pr_number: null, repo_full: null, error: `alvo "${target}" nao e numero de PR nem URL do GitHub` };
}

export function extractTicket(title: string, headRef: string, linearOrg: string | null): { id: string; url: string | null } | null {
  const match = title.match(TICKET_PATTERN) ?? headRef.match(TICKET_PATTERN);
  if (!match) return null;
  const id = match[0];
  return { id, url: linearOrg ? `https://linear.app/${linearOrg}/issue/${id}` : null };
}

export function isBotComment(authorLogin: string, body: string, botLogins: string[]): boolean {
  if (authorLogin.endsWith("[bot]")) return true;
  if (botLogins.includes(authorLogin)) return true;
  const trimmed = body.trim();
  if (trimmed.length < 20 && /^(sync|ci)\b/i.test(trimmed)) return true;
  return false;
}

export interface GhRunner {
  (args: string[]): { ok: boolean; stdout: string; stderr: string };
}

function defaultGh(cwd: string): GhRunner {
  return (args: string[]) => {
    try {
      const result = Bun.spawnSync(["gh", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
      return {
        ok: result.exitCode === 0,
        stdout: result.stdout ? new TextDecoder().decode(result.stdout) : "",
        stderr: result.stderr ? new TextDecoder().decode(result.stderr) : "",
      };
    } catch (e) {
      return { ok: false, stdout: "", stderr: (e as Error).message };
    }
  };
}

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          path
          line
          comments(first: 50) {
            nodes {
              databaseId
              url
              author { login }
              body
              createdAt
            }
          }
        }
      }
    }
  }
}`;

export interface GatherPrResult {
  schema_version: string;
  status: "ok" | "degraded" | "abort";
  abort_message: string | null;
  gathered_at: string;
  pr_number: number | null;
  repo_full: string | null;
  pr_url: string | null;
  commit_url: string | null;
  title: string | null;
  body: string | null;
  author: { login: string; name: string | null } | null;
  is_own_pr: boolean | null;
  viewer_login: string | null;
  assignees: string[];
  head_ref: string | null;
  base_ref: string | null;
  head_oid: string | null;
  state: string | null;
  is_draft: boolean | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  ticket: { id: string; url: string | null } | null;
  diff_path: string | null;
  diff_bytes: number | null;
  diff: string | null;
  threads: unknown[] | null;
  threads_path: string | null;
  thread_count: number | null;
  unresolved_thread_count: number | null;
  issue_comments: unknown[] | null;
  issue_comment_count: number | null;
  commits: { sha: string; message: string; author: string | null }[] | null;
  degradations: string[];
}

function emptyResult(now: Date): GatherPrResult {
  return {
    schema_version: GATHER_SCHEMA_VERSION,
    status: "ok",
    abort_message: null,
    gathered_at: now.toISOString(),
    pr_number: null,
    repo_full: null,
    pr_url: null,
    commit_url: null,
    title: null,
    body: null,
    author: null,
    is_own_pr: null,
    viewer_login: null,
    assignees: [],
    head_ref: null,
    base_ref: null,
    head_oid: null,
    state: null,
    is_draft: null,
    additions: null,
    deletions: null,
    changed_files: null,
    ticket: null,
    diff_path: null,
    diff_bytes: null,
    diff: null,
    threads: null,
    threads_path: null,
    thread_count: null,
    unresolved_thread_count: null,
    issue_comments: null,
    issue_comment_count: null,
    commits: null,
    degradations: [],
  };
}

export async function gatherPr(opts: {
  target: string;
  repo?: string | null;
  cwd?: string;
  threads?: boolean;
  outDir?: string | null;
  gh?: GhRunner;
  now?: Date;
}): Promise<GatherPrResult> {
  const now = opts.now ?? new Date();
  const cwd = opts.cwd ?? process.cwd();
  const result = emptyResult(now);

  const parsed = parsePrTarget(opts.target, opts.repo ?? null);
  if (parsed.error) {
    result.status = "abort";
    result.abort_message = parsed.error;
    return result;
  }
  result.pr_number = parsed.pr_number;

  const gh = opts.gh ?? defaultGh(cwd);

  if (!opts.gh) {
    try {
      if (Bun.which("gh") === null) {
        result.status = "abort";
        result.abort_message = "gh nao encontrado no PATH — instale o GitHub CLI ou colete a PR manualmente";
        return result;
      }
    } catch {}
  }

  let repoFull = parsed.repo_full;
  if (!repoFull) {
    const repoView = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
    if (repoView.ok) repoFull = repoView.stdout.trim();
  }
  if (!repoFull) {
    result.status = "abort";
    result.abort_message = `nao foi possivel resolver o repositorio da PR ${parsed.pr_number} — passe --repo owner/repo ou rode dentro de um checkout`;
    return result;
  }
  result.repo_full = repoFull;

  const ctx = await resolveContext({ cwd, targetPath: null, repoSlug: null });
  let manifest: FluxManifest | null = null;
  if (ctx.manifest_path) {
    try {
      manifest = JSON.parse(readFileSync(ctx.manifest_path, "utf-8")) as FluxManifest;
    } catch {}
  }
  const linearOrg = typeof manifest?.linear_org === "string" ? manifest.linear_org : null;
  const botLogins = Array.isArray(manifest?.["bot_logins"])
    ? (manifest!["bot_logins"] as unknown[]).filter((b): b is string => typeof b === "string")
    : [];

  const viewFields =
    "number,title,body,author,headRefName,baseRefName,headRefOid,url,state,isDraft,additions,deletions,changedFiles,commits,assignees";
  const view = gh(["pr", "view", String(parsed.pr_number), "--repo", repoFull, "--json", viewFields]);
  if (!view.ok) {
    result.status = "abort";
    result.abort_message = `gh pr view falhou para ${repoFull}#${parsed.pr_number}: ${view.stderr.trim().slice(0, 300)}`;
    return result;
  }

  let pr: Record<string, unknown>;
  try {
    pr = JSON.parse(view.stdout);
  } catch {
    result.status = "abort";
    result.abort_message = `gh pr view retornou JSON invalido para ${repoFull}#${parsed.pr_number}`;
    return result;
  }

  const authorLogin = (pr["author"] as { login?: string } | null)?.login ?? null;
  result.title = (pr["title"] as string) ?? null;
  result.body = (pr["body"] as string) ?? null;
  result.head_ref = (pr["headRefName"] as string) ?? null;
  result.base_ref = (pr["baseRefName"] as string) ?? null;
  result.head_oid = (pr["headRefOid"] as string) ?? null;
  result.pr_url = (pr["url"] as string) ?? null;
  result.state = (pr["state"] as string) ?? null;
  result.is_draft = (pr["isDraft"] as boolean) ?? null;
  result.additions = (pr["additions"] as number) ?? null;
  result.deletions = (pr["deletions"] as number) ?? null;
  result.changed_files = (pr["changedFiles"] as number) ?? null;
  result.assignees = Array.isArray(pr["assignees"])
    ? (pr["assignees"] as { login?: string }[]).map((a) => a.login ?? "").filter(Boolean)
    : [];
  result.commits = Array.isArray(pr["commits"])
    ? (pr["commits"] as Record<string, unknown>[]).map((c) => ({
        sha: String(c["oid"] ?? "").slice(0, 7),
        message: String((c["messageHeadline"] as string) ?? ""),
        author:
          Array.isArray(c["authors"]) && (c["authors"] as { login?: string }[])[0]
            ? ((c["authors"] as { login?: string }[])[0].login ?? null)
            : null,
      }))
    : null;
  if (result.head_oid) {
    result.commit_url = `https://github.com/${repoFull}/commit/${result.head_oid}`;
  }
  result.ticket = extractTicket(result.title ?? "", result.head_ref ?? "", linearOrg);

  let authorName: string | null = null;
  if (authorLogin) {
    const user = gh(["api", `users/${authorLogin}`, "-q", ".name"]);
    if (user.ok) authorName = user.stdout.trim() || null;
    result.author = { login: authorLogin, name: authorName };
  }

  const me = gh(["api", "user", "-q", ".login"]);
  if (me.ok) {
    const viewer = me.stdout.trim();
    result.viewer_login = viewer;
    result.is_own_pr = viewer === authorLogin || result.assignees.includes(viewer);
  } else {
    result.degradations.push("identidade do viewer indisponivel — is_own_pr nao determinado");
  }

  const outDir = opts.outDir ?? join(tmpdir(), "flux-gather");
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {}

  const diff = gh(["pr", "diff", String(parsed.pr_number), "--repo", repoFull]);
  if (diff.ok) {
    const diffPath = join(outDir, `${repoFull.replace("/", "-")}-pr${parsed.pr_number}.diff`);
    try {
      writeFileSync(diffPath, diff.stdout);
      result.diff_path = diffPath;
    } catch {
      result.degradations.push(`nao foi possivel gravar o diff em ${outDir}`);
    }
    result.diff_bytes = Buffer.byteLength(diff.stdout);
    if (result.diff_bytes <= INLINE_DIFF_MAX_BYTES) result.diff = diff.stdout;
  } else {
    result.degradations.push(`gh pr diff falhou: ${diff.stderr.trim().slice(0, 200)}`);
  }

  if (opts.threads) {
    const [owner, name] = repoFull.split("/");
    const threadsRes = gh([
      "api", "graphql",
      "-f", `query=${THREADS_QUERY}`,
      "-f", `owner=${owner}`,
      "-f", `name=${name}`,
      "-F", `number=${parsed.pr_number}`,
    ]);
    if (threadsRes.ok) {
      try {
        const data = JSON.parse(threadsRes.stdout);
        const nodes: Record<string, unknown>[] =
          data?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
        const threads = nodes.map((t) => {
          const comments = ((t["comments"] as { nodes?: Record<string, unknown>[] })?.nodes ?? []).map((c) => ({
            database_id: c["databaseId"],
            url: c["url"],
            author: (c["author"] as { login?: string } | null)?.login ?? null,
            body: c["body"],
            created_at: c["createdAt"],
          }));
          const first = comments[0] ?? null;
          return {
            is_resolved: t["isResolved"],
            path: t["path"],
            line: t["line"],
            database_id: first?.database_id ?? null,
            url: first?.url ?? null,
            author: first?.author ?? null,
            body: first?.body ?? null,
            replies: comments.slice(1),
          };
        });
        result.thread_count = threads.length;
        result.unresolved_thread_count = threads.filter((t) => !t.is_resolved).length;
        const threadsPath = join(outDir, `${repoFull.replace("/", "-")}-pr${parsed.pr_number}-threads.json`);
        try {
          writeFileSync(threadsPath, JSON.stringify(threads, null, 2));
          result.threads_path = threadsPath;
        } catch {}
        result.threads = threads;
      } catch {
        result.degradations.push("resposta GraphQL de threads invalida — threads nao coletadas");
      }
    } else {
      result.degradations.push(`coleta de threads falhou: ${threadsRes.stderr.trim().slice(0, 200)}`);
    }

    const comments = gh(["api", `repos/${repoFull}/issues/${parsed.pr_number}/comments`]);
    if (comments.ok) {
      try {
        const raw: Record<string, unknown>[] = JSON.parse(comments.stdout);
        const kept = raw
          .map((c) => ({
            id: c["id"],
            author: (c["user"] as { login?: string } | null)?.login ?? "",
            body: String(c["body"] ?? ""),
            created_at: c["created_at"],
          }))
          .filter((c) => !isBotComment(c.author, c.body, botLogins));
        result.issue_comments = kept;
        result.issue_comment_count = kept.length;
      } catch {
        result.degradations.push("resposta de issue comments invalida");
      }
    } else {
      result.degradations.push(`coleta de issue comments falhou: ${comments.stderr.trim().slice(0, 200)}`);
    }
  }

  if (result.degradations.length > 0) result.status = "degraded";
  return result;
}
