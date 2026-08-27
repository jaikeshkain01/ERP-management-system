/**
 * Adjustment reason codes for inventory ADJUSTMENT movements.
 *
 * Client-side vocabulary. The server accepts any `reason` string on the
 * inventory transaction body — we constrain it here so reports can group
 * cleanly and users don't reinvent "damaged"/"broken"/"defective" every time.
 *
 * If a reason isn't in this list, the "Other" code is used and the note
 * field becomes required — so free-text explanations still land in `note`
 * without diluting the reason vocabulary.
 */

export interface AdjustmentReason {
  /** Stable code stored in inventory_transactions.reason. Never rename. */
  code: string
  /** Short label shown in the picker. */
  label: string
  /** One-line explanation shown as a helper below the picker. */
  hint: string
  /** Whether this reason is typically positive (+), negative (-), or either. */
  sign: "positive" | "negative" | "either"
  /** When true, the note field is required to record what actually happened. */
  requiresNote?: boolean
}

export const ADJUSTMENT_REASONS: readonly AdjustmentReason[] = [
  {
    code: "count_correction",
    label: "Cycle count correction",
    hint: "Physical count differed from the system — reconciling.",
    sign: "either",
  },
  {
    code: "found",
    label: "Found (extra units)",
    hint: "Physical count higher than system. Adds stock.",
    sign: "positive",
  },
  {
    code: "damaged",
    label: "Damaged goods",
    hint: "Units unusable due to damage. Removes stock.",
    sign: "negative",
  },
  {
    code: "expired",
    label: "Expired",
    hint: "Past expiry date, cannot be used. Removes stock.",
    sign: "negative",
  },
  {
    code: "lost",
    label: "Lost or stolen",
    hint: "Cannot locate; presumed lost or theft. Removes stock.",
    sign: "negative",
  },
  {
    code: "scrap",
    label: "Scrap",
    hint: "Written off for scrap (rework failure, obsolete). Removes stock.",
    sign: "negative",
  },
  {
    code: "sample",
    label: "Sample given out",
    hint: "Given away as sample / evaluation unit. Removes stock.",
    sign: "negative",
  },
  {
    code: "transfer_error",
    label: "Transfer error correction",
    hint: "Reversing a mis-directed transfer. Any sign.",
    sign: "either",
  },
  {
    code: "system_error",
    label: "System error correction",
    hint: "Reversing a data-entry or system mistake. Any sign.",
    sign: "either",
  },
  {
    code: "other",
    label: "Other",
    hint: "Not covered by the codes above — note required.",
    sign: "either",
    requiresNote: true,
  },
] as const

export function adjustmentReasonByCode(code: string): AdjustmentReason | undefined {
  return ADJUSTMENT_REASONS.find((r) => r.code === code)
}
