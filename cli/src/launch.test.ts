import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { escapeAppleScript, buildITermScript, buildTerminalScript, launchClaude } from "./launch.ts";

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

describe("launchClaude: caminhos de execução", () => {
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
