/**
 * Tiny IMAP client (Deno TLS) — enough to poll a catch-all mailbox:
 * LOGIN → SELECT INBOX → SEARCH UNSEEN → FETCH → STORE \Seen.
 */
export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface RawMail {
  seq: number;
  raw: string;
}

export class ImapClient {
  private conn!: Deno.TlsConn;
  private buf = "";
  private tag = 0;
  private dec = new TextDecoder();
  private enc = new TextEncoder();

  constructor(private cfg: ImapConfig) {}

  async connect() {
    this.conn = await Deno.connectTls({ hostname: this.cfg.host, port: this.cfg.port });
    await this.readUntil((l) => l.startsWith("* OK"));
  }

  private async readChunk(): Promise<string> {
    const b = new Uint8Array(65536);
    const n = await this.conn.read(b);
    if (n === null) throw new Error("imap connection closed");
    return this.dec.decode(b.subarray(0, n));
  }

  private async readUntil(pred: (line: string) => boolean): Promise<string> {
    let out = "";
    while (true) {
      const chunk = this.buf || (await this.readChunk());
      this.buf = "";
      out += chunk;
      const lines = out.split("\r\n");
      if (lines.some(pred)) return out;
    }
  }

  /** Send a tagged command and read until its completion line. */
  async cmd(command: string): Promise<string> {
    const tag = `a${++this.tag}`;
    await this.conn.write(this.enc.encode(`${tag} ${command}\r\n`));
    const done = (l: string) =>
      l.startsWith(`${tag} OK`) || l.startsWith(`${tag} NO`) || l.startsWith(`${tag} BAD`);
    const res = await this.readUntil(done);
    const line = res.split("\r\n").find(done)!;
    if (!line.startsWith(`${tag} OK`)) throw new Error(line);
    return res;
  }

  async login() {
    await this.cmd(`LOGIN "${this.cfg.user}" "${this.cfg.pass.replace(/(["\\])/g, "\\$1")}"`);
  }

  async selectInbox() {
    await this.cmd("SELECT INBOX");
  }

  async searchUnseen(): Promise<number[]> {
    const res = await this.cmd("SEARCH UNSEEN");
    const line = res.split("\r\n").find((l) => l.startsWith("* SEARCH")) ?? "";
    return line
      .replace("* SEARCH", "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n));
  }

  async fetchRaw(seq: number): Promise<string> {
    const res = await this.cmd(`FETCH ${seq} (BODY.PEEK[])`);
    const start = res.indexOf("}\r\n");
    if (start === -1) return res;
    const end = res.lastIndexOf(")\r\n");
    return res.slice(start + 3, end > start ? end : undefined);
  }

  async markSeen(seq: number) {
    await this.cmd(`STORE ${seq} +FLAGS (\\Seen)`);
  }

  async logout() {
    try {
      await this.cmd("LOGOUT");
    } catch { /* ignore */ }
    try {
      this.conn.close();
    } catch { /* ignore */ }
  }
}

function decodeWord(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs, enc, txt) => {
    try {
      let bytes: Uint8Array;
      if (enc.toUpperCase() === "B") {
        bytes = Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));
      } else {
        const fixed = txt.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) =>
          String.fromCharCode(parseInt(h, 16)),
        );
        bytes = Uint8Array.from(fixed, (c: string) => c.charCodeAt(0));
      }
      return new TextDecoder(String(cs).toLowerCase()).decode(bytes);
    } catch {
      return txt;
    }
  });
}

export interface ParsedMail {
  from: string;
  fromName: string | null;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  messageId: string | null;
}

/** Very small MIME parser: headers + first text/plain (or html) part. */
export function parseMail(raw: string): ParsedMail {
  const sep = raw.indexOf("\r\n\r\n");
  const headBlock = (sep === -1 ? raw : raw.slice(0, sep)).replace(/\r\n[ \t]+/g, " ");
  let body = sep === -1 ? "" : raw.slice(sep + 4);
  const headers = new Map<string, string>();
  for (const line of headBlock.split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) {
      const k = line.slice(0, i).trim().toLowerCase();
      if (!headers.has(k)) headers.set(k, line.slice(i + 1).trim());
    }
  }
  const h = (k: string) => decodeWord(headers.get(k) ?? "");
  const addr = (v: string) => (v.match(/<([^>]+)>/)?.[1] ?? v).trim().toLowerCase();
  const name = (v: string) => {
    const m = v.match(/^\s*"?([^"<]*?)"?\s*</);
    return m && m[1].trim() ? m[1].trim() : null;
  };

  const ctype = headers.get("content-type") ?? "";
  let text = "";
  let html: string | null = null;

  const decodeBody = (part: string, enc: string, charset: string) => {
    let out = part;
    const e = enc.toLowerCase();
    try {
      if (e.includes("base64")) {
        const bytes = Uint8Array.from(atob(part.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
        out = new TextDecoder(charset).decode(bytes);
      } else if (e.includes("quoted-printable")) {
        const fixed = part
          .replace(/=\r\n/g, "")
          .replace(/=([0-9A-Fa-f]{2})/g, (_x, hh) => String.fromCharCode(parseInt(hh, 16)));
        out = new TextDecoder(charset).decode(Uint8Array.from(fixed, (c) => c.charCodeAt(0)));
      }
    } catch { /* keep raw */ }
    return out;
  };

  const boundary = ctype.match(/boundary="?([^";]+)"?/i)?.[1];
  if (boundary) {
    for (const part of body.split(`--${boundary}`)) {
      const ps = part.indexOf("\r\n\r\n");
      if (ps === -1) continue;
      const ph = part.slice(0, ps).toLowerCase();
      const pb = part.slice(ps + 4);
      const enc = ph.match(/content-transfer-encoding:\s*([^\r\n;]+)/)?.[1] ?? "";
      const cs = ph.match(/charset="?([^";\r\n]+)"?/)?.[1] ?? "utf-8";
      if (ph.includes("text/plain") && !text) text = decodeBody(pb, enc, cs).trim();
      else if (ph.includes("text/html") && !html) html = decodeBody(pb, enc, cs).trim();
    }
  } else {
    const enc = headers.get("content-transfer-encoding") ?? "";
    const cs = ctype.match(/charset="?([^";]+)"?/i)?.[1] ?? "utf-8";
    body = decodeBody(body, enc, cs);
    if (ctype.toLowerCase().includes("text/html")) html = body.trim();
    else text = body.trim();
  }

  if (!text && html) text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return {
    from: addr(h("from")),
    fromName: name(headers.get("from") ?? "") ? decodeWord(name(headers.get("from") ?? "")!) : null,
    to: addr(h("delivered-to") || h("x-original-to") || h("to")),
    subject: h("subject"),
    text,
    html,
    messageId: (headers.get("message-id") ?? "").replace(/[<>]/g, "").trim() || null,
  };
}
