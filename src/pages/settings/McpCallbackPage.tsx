/** @doc Landing page for a tool-server sign-in redirect.
 *  It hands the authorization code back to the gateway, which exchanges it
 *  server-side and re-reads the server's tool list.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeMcpOAuth } from "@/lib/mcp/client";
import { notifyTurnContextChanged } from "@/lib/chat/turnContext";

export default function McpCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Finishing the connection…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const state = params.get("state") ?? "";
    const code = params.get("code") ?? "";
    const denied = params.get("error");

    if (denied || !state || !code) {
      setStatus("error");
      setMessage(denied ? "Access was not granted." : "This link is incomplete.");
      return;
    }

    completeMcpOAuth(state, code)
      .then((res) => {
        if (res.ok === false) throw new Error(res.error || "Connection failed");
        notifyTurnContextChanged();
        setStatus("done");
        const count = Array.isArray(res.tools) ? res.tools.length : 0;
        setMessage(count ? `Connected — ${count} tools available.` : "Connected.");
        setTimeout(() => navigate("/settings/mcp", { replace: true }), 1200);
      })
      .catch((err: Error) => {
        setStatus("error");
        setMessage(err.message || "Connection failed");
      });
  }, [params, navigate]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      {status === "working" && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      {status === "done" && <CheckCircle2 className="h-6 w-6 text-emerald-500" />}
      {status === "error" && <AlertCircle className="h-6 w-6 text-destructive" />}
      <p className="text-sm text-muted-foreground">{message}</p>
      {status !== "working" && (
        <Button variant="secondary" size="sm" onClick={() => navigate("/settings/mcp", { replace: true })}>
          Back to tool servers
        </Button>
      )}
    </div>
  );
}
