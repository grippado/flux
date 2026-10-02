import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { VERB_REQUIREMENTS, type RequirementSpec } from "./preflight.ts";
import { GATE_KINDS } from "./gate.ts";

const SKILLS_DIR = join(import.meta.dir, "..", "..", "plugins", "flux", "skills");

const MODELED_BY_CLI = new Set(["file", "bin", "vault", "checkout_local"]);

const PARITY_VERBS = ["review"] as const;

type Requires = { hard: string[]; soft: string[] };

export function parseRequires(skillMarkdown: string): Requires {
  const lines = skillMarkdown.split("\n");
  if (lines[0] !== "---") throw new Error("SKILL.md sem frontmatter");
  const end = lines.indexOf("---", 1);
  const front = lines.slice(1, end);
  const out: Requires = { hard: [], soft: [] };
  let inRequires = false;
  let level: "hard" | "soft" | null = null;
  for (const line of front) {
    if (/^requires:\s*$/.test(line)) {
      inRequires = true;
      continue;
    }
    if (!inRequires) continue;
    if (/^\S/.test(line)) break;
    const levelMatch = line.match(/^  (hard|soft):\s*$/);
    if (levelMatch) {
      level = levelMatch[1] as "hard" | "soft";
      continue;
    }
    const item = line.match(/^    - (.+?)\s*$/);
    if (item && level) out[level].push(item[1]!);
  }
  return out;
}

function toKey(entry: string): { type: string; key: string } {
  const typed = entry.match(/^([a-z_]+):\s*(.+)$/);
  if (typed) return { type: typed[1]!, key: `${typed[1]}:${typed[2]}` };
  return { type: entry, key: `${entry}:${entry}` };
}

function skillKeys(entries: string[]): string[] {
  return entries
    .map(toKey)
    .filter((e) => MODELED_BY_CLI.has(e.type))
    .map((e) => e.key)
    .sort();
}

function cliKeys(specs: RequirementSpec[]): string[] {
  return specs.map((s) => `${s.type}:${s.name}`).sort();
}

describe("paridade entre VERB_REQUIREMENTS (CLI) e requires: do SKILL.md", () => {
  it("parseRequires lê hard e soft do frontmatter e ignora o corpo", () => {
    const parsed = parseRequires(
      ["---", "name: x", "requires:", "  hard:", "    - file: shared/a.md", "    - bin: git", "  soft:", "    - vault", "---", "", "requires:", "    - bin: nao-conta"].join("\n"),
    );
    expect(parsed).toEqual({ hard: ["file: shared/a.md", "bin: git"], soft: ["vault"] });
  });

  for (const verb of PARITY_VERBS) {
    const skill = parseRequires(readFileSync(join(SKILLS_DIR, verb, "SKILL.md"), "utf8"));
    const cli = VERB_REQUIREMENTS[verb];

    it(`${verb}: a CLI tem tabela própria`, () => {
      expect(cli).toBeDefined();
    });

    it(`${verb}: hard idêntico nos tipos que a CLI modela (file, bin, vault, checkout_local)`, () => {
      expect(cliKeys(cli!.hard)).toEqual(skillKeys(skill.hard).map((k) => k.replace(/:\s+/, ":")));
    });

    it(`${verb}: soft idêntico nos tipos que a CLI modela`, () => {
      expect(cliKeys(cli!.soft)).toEqual(skillKeys(skill.soft).map((k) => k.replace(/:\s+/, ":")));
    });
  }
});

describe("paridade entre GATE_KINDS (CLI) e o vocabulario de gates do run.sh", () => {
  const runSh = readFileSync(join(import.meta.dir, "..", "..", "plugins", "flux", "scripts", "run.sh"), "utf8");

  it("o vocabulario do CLI e o de run.sh gate sao o mesmo conjunto, na mesma ordem", () => {
    const line = runSh.split("\n").find((l) => l.startsWith("GATE_KINDS="));
    expect(line).toBeDefined();
    const kinds = line!.replace(/^GATE_KINDS="/, "").replace(/"\s*$/, "").trim().split(/\s+/);
    expect([...GATE_KINDS]).toEqual(kinds);
  });
});
