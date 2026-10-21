const TICKET_BODY = "[A-Z]{2,10}-\\d+";

export const TICKET_PATTERN = new RegExp(`^${TICKET_BODY}$`);
export const TICKET_IN_TEXT = new RegExp(`\\b${TICKET_BODY}\\b`);

const LINEAR_ISSUE_ID = new RegExp(`/issue/(${TICKET_BODY})\\b`, "i");

export function findTicket(text: string): string | null {
  const match = text.match(TICKET_IN_TEXT);
  return match ? match[0] : null;
}

export function ticketFromLinearUrl(url: string): string | null {
  const match = url.match(LINEAR_ISSUE_ID);
  return match ? match[1].toUpperCase() : null;
}
