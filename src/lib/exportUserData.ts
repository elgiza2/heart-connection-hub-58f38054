/** @doc Exports the signed-in user's own rows (readable under RLS) as a JSON download. No admin/service-role access. */
import { supabase } from "@/integrations/supabase/client";

// Tables that hold user-owned data and are readable by the signed-in user
// under existing RLS policies via the anon/browser client. Kept as an
// explicit allow-list rather than iterating every table in the schema.
const USER_DATA_TABLES = [
  "profiles",
  "user_preferences",
  "user_chat_settings",
  "ai_personalization",
  "user_memory_profiles",
  "conversations",
  "messages",
  "memories",
  "notifications",
  "notification_preferences",
  "credit_transactions",
  "subscriptions",
  "referrals",
  "referral_codes",
  "user_gallery",
  "media_assets",
  "user_assets",
  "projects",
  "api_keys",
  "push_subscriptions",
  "user_roles",
  "workspace_members",
] as const;

export interface ExportProgress {
  table: string;
  index: number;
  total: number;
}

/**
 * Pulls every row visible to the current user (RLS-enforced) from a
 * curated list of user-owned tables using the normal browser Supabase
 * client, then returns a single JSON-serialisable object.
 */
export async function collectUserData(
  onProgress?: (p: ExportProgress) => void,
): Promise<Record<string, unknown>> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    throw new Error("You must be signed in to export your data.");
  }
  const user = authData.user;

  const result: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
    },
    tables: {} as Record<string, unknown>,
    errors: {} as Record<string, string>,
  };

  const tables = result.tables as Record<string, unknown>;
  const errors = result.errors as Record<string, string>;

  for (let i = 0; i < USER_DATA_TABLES.length; i++) {
    const table = USER_DATA_TABLES[i];
    onProgress?.({ table, index: i + 1, total: USER_DATA_TABLES.length });
    try {
      // RLS restricts every one of these tables to rows owned by the
      // signed-in user, so a plain select("*") is safe here.
      const { data, error } = await supabase.from(table as any).select("*").limit(10000);
      if (error) {
        errors[table] = error.message;
      } else {
        tables[table] = data ?? [];
      }
    } catch (e: any) {
      errors[table] = e?.message ?? String(e);
    }
  }

  if (Object.keys(errors).length === 0) delete (result as any).errors;

  return result;
}

/** Triggers a browser download of the user's exported data as a JSON file. */
export async function downloadUserData(
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const data = await collectUserData(onProgress);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `megsy-data-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
