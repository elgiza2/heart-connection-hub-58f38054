/** @doc OAuth consent screen for third-party apps requesting Megsy access. */
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield, X, Check, Loader2, ExternalLink } from "lucide-react";
import { m as motion } from "framer-motion";

export default function OAuthAuthorizePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<{
    name: string;
    logo_url: string | null;
    scope: string;
  } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const scope = searchParams.get("scope") || "read";
  const state = searchParams.get("state");

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const returnUrl = window.location.href;
        navigate(`/auth?redirect=${encodeURIComponent(returnUrl)}`);
        return;
      }
      setUserId(session.user.id);

      if (!clientId || !redirectUri) {
        setError("Incomplete application data");
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase.functions.invoke("oauth-authorize", {
        body: { client_id: clientId, redirect_uri: redirectUri, scope, action: "info" },
      });

      if (fetchError || !data) {
        setError("Invalid application");
        setLoading(false);
        return;
      }

      if (!data.valid_redirect) {
        setError("Redirect URI not allowed");
        setLoading(false);
        return;
      }

      setAppInfo(data);
      setLoading(false);
    };
    init();
  }, [clientId, redirectUri, scope, navigate]);

  const handleApprove = async () => {
    if (!userId || !clientId || !redirectUri) return;
    setApproving(true);

    const { data, error: invokeError } = await supabase.functions.invoke("oauth-authorize", {
      body: {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        user_id: userId,
        action: "approve",
      },
    });

    if (invokeError || !data?.code) {
      setError("Authorization failed");
      setApproving(false);
      return;
    }

    const url = new URL(redirectUri);
    url.searchParams.set("code", data.code);
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  };

  const handleDeny = () => {
    if (!redirectUri) return;
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center"
        >
          <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <X className="w-8 h-8 text-destructive" />
          </div>
          <h2
            className="text-xl font-semibold text-foreground mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Authorization Error
          </h2>
          <p className="text-muted-foreground">{error}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="mx-auto mb-5 w-20 h-20 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center overflow-hidden"
          >
            {appInfo?.logo_url ? (
              <img loading="lazy" decoding="async"
                src={appInfo.logo_url}
                alt={appInfo.name}
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              <Shield className="w-9 h-9 text-primary" />
            )}
          </motion.div>
          <h1
            className="text-2xl font-bold text-foreground tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {appInfo?.name}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            wants to access your <span className="font-medium text-foreground">Megsy</span> account
          </p>
        </div>

        {/* Permissions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-5 mb-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            This app will be able to
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm text-foreground">
                Read your account info (name, email, avatar)
              </span>
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex gap-3"
        >
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl text-sm font-medium"
            onClick={handleDeny}
          >
            Deny
          </Button>
          <Button
            className="flex-1 h-12 rounded-xl text-sm font-medium"
            onClick={handleApprove}
            disabled={approving}
          >
            {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Authorize"}
          </Button>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-xs text-center text-muted-foreground mt-5"
        >
          By clicking "Authorize", you agree to share your data with this application.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-1.5 mt-3"
        >
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
            Powered by
          </span>
          <span
            className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Megsy
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}
