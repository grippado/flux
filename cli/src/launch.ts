import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir, homedir, constants } from "os";
import { markSessionEnded } from "./session.ts";

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
  sessionId?: string;
};

const SHELL_METACHAR_PATTERN = /[;&|`\n<>]|\$\(/;

export function assertSafeInvocation(invocation: string): void {
  if (SHELL_METACHAR_PATTERN.test(invocation)) {
    throw new Error(
      `invocation contém metacaractere de shell não permitido: ${JSON.stringify(invocation)}. Verifique FLUX_CLAUDE_CMD.`,
    );
  }
}

export function shellQuoteArg(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function buildShellCmd(invocation: string, filePath: string, sessionId?: string): string {
  assertSafeInvocation(invocation);
  const sessionEnv = sessionId ? `FLUX_SESSION_ID=${shellQuoteArg(sessionId)} ` : "";
  return `${sessionEnv}${invocation} -- "$(cat ${shellQuoteArg(filePath)})"`;
}

export type HereDeps = {
  spawn?: (argv: string[]) => Promise<number>;
  writePromptFile?: (prompt: string) => string;
  shell?: string;
};

export function exitCodeOf(proc: { exitCode: number | null; signalCode?: string | null }): number {
  if (proc.exitCode !== null) return proc.exitCode;
  const signal = proc.signalCode ? (constants.signals as Record<string, number>)[proc.signalCode] : undefined;
  return signal ? 128 + signal : 1;
}

function spawnInherit(argv: string[]): number {
  return exitCodeOf(Bun.spawnSync(argv, { stdio: ["inherit", "inherit", "inherit"] }));
}

async function spawnInheritForwarding(argv: string[]): Promise<number> {
  const proc = Bun.spawn(argv, { stdio: ["inherit", "inherit", "inherit"] });
  const onTerm = () => proc.kill("SIGTERM");
  const onInt = () => {};
  process.on("SIGTERM", onTerm);
  process.on("SIGINT", onInt);
  try {
    await proc.exited;
    return exitCodeOf(proc);
  } finally {
    process.off("SIGTERM", onTerm);
    process.off("SIGINT", onInt);
  }
}

export async function runHere(req: LaunchRequest, deps: HereDeps = {}): Promise<number> {
  const spawn = deps.spawn ?? spawnInheritForwarding;
  const writeFile = deps.writePromptFile ?? writePromptToTempFile;
  const shell = deps.shell ?? process.env["SHELL"] ?? "/bin/zsh";

  const filePath = writeFile(req.body);
  const shellCmd = buildShellCmd(req.invocation, filePath, req.sessionId);
  return await spawn([shell, "-i", "-c", shellCmd]);
}

export type RemoteRequest = {
  remote: string;
  argv: string[];
};

export type RemoteDeps = {
  checkSshAvailable?: () => boolean;
  checkReachable?: (remote: string) => boolean;
  spawn?: (argv: string[]) => number;
};

function sshAvailable(): boolean {
  return Bun.which("ssh") !== null;
}

function sshReachable(remote: string): boolean {
  try {
    const result = Bun.spawnSync(
      ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=3", remote, "exit"],
      { stderr: "ignore", stdout: "ignore" },
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export function listSshHostAliases(configPath?: string): string[] {
  let text: string;
  try {
    text = readFileSync(configPath ?? join(homedir(), ".ssh", "config"), "utf8");
  } catch {
    return [];
  }

  const aliases: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^\s*Host\s+(.+)$/i);
    if (!match) continue;

    // Marcador de opt-out: um comentário "# flux:ignore" em qualquer linha
    // logo acima do "Host" (pulando linhas em branco) exclui esse bloco
    // inteiro de --remote — sem precisar o CLI conhecer nomes de máquina
    // específicos (ex.: um servidor de produção que só está em ~/.ssh/config
    // por conveniência, não porque deva rodar sessões do flux).
    let ignored = false;
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j]!.trim();
      if (prev === "") continue;
      ignored = /^#.*flux:ignore/i.test(prev);
      break;
    }
    if (ignored) continue;

    for (const token of match[1]!.trim().split(/\s+/)) {
      // Descarta wildcards (Host *, Host 192.168.*) e hosts com ponto — esses
      // são tipicamente serviços (github.com, hq.gripp.link), não máquinas
      // pessoais candidatas a --remote.
      if (token.includes("*") || token.includes("?") || token.includes(".")) continue;
      if (!aliases.includes(token)) aliases.push(token);
    }
  }
  return aliases;
}

export async function checkRemotesReachable(
  candidates: string[],
  isReachable: (remote: string) => boolean = sshReachable,
): Promise<string[]> {
  const results = await Promise.all(
    candidates.map((alias) => Promise.resolve(isReachable(alias)).then((ok) => (ok ? alias : null))),
  );
  return results.filter((a): a is string => a !== null);
}

export function runRemote(req: RemoteRequest, deps: RemoteDeps = {}): number {
  const isAvailable = deps.checkSshAvailable ?? sshAvailable;
  const isReachable = deps.checkReachable ?? sshReachable;
  const spawn = deps.spawn ?? spawnInherit;

  if (!isAvailable()) {
    process.stderr.write("aviso: ssh não encontrado no PATH — --remote não funciona aqui\n");
    return 1;
  }
  if (!isReachable(req.remote)) {
    process.stderr.write(
      `[flux] ✋ ${req.remote} não está acessível via SSH agora — verifique a conexão e ~/.ssh/config\n`,
    );
    return 1;
  }

  return spawn(buildRemoteSshArgv(req.remote, req.argv));
}

export function buildRemoteSshArgv(remote: string, argv: string[]): string[] {
  const remoteCmd = ["flux", ...argv].map(shellQuoteArg).join(" ");
  return ["ssh", "-t", remote, "zsh", "-lic", shellQuoteArg(remoteCmd)];
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
    if (req.sessionId) markSessionEnded(req.sessionId);
  };

  if (!isAvailable()) {
    fallback();
    return;
  }

  let script: string;
  if (termProgram === "iTerm.app" || termProgram === "Apple_Terminal") {
    const filePath = writeFile(req.body);
    const shellCmd = buildShellCmd(req.invocation, filePath, req.sessionId);
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
