/**
 * قائمة Tools (tool names) التي تتطلب موافقة بشرية قبل عرض نتيجتها.
 * أي tool اسمه يطابق (أو ينتهي بـ) واحد من هذه المدخلات يُعتبر حساساً.
 *
 * التنفيذ الفعلي للأداة يحدث في السيرفر (لا نستطيع منعه من الواجهة)،
 * لذا هذا الـ gating يعمل على مستوى العرض/الإقرار في الـ UI: نخفي
 * نتيجة الأداة حتى موافقة المستخدم للمرة الأولى، ثم نحفظ الموافقة
 * تلقائياً لنفس الأداة عبر localStorage (per-user).
 */
export const SENSITIVE_TOOL_PATTERNS: string[] = [
  "delete",
  "remove",
  "purge",
  "email.send",
  "send_email",
  "payment",
  "charge",
  "web_write",
  "operator",
  "exec",
  "shell",
];

export function isSensitiveTool(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return SENSITIVE_TOOL_PATTERNS.some((p) => n === p || n.includes(p));
}
