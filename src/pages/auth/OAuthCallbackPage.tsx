/** @doc Handles the OAuth callback after the user authorizes a provider. */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const OAuthCallbackPage = () => {
  const { provider } = useParams<{ provider: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Connecting...");

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (provider === "pipedream") {
          const errorParam = params.get("error") || params.get("error_description");
          const explicitFail = params.get("success") === "false" || !!errorParam;
          const ok = !explicitFail;
          if (!ok) {
            const errorMessage = errorParam || "Connection failed";
            setStatus("error");
            setMessage(errorMessage);
            if (window.opener) {
              window.opener.postMessage({ type: "pipedream-oauth", ok: false, message: errorMessage }, "*");
              setTimeout(() => window.close(), 900);
            }
            return;
          }

          try {
            await supabase.functions.invoke("pipedream-connect", { body: { action: "list_accounts" } });
          } catch (syncErr) {
            console.warn("[oauth-callback] pipedream sync failed", syncErr);
          }
          setStatus("ok");
          setMessage("Integration connected successfully");
          if (window.opener) {
            window.opener.postMessage({ type: "pipedream-oauth", ok: true }, "*");
            setTimeout(() => window.close(), 500);
          } else {
            setTimeout(() => navigate("/chat?integrations=1"), 1500);
          }
          return;
        }

        const code = params.get("code");
        const state = params.get("state");
        const providerError = params.get("error_description") || params.get("error");
        if (!code || !state) {
          setStatus("error");
          setMessage(providerError || "Missing parameters");
          if (window.opener) {
            window.opener.postMessage(
              {
                type: `${provider}-oauth`,
                ok: false,
                message: providerError || "Missing parameters",
              },
              "*",
            );
            setTimeout(() => window.close(), 900);
          }
          return;
        }

        const fnName = provider === "github" ? "oauth-github-connect" : "oauth-supabase-connect";
        const { data, error } = await supabase.functions.invoke(fnName, {
          body: { code, state, redirect_origin: window.location.origin },
        });

        if (error || data?.error) {
          setStatus("error");
          const errorMessage = data?.error || error?.message || "Connection failed";
          setMessage(errorMessage);
          if (window.opener) {
            window.opener.postMessage(
              { type: `${provider}-oauth`, ok: false, message: errorMessage },
              "*",
            );
            setTimeout(() => window.close(), 900);
          }
          return;
        }

        setStatus("ok");
        setMessage(`${provider === "github" ? "GitHub" : "Supabase"} connected successfully`);
        if (window.opener) {
          window.opener.postMessage(
            { type: `${provider}-oauth`, ok: true },
            "*",
          );
          setTimeout(() => window.close(), 500);
        } else {
          setTimeout(() => navigate("/chat?integrations=1"), 1500);
        }
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message || "Connection failed");
      }
    })();
  }, [provider, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="rounded-3xl border border-border bg-card/80 backdrop-blur-xl p-8 max-w-sm w-full text-center space-y-4">
        {status === "working" && (
          <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
        )}
        {status === "ok" && (
          <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="w-6 h-6 text-primary" />
          </div>
        )}
        {status === "error" && (
          <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <X className="w-6 h-6 text-destructive" />
          </div>
        )}
        <p className="text-sm text-foreground">{message}</p>
        {status === "error" && (
          <button
            onClick={() => navigate("/chat?integrations=1")}
            className="text-xs text-muted-foreground underline"
          >
            Back to Programming
          </button>
        )}
      </div>
    </div>
  );
};

export default OAuthCallbackPage;
