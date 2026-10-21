import { describe, test, expect } from "bun:test";
import { TICKET_PATTERN, findTicket, ticketFromLinearUrl } from "./ticket.ts";

describe("TICKET_PATTERN: alvo inteiro", () => {
  test("aceita prefixo de 2 a 10 letras", () => {
    expect(TICKET_PATTERN.test("LAB-123")).toBe(true);
    expect(TICKET_PATTERN.test("AIPROD-123")).toBe(true);
    expect(TICKET_PATTERN.test("AB-1")).toBe(true);
    expect(TICKET_PATTERN.test("ABCDEFGHIJ-1")).toBe(true);
  });

  test("recusa prefixo fora da faixa, minúsculo ou com sobra", () => {
    expect(TICKET_PATTERN.test("A-1")).toBe(false);
    expect(TICKET_PATTERN.test("ABCDEFGHIJK-1")).toBe(false);
    expect(TICKET_PATTERN.test("aiprod-123")).toBe(false);
    expect(TICKET_PATTERN.test("AIPROD-123x")).toBe(false);
    expect(TICKET_PATTERN.test("meu-repo")).toBe(false);
  });
});

describe("findTicket: ticket dentro de texto", () => {
  test("AIPROD-123 isolado", () => {
    expect(findTicket("AIPROD-123")).toBe("AIPROD-123");
  });

  test("AIPROD-123 dentro de frase não vira IPROD-123", () => {
    expect(findTicket("fix: corrige o alvo de AIPROD-123 no build")).toBe("AIPROD-123");
  });

  test("AIPROD-123 dentro de URL do Linear", () => {
    expect(findTicket("ver https://linear.app/acme/issue/AIPROD-123/slug")).toBe("AIPROD-123");
  });

  test("LAB-123 continua reconhecido", () => {
    expect(findTicket("feat: coisa [LAB-123]")).toBe("LAB-123");
  });

  test("não recorta ticket de dentro de uma palavra maior", () => {
    expect(findTicket("QWERTYAIPROD-123")).toBeNull();
    expect(findTicket("xAIPROD-123")).toBeNull();
    expect(findTicket("AIPROD-123abc")).toBeNull();
  });
});

describe("ticketFromLinearUrl", () => {
  test("extrai AIPROD-123 da URL do Linear", () => {
    expect(ticketFromLinearUrl("https://linear.app/acme/issue/AIPROD-123/slug-da-issue")).toBe("AIPROD-123");
    expect(ticketFromLinearUrl("https://linear.app/acme/issue/AIPROD-123")).toBe("AIPROD-123");
  });

  test("normaliza para maiúsculas e mantém LAB-123", () => {
    expect(ticketFromLinearUrl("https://linear.app/g-lab-s/issue/lab-123/foo")).toBe("LAB-123");
  });

  test("sem id de issue retorna null", () => {
    expect(ticketFromLinearUrl("https://linear.app/acme/project/foo")).toBeNull();
    expect(ticketFromLinearUrl("https://linear.app/acme/issue/ABCDEFGHIJK-1")).toBeNull();
  });
});
