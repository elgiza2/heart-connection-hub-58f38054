// Robust Markdown normalizer for Deep Research reports.
// Strategy: minimal touch. Don't break valid Markdown. Just clean leakage,
// strip inline images, normalize bullets, and ensure tables have separators.

const ARABIC_REGEX = /[\u0600-\u06FF]/;

export const normalizeResearchReport = (raw: string): string => {
  if (!raw) return "";

  let s = raw.trim();

  // 0a) Unwrap JSON envelope like {"answer":"..."} or {"section":"...","section_2":"..."}
  //     that sometimes gets saved raw instead of rendered markdown.

  // Strip synthetic key references like "[section_9[0]]" that some models leak
  // into body text (they were meant as internal footnote labels).
  // Bare-domain citation leaks like "(liverpoolfc.com)", "[uefa.com]" or a
  // lone "www.fifa.com" — the model names the source domain without a full
  // URL. Domains belong in the sources section, never inside the prose.
  const stripBareDomains = (txt: string): string =>
    txt
      .replace(/\(\s*(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\.[a-z]{2})?\s*\)/gi, "")
      .replace(/\[\s*(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\.[a-z]{2})?\s*\]/gi, "")
      .replace(/\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)\]<>"']*)?/gi, "")
      .replace(
        /(?<![\w/.])(?:[a-z0-9-]+\.)+(?:com|org|net|io|gov|edu|info|news|me|tv|co|ai|eg|sa|ae|tr|uk|de|fr)(?:\.[a-z]{2})?(?![\w/])/gi,
        "",
      )
      .replace(/\(\s*\)/g, "");

  const stripSyntheticRefs = (txt: string): string =>
    txt
      .replace(/\[\s*section(?:_\d+)?(?:\[\d+\])?\s*\]/gi, "")
      // Numeric footnote markers like "[2]" that models leak into body text.
      .replace(/\[\s*\d+\s*\]/g, "")
      // Other citation shapes frequently emitted by research models.
      .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, "")
      .replace(/\((?:source|sources|reference|references|مصدر|المصدر|مرجع|المراجع)\s*\d+(?:\s*[,،-]\s*\d+)*\)/gi, "")
      // Plain-text "Sources الرئيسية:" / "Main sources:" lines outside headings.
      .replace(/^\s*(?:Sources\s+الرئيسية|main\s+sources|sources|references|Sources|المراجع|مصادر)\s*[:：]\s*$/gim, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n[ \t]+\n/g, "\n\n");

  // Remove an in-body source list block: a line that looks like a source heading
  // (heading, bold, or plain text) followed by list items. This catches the
  // "Sources الرئيسية:" blocks that models sometimes inject inside sections.
  const stripSourceListBlocks = (txt: string): string => {
    const sourceLabelRe =
      /^\s*(?:#{1,6}\s+|\*\*)?(?:Sources\s+الرئيسية|Sources|المراجع|مصادر|main\s+sources|sources|references)\s*[:：]?(?:\*\*)?\s*[:：]?\s*$/i;
    const listItemRe = /^\s*(?:[-*]|\d+\.)\s+/;
    const blankOrHeading = (l: string) => /^\s*$/.test(l) || /^#{1,6}\s/.test(l.trim());
    const lines = txt.split("\n");
    const out: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (sourceLabelRe.test(line)) {
        skipping = true;
        continue;
      }
      if (skipping) {
        if (blankOrHeading(line)) {
          skipping = false;
          out.push(line);
        } else if (!listItemRe.test(line)) {
          // Label was followed by normal text, not a list; keep from here on.
          skipping = false;
          out.push(line);
        }
        // otherwise skip the list line
        continue;
      }
      out.push(line);
    }
    return out.join("\n");
  };

  // Derive a short heading from the first line of a section body.
  // Uses the first line if it's short and ends with ":" or "-", otherwise
  // the first sentence trimmed. Returns null when no good candidate exists.
  const deriveHeading = (body: string): { heading: string | null; rest: string } => {
    const trimmed = body.trim();
    if (!trimmed) return { heading: null, rest: "" };
    const firstLineEnd = trimmed.indexOf("\n");
    const firstLine = (firstLineEnd === -1 ? trimmed : trimmed.slice(0, firstLineEnd)).trim();
    const rest = firstLineEnd === -1 ? "" : trimmed.slice(firstLineEnd + 1).trim();
    // Line ending with ":" → likely a title.
    if (/[:：]\s*$/.test(firstLine) && firstLine.length <= 90) {
      return { heading: firstLine.replace(/[:：]\s*$/, "").trim(), rest };
    }
    // Short standalone line (no punctuation dot in middle) → use as heading.
    if (firstLine.length <= 60 && !/[.!؟?]\s/.test(firstLine) && rest) {
      return { heading: firstLine, rest };
    }
    return { heading: null, rest: trimmed };
  };

  const flattenJsonValue = (val: unknown, opts: { autoHeading?: boolean } = {}): string => {
    if (val == null) return "";
    if (typeof val === "string") return stripSyntheticRefs(val);
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (Array.isArray(val))
      return val.map((v) => flattenJsonValue(v, opts)).filter(Boolean).join("\n\n");
    if (typeof val === "object") {
      const parts: string[] = [];
      let sectionIdx = 0;
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const text = flattenJsonValue(v, opts);
        if (!text.trim()) continue;
        const isSectionKey = /^section(_\d+)?(\[\d+\])?$/i.test(k);
        if (isSectionKey) {
          sectionIdx++;
          if (opts.autoHeading) {
            const { heading, rest } = deriveHeading(text);
            if (heading) {
              parts.push(`## ${heading}\n\n${rest}`.trim());
              continue;
            }
          }
          parts.push(text);
        } else {
          // Named key (e.g. "Sources_الرئيسية") — render as heading.
          const heading = k.replace(/_/g, " ").trim();
          parts.push(`## ${heading}\n\n${text}`);
        }
      }
      return parts.join("\n\n");
    }
    return "";
  };

  const tryUnwrap = (txt: string): string => {
    const t = txt.trim();
    if (!(t.startsWith("{") && t.endsWith("}"))) return txt;
    const tryParse = (candidate: string): unknown | undefined => {
      try { return JSON.parse(candidate); } catch { return undefined; }
    };
    let obj = tryParse(t);
    if (obj === undefined) {
      // Payloads sometimes contain real newlines inside string values (invalid JSON).
      const repaired = t.replace(/[\n\r\t]/g, (c) =>
        c === "\n" ? "\\n" : c === "\r" ? "\\r" : "\\t"
      );
      obj = tryParse(repaired);
    }
    if (obj && typeof obj === "object") {
      const rec = obj as Record<string, unknown>;
      const preferred = rec.answer ?? rec.report ?? rec.content ?? rec.text ?? rec.markdown;
      if (typeof preferred === "string" && preferred.trim()) return stripSyntheticRefs(preferred);
      const flat = flattenJsonValue(obj, { autoHeading: true });
      if (flat.trim()) return flat;
    }
    const m = t.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (m) {
      try { return stripSyntheticRefs(JSON.parse('"' + m[1] + '"')); }
      catch { return stripSyntheticRefs(m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")); }
    }
    return txt;
  };
  s = tryUnwrap(s);


  // 0) Strip deep-research streaming/agent leakage that sometimes ends up saved.
  s = s
    .replace(/^Browser Agent Result for[^\n]*\n?/gim, "")
    .replace(/\{"status"\s*:\s*"[^"]+"\}/g, "")
    .replace(/^\s*===\s*Next Source\s*===\s*$/gim, "")
    .replace(/^\s*===\s*[A-Za-z ]+\s*===\s*$/gim, "")
    .replace(/^Source:\s*$/gim, "");

  // 1) Strip leakage / thinking / tool blocks
  s = s
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<tool[\s\S]*?<\/tool>/gi, "");

  // 2) Strip inline images (handled by gallery)
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<img\b[^>]*>/gi, "");

  // Links belong in the dedicated sources drawer. Preserve their readable
  // labels in prose, but never leave clickable URLs or raw URL noise in-body.
  s = s
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/https?:\/\/[^\s)\]<>\"]+/g, "");

  // 3) Unify line endings + tabs + nbsp
  s = s
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/\u00A0/g, " ");

  // 4) Strip bold wrappers from headings: "## **Title**" -> "## Title"
  s = s.replace(/^(#{1,6})\s*\*\*\s*([^\n]*?)\s*\*\*\s*$/gm, "$1 $2");

  // 5) Headings without space after # -> add space
  s = s.replace(/^(#{1,6})([^\s#])/gm, "$1 $2");

  // 6) Normalize unicode bullets to "- "
  s = s.replace(/^([ \t]*)[•●◦∙·▪▫■□–—](\s+)/gm, "$1- ");

  // 7) Ordered list items missing space
  s = s.replace(/^(\s*\d+\.)([^\s])/gm, "$1 $2");

  // 8) Ensure blank line BEFORE headings & blockquotes (NOT tables — would break them)
  s = s.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2").replace(/([^\n])\n(>\s)/g, "$1\n\n$2");

  // 8b) Ensure blank line before a table row, but only when previous line is plain text
  // (not another table row or separator)
  s = s.replace(/^([^\n|][^\n]*)\n(\|[^\n]+\|)\s*$/gm, (_m, prev: string, table: string) => {
    if (/^\s*$/.test(prev)) return _m;
    return `${prev}\n\n${table}`;
  });

  // 9) Repair tables: ensure separator after header AND remove blank lines inside table
  const lines = s.split("\n");
  const isTableLine = (l: string) => /^\|.*\|\s*$/.test(l.trim());
  const isSepLine = (l: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(l.trim());

  // Pass 1: drop blank lines between two table rows (GFM breaks otherwise)
  const compact: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    if (cur.trim() === "") {
      const prev = lines[i - 1] ?? "";
      // look ahead past additional blank lines
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      const next = lines[j] ?? "";
      if (isTableLine(prev) && isTableLine(next)) continue;
    }
    compact.push(cur);
  }

  // Pass 2: insert separator row after header if missing
  const out: string[] = [];
  for (let i = 0; i < compact.length; i++) {
    const line = compact[i];
    out.push(line);
    if (isTableLine(line) && !isSepLine(line)) {
      const prev = compact[i - 1] ?? "";
      const next = compact[i + 1] ?? "";
      const prevIsTable = isTableLine(prev);
      const nextIsSep = isSepLine(next);
      if (!prevIsTable && !nextIsSep) {
        const cells = line
          .trim()
          .split("|")
          .filter((c) => c.length > 0);
        out.push("| " + Array(Math.max(cells.length, 2)).fill("---").join(" | ") + " |");
      }
    }
  }
  s = out.join("\n");

  // 10) Collapse 3+ blank lines to 2
  s = s.replace(/\n{3,}/g, "\n\n");

  // 11) Trim leading/trailing blank lines and stray horizontal rules at top
  s = s.replace(/^\s*(?:-{3,}\s*\n+)+/, "").trim();

  // 12) Strip any "Sources / Sources / المراجع / Sources الرئيسية" section
  //     (both trailing and mid-body — sources are rendered separately).
  s = s.replace(
    /\n+#{1,6}\s*(?:sources|references|Sources\s+الرئيسية|Sources|المراجع|مصادر|المصادر)\s*:?[^\n]*\n[\s\S]*?(?=\n#{1,6}\s|\n*$)/gi,
    "\n\n",
  ).trim();

  // 13) Final cleanup pass over the assembled body: kill leaked footnote
  //     markers, in-body source list blocks, and bare source labels wherever
  //     they still appear.
  s = stripBareDomains(stripSyntheticRefs(stripSourceListBlocks(s)))
    // Lines that are only a bracketed number (or several) e.g. "[2]" or "[2] [3]".
    .replace(/^\s*(?:\[\s*\d+\s*\]\s*){1,}$/gm, "")
    // Empty list items left behind after stripping markers ("- " / "* " / "1. ").
    .replace(/^\s*(?:[-*]|\d+\.)\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return s;
};

export const detectResearchReportDirection = (report: string) =>
  ARABIC_REGEX.test(report) ? "rtl" : "ltr";
