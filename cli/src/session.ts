import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";

export type SessionStatus = "running" | "ended";

export type SessionState = {
  sessionId: string;
  verb: string;
  pid: number;
  terminalApp: string;
  startedAt: string;
  status: SessionStatus;
  lastTickAt?: string;
};

export function sessionsDir(): string {
  return join(homedir(), ".flux", "sessions");
}

export function generateSessionId(): string {
  return `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

export function sessionFilePath(sessionId: string, dir: string = sessionsDir()): string {
  return join(dir, `${sessionId}.json`);
}

export function writeSessionFile(session: SessionState, dir: string = sessionsDir()): string {
  mkdirSync(dir, { recursive: true });
  const filePath = sessionFilePath(session.sessionId, dir);
  writeFileSync(filePath, JSON.stringify(session, null, 2) + "\n", { mode: 0o600 });
  return filePath;
}

export function readSessionFile(sessionId: string, dir: string = sessionsDir()): SessionState | null {
  const filePath = sessionFilePath(sessionId, dir);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as SessionState;
  } catch {
    return null;
  }
}

export function markSessionEnded(sessionId: string, dir: string = sessionsDir()): boolean {
  const current = readSessionFile(sessionId, dir);
  if (!current) return false;
  const updated: SessionState = {
    ...current,
    status: "ended",
    lastTickAt: new Date().toISOString(),
  };
  writeSessionFile(updated, dir);
  return true;
}
