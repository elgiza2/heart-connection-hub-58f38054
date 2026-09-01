// Parse uploaded files (PDF, DOCX, plain text) into model-readable text.
// Heavy parsing (pdfjs + mammoth) runs inside a dedicated Web Worker so it
// never blocks the main thread — the chat UI stays responsive even while
// extracting a 50-page PDF or a large DOCX. Public API is unchanged; call
// sites just `await parseUploadedFile(file)` as before.

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: string) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    new URL("./parseUploadedFile.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker.addEventListener("message", (event) => {
    const { id, text, error } = event.data as {
      id: number;
      text?: string;
      error?: string;
    };
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) entry.reject(new Error(error));
    else entry.resolve(text ?? "");
  });
  worker.addEventListener("error", (e) => {
    // Fatal worker error: reject any in-flight requests and drop the worker
    // so the next call re-spawns it.
    for (const [, entry] of pending) {
      entry.reject(new Error(e.message || "worker crashed"));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export async function parseUploadedFile(file: File): Promise<string> {
  try {
    const w = getWorker();
    const id = nextId++;
    return await new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, file });
    });
  } catch (e: any) {
    console.error("[parseUploadedFile] failed:", e);
    return `[Could not extract content from ${file.name}: ${e?.message || "unknown"}]`;
  }
}
