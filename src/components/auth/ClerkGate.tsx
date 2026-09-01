/** @doc Mounts ClerkProvider only when a publishable key is configured.
 *  Without a key the app renders exactly as before — Clerk features simply
 *  stay hidden instead of crashing the tree. The provider itself is code-split
 *  so the Clerk SDK never ships in the first-load entry bundle.
 */
import { Suspense, lazy, type ReactNode } from "react";
import { clerkEnabled } from "@/lib/clerk/config";

const ClerkProviderLazy = lazy(() => import("./ClerkProviderLazy"));

export default function ClerkGate({ children }: { children: ReactNode }) {
  if (!clerkEnabled) return <>{children}</>;
  return (
    <Suspense fallback={<>{children}</>}>
      <ClerkProviderLazy>{children}</ClerkProviderLazy>
    </Suspense>
  );
}
