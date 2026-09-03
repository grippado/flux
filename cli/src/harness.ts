export const CANONICAL_HARNESSES = ["claude", "cursor", "codex"] as const;
export type CanonicalHarness = typeof CANONICAL_HARNESSES[number];

export type HarnessResolution = {
  harness: Harness;
  source: "flag" | "env" | "manifesto" | "override" | "deteccao" | "default";
  override?: string;
};

export const UNKNOWN_HARNESS = "desconhecido";

export type Harness = CanonicalHarness | typeof UNKNOWN_HARNESS;

export function isCanonicalHarness(value: string): value is CanonicalHarness {
  return (CANONICAL_HARNESSES as readonly string[]).includes(value);
}

export function assertCanonicalHarness(value: string, origin: string): CanonicalHarness {
  if (isCanonicalHarness(value)) return value;
  throw new Error(
    `[flux] ${origin}="${value}" nao e um valor canonico. Valores aceitos: ${CANONICAL_HARNESSES.join(", ")}`
  );
}

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
    return { harness: assertCanonicalHarness(input.harness, "--harness"), source: "flag" };
  }

  const envHarness = process.env["FLUX_HARNESS"];
  if (envHarness) {
    return { harness: assertCanonicalHarness(envHarness, "FLUX_HARNESS"), source: "env" };
  }

  if (input.preferredHarness) {
    return {
      harness: assertCanonicalHarness(input.preferredHarness, "preferred_harness"),
      source: "manifesto",
    };
  }

  return { harness: "claude", source: "default" };
}

export const DEFAULT_HARNESS_WARNING =
  '[flux] nenhum harness declarado; assumindo "claude". ' +
  "Declare com --harness <claude|cursor|codex>, FLUX_HARNESS ou preferred_harness no manifesto.";

export function harnessInstallHint(harness: Harness): string {
  switch (harness) {
    case "claude":
      return "curl -fsSL https://claude.ai/install.sh | bash";
    case "codex":
      return "npm install -g @openai/codex";
    case "cursor":
      return "Instalacao automatica nao apurada. Acesse https://cursor.com/download para instrucoes.";
    case UNKNOWN_HARNESS:
      return "Invocacao vinda de FLUX_CLAUDE_CMD: o flux nao conhece o alvo e nao pode sugerir instalacao.";
  }
}
