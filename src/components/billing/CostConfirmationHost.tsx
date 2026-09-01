import { useEffect, useState, useRef, useCallback } from "react";
import {
  CostEstimateDialog,
  isCostDialogSuppressed,
} from "@/components/billing/CostEstimateDialog";

/**
 * Global cost-confirmation modal, mounted once at the app root.
 *
 * Trigger from anywhere (even outside React) via:
 *   const ok = await confirmCostGlobal({ ... });
 */

interface ConfirmOptions {
  estimatedCost: number;
  operation: string;
  reason?: string;
  suppressKey: string;
}

type Resolver = (ok: boolean) => void;

interface PendingRequest {
  opts: ConfirmOptions;
  resolve: Resolver;
}

const listeners = new Set<(req: PendingRequest) => void>();

export function confirmCostGlobal(opts: ConfirmOptions): Promise<boolean> {
  if (isCostDialogSuppressed(opts.suppressKey)) return Promise.resolve(true);
  if (typeof window === "undefined" || listeners.size === 0) {
    // No provider mounted — degrade gracefully to "allow".
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    for (const listener of listeners) {
      listener({ opts, resolve });
    }
  });
}

/**
 * Mount this once near the root of the app. It renders the modal and
 * listens for `confirmCostGlobal(...)` calls from anywhere.
 */
export function CostConfirmationHost() {
  const [current, setCurrent] = useState<PendingRequest | null>(null);
  const queueRef = useRef<PendingRequest[]>([]);

  const showNext = useCallback(() => {
    setCurrent((cur) => {
      if (cur) return cur;
      const next = queueRef.current.shift() ?? null;
      return next;
    });
  }, []);

  useEffect(() => {
    const listener = (req: PendingRequest) => {
      queueRef.current.push(req);
      showNext();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [showNext]);

  const handleClose = useCallback(
    (ok: boolean) => {
      if (current) current.resolve(ok);
      if (ok) {
        // Long jobs may run in the background — ask for browser
        // notification permission once so completion pings fire even
        // when the user tabs away.
        import("@/lib/notifyJobComplete")
          .then((m) => m.ensureNotificationPermission())
          .catch(() => {});
      }
      setCurrent(null);
      // Show next queued (if any) on next tick.
      setTimeout(showNext, 50);
    },
    [current, showNext],
  );


  if (!current) return null;

  return (
    <CostEstimateDialog
      open
      onOpenChange={(o) => !o && handleClose(false)}
      estimatedCost={current.opts.estimatedCost}
      operation={current.opts.operation}
      reason={current.opts.reason}
      suppressKey={current.opts.suppressKey}
      onConfirm={() => handleClose(true)}
      onCancel={() => handleClose(false)}
    />
  );
}

export default CostConfirmationHost;
