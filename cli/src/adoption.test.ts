import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { GATE_KINDS } from "./gate.ts";

const SKILLS_DIR = join(import.meta.dir, "..", "..", "plugins", "flux", "skills");

const ADOPTERS: Record<string, string[]> = {
  iterate: ["commit-push", "github-post"],
  review: ["commit-push", "github-post", "issue-write"],
  build: ["pr-open"],
};

function kindsCited(skillMarkdown: string): string[] {
  return [...skillMarkdown.matchAll(/`kind` `([a-z-]+)`/g)].map((m) => m[1]!);
}

describe("adoção do sinal flux-gate/1 pelas skills (o contrato mora em shared/hitl.md)", () => {
  for (const [skill, expected] of Object.entries(ADOPTERS)) {
    const text = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8");

    it(`${skill}: aponta para a seção "Execução headless" do hitl.md`, () => {
      expect(text).toContain("${FLUX_ROOT}/shared/hitl.md");
      expect(text).toMatch(/Execução headless/);
    });

    it(`${skill}: todo kind citado pertence a GATE_KINDS`, () => {
      const cited = kindsCited(text);
      expect(cited.length).toBeGreaterThan(0);
      for (const kind of cited) expect(GATE_KINDS as readonly string[]).toContain(kind);
    });

    it(`${skill}: cita exatamente os kinds dos gates que tem`, () => {
      expect([...new Set(kindsCited(text))].sort()).toEqual([...expected].sort());
    });

    it(`${skill}: não reescreve o schema do sinal na skill`, () => {
      expect(text).not.toContain("flux-gate/1");
    });
  }
});
