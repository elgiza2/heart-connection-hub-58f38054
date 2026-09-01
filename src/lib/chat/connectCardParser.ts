/** @doc Parses `<CONNECT .../>` tags out of an assistant reply so the chat can
 *  render a clean inline connect box (MCP server or API app credentials)
 *  instead of raw markup.
 *
 *  Examples the assistant may emit:
 *    <CONNECT type="mcp" name="Notion" url="https://mcp.notion.com/mcp" />
 *    <CONNECT type="api" app="stripe" />
 */

export type ConnectSpec = {
  kind: "mcp" | "api";
  /** MCP server url (mcp) */
  url?: string;
  /** Suggested display name (mcp) or app id (api) */
  name?: string;
  appId?: string;
  note?: string;
};

export type ConnectSegment =
  | { type: "text"; text: string }
  | { type: "connect"; spec: ConnectSpec };

const TAG_RE = /<CONNECT\b([^>]*?)\/?\s*>/gi;

export function hasConnectCards(text: string): boolean {
  return /<CONNECT\b/i.test(text);
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? "";
  return out;
}

function toSpec(attrs: Record<string, string>): ConnectSpec | null {
  const type = (attrs.type || (attrs.url ? "mcp" : "api")).toLowerCase();
  if (type === "mcp") {
    return { kind: "mcp", url: attrs.url || "", name: attrs.name || "", note: attrs.note };
  }
  const appId = (attrs.app || attrs.id || attrs.name || "").trim();
  if (!appId) return null;
  return { kind: "api", appId, name: attrs.name || appId, note: attrs.note };
}

/** Strip every `<CONNECT .../>` tag from the text. */
export function stripConnectTags(text: string): string {
  return text.replace(TAG_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Split a reply into plain-text runs and connect-card specs, in order. */
export function parseConnectSegments(text: string): ConnectSegment[] {
  const out: ConnectSegment[] = [];
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text))) {
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ type: "text", text: before });
    const spec = toSpec(parseAttrs(m[1] || ""));
    if (spec) out.push({ type: "connect", spec });
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) out.push({ type: "text", text: tail });
  return out;
}
