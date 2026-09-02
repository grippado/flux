export const CANONICAL_HARNESSES = ["claude", "cursor", "codex"] as const;
export type CanonicalHarness = typeof CANONICAL_HARNESSES[number];

export type HarnessResolution = {
  harness: string;
  source: "flag" | "env" | "manifesto" | "override" | "deteccao" | "default";
  override?: string;
};

export const UNKNOWN_HARNESS = "desconhecido";

export type ResolveHarnessInput = {
  harness: string | null;
  preferredHarness: string | null;
  override?: string | null;
};

export function resolveHarness(input: ResolveHarnessInput): HarnessResolution {
  const override = input.override ?? process.env["FLUX_CLAUDE_CMD"];

  if (input.harness && override) {
    throw new Error(
      "[flux] --harness e FLUX_CLAUDE_CMD nao podem ser usados ao mesmo tempo. Remova um dos dois."
    );
  }

  if (override) {
    return { harness: UNKNOWN_HARNESS, source: "override", override };
  }

  if (input.harness) {
    return { harness: input.harness, source: "flag" };
  }

  const envHarness = process.env["FLUX_HARNESS"];
  if (envHarness) {
    const valid: string[] = [...CANONICAL_HARNESSES];
    if (!valid.includes(envHarness)) {
      throw new Error(
        `[flux] FLUX_HARNESS="${envHarness}" nao e um valor canonico. Valores aceitos: ${valid.join(", ")}`
      );
    }
    return { harness: envHarness, source: "env" };
  }

  if (input.preferredHarness) {
    const valid: string[] = [...CANONICAL_HARNESSES];
    if (!valid.includes(input.preferredHarness)) {
      throw new Error(
        `[flux] preferred_harness="${input.preferredHarness}" no manifesto nao e um valor canonico. Valores aceitos: ${valid.join(", ")}`
      );
    }
    return { harness: input.preferredHarness, source: "manifesto" };
  }

  return { harness: "claude", source: "default" };
}

export const DEFAULT_HARNESS_WARNING =
  '[flux] nenhum harness declarado; assumindo "claude". ' +
  "Declare com --harness <claude|cursor|codex>, FLUX_HARNESS ou preferred_harness no manifesto.";

export function harnessInstallHint(harness: string): string {
  if (harness === "claude") {
    return "curl -fsSL https://claude.ai/install.sh | bash";
  }
  if (harness === "codex") {
    return "npm install -g @openai/codex";
  }
  if (harness === "cursor") {
    return "Instalacao automatica nao apurada. Acesse https://cursor.com/download para instrucoes.";
  }
  return `Sem instrucao de instalacao conhecida para o harness "${harness}".`;
}
