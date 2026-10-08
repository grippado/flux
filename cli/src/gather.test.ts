import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parsePrTarget, extractTicket, isBotComment, gatherPr, type GhRunner } from "./gather.ts";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "flux-gather-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("parsePrTarget", () => {
  test("numero puro usa o repo da flag", () => {
    expect(parsePrTarget("123", "acme/api")).toEqual({ pr_number: 123, repo_full: "acme/api", error: null });
  });

  test("URL de PR extrai repo e numero", () => {
    const r = parsePrTarget("https://github.com/acme/api-service/pull/247", null);
    expect(r).toEqual({ pr_number: 247, repo_full: "acme/api-service", error: null });
  });

  test("URL com sufixo de files tambem resolve", () => {
    const r = parsePrTarget("https://github.com/acme/api/pull/9/files", null);
    expect(r.pr_number).toBe(9);
    expect(r.repo_full).toBe("acme/api");
  });

  test("alvo invalido produz erro", () => {
    const r = parsePrTarget("minha-branch", null);
    expect(r.error).toContain("minha-branch");
    expect(r.pr_number).toBeNull();
  });
});

describe("extractTicket", () => {
  test("acha ticket no titulo e monta URL com linear_org", () => {
    const t = extractTicket("feat: coisa [CPU-3625]", "feat/coisa", "acme");
    expect(t).toEqual({ id: "CPU-3625", url: "https://linear.app/acme/issue/CPU-3625" });
  });

  test("cai para a branch quando o titulo nao tem", () => {
    const t = extractTicket("feat: coisa", "gabriel/LAB-107-kits", null);
    expect(t).toEqual({ id: "LAB-107", url: null });
  });

  test("sem ticket retorna null", () => {
    expect(extractTicket("chore: bump", "chore/bump", "acme")).toBeNull();
  });
});

describe("isBotComment", () => {
  test("sufixo [bot] e sempre bot", () => {
    expect(isBotComment("dependabot[bot]", [])).toBe(true);
  });
  test("login na lista do manifesto e bot", () => {
    expect(isBotComment("arco-reviewer", ["arco-reviewer"])).toBe(true);
  });
  test("humano nao e bot, mesmo com comentario curto sobre CI", () => {
    expect(isBotComment("gabriel", [])).toBe(false);
  });
});

type GhResponse = { ok: boolean; stdout: string; stderr?: string };

function fakeGh(responses: Record<string, GhResponse> | ((args: string[]) => GhResponse)): GhRunner {
  return (args: string[]) => {
    if (typeof responses === "function") return responses(args);
    const key = args.slice(0, 2).join(" ");
    const match =
      responses[args.join(" ")] ??
      responses[key] ??
      { ok: false, stdout: "", stderr: `sem mock para: ${args.join(" ")}` };
    return { ok: match.ok, stdout: match.stdout, stderr: match.stderr ?? "" };
  };
}

const PR_VIEW = {
  number: 247,
  title: "feat(auth): refresh [CPU-100]",
  body: "corpo",
  author: { login: "marcelino" },
  headRefName: "feat/auth",
  baseRefName: "main",
  headRefOid: "a4f8e12c3d9b",
  url: "https://github.com/acme/api/pull/247",
  state: "OPEN",
  isDraft: false,
  additions: 10,
  deletions: 2,
  changedFiles: 3,
  commits: [{ oid: "a4f8e12c3d9b", messageHeadline: "feat(auth): refresh", authors: [{ login: "marcelino" }] }],
  assignees: [{ login: "gabriel" }],
};

describe("gatherPr", () => {
  test("abort com alvo invalido", async () => {
    const r = await gatherPr({ target: "branch-x", gh: fakeGh({}) });
    expect(r.status).toBe("abort");
    expect(r.abort_message).toContain("branch-x");
  });

  test("abort quando gh pr view falha", async () => {
    const r = await gatherPr({
      target: "247",
      repo: "acme/api",
      cwd: tmp,
      gh: fakeGh({ "pr view": { ok: false, stdout: "", stderr: "not found" } }),
    });
    expect(r.status).toBe("abort");
    expect(r.abort_message).toContain("acme/api#247");
  });

  test("coleta completa: metadados, is_own_pr por assignee, ticket, diff em arquivo", async () => {
    const r = await gatherPr({
      target: "247",
      repo: "acme/api",
      cwd: tmp,
      outDir: join(tmp, "out"),
      gh: fakeGh({
        "pr view": { ok: true, stdout: JSON.stringify(PR_VIEW) },
        "pr diff": { ok: true, stdout: "--- a/x\n+++ b/x\n" },
        "api users/marcelino -q .name": { ok: true, stdout: "Marcelino Souza\n" },
        "api user -q .login": { ok: true, stdout: "gabriel\n" },
        api: { ok: true, stdout: "" },
      }),
    });
    expect(r.status).toBe("ok");
    expect(r.repo_full).toBe("acme/api");
    expect(r.author).toEqual({ login: "marcelino", name: "Marcelino Souza" });
    expect(r.is_own_pr).toBe(true);
    expect(r.ticket?.id).toBe("CPU-100");
    expect(r.diff).toContain("+++ b/x");
    expect(r.diff_path).not.toBeNull();
    expect(existsSync(r.diff_path!)).toBe(true);
    expect(readFileSync(r.diff_path!, "utf-8")).toContain("+++ b/x");
    expect(r.commits?.[0]).toEqual({ sha: "a4f8e12", message: "feat(auth): refresh", author: "marcelino" });
  });

  test("--threads coleta threads GraphQL e issue comments filtrando bots", async () => {
    const firstThreadPage = {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: true, endCursor: "thread-cursor" },
              nodes: [
                {
                  id: "thread-1",
                  isResolved: false,
                  path: "src/x.ts",
                  line: 84,
                  comments: {
                    nodes: [
                      { databaseId: 1, url: "u1", author: { login: "senior" }, body: "TTL configuravel?", createdAt: "2026-08-21T00:00:00Z" },
                    ],
                    pageInfo: { hasNextPage: true, endCursor: "comment-cursor" },
                  },
                },
              ],
            },
          },
        },
      },
    };
    const secondThreadPage = {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: "thread-cursor-2" },
              nodes: [
                {
                  id: "thread-2",
                  isResolved: true,
                  path: "src/y.ts",
                  line: 10,
                  comments: {
                    nodes: [
                      { databaseId: 3, url: "u3", author: { login: "senior" }, body: "resolvido", createdAt: "2026-08-21T02:00:00Z" },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: "comment-cursor-2" },
                  },
                },
              ],
            },
          },
        },
      },
    };
    const commentPage = {
      data: {
        node: {
          comments: {
            nodes: [
              { databaseId: 2, url: "u2", author: { login: "marcelino" }, body: "feito", createdAt: "2026-08-21T01:00:00Z" },
            ],
            pageInfo: { hasNextPage: false, endCursor: "comment-cursor-2" },
          },
        },
      },
    };
    const comments = [
      { id: 1, user: { login: "gabriel" }, body: "comentario denso de humano aqui", created_at: "2026-08-21T02:00:00Z" },
      { id: 2, user: { login: "dependabot[bot]" }, body: "bump", created_at: "2026-08-21T03:00:00Z" },
    ];
    const r = await gatherPr({
      target: "247",
      repo: "acme/api",
      cwd: tmp,
      threads: true,
      outDir: join(tmp, "out"),
      gh: fakeGh((args) => {
        if (args[0] === "api" && args[1] === "graphql") {
          if (args.includes("threadId=thread-1")) return { ok: true, stdout: JSON.stringify(commentPage) };
          if (args.includes("cursor=thread-cursor")) return { ok: true, stdout: JSON.stringify(secondThreadPage) };
          return { ok: true, stdout: JSON.stringify(firstThreadPage) };
        }
        const key = args.slice(0, 2).join(" ");
        if (key === "pr view") return { ok: true, stdout: JSON.stringify(PR_VIEW) };
        if (key === "pr diff") return { ok: true, stdout: "diff" };
        if (args.join(" ") === "api users/marcelino -q .name") return { ok: true, stdout: "" };
        if (args.join(" ") === "api user -q .login") return { ok: true, stdout: "gabriel\n" };
        if (args.join(" ") === "api repos/acme/api/issues/247/comments") return { ok: true, stdout: JSON.stringify(comments) };
        return { ok: false, stdout: "", stderr: `sem mock para: ${args.join(" ")}` };
      }),
    });
    expect(r.status).toBe("ok");
    expect(r.thread_count).toBe(2);
    expect(r.unresolved_thread_count).toBe(1);
    const thread = r.threads?.[0] as Record<string, unknown>;
    expect(thread["author"]).toBe("senior");
    expect((thread["replies"] as unknown[]).length).toBe(1);
    expect(r.threads?.map((t) => (t as Record<string, unknown>)["path"])).toEqual(["src/x.ts", "src/y.ts"]);
    expect(r.issue_comment_count).toBe(1);
    expect(r.threads_path).not.toBeNull();
  });

  test("node GraphQL inválido torna a coleção indisponível", async () => {
    const graphql = {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                null,
                {
                  isResolved: false,
                  path: "src/x.ts",
                  line: 84,
                  comments: {
                    nodes: [
                      { databaseId: 1, url: "u1", author: { login: "senior" }, body: "TTL configuravel?", createdAt: "2026-08-21T00:00:00Z" },
                    ],
                  },
                },
                null,
              ],
            },
          },
        },
      },
    };
    const r = await gatherPr({
      target: "247",
      repo: "acme/api",
      cwd: tmp,
      threads: true,
      outDir: join(tmp, "out"),
      gh: fakeGh({
        "pr view": { ok: true, stdout: JSON.stringify(PR_VIEW) },
        "pr diff": { ok: true, stdout: "diff" },
        "api users/marcelino -q .name": { ok: true, stdout: "" },
        "api user -q .login": { ok: true, stdout: "gabriel\n" },
        "api graphql": { ok: true, stdout: JSON.stringify(graphql) },
        "api repos/acme/api/issues/247/comments": { ok: true, stdout: "[]" },
      }),
    });
    expect(r.status).toBe("degraded");
    expect(r.threads).toBeNull();
    expect(r.thread_count).toBeNull();
    expect(r.degradations.some((degradation) => degradation.startsWith("threads indisponiveis"))).toBe(true);
  });

  test("erros GraphQL com dados parciais tornam a coleção indisponível", async () => {
    const graphql = {
      errors: [{ message: "partial response" }],
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "thread-1",
                  isResolved: false,
                  comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    };
    const r = await gatherPr({
      target: "247",
      repo: "acme/api",
      cwd: tmp,
      threads: true,
      outDir: join(tmp, "out"),
      gh: fakeGh({
        "pr view": { ok: true, stdout: JSON.stringify(PR_VIEW) },
        "pr diff": { ok: true, stdout: "diff" },
        "api users/marcelino -q .name": { ok: true, stdout: "" },
        "api user -q .login": { ok: true, stdout: "gabriel\n" },
        "api graphql": { ok: true, stdout: JSON.stringify(graphql) },
        "api repos/acme/api/issues/247/comments": { ok: true, stdout: "[]" },
      }),
    });
    expect(r.status).toBe("degraded");
    expect(r.threads).toBeNull();
    expect(r.thread_count).toBeNull();
    expect(r.degradations.some((degradation) => degradation.startsWith("threads indisponiveis"))).toBe(true);
  });

  test("body de thread com 200+ chars busca o completo via REST", async () => {
    const truncated = "x".repeat(200);
    const full = "x".repeat(200) + " e o resto do argumento que o GraphQL cortou";
    const graphql = {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "thread-1",
                  isResolved: false,
                  path: "src/x.ts",
                  line: 10,
                  comments: {
                    nodes: [
                      { databaseId: 77, url: "u", author: { login: "senior" }, body: truncated, createdAt: "2026-08-21T00:00:00Z" },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: "comment-cursor" },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: "thread-cursor" },
            },
          },
        },
      },
    };
    const r = await gatherPr({
      target: "247",
      repo: "acme/api",
      cwd: tmp,
      threads: true,
      outDir: join(tmp, "out"),
      gh: fakeGh({
        "pr view": { ok: true, stdout: JSON.stringify(PR_VIEW) },
        "pr diff": { ok: true, stdout: "diff" },
        "api users/marcelino -q .name": { ok: true, stdout: "" },
        "api user -q .login": { ok: true, stdout: "gabriel\n" },
        "api graphql": { ok: true, stdout: JSON.stringify(graphql) },
        "api repos/acme/api/pulls/comments/77 -q .body": { ok: true, stdout: full + "\n" },
        "api repos/acme/api/issues/247/comments": { ok: true, stdout: "[]" },
      }),
    });
    const thread = r.threads?.[0] as Record<string, unknown>;
    expect(thread["body"]).toBe(full);
  });

  test("falha parcial em threads degrada sem abortar", async () => {
    const r = await gatherPr({
      target: "247",
      repo: "acme/api",
      cwd: tmp,
      threads: true,
      outDir: join(tmp, "out"),
      gh: fakeGh((args) => {
        if (args[0] === "api" && args[1] === "graphql") {
          if (args.includes("cursor=thread-cursor")) return { ok: false, stdout: "", stderr: "rate limit" };
          return {
            ok: true,
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequest: {
                    reviewThreads: {
                      nodes: [
                        {
                          id: "thread-1",
                          isResolved: false,
                          comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
                        },
                      ],
                      pageInfo: { hasNextPage: true, endCursor: "thread-cursor" },
                    },
                  },
                },
              },
            }),
          };
        }
        const key = args.slice(0, 2).join(" ");
        if (key === "pr view") return { ok: true, stdout: JSON.stringify(PR_VIEW) };
        if (key === "pr diff") return { ok: true, stdout: "diff" };
        if (args.join(" ") === "api users/marcelino -q .name") return { ok: true, stdout: "" };
        if (args.join(" ") === "api user -q .login") return { ok: true, stdout: "gabriel\n" };
        if (args.join(" ") === "api repos/acme/api/issues/247/comments") return { ok: true, stdout: "[]" };
        return { ok: false, stdout: "", stderr: `sem mock para: ${args.join(" ")}` };
      }),
    });
    expect(r.status).toBe("degraded");
    expect(r.degradations.some((d) => d.startsWith("threads indisponiveis"))).toBe(true);
    expect(r.threads).toBeNull();
    expect(r.thread_count).toBeNull();
    expect(r.title).toBe("feat(auth): refresh [CPU-100]");
  });

  test("falha ao paginar comments descarta threads parciais", async () => {
    const graphql = {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "thread-1",
                  isResolved: false,
                  path: "src/x.ts",
                  line: 10,
                  comments: {
                    nodes: [{ databaseId: 1, url: "u1", author: { login: "senior" }, body: "primeiro", createdAt: "2026-08-21T00:00:00Z" }],
                    pageInfo: { hasNextPage: true, endCursor: "comment-cursor" },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: "thread-cursor" },
            },
          },
        },
      },
    };
    const r = await gatherPr({
      target: "247",
      repo: "acme/api",
      cwd: tmp,
      threads: true,
      outDir: join(tmp, "out"),
      gh: fakeGh((args) => {
        if (args[0] === "api" && args[1] === "graphql") {
          if (args.includes("threadId=thread-1")) return { ok: false, stdout: "", stderr: "rate limit" };
          return { ok: true, stdout: JSON.stringify(graphql) };
        }
        const key = args.slice(0, 2).join(" ");
        if (key === "pr view") return { ok: true, stdout: JSON.stringify(PR_VIEW) };
        if (key === "pr diff") return { ok: true, stdout: "diff" };
        if (args.join(" ") === "api users/marcelino -q .name") return { ok: true, stdout: "" };
        if (args.join(" ") === "api user -q .login") return { ok: true, stdout: "gabriel\n" };
        if (args.join(" ") === "api repos/acme/api/issues/247/comments") return { ok: true, stdout: "[]" };
        return { ok: false, stdout: "", stderr: `sem mock para: ${args.join(" ")}` };
      }),
    });
    expect(r.status).toBe("degraded");
    expect(r.degradations.some((degradation) => degradation.startsWith("threads indisponiveis"))).toBe(true);
    expect(r.threads).toBeNull();
    expect(r.thread_count).toBeNull();
  });
});
