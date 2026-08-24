import { describe, it, expect } from "bun:test";
import { repoSlugFromTarget } from "./github-url.ts";

describe("repoSlugFromTarget: extrai o slug do repo a partir do alvo", () => {
  it("extrai o slug de uma URL de PR do GitHub", () => {
    expect(repoSlugFromTarget("https://github.com/OlaIsaac/rf-monorepo/pull/4742")).toBe("rf-monorepo");
  });

  it("retorna null para alvo nulo", () => {
    expect(repoSlugFromTarget(null)).toBeNull();
  });

  it("retorna null para alvo que nao e URL de PR (ex.: slug de repo puro)", () => {
    expect(repoSlugFromTarget("rf-monorepo")).toBeNull();
  });

  it("retorna null para numero de PR sem owner/repo na URL", () => {
    expect(repoSlugFromTarget("4742")).toBeNull();
  });
});
