/**
 * @doc Sidebar pins — optional shortcuts the user adds to the main sidebar.
 *
 * Currently only Mail can be pinned. The choice is stored locally so it stays
 * per-device and applies instantly with no round-trip.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SidebarPin = "mail";

const KEY = "sidebar_pins";
const EVT = "megsy:sidebar-pins";
let remoteLoadedFor: string | null = null;

function read(): SidebarPin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? (raw.filter((p) => p === "mail") as SidebarPin[]) : [];
  } catch {
    return [];
  }
}

export function getSidebarPins(): SidebarPin[] {
  return read();
}

export function isPinned(pin: SidebarPin): boolean {
  return read().includes(pin);
}

export function setPinned(pin: SidebarPin, on: boolean): void {
  const next = on ? Array.from(new Set([...read(), pin])) : read().filter((p) => p !== pin);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
  } catch {
    // ignore
  }
  void persistRemote(next);
}

async function persistRemote(pins: SidebarPin[]) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;
  const { data } = await supabase
    .from("user_preferences")
    .select("page_settings")
    .eq("user_id", userId)
    .maybeSingle();
  const current = data?.page_settings && typeof data.page_settings === "object" && !Array.isArray(data.page_settings)
    ? data.page_settings as Record<string, unknown>
    : {};
  await supabase.from("user_preferences").upsert({
    user_id: userId,
    page_settings: { ...current, sidebarPins: pins },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

async function hydrateRemote() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId || remoteLoadedFor === userId) return;
  remoteLoadedFor = userId;
  const { data } = await supabase
    .from("user_preferences")
    .select("page_settings")
    .eq("user_id", userId)
    .maybeSingle();
  const settings = data?.page_settings;
  const remote = settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>).sidebarPins
    : undefined;
  const pins = Array.isArray(remote)
    ? remote.filter((pin): pin is SidebarPin => pin === "mail")
    : read();
  localStorage.setItem(KEY, JSON.stringify(pins));
  window.dispatchEvent(new CustomEvent(EVT, { detail: pins }));
  if (!Array.isArray(remote) && pins.length > 0) void persistRemote(pins);
}

/** React hook: current pins, re-rendering whenever they change. */
export function useSidebarPins(): SidebarPin[] {
  const [pins, setPins] = useState<SidebarPin[]>(() => read());
  useEffect(() => {
    const sync = () => setPins(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    void hydrateRemote();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      remoteLoadedFor = null;
      void hydrateRemote();
    });
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
      listener.subscription.unsubscribe();
    };
  }, []);
  return pins;
}
