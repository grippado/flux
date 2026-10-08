import { describe, it, expect } from "bun:test";
import { EventEmitter } from "events";
import { applyTabColor, buildTabColorSequence, buildTabResetSequence, normalizeTabColor, pickTabColor, withTabColor } from "./tab.ts";

function fakeProc() {
  const emitter = new EventEmitter();
  const kills: Array<[number, string]> = [];
  return {
    emitter,
    kills,
    proc: {
      pid: 4242,
      on: (s: string, h: () => void) => emitter.on(s, h),
      off: (s: string, h: () => void) => emitter.off(s, h),
      listenerCount: (s: string) => emitter.listenerCount(s),
      kill: (pid: number, s: string) => {
        kills.push([pid, s]);
        return true;
      },
    } as never,
  };
}

function setup(overrides: Record<string, unknown> = {}) {
  const writes: string[] = [];
  const env: Record<string, string | undefined> = { TERMINAL_APP: "iterm2", TERM_PROGRAM: "iTerm.app" };
  const fake = fakeProc();
  const deps = { write: (b: string) => void writes.push(b), env, isTTY: true, proc: fake.proc, ...overrides };
  return { writes, env, fake, deps };
}

const TAB = { iterm2: "6fa1f1" };

describe("normalizeTabColor e pickTabColor", () => {
  it("aceita rrggbb minusculo sem #", () => {
    expect(normalizeTabColor("6fa1f1")).toBe("6fa1f1");
  });

  it("recusa com #, maiusculas, tamanho errado e nao string", () => {
    for (const bad of ["#6fa1f1", "6FA1F1", "6fa1f", "6fa1f1f", "zzzzzz", "", 123456, null, undefined]) {
      expect(normalizeTabColor(bad)).toBeNull();
    }
  });

  it("pickTabColor le a chave do terminal e ignora formas inesperadas", () => {
    expect(pickTabColor({ iterm2: "6fa1f1" }, "iterm2")).toBe("6fa1f1");
    expect(pickTabColor({ kitty: "6fa1f1" }, "iterm2")).toBeNull();
    expect(pickTabColor("6fa1f1", "iterm2")).toBeNull();
    expect(pickTabColor(["6fa1f1"], "iterm2")).toBeNull();
    expect(pickTabColor(null, "iterm2")).toBeNull();
    expect(pickTabColor(undefined, "iterm2")).toBeNull();
  });
});

describe("sequencias", () => {
  it("cor e reset usam OSC 1337 SetColors e BEL, sem OSC 0", () => {
    expect(buildTabColorSequence("6fa1f1")).toBe("\x1b]1337;SetColors=tab=6fa1f1\x07");
    expect(buildTabResetSequence()).toBe("\x1b]1337;SetColors=tab=default\x07");
    expect(buildTabColorSequence("6fa1f1")).not.toContain("\x1b]0;");
    expect(buildTabResetSequence()).not.toContain("\x1b]0;");
  });
});

describe("applyTabColor: quando nao emite nenhum byte", () => {
  it("sem TERMINAL_APP", () => {
    const { writes, env, deps } = setup();
    delete env["TERMINAL_APP"];
    expect(applyTabColor(TAB, deps)).toBeNull();
    expect(writes).toEqual([]);
    expect(env["FLUX_TAB_COLORED"]).toBeUndefined();
  });

  it("TERMINAL_APP diferente de iterm2", () => {
    const { writes, env, deps } = setup();
    env["TERMINAL_APP"] = "terminal";
    expect(applyTabColor(TAB, deps)).toBeNull();
    expect(writes).toEqual([]);
  });

  it("fora do iTerm2", () => {
    const { writes, deps } = setup({ termProgram: "Apple_Terminal" });
    expect(applyTabColor(TAB, deps)).toBeNull();
    expect(writes).toEqual([]);
  });

  it("sem TERM_PROGRAM", () => {
    const { writes, env, deps } = setup();
    delete env["TERM_PROGRAM"];
    expect(applyTabColor(TAB, deps)).toBeNull();
    expect(writes).toEqual([]);
  });

  it("sem TTY", () => {
    const { writes, deps } = setup({ isTTY: false });
    expect(applyTabColor(TAB, deps)).toBeNull();
    expect(writes).toEqual([]);
  });

  it("sem o campo no manifesto", () => {
    const { writes, deps } = setup();
    expect(applyTabColor(null, deps)).toBeNull();
    expect(applyTabColor({}, deps)).toBeNull();
    expect(writes).toEqual([]);
  });

  it("valor invalido, sem erro", () => {
    const { writes, env, deps } = setup();
    expect(applyTabColor({ iterm2: "#6fa1f1" }, deps)).toBeNull();
    expect(applyTabColor({ iterm2: "nope" }, deps)).toBeNull();
    expect(writes).toEqual([]);
    expect(env["FLUX_TAB_COLORED"]).toBeUndefined();
    expect(deps.proc.listenerCount("SIGINT")).toBe(0);
  });
});

describe("applyTabColor: cor valida", () => {
  it("emite a cor, exporta FLUX_TAB_COLORED e reseta uma unica vez", () => {
    const { writes, env, deps } = setup();
    const handle = applyTabColor(TAB, deps);
    expect(handle).not.toBeNull();
    expect(writes).toEqual(["\x1b]1337;SetColors=tab=6fa1f1\x07"]);
    expect(env["FLUX_TAB_COLORED"]).toBe("1");

    handle!.reset();
    handle!.reset();
    expect(writes).toEqual(["\x1b]1337;SetColors=tab=6fa1f1\x07", "\x1b]1337;SetColors=tab=default\x07"]);
    expect(env["FLUX_TAB_COLORED"]).toBeUndefined();
    expect(deps.proc.listenerCount("SIGINT")).toBe(0);
    expect(deps.proc.listenerCount("SIGTERM")).toBe(0);
  });

  it("nunca escreve titulo", () => {
    const { writes, deps } = setup();
    applyTabColor(TAB, deps)!.reset();
    expect(writes.join("")).not.toContain("\x1b]0;");
    expect(writes.join("")).not.toContain("\x1b]2;");
  });

  it("withTabColor: erro dentro de fn ainda reseta a aba", async () => {
    const { writes, env, fake, deps } = setup();
    await expect(
      withTabColor("review", TAB, async () => {
        expect(env["FLUX_TAB_COLORED"]).toBe("1");
        throw new Error("boom");
      }, deps),
    ).rejects.toThrow("boom");
    expect(writes.at(-1)).toBe("\x1b]1337;SetColors=tab=default\x07");
    expect(env["FLUX_TAB_COLORED"]).toBeUndefined();
    expect(fake.emitter.listenerCount("SIGINT")).toBe(0);
  });

  it("withTabColor: retorno normal também reseta e devolve o valor", async () => {
    const { writes, deps } = setup();
    const result = await withTabColor("build", TAB, async () => 7, deps);
    expect(result).toBe(7);
    expect(writes).toEqual([buildTabColorSequence("6fa1f1"), buildTabResetSequence()]);
  });

  it("withTabColor: só review, build e iterate coloram", async () => {
    for (const verb of ["review", "build", "iterate"]) {
      const { writes, deps } = setup();
      await withTabColor(verb, TAB, async () => 0, deps);
      expect(writes.length).toBe(2);
    }
    for (const verb of ["peek", "issue", "land", "refine", "probe", "reply", "chain", "equip", "map"]) {
      const { writes, env, deps } = setup();
      const result = await withTabColor(verb, TAB, async () => {
        expect(env["FLUX_TAB_COLORED"]).toBeUndefined();
        return 3;
      }, deps);
      expect(result).toBe(3);
      expect(writes).toEqual([]);
    }
  });

  it("write que lança na cor: retorna null, sem listeners e sem FLUX_TAB_COLORED", () => {
    const { env, fake, deps } = setup({
      write: () => {
        throw new Error("EPIPE");
      },
    });
    expect(applyTabColor(TAB, deps)).toBeNull();
    expect(fake.emitter.listenerCount("SIGINT")).toBe(0);
    expect(fake.emitter.listenerCount("SIGTERM")).toBe(0);
    expect(env["FLUX_TAB_COLORED"]).toBeUndefined();
  });

  it("restaura o valor anterior de FLUX_TAB_COLORED", () => {
    const { env, deps } = setup();
    env["FLUX_TAB_COLORED"] = "0";
    const handle = applyTabColor(TAB, deps)!;
    expect(env["FLUX_TAB_COLORED"]).toBe("1");
    handle.reset();
    expect(env["FLUX_TAB_COLORED"]).toBe("0");
  });

  it("falha do escritor no reset nao propaga", () => {
    let calls = 0;
    const { deps } = setup({
      write: () => {
        calls++;
        if (calls > 1) throw new Error("EPIPE");
      },
    });
    const handle = applyTabColor(TAB, deps)!;
    expect(() => handle.reset()).not.toThrow();
  });
});

describe("applyTabColor: sinais", () => {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    it(`${signal} sem outro listener: reseta e reenvia o sinal ao proprio processo`, () => {
      const { writes, fake, deps } = setup();
      applyTabColor(TAB, deps);
      fake.emitter.emit(signal);
      expect(writes.at(-1)).toBe("\x1b]1337;SetColors=tab=default\x07");
      expect(fake.kills).toEqual([[4242, signal]]);
      expect(fake.emitter.listenerCount(signal)).toBe(0);
    });

    it(`${signal} com outro listener ativo: nao reseta cedo, o finally do chamador cuida`, () => {
      const { writes, fake, deps } = setup();
      const handle = applyTabColor(TAB, deps)!;
      fake.emitter.on(signal, () => {});
      fake.emitter.emit(signal);
      expect(writes).toEqual(["\x1b]1337;SetColors=tab=6fa1f1\x07"]);
      expect(fake.kills).toEqual([]);
      handle.reset();
      expect(writes.at(-1)).toBe("\x1b]1337;SetColors=tab=default\x07");
    });
  }
});
