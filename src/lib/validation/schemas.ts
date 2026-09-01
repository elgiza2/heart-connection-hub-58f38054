import { z } from "zod";

/**
 * Centralized client-side input schemas.
 * Server-side validation still lives in edge functions / RLS — this layer
 * catches obvious mistakes (empty, too long, wrong format, oversized files)
 * before they ever hit the network and gives users immediate feedback.
 */

// Strips control chars and trims whitespace.
const cleanString = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, "").trim();

export const emailSchema = z
  .string()
  .transform(cleanString)
  .pipe(
    z
      .string()
      .min(1, "Email is required")
      .max(254, "Email is too long")
      .email("Enter a valid email address"),
  );

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
    message: "Password must contain at least one letter and one number",
  });

// Used when signing in — we don't want to gate users on legacy weak passwords.
export const passwordLoginSchema = z
  .string()
  .min(1, "Password is required")
  .max(128, "Password is too long");

export const displayNameSchema = z
  .string()
  .transform(cleanString)
  .pipe(
    z
      .string()
      .min(1, "Name is required")
      .max(50, "Name must be 50 characters or less")
      .refine((v) => !/<[^>]+>/.test(v), {
        message: "Name cannot contain HTML",
      }),
  );

export const MAX_CHAT_MESSAGE_CHARS = 8000;

export const chatMessageSchema = z
  .string()
  .max(
    MAX_CHAT_MESSAGE_CHARS,
    `Message is too long (max ${MAX_CHAT_MESSAGE_CHARS.toLocaleString()} chars)`,
  )
  .refine((v) => v.trim().length > 0, { message: "Message cannot be empty" });

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_ATTACHMENT_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
  "application/json",
  "text/",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.",
  "application/vnd.ms-",
];

export const isAttachmentMimeAllowed = (mime: string) =>
  ALLOWED_ATTACHMENT_MIME_PREFIXES.some((p) => mime.startsWith(p));

export const validateAttachment = (file: File): { ok: true } | { ok: false; reason: string } => {
  if (file.size === 0) return { ok: false, reason: "File is empty" };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `File is too large (max ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB)`,
    };
  }
  if (file.type && !isAttachmentMimeAllowed(file.type)) {
    return { ok: false, reason: `Unsupported file type: ${file.type}` };
  }
  return { ok: true };
};

export const referralCodeSchema = z
  .string()
  .transform(cleanString)
  .pipe(
    z
      .string()
      .min(3, "Code is too short")
      .max(32, "Code is too long")
      .regex(/^[A-Za-z0-9_-]+$/, "Code can only contain letters, numbers, _ and -"),
  );

export const otpSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{4,8}$/, "Enter the numeric code from your email"));

/** Helper that returns a friendly first error string from a zod result. */
export const firstError = (result: z.SafeParseReturnType<unknown, unknown>): string | null => {
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Invalid input";
};
