// Web Worker that parses uploaded PDF / DOCX / plain-text files off the main
// thread. Keeps the chat UI responsive during large document extraction.

/// <reference lib="webworker" />

const MAX_CHARS = 80_000;

function clip(text: string): string {
  const cleaned = text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (cleaned.length <= MAX_CHARS) return cleaned;
  return (
    cleaned.slice(0, MAX_CHARS) +
    `\n\n[... Done File truncated at ${MAX_CHARS} characters ...]`
  );
}

let pdfjsPromise: Promise<any> | null = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs: any = await import("pdfjs-dist");
      // Inside a module worker pdfjs can run without a nested worker.
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = "";
      } catch {
        /* ignore */
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

async function parsePdf(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: buf, disableWorker: true }).promise;
  const pages: string[] = [];
  const max = Math.min(doc.numPages, 50);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(" ");
    pages.push(`--- Page ${i} ---\n${text}`);
  }
  return clip(pages.join("\n\n"));
}

async function parseDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const { default: mammoth } = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return clip(value || "");
}

async function parsePlainText(file: File): Promise<string> {
  const txt = await file.text();
  return clip(txt);
}

async function parseSpreadsheet(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const XLSX: any = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames.slice(0, 8)) {
    const sheet = wb.Sheets[name];
    // CSV output preserves rows/columns cleanly for LLM consumption.
    const csv: string = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) parts.push(`--- Sheet: ${name} ---\n${csv}`);
  }
  return clip(parts.join("\n\n"));
}

async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return parsePdf(file);
  }
  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return parseDocx(file);
  }
  if (name.endsWith(".doc")) {
    return `[Could not read legacy .doc file. Please save it as .docx or PDF.]`;
  }
  if (
    /\.(xlsx|xls|xlsm|xlsb|ods|csv|tsv)$/i.test(name) ||
    /spreadsheet|excel|csv/i.test(file.type)
  ) {
    return parseSpreadsheet(file);
  }
  return parsePlainText(file);
}

self.addEventListener("message", async (event: MessageEvent) => {
  const { id, file } = event.data as { id: number; file: File };
  try {
    const text = await parseFile(file);
    (self as any).postMessage({ id, text });
  } catch (e: any) {
    (self as any).postMessage({
      id,
      error: e?.message || "unknown parser error",
    });
  }
});

export {};
