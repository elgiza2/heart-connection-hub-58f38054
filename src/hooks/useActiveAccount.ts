import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnProfile } from "@/lib/ownProfile";

export type ActiveAccount = {
  kind: "personal" | "workspace";
  id: string | null;
  name: string;
  avatarUrl: string | null;
  credits: number;
};

const DEFAULT: ActiveAccount = {
  kind: "personal",
  id: null,
  name: "",
  avatarUrl: null,
  credits: 0,
};

const CACHE_KEY = "megsy:active-account";

function readCache(): ActiveAccount {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      kind: parsed.kind === "workspace" ? "workspace" : "personal",
      id: typeof parsed.id === "string" ? parsed.id : null,
      name: typeof parsed.name === "string" ? parsed.name : "",
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null,
      credits: Number(parsed.credits) || 0,
    };
  } catch {
    return DEFAULT;
  }
}

function writeCache(a: ActiveAccount) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(a));
  } catch {}
}

function pickName(user: any, profile?: any): string {
  const fromProfile = profile?.display_name || profile?.username || profile?.full_name;
  const fromMeta =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.user_name;
  const fromEmail = user.email?.split("@")[0];
  return fromProfile || fromMeta || fromEmail || "";
}

export function useActiveAccount(): ActiveAccount {
  const [account, setAccount] = useState<ActiveAccount>(readCache);


  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      let user = session?.user ?? null;

      if (!user) {
        const {
          data: { user: fetchedUser },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !fetchedUser) {
          if (!cancelled) {
            setAccount(DEFAULT);
            writeCache(DEFAULT);
          }
          return;
        }
        user = fetchedUser;
      }

      if (!user) {
        if (!cancelled) {
          setAccount(DEFAULT);
          writeCache(DEFAULT);
        }
        return;
      }

      // Populate immediately from auth so the UI never sticks on the
      // "User" fallback while we wait for the profiles row.
      if (!cancelled) {
        setAccount((prev) => {
          const next: ActiveAccount = {
            kind: "personal",
            id: user.id,
            name: pickName(user) || prev.name,
            avatarUrl: user.user_metadata?.avatar_url || prev.avatarUrl || null,
            credits: prev.credits,
          };
          writeCache(next);
          return next;
        });
      }

      try {
        const profile = await getOwnProfile(user.id);

        if (cancelled) return;

        const next: ActiveAccount = {
          kind: "personal",
          id: user.id,
          name: pickName(user, profile),
          avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || null,
          credits: Number(profile?.credits) || 0,
        };
        setAccount(next);
        writeCache(next);
      } catch {
        // Keep auth-derived values already set above.
      }
    };

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        if (!cancelled) setAccount(DEFAULT);
        return;
      }
      load();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return account;
}

export default useActiveAccount;
