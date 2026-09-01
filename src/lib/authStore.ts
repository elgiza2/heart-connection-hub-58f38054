/** @doc Single source of truth for the Supabase session across the app. */
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthState = {
  authenticated: boolean;
  resolved: boolean;
  userId: string | null;
};

let state: AuthState = { authenticated: false, resolved: false, userId: null };
const stateListeners = new Set<(s: AuthState) => void>();
const eventListeners = new Set<(event: AuthChangeEvent | "INITIAL", session: Session | null) => void>();
let bootstrapped = false;

const publish = (event: AuthChangeEvent | "INITIAL", session: Session | null) => {
  state = { authenticated: !!session, resolved: true, userId: session?.user?.id ?? null };
  stateListeners.forEach((cb) => cb(state));
  eventListeners.forEach((cb) => cb(event, session));
};

export const bootstrapAuth = () => {
  if (bootstrapped) return;
  bootstrapped = true;
  supabase.auth.onAuthStateChange((event, session) => publish(event, session));
  void supabase.auth.getSession().then(({ data: { session } }) => {
    if (!state.resolved) publish("INITIAL", session);
  });
};

export const getAuthState = (): AuthState => state;

export const subscribeAuthState = (cb: (s: AuthState) => void) => {
  bootstrapAuth();
  stateListeners.add(cb);
  return () => stateListeners.delete(cb);
};

export const subscribeAuthEvents = (
  cb: (event: AuthChangeEvent | "INITIAL", session: Session | null) => void,
) => {
  bootstrapAuth();
  eventListeners.add(cb);
  return () => eventListeners.delete(cb);
};
