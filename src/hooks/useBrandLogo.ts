/** @doc useBrandLogo — returns the Megsy brand icon URL. */
import megsyProjectLogo from "@/assets/megsy-project-logo.png";

const megsyIconUrl = megsyProjectLogo;

export function useBrandLogo(): string {
  return megsyIconUrl;
}

export { megsyIconUrl as megsyIcon };
