/** @doc Desktop bridge settings — pair a Windows PC and control its permissions. */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Monitor, RefreshCw, Trash2 } from "lucide-react";
import { SubShell } from "@/components/settings/SubShell";
import { toast } from "sonner";
import {
  type BridgeCapability,
  type LocalCommand,
  type LocalDevice,
  type PermissionMode,
  createDevice,
  decideCommand,
  deleteDevice,
  isOnline,
  listCommands,
  listDevices,
  queueCommand,
  regeneratePairCode,
  updateDevice,
} from "@/lib/computer/localBridge";

const CAPS: Array<{ key: BridgeCapability; label: string; hint: string }> = [
  { key: "shell", label: "أوامر Shell", hint: "تشغيل أوامر PowerShell/CMD وقراءة النتيجة" },
  { key: "files", label: "الملفات", hint: "قراءة وكتابة الملفات داخل مجلد العمل" },
  { key: "screen", label: "الشاشة", hint: "أخذ لقطات شاشة" },
  { key: "input", label: "ماوس وكيبورد", hint: "تحريك الماوس والكتابة والاختصارات" },
  { key: "browser", label: "المتصفح", hint: "فتح صفحات وأتمتة التصفح على جهازك" },
];

const MODES: Array<{ key: PermissionMode; label: string; hint: string }> = [
  { key: "ask", label: "موافقة على كل أمر", hint: "كل أمر يستنى موافقتك من هذه الصفحة" },
  { key: "allowlist", label: "تلقائي مع قائمة سماح", hint: "القراءة واللقطات تلقائي + أوامر بادئتها مسموحة" },
  { key: "auto", label: "تحكم كامل", hint: "تنفيذ فوري لأي أمر — خطر عالي" },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={[
        "relative inline-flex h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-primary" : "bg-[color:var(--mn-press)]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-[26px] w-[26px] rounded-full bg-[color:var(--mn-fg)] transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        ].join(" ")}
        style={{ marginTop: 2 }}
      />
    </button>
  );
}

const card = "rounded-2xl border border-border/60 bg-card/60 p-4 space-y-3";

export default function DesktopBridgePage() {
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [commands, setCommands] = useState<LocalCommand[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [cmdText, setCmdText] = useState("");
  const [allowText, setAllowText] = useState("");

  const device = devices.find((d) => d.id === selected) ?? null;

  const refresh = useCallback(async () => {
    try {
      const rows = await listDevices();
      setDevices(rows);
      setSelected((prev) => prev ?? rows[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تحميل الأجهزة");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Light polling keeps the online badge and command results fresh without
    // holding a realtime channel open on a settings screen.
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const load = async () => {
      try {
        const rows = await listCommands(selected);
        if (alive) setCommands(rows);
      } catch {
        /* transient */
      }
    };
    void load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected]);

  const onCreate = async () => {
    setBusy(true);
    try {
      const created = await createDevice(newName);
      setNewName("");
      setSelected(created.id);
      await refresh();
      toast.success("اتعمل كود ربط — شغّل برنامج الجسر وادخل الكود");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل إنشاء الجهاز");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (next: Partial<LocalDevice>) => {
    if (!device) return;
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, ...next } : d)));
    try {
      await updateDevice(device.id, next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الحفظ");
      void refresh();
    }
  };

  const send = async () => {
    if (!device || !cmdText.trim()) return;
    setBusy(true);
    try {
      await queueCommand({
        deviceId: device.id,
        kind: "shell",
        payload: { command: cmdText.trim() },
        summary: cmdText.trim().slice(0, 120),
      });
      setCmdText("");
      toast.success(device.permission_mode === "ask" ? "الأمر في انتظار موافقتك" : "الأمر اتبعت للجهاز");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الإرسال");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubShell
      title="جهاز الكمبيوتر"
      subtitle="اربط الكمبيوتر بحسابك وخلي الوكيل يشتغل عليه بالصلاحيات اللي تختارها"
      backTo="/settings"
    >
      <div className="space-y-4 pb-24">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <section className={card}>
              <h2 className="text-sm font-semibold">إضافة جهاز</h2>
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="اسم الجهاز (مثال: لابتوب الشغل)"
                  className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={onCreate}
                  disabled={busy}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  كود ربط
                </button>
              </div>
              <p className="text-[12px] text-muted-foreground">
                نزّل برنامج الجسر (مجلد <code>bridge/</code> في المستودع)، شغّل <code>start-windows.cmd</code>،
                وادخل الكود مرة واحدة. البرنامج ما بياخدش باسورد حسابك.
              </p>
            </section>

            {devices.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {devices.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelected(d.id)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-[12.5px]",
                      d.id === selected ? "border-primary text-primary" : "border-border/60 text-muted-foreground",
                    ].join(" ")}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}

            {device && (
              <>
                <section className={card}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold">{device.name}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {isOnline(device) ? "متصل الآن" : "غير متصل"}
                          {device.hostname ? ` · ${device.hostname}` : ""}
                          {device.agent_version ? ` · v${device.agent_version}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="كود ربط جديد"
                        onClick={async () => {
                          await regeneratePairCode(device.id);
                          await refresh();
                        }}
                        className="rounded-lg border border-border/60 p-2 text-muted-foreground"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="حذف الجهاز"
                        onClick={async () => {
                          await deleteDevice(device.id);
                          setSelected(null);
                          await refresh();
                        }}
                        className="rounded-lg border border-border/60 p-2 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {device.pair_code && (
                    <div className="rounded-xl bg-[color:var(--mn-press)] px-3 py-2">
                      <p className="text-[12px] text-muted-foreground">كود الربط (صالح ١٥ دقيقة)</p>
                      <p className="font-mono text-lg tracking-[0.3em]">{device.pair_code}</p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[12px] text-muted-foreground">مجلد العمل على الجهاز</label>
                    <input
                      value={device.work_dir ?? ""}
                      onChange={(event) => patch({ work_dir: event.target.value })}
                      placeholder="C:\\Users\\me\\megsy"
                      className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </section>

                <section className={card}>
                  <h2 className="text-sm font-semibold">الصلاحيات</h2>
                  {CAPS.map((cap) => (
                    <div key={cap.key} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[13.5px]">{cap.label}</p>
                        <p className="text-[12px] text-muted-foreground">{cap.hint}</p>
                      </div>
                      <Toggle
                        label={cap.label}
                        checked={device.capabilities[cap.key] === true}
                        onChange={() =>
                          patch({
                            capabilities: {
                              ...device.capabilities,
                              [cap.key]: !device.capabilities[cap.key],
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </section>

                <section className={card}>
                  <h2 className="text-sm font-semibold">نمط الموافقة</h2>
                  {MODES.map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => patch({ permission_mode: mode.key })}
                      className={[
                        "w-full rounded-xl border px-3 py-2 text-right",
                        device.permission_mode === mode.key ? "border-primary" : "border-border/60",
                      ].join(" ")}
                    >
                      <p className="text-[13.5px]">{mode.label}</p>
                      <p className="text-[12px] text-muted-foreground">{mode.hint}</p>
                    </button>
                  ))}

                  {device.permission_mode === "allowlist" && (
                    <div className="space-y-2">
                      <p className="text-[12px] text-muted-foreground">
                        بادئات مسموحة تلقائياً (كل واحدة في سطر): {device.allowlist.length}
                      </p>
                      <textarea
                        value={allowText || device.allowlist.join("\n")}
                        onChange={(event) => setAllowText(event.target.value)}
                        onBlur={() =>
                          patch({
                            allowlist: allowText
                              .split("\n")
                              .map((line) => line.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={4}
                        placeholder={"git status\nnpm run build"}
                        className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 font-mono text-[12.5px]"
                      />
                    </div>
                  )}
                </section>

                <section className={card}>
                  <h2 className="text-sm font-semibold">تنفيذ أمر</h2>
                  <div className="flex gap-2">
                    <input
                      value={cmdText}
                      onChange={(event) => setCmdText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void send();
                      }}
                      placeholder="dir"
                      className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 font-mono text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={send}
                      disabled={busy || !cmdText.trim()}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      إرسال
                    </button>
                  </div>
                </section>

                <section className={card}>
                  <h2 className="text-sm font-semibold">السجل</h2>
                  {commands.length === 0 && <p className="text-[12.5px] text-muted-foreground">لا يوجد أوامر بعد.</p>}
                  {commands.map((command) => (
                    <div key={command.id} className="rounded-xl border border-border/50 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-[12.5px] break-all">
                          {command.summary || command.kind}
                        </p>
                        <span className="shrink-0 text-[11.5px] text-muted-foreground">{command.status}</span>
                      </div>
                      {command.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await decideCommand(command.id, true);
                              setCommands(await listCommands(device.id));
                            }}
                            className="rounded-lg bg-primary px-3 py-1 text-[12.5px] text-primary-foreground"
                          >
                            موافقة
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await decideCommand(command.id, false);
                              setCommands(await listCommands(device.id));
                            }}
                            className="rounded-lg border border-border/60 px-3 py-1 text-[12.5px]"
                          >
                            رفض
                          </button>
                        </div>
                      )}
                      {(command.result || command.error) && (
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[color:var(--mn-press)] p-2 text-[11.5px]">
                          {command.error ?? String((command.result as { stdout?: string })?.stdout ?? JSON.stringify(command.result))}
                        </pre>
                      )}
                    </div>
                  ))}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </SubShell>
  );
}
