/** @doc Isolated Clerk provider so `@clerk/clerk-react` lands in its own chunk
 *  and never weighs down the first-load entry bundle. Only imported when a
 *  publishable key is configured.
 */
import { type ReactNode } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { clerkPublishableKey } from "@/lib/clerk/config";

export default function ClerkProviderLazy({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  );
}
