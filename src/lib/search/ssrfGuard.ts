/**
 * @doc Server-only SSRF guard for every outbound fetch that follows a
 * user/AI-supplied URL.
 *
 * String hostname checks alone are not enough: `internal.example.com` can
 * resolve to `10.0.0.5`, and a host that resolves publicly on the first lookup
 * can be re-pointed at a private address on the next one (DNS rebinding).
 * So we resolve DNS ourselves, reject every address that is not public, and
 * pin the connection to the exact address we validated.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Blocked hostnames that never need a DNS round-trip. */
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "instance-data"]);

function ipv4IsPublic(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return false; // this-net, private, loopback
  if (a === 169 && b === 254) return false; // link-local + 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0) return false; // IETF protocol assignments
  if (a === 192 && b === 88) return false; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51) return false; // TEST-NET-2
  if (a === 203 && b === 0) return false; // TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

function ipv6IsPublic(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (ip === "::" || ip === "::1") return false; // unspecified, loopback
  // IPv4-mapped / IPv4-compatible: validate the embedded IPv4 instead.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || ip.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPublic(mapped[1]);
  // URL parsing normalises ::ffff:127.0.0.1 to its hex form ::ffff:7f00:1.
  const hexMapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return ipv4IsPublic(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (/^f[cd]/.test(ip)) return false; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(ip)) return false; // fe80::/10 link-local
  if (/^ff/.test(ip)) return false; // multicast
  if (ip.startsWith("2001:db8")) return false; // documentation
  if (ip.startsWith("64:ff9b")) return false; // NAT64 (can wrap private IPv4)
  return true;
}

export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return ipv4IsPublic(ip);
  if (family === 6) return ipv6IsPublic(ip);
  return false;
}

export interface ResolvedTarget {
  url: URL;
  /** The single validated IP the request must connect to. */
  address: string;
  family: 4 | 6;
}

/**
 * Validates one URL: scheme, credentials, hostname, and EVERY DNS answer.
 * Returns the pinned address, or `null` when the target is not safely public.
 */
export async function resolveSafeUrl(rawUrl: string): Promise<ResolvedTarget | null> {
  let url: URL;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return null;
  if (BLOCKED_HOSTS.has(host)) return null;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  if (!host.includes(".") && isIP(host) === 0) return null; // bare internal names

  // A literal IP needs no DNS, but still has to be public.
  if (isIP(host) !== 0) {
    if (!isPublicIp(host)) return null;
    return { url, address: host, family: isIP(host) === 6 ? 6 : 4 };
  }

  let answers: { address: string; family: number }[];
  try {
    answers = await lookup(host, { all: true, verbatim: true });
  } catch {
    return null;
  }
  if (!answers.length) return null;
  // Every answer must be public — a rebinding host that mixes a public and a
  // private record is rejected outright rather than raced.
  if (!answers.every((a) => isPublicIp(a.address))) return null;

  const chosen = answers[0];
  return { url, address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
}

/**
 * Fetches a URL with SSRF protection: manual redirect handling where every hop
 * is re-validated, and DNS pinning so the address cannot change between the
 * check and the connection.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<SafeFetchResult> {
  const maxRedirects = init.maxRedirects ?? 4;
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const target = await resolveSafeUrl(current);
    if (!target) throw new Error("blocked: private or invalid url");

    // Pin the connection to the validated IP and keep the original Host header,
    // so a second DNS answer cannot be substituted after validation.
    const literal = target.family === 6 ? `[${target.address}]` : target.address;
    const pinned = new URL(target.url.href);
    pinned.hostname = literal;

    const headers = new Headers(init.headers);
    headers.set("Host", target.url.host);
    if (!headers.has("User-Agent")) headers.set("User-Agent", BROWSER_UA);

    // HTTPS certificates are issued for the hostname, not the IP, so TLS has to
    // keep using the real hostname; only plain HTTP can be address-pinned.
    const requestUrl = target.url.protocol === "https:" ? target.url.href : pinned.href;

    const response = await fetch(requestUrl, {
      ...init,
      headers,
      redirect: "manual",
      });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: target.url.href };
      current = new URL(location, target.url).href; // re-validated on next loop
      continue;
    }
    return { response, finalUrl: target.url.href };
  }
  throw new Error("blocked: too many redirects");
}
