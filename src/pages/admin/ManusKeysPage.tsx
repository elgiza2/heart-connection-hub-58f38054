/** @doc Hidden password-protected page (/m) to manage the Manus API key pool. */
import { useCallback, useEffect, useState } from "react";
import { Loader2, KeyRound, Plus, Trash2, Power, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface ManusKeyRow {
  id: string;
  label: string | null;
  status: string;
  failure_count: number;
  success_count: number;
  last_error: string | null;
  last_used_at: string | null;
  cooldown_until: string | null;
  notes: string | null;
  api_key: string;
  created_at: string;
}

const STORAGE_KEY = "m_admin_pw";

type Provider = "manus" | "freestyle";

const PROVIDERS: Record<Provider, { endpoint: string; label: string; hint: string }> = {
  manus: {
    endpoint: "/api/manus-admin",
    label: "Manus",
    hint: "مجمّع المفاتيح — لو مفتاح فشل أو خلص رصيده يتحوّل تلقائيًا للتالي.",
  },
  freestyle: {
    endpoint: "/api/dev-admin",
    label: "Freestyle",
    hint: "مفاتيح بيئة التشغيل والنشر لوكيل البرمجة (VMs / Git / Deploy).",
  },
};

let activeEndpoint = PROVIDERS.manus.endpoint;

async function callAdmin<T = Record<string, unknown>>(
  password: string,
  body: Record<string, unknown>,
  endpoint: string = activeEndpoint,
): Promise<T> {
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, password }),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) throw new Error((data.error as string) || `HTTP ${resp.status}`);
  return data as T;
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600",
  disabled: "bg-muted text-muted-foreground",
  exhausted: "bg-amber-500/15 text-amber-600",
};

export default function ManusKeysPage() {
  const [password, setPassword] = useState<string>(() => sessionStorage.getItem(STORAGE_KEY) ?? "");
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [keys, setKeys] = useState<ManusKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<Provider>("manus");
  const endpoint = PROVIDERS[provider].endpoint;
  activeEndpoint = endpoint;

  const refresh = useCallback(
    async (pw: string, ep: string = endpoint) => {
      setLoading(true);
      try {
        const data = await callAdmin<{ keys: ManusKeyRow[] }>(pw, { action: "list" }, ep);
        setKeys(data.keys ?? []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "تعذّر تحميل المفاتيح");
      } finally {
        setLoading(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    if (!password) return;
    let cancelled = false;
    void (async () => {
      try {
        await callAdmin(password, { action: "login" });
        if (cancelled) return;
        setUnlocked(true);
        void refresh(password);
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
        setPassword("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [password, refresh]);

  const onUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwInput.trim()) return;
    setChecking(true);
    try {
      await callAdmin(pwInput, { action: "login" });
      sessionStorage.setItem(STORAGE_KEY, pwInput);
      setPassword(pwInput);
      setUnlocked(true);
      void refresh(pwInput);
    } catch {
      toast.error("كلمة المرور غير صحيحة");
    } finally {
      setChecking(false);
    }
  };

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setAdding(true);
    try {
      await callAdmin(password, { action: "add", api_key: newKey.trim(), label: newLabel.trim() });
      setNewKey("");
      setNewLabel("");
      toast.success("تمت إضافة المفتاح");
      void refresh(password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setAdding(false);
    }
  };

  const onToggle = async (row: ManusKeyRow) => {
    const status = row.status === "active" ? "disabled" : "active";
    try {
      await callAdmin(password, { action: "update_status", id: row.id, status });
      void refresh(password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحديث");
    }
  };

  const onDelete = async (row: ManusKeyRow) => {
    try {
      await callAdmin(password, { action: "delete", id: row.id });
      toast.success("تم حذف المفتاح");
      void refresh(password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    }
  };

  if (!unlocked) {
    return (
      <main dir="rtl" className="min-h-dvh grid place-items-center bg-background px-5">
        <form
          onSubmit={onUnlock}
          className="w-full max-w-sm rounded-[24px] border border-border bg-card p-6 shadow-sm"
        >
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-center text-lg font-semibold text-foreground">منطقة محمية</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            أدخل كلمة المرور لإدارة مفاتيح Manus
          </p>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            autoComplete="current-password"
            placeholder="كلمة المرور"
            className="mt-5 h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={checking}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            دخول
          </button>
        </form>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-dvh bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              مفاتيح {PROVIDERS[provider].label}
            </h1>
            <p className="text-sm text-muted-foreground">{PROVIDERS[provider].hint}</p>
          </div>
          <button
            onClick={() => void refresh(password)}
            className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground"
            aria-label="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </header>

        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-1">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                if (p === provider) return;
                setProvider(p);
                setKeys([]);
                void refresh(password, PROVIDERS[p].endpoint);
              }}
              className={`h-9 flex-1 rounded-xl text-sm font-medium transition-colors ${
                p === provider
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PROVIDERS[p].label}
            </button>
          ))}
        </div>

        <form onSubmit={onAdd} className="rounded-[22px] border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <KeyRound className="h-4 w-4" /> إضافة مفتاح جديد
          </div>
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Manus API Key"
            className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="اسم الحساب (اختياري)"
            className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={adding || !newKey.trim()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إضافة المفتاح
          </button>
        </form>

        <section className="rounded-[22px] border border-border bg-card divide-y divide-border">
          {keys.length === 0 && !loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">لا توجد مفاتيح بعد</p>
          ) : null}
          {keys.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {row.label || "بدون اسم"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${statusStyles[row.status] ?? statusStyles.disabled}`}
                  >
                    {row.status}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
                  {row.api_key}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  نجاح {row.success_count} · فشل {row.failure_count}
                  {row.last_error ? ` · ${row.last_error.slice(0, 60)}` : ""}
                </p>
              </div>
              <button
                onClick={() => void onToggle(row)}
                className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground"
                aria-label="تفعيل/إيقاف"
              >
                <Power className="h-4 w-4" />
              </button>
              <button
                onClick={() => void onDelete(row)}
                className="grid h-9 w-9 place-items-center rounded-full border border-border text-destructive"
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
