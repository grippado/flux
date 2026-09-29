import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  generateSessionId,
  markSessionEnded,
  readSessionFile,
  sessionFilePath,
  writeSessionFile,
  type SessionState,
} from "./session.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flux-sessions-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: "testsess-a1b2c3d4",
    verb: "iterate",
    pid: 12345,
    terminalApp: "iTerm.app",
    startedAt: "2026-09-28T10:00:00.000Z",
    status: "running",
    ...overrides,
  };
}

describe("generateSessionId: identificadores distintos", () => {
  it("gera ids diferentes em chamadas sucessivas", () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).not.toBe(b);
  });
});

describe("writeSessionFile: grava o arquivo minimo no spawn", () => {
  it("cria o diretorio e grava os campos minimos", () => {
    const session = makeSession();
    const path = writeSessionFile(session, dir);
    expect(path).toBe(sessionFilePath(session.sessionId, dir));

    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk).toEqual(session);
  });

  it("duas sessoes simultaneas de verbos diferentes gravam arquivos e pids distintos", () => {
    const a = makeSession({ sessionId: "sessa-11111111", verb: "iterate", pid: 111 });
    const b = makeSession({ sessionId: "sessb-22222222", verb: "reply", pid: 222 });

    writeSessionFile(a, dir);
    writeSessionFile(b, dir);

    const onDiskA = readSessionFile("sessa-11111111", dir);
    const onDiskB = readSessionFile("sessb-22222222", dir);

    expect(onDiskA?.pid).toBe(111);
    expect(onDiskB?.pid).toBe(222);
    expect(onDiskA?.verb).toBe("iterate");
    expect(onDiskB?.verb).toBe("reply");
    expect(onDiskA?.pid).not.toBe(onDiskB?.pid);
  });
});

describe("sessionFilePath: valida o formato do sessionId antes de montar o path", () => {
  it("rejeita id fora do padrao (ex.: path traversal)", () => {
    expect(() => sessionFilePath("../../etc/passwd", dir)).toThrow();
  });

  it("aceita id no formato real gerado por generateSessionId", () => {
    const id = generateSessionId();
    expect(() => sessionFilePath(id, dir)).not.toThrow();
  });
});

describe("readSessionFile: le ou retorna null sem lancar", () => {
  it("retorna null para sessao inexistente", () => {
    expect(readSessionFile("naoexis-00000000", dir)).toBeNull();
  });

  it("retorna null para JSON corrompido, sem lancar", () => {
    const session = makeSession({ sessionId: "corromp-abcdef12" });
    const path = writeSessionFile(session, dir);
    writeFileSync(path, "{ nao e json valido");
    expect(readSessionFile("corromp-abcdef12", dir)).toBeNull();
  });
});

describe("markSessionEnded: fim de watch normal", () => {
  it("marca status ended e carimba lastTickAt", () => {
    const session = makeSession({ sessionId: "sessfim-00000001" });
    writeSessionFile(session, dir);

    const ok = markSessionEnded("sessfim-00000001", dir);
    expect(ok).toBe(true);

    const onDisk = readSessionFile("sessfim-00000001", dir);
    expect(onDisk?.status).toBe("ended");
    expect(onDisk?.lastTickAt).toBeDefined();
    expect(onDisk?.pid).toBe(session.pid);
  });

  it("sessao morta sem arquivo (terminal fechado antes do spawn gravar) retorna false, nao lanca", () => {
    expect(markSessionEnded("nuncaexi-deadbeef", dir)).toBe(false);
  });
});
