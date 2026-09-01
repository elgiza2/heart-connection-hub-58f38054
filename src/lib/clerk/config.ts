/** @doc Client-side Clerk configuration.
 *  Clerk powers two optional things: Apple sign-in and app integrations
 *  (connected accounts). The whole app must keep working when the key is
 *  absent, so every Clerk surface checks `clerkEnabled` first.
 */
export const clerkPublishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? "";

export const clerkEnabled = clerkPublishableKey.startsWith("pk_");

/** Providers we surface in the integrations screen (generic labels only). */
export const CLERK_INTEGRATIONS: { provider: string; label: string; description: string }[] = [
  { provider: "google", label: "Google Workspace", description: "Mail, calendar and drive files" },
  { provider: "microsoft", label: "Microsoft 365", description: "Outlook mail and calendar" },
  { provider: "slack", label: "Slack", description: "Read and post in your channels" },
  { provider: "notion", label: "Notion", description: "Search and update your pages" },
  { provider: "github", label: "GitHub", description: "Repositories, issues and pull requests" },
  { provider: "linear", label: "Linear", description: "Issues and project updates" },
];
