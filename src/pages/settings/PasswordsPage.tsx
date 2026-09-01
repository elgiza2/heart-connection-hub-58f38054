/** @doc Settings → Passwords: every login the agent created for the user, plus manual entries. */
import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SubShell } from "@/components/settings/SubShell";
import { Input } from "@/components/ui/input";
import {
  deleteCredential,
  generatePassword,
  listCredentials,
  saveCredential,
  type AgentCredential,
} from "@/lib/agentkernel/credentials";

export default function PasswordsPage() {
  const [rows, setRows] = useState<AgentCredential[]>([]);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ site: "", login_email: "", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listCredentials());
    } catch {
      toast.error("Couldn't load your passwords");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Copying isn't available");
    }
  };

  const add = async () => {
    if (!draft.site.trim() || !draft.login_email.trim() || !draft.password.trim()) {
      toast.error("Fill in the site, email and password");
      return;
    }
    try {
      await saveCredential(draft);
      setDraft({ site: "", login_email: "", password: "" });
      setAdding(false);
      await load();
    } catch {
      toast.error("Couldn't save");
    }
  };

  const remove = async (id: string) => {
    await deleteCredential(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <SubShell title="Passwords">
      <p className="px-1 text-[13px] leading-relaxed text-[color:var(--mn-faint)]">
        Every account the agent creates is registered with your Megsy email and a
        strong password, and it is saved here so you can come back to it anytime.
      </p>

      <section className="overflow-hidden rounded-[20px] bg-[var(--mn-card)]">
        {loading ? (
          <div className="px-5 py-[18px] text-[14px] text-[color:var(--mn-faint)]">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-[18px] text-[14px] text-[color:var(--mn-faint)]">
            No saved passwords yet.
          </div>
        ) : (
          rows.map((row, i) => (
            <div key={row.id}>
              {i > 0 && <div className="mx-5 h-px bg-[color:var(--mn-sep)]" />}
              <div className="flex flex-col gap-1 px-5 py-[16px]">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[15px] text-[color:var(--mn-fg)]">
                    {row.site}
                  </span>
                  <button
                    type="button"
                    aria-label="Show password"
                    onClick={() => setShown((s) => ({ ...s, [row.id]: !s[row.id] }))}
                    className="text-[color:var(--mn-faint)] transition-colors hover:text-[color:var(--mn-fg)]"
                  >
                    {shown[row.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Copy password"
                    onClick={() => void copy(row.password)}
                    className="text-[color:var(--mn-faint)] transition-colors hover:text-[color:var(--mn-fg)]"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={() => void remove(row.id)}
                    className="text-[color:var(--mn-faint)] transition-colors hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-[13px] text-[color:var(--mn-faint)]">{row.login_email}</span>
                <span className="font-mono text-[13px] text-[color:var(--mn-faint)]">
                  {shown[row.id] ? row.password : "••••••••••••"}
                </span>
              </div>
            </div>
          ))
        )}
      </section>

      {adding ? (
        <section className="flex flex-col gap-2 rounded-[20px] bg-[var(--mn-card)] p-4">
          <Input
            placeholder="Site (example.com)"
            value={draft.site}
            onChange={(e) => setDraft((d) => ({ ...d, site: e.target.value }))}
          />
          <Input
            placeholder="Email"
            value={draft.login_email}
            onChange={(e) => setDraft((d) => ({ ...d, login_email: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <Input
              placeholder="Password"
              value={draft.password}
              onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
            />
            <button
              type="button"
              aria-label="Generate password"
              onClick={() => setDraft((d) => ({ ...d, password: generatePassword() }))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[color:var(--mn-faint)] hover:text-[color:var(--mn-fg)]"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => void add()} className="text-[14px] text-primary">
              Save
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-[14px] text-[color:var(--mn-faint)]"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 self-start px-1 text-[14px] text-primary"
        >
          <Plus className="h-4 w-4" /> Add password
        </button>
      )}
    </SubShell>
  );
}
