/**
 * Ticket lifecycle (SDD §25.2):
 *
 *   Új → Folyamatban → Jóváhagyásra vár → Jóváhagyva | Elutasítva → Lezárt
 *   Folyamatban → Lezárt (no approval needed)
 *
 * Leave categories (those that create an absence) with an approval chain skip *Folyamatban* and go
 * straight to the chain.
 */

export type TicketStatus =
  "uj" | "folyamatban" | "jovahagyasra_var" | "jovahagyva" | "elutasitva" | "lezart";

export const TICKET_STATUSES: readonly TicketStatus[] = [
  "uj",
  "folyamatban",
  "jovahagyasra_var",
  "jovahagyva",
  "elutasitva",
  "lezart",
];

const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  uj: ["folyamatban"],
  folyamatban: ["jovahagyasra_var", "lezart"],
  jovahagyasra_var: ["jovahagyva", "elutasitva"],
  jovahagyva: ["lezart"],
  elutasitva: ["lezart"],
  lezart: [],
};

export const canTransition = (from: TicketStatus, to: TicketStatus): boolean =>
  TRANSITIONS[from].includes(to);

export const allowedTransitions = (from: TicketStatus): readonly TicketStatus[] =>
  TRANSITIONS[from];

/** The status a new ticket starts in. */
export function initialStatus(category: {
  createsAbsence: boolean;
  chainLength: number;
}): TicketStatus {
  return category.createsAbsence && category.chainLength > 0 ? "jovahagyasra_var" : "uj";
}

export const isOpen = (status: TicketStatus): boolean => status !== "lezart";
