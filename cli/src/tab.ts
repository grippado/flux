const TAB_COLOR_PATTERN = /^[0-9a-f]{6}$/;
const TAB_COLOR_ENV = "FLUX_TAB_COLORED";
const RESET_SIGNALS = ["SIGINT", "SIGTERM"] as const;

export const TAB_COLOR_VERBS = ["review", "build", "iterate"] as const;

export type TabColorDeps = {
  write?: (bytes: string) => void;
  env?: Record<string, string | undefined>;
  termProgram?: string;
  isTTY?: boolean;
  proc?: Pick<NodeJS.Process, "on" | "off" | "kill" | "listenerCount" | "pid">;
};

export type TabHandle = {
  reset: () => void;
};

export function normalizeTabColor(value: unknown): string | null {
  return typeof value === "string" && TAB_COLOR_PATTERN.test(value) ? value : null;
}

export function pickTabColor(terminalTab: unknown, terminal: string): string | null {
  if (typeof terminalTab !== "object" || terminalTab === null || Array.isArray(terminalTab)) return null;
  return normalizeTabColor((terminalTab as Record<string, unknown>)[terminal]);
}

export function buildTabColorSequence(color: string): string {
  return `\x1b]1337;SetColors=tab=${color}\x07`;
}

export function buildTabResetSequence(): string {
  return "\x1b]1337;SetColors=tab=default\x07";
}

export function applyTabColor(terminalTab: unknown, deps: TabColorDeps = {}): TabHandle | null {
  const env = deps.env ?? process.env;
  if (env["TERMINAL_APP"] !== "iterm2") return null;
  const termProgram = "termProgram" in deps ? deps.termProgram : env["TERM_PROGRAM"];
  if (termProgram !== "iTerm.app") return null;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isTTY) return null;
  const color = pickTabColor(terminalTab, "iterm2");
  if (!color) return null;

  const write = deps.write ?? ((bytes: string) => void process.stdout.write(bytes));
  const proc = deps.proc ?? process;
  const previous = env[TAB_COLOR_ENV];

  let active = true;
  const signalHandlers = new Map<string, () => void>();

  const reset = (): void => {
    if (!active) return;
    active = false;
    for (const [signal, handler] of signalHandlers) proc.off(signal as NodeJS.Signals, handler);
    signalHandlers.clear();
    try {
      write(buildTabResetSequence());
    } catch {}
    if (previous === undefined) delete env[TAB_COLOR_ENV];
    else env[TAB_COLOR_ENV] = previous;
  };

  for (const signal of RESET_SIGNALS) {
    const handler = (): void => {
      if (proc.listenerCount(signal) > 1) return;
      reset();
      proc.kill(proc.pid, signal);
    };
    signalHandlers.set(signal, handler);
    proc.on(signal, handler);
  }

  write(buildTabColorSequence(color));
  env[TAB_COLOR_ENV] = "1";
  return { reset };
}
