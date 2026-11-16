import { ACCESS_LABELS } from "../access.ts";

export const TRUST_LABELS = {
  corroborated: "Corroborated",
  sourced: "Sourced",
  inferred: "Inferred",
  contradicted: "Contradicted",
  gap: "Gap: no evidence kept",
} as const;

export const REVIEW_LABELS = { draft: "Draft", accepted: "Accepted", rejected: "Rejected", edited: "Edited" } as const;

export const STATUS_LABELS = {
  open: "Open",
  fulfilled: "Done",
  likely_fulfilled: "Likely done (inferred)",
  no_evidence: "No evidence kept",
  contradicted: "Contradicted",
} as const;

const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: STATUS_LABELS,
  trust_state: TRUST_LABELS,
  review_state: REVIEW_LABELS,
  access_level: ACCESS_LABELS,
};

/** A stored field value in the words the rest of the app uses ("no_evidence" is "No evidence kept"). Unknown values and other fields pass through. */
export function diffValueLabel(field: string, value: string | null): string | null {
  if (value === null) return null;
  return VALUE_LABELS[field]?.[value] ?? value;
}

export const RULING_LABELS = { done: "Done", not_done: "Not done", cannot_tell: "Cannot tell" } as const;
export type Ruling = keyof typeof RULING_LABELS;

/** A ruling records the advisor's decision. It is not evidence, so the item stays contradicted. */
export const RULING_NOTE = "The advisor's decision, not evidence: the records still disagree, so the item stays contradicted.";

export function rulingLabel(ruling: string | null | undefined): string {
  return ruling && ruling in RULING_LABELS ? RULING_LABELS[ruling as Ruling] : "No ruling yet";
}
