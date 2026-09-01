/** @doc Accept a personal invite to join a Megsy workspace or chat. */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, MessageSquare, Users } from "lucide-react";
import { toast } from "sonner";

interface InviteDetails {
  invite_id: string;
  conversation_id: string;
  invite_email: string | null;
  conversation_title: string;
  conversation_mode: string;
  inviter_name: string | null;
  inviter_avatar: string | null;
  member_count: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "This invite link doesn't exist.",
  already_used: "This invite has already been used.",
  expired: "This invite has expired.",
  auth_required: "Please sign in to accept the invite.",
};

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) {
        setError("Invalid invite link");
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      const { data, error: rpcErr } = await supabase.rpc("get_invite_details" as any, {
        p_token: token,
      });
      if (rpcErr || !data) {
        setError("Couldn't load this invite. Try again later.");
        setLoading(false);
        return;
      }
      const result = data as any;
      if (result.error) {
        setError(ERROR_MESSAGES[result.error] || "Invite unavailable");
        setLoading(false);
        return;
      }
      setDetails(result as InviteDetails);
      setLoading(false);
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!details || !token) return;
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }
    setAccepting(true);
    const { data, error: rpcErr } = await supabase.rpc("accept_conversation_invite" as any, {
      p_token: token,
    });
    if (rpcErr) {
      toast.error(rpcErr.message);
      setAccepting(false);
      return;
    }
    const result = data as any;
    if (!result?.success) {
      toast.error(ERROR_MESSAGES[result?.error] || "Failed to accept invite");
      setAccepting(false);
      return;
    }
    toast.success("Joined conversation!");
    navigate(`/chat?conv=${result.conversation_id}`);
  };

  const handleDecline = () => navigate("/");

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center">
            <X className="w-6 h-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Invite unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => navigate("/")} variant="outline" className="rounded-full">
            Go home
          </Button>
        </div>
      </div>
    );
  }

  const inviterName = details.inviter_name || "Someone";

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-border/60 rounded-2xl p-8 shadow-sm space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative">
            {details.inviter_avatar ? (
              <img loading="lazy" decoding="async"
                src={details.inviter_avatar}
                alt={inviterName}
                className="w-16 h-16 rounded-full object-cover border-2 border-background shadow-sm"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-foreground/5 flex items-center justify-center text-xl font-semibold text-foreground">
                {inviterName[0]?.toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-foreground flex items-center justify-center border-2 border-card">
              <MessageSquare className="w-3.5 h-3.5 text-background" />
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">{inviterName} invited you</h1>
            <p className="text-sm text-muted-foreground">to join the conversation</p>
          </div>

          <div className="w-full bg-muted/40 rounded-xl p-4 space-y-2">
            <p className="font-medium text-foreground line-clamp-2">{details.conversation_title}</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>
                {details.member_count} {details.member_count === 1 ? "member" : "members"}
              </span>
            </div>
          </div>
        </div>

        {!user && (
          <p className="text-xs text-center text-muted-foreground">
            You'll need to sign in to join.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleDecline}
            variant="outline"
            className="flex-1 rounded-full"
            disabled={accepting}
          >
            Decline
          </Button>
          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="flex-1 rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {accepting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : user ? (
              <>
                <Check className="w-4 h-4 mr-1.5" /> Accept
              </>
            ) : (
              "Sign in to join"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
