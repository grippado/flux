import { describe, it, expect } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildRemoteSshArgv } from "./launch.ts";

describe("flux --remote --dry: reencaminha o comando sem levar --dry/--remote junto", () => {
  it("--remote combinado com --dry imprime o comando ssh esperado, sem --dry nem --remote no lado de la, com --here garantido", () => {
    const dir = mkdtempSync(join(tmpdir(), "flux-remote-dry-"));
    const out = execFileSync(
      "bun",
      ["run", join(import.meta.dir, "index.ts"), "peek", "--repo", "flux", "--remote", "personal", "--dry"],
      { cwd: dir, encoding: "utf8" },
    ).trim();

    const expected = buildRemoteSshArgv("personal", ["peek", "--repo", "flux", "--here"]).join(" ");
    expect(out).toBe(expected);
  });

  it("--here explicito nao duplica ao ser reencaminhado", () => {
    const dir = mkdtempSync(join(tmpdir(), "flux-remote-dry-"));
    const out = execFileSync(
      "bun",
      ["run", join(import.meta.dir, "index.ts"), "peek", "--repo", "flux", "--here", "--remote", "arco", "--dry"],
      { cwd: dir, encoding: "utf8" },
    ).trim();

    const expected = buildRemoteSshArgv("arco", ["peek", "--repo", "flux", "--here"]).join(" ");
    expect(out).toBe(expected);
  });
});
