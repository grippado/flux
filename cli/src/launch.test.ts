import { describe, it, expect } from "bun:test";
import { escapeAppleScript, buildITermScript, buildTerminalScript } from "./launch.ts";

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
