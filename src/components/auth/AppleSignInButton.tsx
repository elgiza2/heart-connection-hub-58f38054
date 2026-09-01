/** @doc Sign in with Apple, brokered by Clerk and bridged into the app account.
 *  Hidden entirely when Clerk is not configured.
 */
import { useState } from "react";
import { useSignIn } from "@clerk/clerk-react";
import { toast } from "sonner";
import { clerkEnabled } from "@/lib/clerk/config";

function AppleButtonInner({ className }: { className?: string }) {
  const { signIn, isLoaded } = useSignIn();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_apple",
        redirectUrl: `${window.location.origin}/auth/apple-callback`,
        redirectUrlComplete: `${window.location.origin}/auth/apple-callback`,
      });
    } catch (err) {
      setBusy(false);
      toast.error((err as Error).message || "Apple sign-in is unavailable");
    }
  }

  return (
    <button onClick={() => void start()} className={className} disabled={busy || !isLoaded} type="button">
      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16.36 12.78c.02 2.6 2.28 3.47 2.31 3.48-.02.06-.36 1.24-1.2 2.45-.72 1.05-1.47 2.1-2.66 2.12-1.16.02-1.54-.69-2.87-.69-1.33 0-1.75.67-2.85.71-1.14.04-2.01-1.12-2.74-2.17-1.58-2.29-2.79-6.47-1.17-9.29.81-1.4 2.25-2.29 3.81-2.31 1.12-.02 2.18.75 2.87.75.68 0 1.97-.93 3.32-.79.57.02 2.16.21 3.19 1.72-.08.05-1.9 1.11-1.88 3.31M14.2 4.2c.61-.74 1.02-1.77.91-2.8-.88.04-1.95.59-2.58 1.32-.57.65-1.06 1.7-.93 2.7.98.08 1.99-.5 2.6-1.22" />
      </svg>
      {busy ? "Connecting…" : "Continue with Apple"}
    </button>
  );
}

/** Apple sign-in stays hidden until real Apple credentials are configured. */
const appleEnabled = String(import.meta.env.VITE_APPLE_SIGNIN_ENABLED ?? "") === "true";

export default function AppleSignInButton({ className }: { className?: string }) {
  if (!appleEnabled || !clerkEnabled) return null;
  return <AppleButtonInner className={className} />;
}
