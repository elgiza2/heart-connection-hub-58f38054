import { useEffect } from "react";

/**
 * Adds a data-label attribute to each <td> inside .chat-md-table-wrap so the
 * mobile stacked-card CSS can render "Header: Value" pairs.
 * The header list is stored on the wrap element as data-headers (JSON array).
 */
export function useChatTableLabels(root?: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const scope = root?.current ?? document;

    const process = (wrap: Element) => {
      let headers: string[] = [];
      try {
        headers = JSON.parse((wrap as HTMLElement).dataset.headers || "[]");
      } catch {
        headers = [];
      }
      // Fallback: read from <thead th> if data-headers empty.
      if (!headers.length) {
        headers = Array.from(wrap.querySelectorAll("thead th")).map(
          (th) => (th.textContent || "").trim(),
        );
      }
      const rows = wrap.querySelectorAll("tbody tr");
      rows.forEach((tr) => {
        const cells = tr.querySelectorAll(":scope > td");
        cells.forEach((td, idx) => {
          const label = headers[idx];
          if (label) td.setAttribute("data-label", label);
        });
      });
    };

    const run = () => {
      (scope as Document | HTMLElement)
        .querySelectorAll(".chat-md-table-wrap")
        .forEach(process);
    };

    run();

    const target = (root?.current ?? document.body) as Node;
    const observer = new MutationObserver(() => {
      // Cheap: rerun on any subtree change; the DOM ops are idempotent.
      run();
    });
    observer.observe(target, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root]);
}
