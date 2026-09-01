import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      verifyOtp: authMocks.verifyOtp,
      setSession: authMocks.setSession,
      getSession: authMocks.getSession,
    },
  },
}));

function installTelegram(initData = "query_id=q&user=%7B%22id%22%3A123%7D&auth_date=1&hash=h") {
  (window as unknown as { Telegram?: unknown }).Telegram = {
    WebApp: {
      initData,
      initDataUnsafe: { user: { id: 123 } },
      platform: "android",
      ready: vi.fn(),
      expand: vi.fn(),
      openTelegramLink: vi.fn(),
    },
  };
}

describe("telegramAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
    authMocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    authMocks.setSession.mockResolvedValue({ data: {}, error: null });
  });

  it("exchanges Telegram initData for a Supabase session with the current token-hash flow", async () => {
    installTelegram();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ email: "tg_123@megsy.telegram.local", token_hash: "token-hash" }),
      }),
    );
    authMocks.verifyOtp.mockResolvedValue({
      data: { session: { access_token: "access", refresh_token: "refresh" } },
      error: null,
    });

    const { signInWithTelegram } = await import("@/lib/telegramAuth");
    const result = await signInWithTelegram();

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/functions/v1/telegram-tasks-bot/harmony/auth"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("initData"),
      }),
    );
    expect(authMocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "token-hash",
      type: "email",
    });
    expect(authMocks.setSession).toHaveBeenCalledWith({
      access_token: "access",
      refresh_token: "refresh",
    });
  });

  it("does not call the backend when Telegram did not provide initData", async () => {
    installTelegram("");
    vi.stubGlobal("fetch", vi.fn());

    const { signInWithTelegram } = await import("@/lib/telegramAuth");
    const result = await signInWithTelegram();

    expect(result).toEqual({ ok: false, error: "no_init_data" });
    expect(fetch).not.toHaveBeenCalled();
    expect(authMocks.verifyOtp).not.toHaveBeenCalled();
  });
});