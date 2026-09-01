/** @doc Brand helper — always returns "Megsy" and brandText is a passthrough. */
export function getZoneBrand(): "Megsy" {
  return "Megsy";
}

/** Passthrough — no rebrand needed. */
export function brandText<T>(value: T, _brand: string = "Megsy"): T {
  return value;
}
