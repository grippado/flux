import { describe, it, expect } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, readdirSync, existsSync, mkdirSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { escapeAppleScript, buildITermScript, buildTerminalScript, launchClaude, runHere, runRemote, assertSafeInvocation, buildShellCmd, buildRemoteSshArgv, listSshHostAliases, checkRemotesReachable } from "./launch.ts";

function captureWrites(): { stdout: string[]; stderr: string[]; restore: () => void } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout as { write: unknown }).write = (s: string) => { stdout.push(s); return true; };
  (process.stderr as { write: unknown }).write = (s: string) => { stderr.push(s); return true; };
  return {
    stdout,
    stderr,
    restore: () => {
      (process.stdout as { write: unknown }).write = origOut;
      (process.stderr as { write: unknown }).write = origErr;
    },
  };
}

describe("escapeAppleScript: backslash antes de aspas", () => {
  it("escapa backslash simples", () => {
    expect(escapeAppleScript("a\\b")).toBe("a\\\\b");
  });

  it("escapa aspas duplas", () => {
    expect(escapeAppleScript('a"b')).toBe('a\\"b');
  });

  it("escapa backslash antes de aspas (ordem importa)", () => {
    expect(escapeAppleScript('a\\"b')).toBe('a\\\\\\"b');
  });

  it("string sem caracteres especiais fica intacta", () => {
    expect(escapeAppleScript("claude /flux:review")).toBe("claude /flux:review");
  });
});

describe("assertSafeInvocation: rejeita metacaractere de shell em FLUX_CLAUDE_CMD", () => {
  it("lanca para encadeamento e execucao de subcomando", () => {
    expect(() => assertSafeInvocation("claude; rm -rf /")).toThrow();
    expect(() => assertSafeInvocation("claude && echo pwned")).toThrow();
    expect(() => assertSafeInvocation("claude | tee /tmp/x")).toThrow();
    expect(() => assertSafeInvocation("claude $(cat /etc/passwd)")).toThrow();
    expect(() => assertSafeInvocation("claude `whoami`")).toThrow();
  });

  it("lanca para redirecionamento", () => {
    expect(() => assertSafeInvocation("claude > /tmp/output")).toThrow();
    expect(() => assertSafeInvocation("claude < /tmp/input")).toThrow();
  });

  it("nao lanca para invocacao limpa", () => {
    expect(() => assertSafeInvocation("claude")).not.toThrow();
    expect(() => assertSafeInvocation("claude --dangerously-skip-permissions")).not.toThrow();
    expect(() => assertSafeInvocation("/usr/local/bin/claude")).not.toThrow();
  });

  it("buildShellCmd propaga a rejeicao de assertSafeInvocation", () => {
    expect(() => buildShellCmd("claude; rm -rf /", "/tmp/prompt.txt")).toThrow();
  });
});

describe("buildShellCmd: propaga FLUX_SESSION_ID como prefixo de ambiente do processo", () => {
  it("com sessionId: antepoe FLUX_SESSION_ID=<id> sem 'export' (nao vaza pro shell da aba)", () => {
    const cmd = buildShellCmd("claude", "/tmp/prompt.txt", "abc-12345678");
    expect(cmd).toBe(`FLUX_SESSION_ID='abc-12345678' claude -- "$(cat '/tmp/prompt.txt')"`);
    expect(cmd).not.toContain("export");
  });

  it("sem sessionId: comando fica identico ao que era antes (sem prefixo nenhum)", () => {
    const cmd = buildShellCmd("claude", "/tmp/prompt.txt");
    expect(cmd).toBe(`claude -- "$(cat '/tmp/prompt.txt')"`);
  });
});

describe("buildITermScript: estrutura AppleScript correta", () => {
  it("menciona iTerm2 e write text", () => {
    const script = buildITermScript("claude hello");
    expect(script).toContain("iTerm2");
    expect(script).toContain("write text");
    expect(script).toContain("create tab with default profile");
  });

  it("embute o comando escapado", () => {
    const script = buildITermScript('claude "hello world"');
    expect(script).toContain('write text "claude \\"hello world\\""');
  });

  it("escapa backslash no comando embebido", () => {
    const script = buildITermScript("claude path\\to\\file");
    expect(script).toContain("path\\\\to\\\\file");
  });
});

describe("buildTerminalScript: do script + activate", () => {
  it("usa do script e activate", () => {
    const script = buildTerminalScript("claude hello");
    expect(script).toContain("do script");
    expect(script).toContain("activate");
    expect(script).toContain('application "Terminal"');
  });

  it("embute o comando escapado", () => {
    const script = buildTerminalScript('claude "hello"');
    expect(script).toContain('do script "claude \\"hello\\""');
  });
});

describe("runHere: executa na aba atual via shell interativo, sem osascript", () => {
  it("passa por zsh -i -c para resolver funcoes/aliases (ex.: FLUX_CLAUDE_CMD apontando pra uma shell function)", async () => {
    let argvUsed: string[] = [];
    const exitCode = await runHere(
      { command: "irrelevante", body: "--- PREFLIGHT RESOLVIDO ---\n/flux:iterate 4742", invocation: "scc" },
      {
        spawn: async (argv) => { argvUsed = argv; return 0; },
        writePromptFile: () => "/tmp/flux-prompt-test/prompt.txt",
        shell: "/bin/zsh",
      },
    );
    expect(argvUsed[0]).toBe("/bin/zsh");
    expect(argvUsed[1]).toBe("-i");
    expect(argvUsed[2]).toBe("-c");
    expect(argvUsed[3]).toContain("scc -- ");
    expect(argvUsed[3]).toContain("$(cat '/tmp/flux-prompt-test/prompt.txt')");
    expect(exitCode).toBe(0);
  });

  it("propaga o exit code do processo filho", async () => {
    const exitCode = await runHere(
      { command: "irrelevante", body: "hello", invocation: "claude" },
      { spawn: async () => 7, writePromptFile: () => "/tmp/flux-prompt-test/prompt.txt" },
    );
    expect(exitCode).toBe(7);
  });

  it("SIGTERM no flux chega ao processo final e o runHere retorna em vez de morrer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flux-sig-"));
    try {
      const child = join(dir, "child.sh");
      const out = join(dir, "sig.out");
      writeFileSync(
        child,
        `#!/bin/sh\ntrap 'echo TERM > ${out}; exit 9' TERM\ntrap 'echo INT > ${out}; exit 8' INT\necho ready > ${join(dir, "ready")}\nsleep 20 >/dev/null 2>&1 & wait $!\n`,
        { mode: 0o755 },
      );
      const runner = `
        import { runHere } from ${JSON.stringify(join(import.meta.dir, "launch.ts"))};
        const code = await runHere({ command: "x", body: "b", invocation: ${JSON.stringify(child)} }, { shell: "/bin/sh", writePromptFile: () => ${JSON.stringify(join(dir, "p.txt"))} });
        console.log("code=" + code);
      `;
      writeFileSync(join(dir, "p.txt"), "b");
      const proc = Bun.spawn(["bun", "-e", runner], { stdout: "pipe", stderr: "ignore" });
      for (let i = 0; i < 100 && !existsSync(join(dir, "ready")); i++) await Bun.sleep(50);
      expect(existsSync(join(dir, "ready"))).toBe(true);
      process.kill(proc.pid, "SIGTERM");
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      expect(readFileSync(out, "utf8").trim()).toBe("TERM");
      expect(stdout).toContain("code=9");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runHere: SIGTERM com a invocação sendo função de shell", () => {
  it.skipIf(!Bun.which("zsh") || !Bun.which("pgrep"))("o processo final recebe o TERM mesmo sem exec no shell", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flux-sigfn-"));
    try {
      const child = join(dir, "child.sh");
      const out = join(dir, "sig.out");
      writeFileSync(
        child,
        `#!/bin/sh\ntrap 'echo TERM > ${out}; exit 9' TERM\necho ready > ${join(dir, "ready")}\nsleep 20 >/dev/null 2>&1 & wait $!\n`,
        { mode: 0o755 },
      );
      const zdot = join(dir, "zdot");
      mkdirSync(zdot);
      writeFileSync(join(zdot, ".zshrc"), 'fluxfn() { "$@"; }\n');
      writeFileSync(join(dir, "p.txt"), "b");
      const runner = `
        import { runHere } from ${JSON.stringify(join(import.meta.dir, "launch.ts"))};
        const code = await runHere({ command: "x", body: "b", invocation: "fluxfn ${child}" }, { shell: "zsh", writePromptFile: () => ${JSON.stringify(join(dir, "p.txt"))} });
        console.log("code=" + code);
      `;
      const proc = Bun.spawn(["bun", "-e", runner], { stdout: "pipe", stderr: "ignore", env: { ...process.env, ZDOTDIR: zdot } });
      for (let i = 0; i < 100 && !existsSync(join(dir, "ready")); i++) await Bun.sleep(50);
      expect(existsSync(join(dir, "ready"))).toBe(true);
      process.kill(proc.pid, "SIGTERM");
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      expect(readFileSync(out, "utf8").trim()).toBe("TERM");
      expect(stdout).toContain("code=9");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("launchClaude: caminhos de execução", () => {
  it("fallback com sessionId: marca a sessão como ended em vez de deixá-la running (HOME isolado em subprocesso)", () => {
    const home = mkdtempSync(join(tmpdir(), "flux-launch-home-"));
    try {
      const script = `
        import { launchClaude } from ${JSON.stringify(join(import.meta.dir, "launch.ts"))};
        import { generateSessionId, readSessionFile, writeSessionFile } from ${JSON.stringify(join(import.meta.dir, "session.ts"))};
        const id = generateSessionId();
        writeSessionFile({ sessionId: id, verb: "peek", pid: 1, terminalApp: null, startedAt: new Date().toISOString(), status: "running" });
        await launchClaude({ command: "claude hello", body: "hello", invocation: "claude", sessionId: id }, { checkOsascript: () => false, termProgram: "iTerm.app" });
        console.log(readSessionFile(id)?.status);
      `;
      const result = spawnSync("bun", ["-e", script], { encoding: "utf8", env: { ...process.env, HOME: home } });
      expect(result.stdout.trim().split("\n").pop()).toBe("ended");
      expect(readdirSync(join(home, ".flux", "sessions"))).toHaveLength(1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("fallback quando osascript indisponivel", async () => {
    const cap = captureWrites();
    try {
      await launchClaude({ command: 'claude "hello"', body: "hello", invocation: "claude" }, { checkOsascript: () => false, termProgram: "iTerm.app" });
      expect(cap.stdout.join("")).toContain('claude "hello"');
      expect(cap.stderr.join("")).toContain("aviso");
    } finally {
      cap.restore();
    }
  });

  it("iTerm.app com osascript disponivel invoca script correto e nao escreve no stdout", async () => {
    let scriptUsed = "";
    const cap = captureWrites();
    try {
      await launchClaude({ command: 'claude "hello"', body: "hello", invocation: "claude" }, {
        checkOsascript: () => true,
        execScript: (s) => { scriptUsed = s; return true; },
        termProgram: "iTerm.app",
        writePromptFile: () => "/tmp/flux-test/prompt.txt",
      });
      expect(cap.stdout.join("")).toBe("");
      expect(scriptUsed).toContain("iTerm2");
      expect(scriptUsed).toContain("write text");
    } finally {
      cap.restore();
    }
  });

  it("Apple_Terminal com osascript disponivel invoca script correto e nao escreve no stdout", async () => {
    let scriptUsed = "";
    const cap = captureWrites();
    try {
      await launchClaude({ command: 'claude "hello"', body: "hello", invocation: "claude" }, {
        checkOsascript: () => true,
        execScript: (s) => { scriptUsed = s; return true; },
        termProgram: "Apple_Terminal",
        writePromptFile: () => "/tmp/flux-test/prompt.txt",
      });
      expect(cap.stdout.join("")).toBe("");
      expect(scriptUsed).toContain('application "Terminal"');
      expect(scriptUsed).toContain("do script");
    } finally {
      cap.restore();
    }
  });

  it("prompt multi-linha: AppleScript nao contem newline literal e arquivo recebe prompt intacto", async () => {
    const multiLinePrompt = "linha 1\nlinha 2\nlinha 3";
    let scriptUsed = "";
    let capturedPrompt = "";
    let capturedPath = "";

    const cap = captureWrites();
    try {
      await launchClaude({ command: `claude "${multiLinePrompt}"`, body: multiLinePrompt, invocation: "claude --dangerously-skip-permissions" }, {
        checkOsascript: () => true,
        execScript: (s) => { scriptUsed = s; return true; },
        termProgram: "iTerm.app",
        writePromptFile: (p) => {
          capturedPrompt = p;
          capturedPath = "/tmp/flux-prompt-test/prompt.txt";
          return capturedPath;
        },
      });
      const writeTextLine = scriptUsed.split("\n").find((l) => l.includes("write text"));
      expect(writeTextLine).toBeDefined();
      expect(writeTextLine!).not.toContain("\n");
      expect(writeTextLine!).not.toMatch(/\\n/);
      expect(capturedPrompt).toBe(multiLinePrompt);
      expect(capturedPrompt).not.toContain('claude "');
      expect(scriptUsed).toContain(capturedPath);
      expect(scriptUsed).toContain("--dangerously-skip-permissions");
      expect(scriptUsed).toContain(`-- \\"$(cat '${capturedPath}')\\"`);
    } finally {
      cap.restore();
    }
  });

  it("separa o prompt com -- para o Commander.js nao interpretar conteudo iniciado em -- como opcao", async () => {
    let scriptUsed = "";
    const cap = captureWrites();
    try {
      await launchClaude({ command: "claude", body: "--- PREFLIGHT RESOLVIDO ---", invocation: "claude --dangerously-skip-permissions" }, {
        checkOsascript: () => true,
        execScript: (s) => { scriptUsed = s; return true; },
        termProgram: "iTerm.app",
        writePromptFile: () => "/tmp/flux-prompt-test/prompt.txt",
      });
      expect(scriptUsed).toContain("--dangerously-skip-permissions -- ");
    } finally {
      cap.restore();
    }
  });

  it("terminal nao reconhecido cai no fallback mesmo com osascript disponivel", async () => {
    const cap = captureWrites();
    try {
      await launchClaude({ command: 'claude "hello"', body: "hello", invocation: "claude" }, {
        checkOsascript: () => true,
        termProgram: "hyper",
      });
      expect(cap.stdout.join("")).toContain('claude "hello"');
      expect(cap.stderr.join("")).toContain("aviso");
    } finally {
      cap.restore();
    }
  });
});

describe("runRemote: reencaminha o comando pra outra máquina via ssh -t", () => {
  it("alcancavel: chama ssh -t <alias> com o argv reencaminhado e escapado", () => {
    let argvUsed: string[] = [];
    const exitCode = runRemote(
      { remote: "personal", argv: ["review", "4742", "--repo", "flux", "--here"] },
      {
        checkSshAvailable: () => true,
        checkReachable: () => true,
        spawn: (argv) => { argvUsed = argv; return 0; },
      },
    );
    expect(argvUsed).toEqual(
      buildRemoteSshArgv("personal", ["review", "4742", "--repo", "flux", "--here"]),
    );
    expect(argvUsed[0]).toBe("ssh");
    expect(argvUsed[1]).toBe("-t");
    expect(argvUsed[2]).toBe("personal");
    expect(argvUsed[3]).toBe("zsh");
    expect(argvUsed[4]).toBe("-lic");
    expect(argvUsed[5]).toContain("flux");
    expect(argvUsed[5]).toContain("review");
    expect(exitCode).toBe(0);
  });

  it("propaga o exit code do processo filho", () => {
    const exitCode = runRemote(
      { remote: "arco", argv: ["peek", "--here"] },
      { checkSshAvailable: () => true, checkReachable: () => true, spawn: () => 5 },
    );
    expect(exitCode).toBe(5);
  });

  it("ssh ausente no PATH: aviso e exit 1, sem tentar spawn", () => {
    const cap = captureWrites();
    let spawned = false;
    try {
      const exitCode = runRemote(
        { remote: "personal", argv: ["review", "--here"] },
        { checkSshAvailable: () => false, spawn: () => { spawned = true; return 0; } },
      );
      expect(exitCode).toBe(1);
      expect(spawned).toBe(false);
      expect(cap.stderr.join("")).toContain("ssh não encontrado");
    } finally {
      cap.restore();
    }
  });

  it("alias inalcancavel: mensagem clara e exit 1, sem stack trace de ssh", () => {
    const cap = captureWrites();
    let spawned = false;
    try {
      const exitCode = runRemote(
        { remote: "worzix-desligado", argv: ["review", "--here"] },
        {
          checkSshAvailable: () => true,
          checkReachable: () => false,
          spawn: () => { spawned = true; return 0; },
        },
      );
      expect(exitCode).toBe(1);
      expect(spawned).toBe(false);
      expect(cap.stderr.join("")).toContain("worzix-desligado");
      expect(cap.stderr.join("")).toContain("não está acessível");
    } finally {
      cap.restore();
    }
  });
});

describe("listSshHostAliases: descobre candidatos a --remote em ~/.ssh/config", () => {
  function fixtureConfig(contents: string): string {
    const dir = mkdtempSync(join(tmpdir(), "flux-ssh-config-"));
    const path = join(dir, "config");
    writeFileSync(path, contents);
    return path;
  }

  it("lista aliases simples, ignora wildcard e hosts com ponto (servicos, nao maquinas)", () => {
    const path = fixtureConfig([
      "Host github.com",
      "  User git",
      "",
      "Host hq",
      "  HostName hq.gripp.link",
      "",
      "Host personal",
      "  HostName worzix.local",
      "",
      "Host arco",
      "  HostName ISAAC-CJ9CJKFLQ3.local",
      "",
      "Host *",
      "  ServerAliveInterval 60",
      "",
    ].join("\n"));

    expect(listSshHostAliases(path)).toEqual(["hq", "personal", "arco"]);
  });

  it("dedup aliases repetidos e trata multiplos patterns na mesma linha Host", () => {
    const path = fixtureConfig("Host personal worzix\nHostName worzix.local\nHost personal\n");
    expect(listSshHostAliases(path)).toEqual(["personal", "worzix"]);
  });

  it("arquivo inexistente: retorna lista vazia sem lancar", () => {
    expect(listSshHostAliases("/tmp/flux-nao-existe-ssh-config-xyz")).toEqual([]);
  });

  it("comentario '# flux:ignore' logo acima do Host exclui o bloco inteiro (ex.: servidor de producao)", () => {
    const path = fixtureConfig([
      "# Hostgator HQ, producao do guia-cumuru, flux:ignore",
      "Host hq",
      "  HostName hq.gripp.link",
      "",
      "Host personal",
      "  HostName worzix.local",
      "",
    ].join("\n"));

    expect(listSshHostAliases(path)).toEqual(["personal"]);
  });

  it("flux:ignore tolera linha em branco entre o comentario e o Host", () => {
    const path = fixtureConfig([
      "# flux:ignore",
      "",
      "Host producao",
      "  HostName prod.example.com",
      "",
    ].join("\n"));

    expect(listSshHostAliases(path)).toEqual([]);
  });

  it("comentario comum (sem o marcador) nao exclui nada", () => {
    const path = fixtureConfig([
      "# so uma nota qualquer",
      "Host personal",
      "  HostName worzix.local",
      "",
    ].join("\n"));

    expect(listSshHostAliases(path)).toEqual(["personal"]);
  });
});

describe("checkRemotesReachable: filtra so os aliases que respondem via ssh", () => {
  it("mantem apenas os alcancaveis, preservando a ordem original", async () => {
    const reachable = await checkRemotesReachable(
      ["a", "b", "c"],
      (alias) => alias !== "b",
    );
    expect(reachable).toEqual(["a", "c"]);
  });

  it("nenhum alcancavel: retorna lista vazia", async () => {
    const reachable = await checkRemotesReachable(["a", "b"], () => false);
    expect(reachable).toEqual([]);
  });
});
