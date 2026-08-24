import { mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildITermScript(command: string): string {
  const escaped = escapeAppleScript(command);
  return [
    'tell application "iTerm2"',
    "  tell current window",
    "    create tab with default profile",
    "    tell current session of current tab",
    `      write text "${escaped}"`,
    "    end tell",
    "  end tell",
    "end tell",
  ].join("\n");
}

export function buildTerminalScript(command: string): string {
  const escaped = escapeAppleScript(command);
  return [
    'tell application "Terminal"',
    `  do script "${escaped}"`,
    "  activate",
    "end tell",
  ].join("\n");
}

export function writePromptToTempFile(prompt: string): string {
  const dir = mkdtempSync(join(tmpdir(), "flux-prompt-"));
  const file = join(dir, "prompt.txt");
  writeFileSync(file, prompt, { mode: 0o600 });
  return file;
}

function osascriptAvailable(): boolean {
  try {
    const result = Bun.spawnSync(["/usr/bin/which", "osascript"], { stderr: "ignore" });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function runOsascript(script: string): boolean {
  try {
    const result = Bun.spawnSync(["/usr/bin/osascript", "-e", script], {
      stderr: "pipe",
      stdout: "pipe",
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export type LaunchDeps = {
  checkOsascript?: () => boolean;
  execScript?: (script: string) => boolean;
  termProgram?: string;
  writePromptFile?: (prompt: string) => string;
};

export type LaunchRequest = {
  command: string;
  body: string;
  invocation: string;
};

export function buildShellCmd(invocation: string, filePath: string): string {
  const escapedPath = filePath.replace(/'/g, "'\\''");
  return `${invocation} -- "$(cat '${escapedPath}')"`;
}

export type HereDeps = {
  spawn?: (argv: string[]) => number;
  writePromptFile?: (prompt: string) => string;
  shell?: string;
};

function spawnInherit(argv: string[]): number {
  const proc = Bun.spawnSync(argv, { stdio: ["inherit", "inherit", "inherit"] });
  return proc.exitCode ?? 1;
}

export function runHere(req: LaunchRequest, deps: HereDeps = {}): number {
  const spawn = deps.spawn ?? spawnInherit;
  const writeFile = deps.writePromptFile ?? writePromptToTempFile;
  const shell = deps.shell ?? process.env["SHELL"] ?? "/bin/zsh";

  const filePath = writeFile(req.body);
  const shellCmd = buildShellCmd(req.invocation, filePath);
  return spawn([shell, "-i", "-c", shellCmd]);
}

export async function launchClaude(req: LaunchRequest, deps: LaunchDeps = {}): Promise<void> {
  const termProgram = "termProgram" in deps ? deps.termProgram : process.env["TERM_PROGRAM"];
  const isAvailable = deps.checkOsascript ?? osascriptAvailable;
  const run = deps.execScript ?? runOsascript;
  const writeFile = deps.writePromptFile ?? writePromptToTempFile;

  const fallback = (): void => {
    process.stdout.write(req.command + "\n");
    process.stderr.write(
      "aviso: não foi possível abrir aba automaticamente — execute o comando acima\n",
    );
  };

  if (!isAvailable()) {
    fallback();
    return;
  }

  let script: string;
  if (termProgram === "iTerm.app" || termProgram === "Apple_Terminal") {
    const filePath = writeFile(req.body);
    const shellCmd = buildShellCmd(req.invocation, filePath);
    if (termProgram === "iTerm.app") {
      script = buildITermScript(shellCmd);
    } else {
      script = buildTerminalScript(shellCmd);
    }
  } else {
    fallback();
    return;
  }

  const ok = run(script);
  if (!ok) {
    fallback();
  }
}
