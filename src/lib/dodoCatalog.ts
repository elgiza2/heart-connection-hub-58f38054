/** @doc Dodo Payments product catalog (Megsy Pro).
 *
 *  The charged amount always comes from Dodo itself — these ids only tell the
 *  server WHICH product to open. Keep in sync with the Dodo dashboard.
 */

export const DODO_PRODUCTS = {
  /** Standard recurring monthly — $20/month. */
  proMonthly: "pdt_0NmMJe9VjECKDbnwNB3FF",
  /** First-month intro — $7. */
  proMonthlyIntro: "pdt_0NmMJpl33HrzioYp8eQKp",
  /** Win-back after an abandoned checkout — $5. */
  proMonthlyWinback: "pdt_0NmMJzzgEol6PgmKsTeRL",
  /** Standard yearly — $160/year. */
  proYearly: "pdt_0NmMKEL4olXitfxpF146K",
  /** Win-back yearly — $149/year. */
  proYearlyWinback: "pdt_0NmMKJmTn3jLB4fIAfyP2",
} as const;

/**
 * Product to open for a given interval, taking the win-back offer into account.
 * Monthly always starts on the intro product (first month $7) unless the user
 * abandoned checkout, in which case the $5 win-back product is used.
 */
export function dodoProductId(
  interval: "monthly" | "yearly",
  winback: boolean,
): string {
  if (interval === "yearly") {
    return winback ? DODO_PRODUCTS.proYearlyWinback : DODO_PRODUCTS.proYearly;
  }
  return winback ? DODO_PRODUCTS.proMonthlyWinback : DODO_PRODUCTS.proMonthlyIntro;
}
