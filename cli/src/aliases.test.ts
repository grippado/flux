import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, existsSync, statSync, realpathSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { generateAliases, shellQuote, sanitizeName } from "./aliases.ts";
import { SUPPORTED_VERBS } from "./index.ts";
import type { ManifestRecord } from "./resolve.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "flux-aliases-test-")));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeWorkspace(name: string): string {
  const p = join(tmpDir, name);
  mkdirSync(p, { recursive: true });
  return p;
}

function makeManifestRecord(dir: string, manifest: object): ManifestRecord {
  return {
    path: join(dir, ".claude", "flux-context.json"),
    dir,
    manifest,
  };
}

const VERBS = SUPPORTED_VERBS.filter((v) => v !== "map");

function functionNames(script: string): string[] {
  return script
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => l.slice(0, l.indexOf("()")));
}

describe("generateAliases: formato e cobertura", () => {
  it("gera uma funcao por contexto e verbo, sem map", () => {
    const arco = makeWorkspace("arco");
    const pessoal = makeWorkspace("pessoal");
    const { script, warnings } = generateAliases(
      [makeManifestRecord(arco, { name: "arco" }), makeManifestRecord(pessoal, { name: "personal" })],
      VERBS,
    );
    const names = functionNames(script);
    expect(names).toHaveLength(18);
    expect(names).toContain("arco-flux-review");
    expect(names).toContain("personal-flux-equip");
    expect(names.some((n) => n.endsWith("-map"))).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("usa o formato exato com subshell e aspas simples", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases([makeManifestRecord(ws, { name: "ctx" })], ["review"]);
    expect(script).toBe(`ctx-flux-review() { ( cd '${ws}' && flux review "$@" ) }\n`);
  });

  it("alias_prefix sobrescreve o name", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases([makeManifestRecord(ws, { name: "pessoal", alias_prefix: "p" })], ["review"]);
    expect(functionNames(script)).toEqual(["p-flux-review"]);
  });

  it("sem workspace_root usa o diretorio do manifesto", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases([makeManifestRecord(ws, { name: "ctx" })], ["peek"]);
    expect(script).toContain(`cd '${ws}'`);
  });

  it("expande ~ em workspace_root", () => {
    const home = process.env["HOME"]!;
    const { script } = generateAliases([makeManifestRecord("/fake", { name: "ctx", workspace_root: "~/" })], ["peek"]);
    expect(script).toContain(`cd '${home}'`);
  });
});

describe("generateAliases: alias_cwd", () => {
  it("alias_cwd vence o workspace_root no cd e nao muda o prefixo", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases(
      [makeManifestRecord(ws, { name: "pessoal", alias_prefix: "personal", workspace_root: ws, alias_cwd: "~/" })],
      ["peek"],
    );
    expect(script).toBe(`personal-flux-peek() { ( cd '${process.env["HOME"]}' && flux peek "$@" ) }\n`);
  });

  it("alias_cwd vale tambem para as funcoes por repo", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases(
      [makeManifestRecord(ws, { name: "p", alias_cwd: "~/", repos: ["api"] })],
      ["peek"],
      { repos: true },
    );
    expect(script).toContain(`p-api-peek() { ( cd '${process.env["HOME"]}' && flux peek --repo 'api' "$@" ) }`);
  });

  it("alias_cwd inexistente pula o manifesto nomeando o campo", () => {
    const ws = makeWorkspace("ws");
    const { script, warnings } = generateAliases(
      [makeManifestRecord(ws, { name: "ctx", alias_cwd: join(tmpDir, "nao-existe") })],
      ["peek"],
    );
    expect(script).toBe("");
    expect(warnings.join("\n")).toContain("alias_cwd inexistente");
  });

  it("alias_cwd vazio ou com tipo errado cai no workspace_root", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases(
      [makeManifestRecord(ws, { name: "a", alias_cwd: "" }), makeManifestRecord(makeWorkspace("w2"), { name: "b", alias_cwd: 7 })],
      ["peek"],
    );
    expect(script).toContain(`cd '${ws}'`);
    expect(script).toContain(`cd '${join(tmpDir, "w2")}'`);
  });
});

describe("generateAliases: casos de borda com aviso", () => {
  it("pula manifesto sem name e sem alias_prefix", () => {
    const ws = makeWorkspace("ws");
    const { script, warnings } = generateAliases([makeManifestRecord(ws, {})], VERBS);
    expect(script).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("sem alias_prefix nem name");
  });

  it("pula o segundo manifesto com prefixo duplicado", () => {
    const a = makeWorkspace("a");
    const b = makeWorkspace("b");
    const { script, warnings } = generateAliases(
      [makeManifestRecord(a, { name: "ctx" }), makeManifestRecord(b, { name: "ctx" })],
      ["review"],
    );
    expect(script).toContain(`cd '${a}'`);
    expect(script).not.toContain(`cd '${b}'`);
    expect(warnings.some((w) => w.includes("já usado"))).toBe(true);
  });

  it("pula workspace_root inexistente", () => {
    const { script, warnings } = generateAliases(
      [makeManifestRecord("/fake", { name: "ctx", workspace_root: join(tmpDir, "nao-existe") })],
      VERBS,
    );
    expect(script).toBe("");
    expect(warnings.some((w) => w.includes("inexistente"))).toBe(true);
  });

  it("nao falha com manifesto cujos campos tem tipo errado", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases(
      [makeManifestRecord(ws, { name: 42, alias_prefix: ["x"], repos: "nope" })],
      VERBS,
      { repos: true },
    );
    expect(script).toBe("");
  });
});

describe("generateAliases: --repos", () => {
  it("gera funcao por repo injetando --repo", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases([makeManifestRecord(ws, { name: "arco", repos: ["backoffice"] })], ["review"], {
      repos: true,
    });
    expect(script).toContain(`arco-backoffice-review() { ( cd '${ws}' && flux review --repo 'backoffice' "$@" ) }`);
  });

  it("nao gera funcao por repo sem a flag", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases([makeManifestRecord(ws, { name: "arco", repos: ["backoffice"] })], ["review"]);
    expect(script).not.toContain("backoffice");
  });

  it("a funcao de contexto vence a colisao e emite aviso", () => {
    const ws = makeWorkspace("ws");
    const { script, warnings } = generateAliases(
      [makeManifestRecord(ws, { name: "personal", repos: ["flux", "outro"] })],
      ["review"],
      { repos: true },
    );
    const lines = script.split("\n").filter((l) => l.startsWith("personal-flux-review()"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("--repo");
    expect(script).toContain("personal-outro-review()");
    expect(warnings.some((w) => w.includes("colisão") && w.includes("personal-flux-review"))).toBe(true);
  });

  it("sanitiza slug de repo invalido com aviso e mantem o valor original quotado", () => {
    const ws = makeWorkspace("ws");
    const { script, warnings } = generateAliases(
      [makeManifestRecord(ws, { name: "ctx", repos: ["opengateway.digital"] })],
      ["review"],
      { repos: true },
    );
    expect(script).toContain("ctx-opengateway-digital-review()");
    expect(script).toContain("--repo 'opengateway.digital'");
    expect(warnings.some((w) => w.includes("sanitizado"))).toBe(true);
  });
});

describe("generateAliases: entrada hostil", () => {
  const hostile = ["a;touch PWNED", "a$(touch PWNED)", "a`touch PWNED`", "a b", "a'b", 'a"b', "a\nb", "a&&b", "a|b", "a>b"];

  it("nome de funcao so contem [A-Za-z0-9_-] para qualquer prefixo", () => {
    for (const h of hostile) {
      const ws = makeWorkspace(`ws-${Math.abs(hashCode(h))}`);
      const { script } = generateAliases([makeManifestRecord(ws, { name: h })], VERBS);
      for (const n of functionNames(script)) expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("nome de funcao so contem [A-Za-z0-9_-] para qualquer slug de repo", () => {
    const ws = makeWorkspace("ws");
    const { script } = generateAliases([makeManifestRecord(ws, { name: "ctx", repos: hostile })], VERBS, { repos: true });
    expect(script).not.toBe("");
    for (const n of functionNames(script)) expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("workspace_root hostil e quotado e nao executa ao carregar nem ao chamar", () => {
    const base = tmpDir;
    const hostileDirs = [`${base}/a;touch PWNED;`, `${base}/a$(touch PWNED)`, `${base}/a'b`, `${base}/a b`, `${base}/a"b`, `${base}/a\`touch PWNED\``];
    const workdir = join(base, "run");
    mkdirSync(workdir);
    hostileDirs.forEach((d, idx) => {
      mkdirSync(d, { recursive: true });
      const { script } = generateAliases([makeManifestRecord(d, { name: `h${idx}`, repos: [hostile[idx] ?? "x"] })], ["peek"], {
        repos: true,
      });
      const r = spawnSync(
        "bash",
        ["-c", `flux() { pwd; printf '%s\\n' "$@"; }\n${script}\nh${idx}-flux-peek one`],
        { cwd: workdir, encoding: "utf8" },
      );
      expect(r.status).toBe(0);
      expect(r.stdout.split("\n")[0]).toBe(d);
      expect(existsSync(join(workdir, "PWNED"))).toBe(false);
      expect(existsSync(join(d, "PWNED"))).toBe(false);
      expect(existsSync(join(base, "PWNED"))).toBe(false);
    });
  });

  it("repo hostil chega ao flux como um unico argumento literal", () => {
    const base = tmpDir;
    const ws = makeWorkspace("ws");
    const evil = "x'; touch PWNED; echo '$(touch PWNED)";
    const { script } = generateAliases([makeManifestRecord(ws, { name: "ctx", repos: [evil] })], ["peek"], { repos: true });
    const r = spawnSync(
      "bash",
      ["-c", `flux() { printf '[%s]\\n' "$@"; }\n${script}\nctx-x-touch-PWNED-echo-touch-PWNED-peek`],
      { cwd: base, encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`[peek]\n[--repo]\n[${evil}]\n`);
    expect(existsSync(join(base, "PWNED"))).toBe(false);
    expect(existsSync(join(ws, "PWNED"))).toBe(false);
  });

  it("verbo fora do whitelist e ignorado com aviso", () => {
    const ws = makeWorkspace("ws");
    const { script, warnings } = generateAliases([makeManifestRecord(ws, { name: "ctx" })], ["review", "x;y"]);
    expect(functionNames(script)).toEqual(["ctx-flux-review"]);
    expect(warnings).toHaveLength(1);
  });

  it("workspace_root com caractere de controle e pulado", () => {
    const { script, warnings } = generateAliases(
      [makeManifestRecord("/fake", { name: "ctx", workspace_root: "/tmp/a\nb" })],
      ["review"],
    );
    expect(script).toBe("");
    expect(warnings).toHaveLength(1);
  });
});

describe("generateAliases: execucao real preserva o cwd do chamador", () => {
  it("a funcao entra no workspace e o chamador continua onde estava", () => {
    const base = tmpDir;
    const ws = makeWorkspace("ws");
    const caller = makeWorkspace("caller");
    const { script } = generateAliases([makeManifestRecord(ws, { name: "arco" })], ["review"]);
    const r = spawnSync(
      "bash",
      ["-c", `flux() { echo "in:$(pwd) args:$*"; }\n${script}\narco-flux-review 8249 --repo backoffice --dry\necho "after:$(pwd)"`],
      { cwd: caller, encoding: "utf8" },
    );
    expect(r.stdout).toBe(`in:${ws} args:review 8249 --repo backoffice --dry\nafter:${caller}\n`);
  });
});

describe("shellQuote e sanitizeName", () => {
  it("escapa aspas simples", () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
  });

  it("sanitiza para o whitelist", () => {
    expect(sanitizeName("a b;c")).toBe("a-b-c");
    expect(sanitizeName("--x--")).toBe("x");
    expect(sanitizeName(";;;")).toBe("");
  });
});

describe("flux aliases: CLI", () => {
  function runCli(args: string[], home: string): ReturnType<typeof spawnSync> {
    return spawnSync("bun", ["run", join(import.meta.dir, "index.ts"), ...args], {
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
  }

  function makeHome(): string {
    const home = join(tmpDir, "home");
    const ws = join(home, "ws");
    mkdirSync(join(ws, ".claude"), { recursive: true });
    writeFileSync(join(ws, ".claude", "flux-context.json"), JSON.stringify({ name: "ctx", repos: ["flux"] }));
    return home;
  }

  it("imprime em stdout e nao gera map", () => {
    const r = runCli(["aliases"], makeHome());
    expect(r.status).toBe(0);
    const out = String(r.stdout);
    expect(out).toContain("ctx-flux-review()");
    expect(out).not.toContain("ctx-flux-map");
  });

  it("--out grava com modo 0600, imprime a linha source e nao toca o zshrc", () => {
    const home = makeHome();
    writeFileSync(join(home, ".zshrc"), "original\n");
    const outFile = join(tmpDir, "aliases.zsh");
    const r = runCli(["aliases", "--out", outFile], home);
    expect(r.status).toBe(0);
    expect(String(r.stdout).trim()).toBe(`source '${outFile}'`);
    expect(statSync(outFile).mode & 0o777).toBe(0o600);
    expect(Bun.file(outFile).size).toBeGreaterThan(0);
    expect(readFileSync(join(home, ".zshrc"), "utf8")).toBe("original\n");
  });

  it("--out corrige o modo de um arquivo preexistente", () => {
    const home = makeHome();
    const outFile = join(tmpDir, "aliases.zsh");
    writeFileSync(outFile, "velho\n", { mode: 0o644 });
    runCli(["aliases", "--out", outFile], home);
    expect(statSync(outFile).mode & 0o777).toBe(0o600);
  });

  it("--repos emite o aviso de colisao no stderr e mantem a funcao de contexto", () => {
    const r = runCli(["aliases", "--repos"], makeHome());
    expect(r.status).toBe(0);
    expect(String(r.stderr)).toContain("colisão");
    const line = String(r.stdout).split("\n").find((l) => l.startsWith("ctx-flux-review()"))!;
    expect(line).not.toContain("--repo");
  });
});

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
