import { Route, Navigate } from "react-router-dom";
import { LegacyToolsRedirect, LegacyAiRedirect, ProtectedRoute, RetiredRedirect } from "./routeHelpers";
import { AnimatedShell } from "./AnimatedShell";
import {
  // chat
  ChatPage,
  SharedChatPage,
  ResearchPreviewPage,
  SlidesPreviewPage,
  ManusKeysPage,
  SlidesFilePreviewPage,
  DocumentPreviewPage,
  // auth hub
  AuthPage,
  OAuthCallbackPage,
  AppleCallbackPage,
  OAuthAuthorizePage,
  ResetPasswordPage,
  ChangeEmailPage,
  ChangePasswordPage,
  TwoFactorPage,
  MfaChallengePage,
  DeleteAccountPage,
  AcceptInvitePage,
  ReferralRedirectPage,
  // billing hub
  BillingPage,
  BillingSuccessPage,
  ReferralsPage,
  ReferralsDashboardTab,
  ReferralsRewardsTab,
  KPage,
  ReferralResourcesPage,
  // integrations hub
  // settings
  SettingsPage,
  CustomizationPage,
  ProfileEditPage,
  SecuritySettingsPage,
  SecurityPage,
  LanguagePage,
  MailPage,
  PasswordsPage,
  NotificationsPage,
  NotificationsInboxPage,
  UsagePage,
  McpSettingsPage,
  McpCallbackPage,
  AIPersonalizationPage,
  KnowledgePage,
  SettingsSupportPage,
  SettingsHelpPage,
  SettingsContactPage,
  SettingsPrivacyPage,
  DataControlsPage,
  DataCategoryPage,
  CapabilitiesPage,
  CloudBrowserPage,
  DesktopBridgePage,
  SystemStatusPage,
  SkillsSettingsPage,
  SkillsNewPage,
  SkillsLibraryPage,
  // marketing
  PricingPage,
  LegalPage,
  RestorePurchasePage,
  NotFoundPage,
  OnboardingPage,
  SplashTestPage,
} from "./lazyPages";

const toChat = <RetiredRedirect to="/chat" />;
const toPricing = <RetiredRedirect to="/pricing" />;

/** All application routes. Rendered inside <DeferredRoutes> in App.tsx. */
export const AppRoutes = ({ currentUserId }: { currentUserId: string | null }) => (
  <>
    {/* ── Entry ──────────────────────────────────────────────── */}
    <Route path="/" element={<ChatPage key={currentUserId} />} />
    <Route path="/chat" element={<ChatPage key={currentUserId} />} />
    <Route path="/index" element={<ChatPage key={currentUserId} />} />
    <Route path="/share/:shareId" element={<SharedChatPage />} />

    {/* ── Auth hub — one page, animated inner views ──────────── */}
    <Route element={<AnimatedShell />}>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/signin" element={<AuthPage />} />
      <Route path="/signup" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage />} />
      <Route path="/auth/apple-callback" element={<AppleCallbackPage />} />
      <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
      <Route path="/auth/mfa" element={<MfaChallengePage />} />
      <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/ref/:code" element={<ReferralRedirectPage />} />
      <Route path="/r/:code" element={<ReferralRedirectPage />} />
      <Route
        path="/settings/change-email"
        element={<ProtectedRoute><ChangeEmailPage /></ProtectedRoute>}
      />
      <Route
        path="/settings/change-password"
        element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>}
      />
      <Route
        path="/settings/two-factor"
        element={<ProtectedRoute><TwoFactorPage /></ProtectedRoute>}
      />
      <Route
        path="/settings/delete-account"
        element={<ProtectedRoute><DeleteAccountPage /></ProtectedRoute>}
      />
    </Route>

    {/* ── Billing hub — one page, animated inner views ───────── */}
    <Route element={<AnimatedShell />}>
      <Route
        path="/settings/billing"
        element={<ProtectedRoute><BillingPage /></ProtectedRoute>}
      />
      <Route path="/billing/success" element={<BillingSuccessPage />} />
      <Route path="/suc" element={<BillingSuccessPage />} />
      <Route
        path="/settings/referrals"
        element={<ProtectedRoute><ReferralsPage /></ProtectedRoute>}
      >
        <Route index element={<ReferralsDashboardTab />} />
        <Route path="rewards" element={<ReferralsRewardsTab />} />
      </Route>
      <Route
        path="/settings/referrals/resources"
        element={<ProtectedRoute><ReferralResourcesPage /></ProtectedRoute>}
      />
    </Route>

    {/* Integrations are managed from the chat composer sheet now. */}

    {/* ── Settings ──────────────────────────────────────────── */}
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/settings/customization" element={<ProtectedRoute><CustomizationPage /></ProtectedRoute>} />
    <Route path="/settings/ai-personalization" element={<ProtectedRoute><AIPersonalizationPage /></ProtectedRoute>} />
    <Route path="/settings/profile" element={<Navigate to="/settings/profile/edit" replace />} />
    <Route path="/settings/profile/edit" element={<ProtectedRoute><ProfileEditPage /></ProtectedRoute>} />
    <Route path="/settings/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
    <Route path="/usage" element={<ProtectedRoute><UsagePage /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><NotificationsInboxPage /></ProtectedRoute>} />
    <Route path="/settings/security" element={<ProtectedRoute><SecuritySettingsPage /></ProtectedRoute>} />
    <Route path="/settings/language" element={<ProtectedRoute><LanguagePage /></ProtectedRoute>} />
    <Route path="/settings/mail" element={<ProtectedRoute><MailPage /></ProtectedRoute>} />
    <Route path="/settings/passwords" element={<ProtectedRoute><PasswordsPage /></ProtectedRoute>} />
    <Route path="/settings/mcp" element={<ProtectedRoute><McpSettingsPage /></ProtectedRoute>} />
    <Route path="/mcp-callback" element={<ProtectedRoute><McpCallbackPage /></ProtectedRoute>} />
    <Route path="/settings/memory" element={<ProtectedRoute><KnowledgePage /></ProtectedRoute>} />
    <Route path="/settings/knowledge" element={<Navigate to="/settings/memory" replace />} />

    <Route path="/settings/skills" element={<ProtectedRoute><SkillsSettingsPage /></ProtectedRoute>} />
    <Route path="/settings/skills/new" element={<ProtectedRoute><SkillsNewPage /></ProtectedRoute>} />
    <Route path="/settings/skills/library" element={<ProtectedRoute><SkillsLibraryPage /></ProtectedRoute>} />
    <Route path="/skills" element={<ProtectedRoute><SkillsSettingsPage /></ProtectedRoute>} />
    <Route path="/settings/support" element={<ProtectedRoute><SettingsSupportPage /></ProtectedRoute>} />
    <Route path="/settings/support/help" element={<ProtectedRoute><SettingsHelpPage /></ProtectedRoute>} />
    <Route path="/settings/support/contact" element={<ProtectedRoute><SettingsContactPage /></ProtectedRoute>} />
    <Route path="/settings/data" element={<ProtectedRoute><DataControlsPage /></ProtectedRoute>} />
    <Route path="/settings/data/:category" element={<ProtectedRoute><DataCategoryPage /></ProtectedRoute>} />
    <Route path="/settings/privacy" element={<ProtectedRoute><SettingsPrivacyPage /></ProtectedRoute>} />
    <Route path="/settings/capabilities" element={<ProtectedRoute><CapabilitiesPage /></ProtectedRoute>} />
    <Route path="/settings/cloud-browser" element={<ProtectedRoute><CloudBrowserPage /></ProtectedRoute>} />
    <Route path="/test" element={<ProtectedRoute><DesktopBridgePage /></ProtectedRoute>} />
    <Route path="/settings/system-status" element={<ProtectedRoute><SystemStatusPage /></ProtectedRoute>} />

    {/* ── Research previews ─────────────────────────────────── */}
    <Route path="/research/preview/new" element={<ProtectedRoute><ResearchPreviewPage /></ProtectedRoute>} />
    <Route path="/research/preview/:id" element={<ProtectedRoute><ResearchPreviewPage /></ProtectedRoute>} />
    <Route path="/research/share/:token" element={<ResearchPreviewPage />} />

    {/* ── Documents & slides previews ───────────────────────── */}
    <Route path="/slides/preview/:id" element={<SlidesPreviewPage />} />
    <Route path="/slides/file-preview/:id" element={<SlidesFilePreviewPage />} />
    <Route path="/document/:artifactId" element={<DocumentPreviewPage />} />

    {/* ── Hidden admin (password gated) ─────────────────────── */}
    <Route path="/m" element={<ManusKeysPage />} />


    {/* ── Retired routes ────────────────────────────────────── */}


    {/* ── Pricing (only surviving marketing page) ───────────── */}
    <Route path="/pricing" element={<PricingPage />} />

    {/* ── Security (settings-owned) ─────────────────────────── */}
    <Route path="/security" element={<SecurityPage />} />

    {/* ── Retired marketing / legal pages ───────────────────── */}
    <Route path="/se" element={toChat} />
    <Route path="/status" element={toChat} />
    <Route path="/ai-chat" element={toChat} />
    <Route path="/ai-chat/*" element={toChat} />
    <Route path="/features-guide" element={toChat} />
    <Route path="/megsy-model" element={toChat} />
    <Route path="/megay" element={toChat} />
    <Route path="/vs/:slug" element={toChat} />
    <Route path="/about" element={<LegalPage slug="about" />} />
    <Route path="/contact" element={<LegalPage slug="contact" />} />
    <Route path="/support" element={toChat} />
    <Route path="/enterprise" element={toPricing} />
    <Route path="/trust" element={toChat} />
    <Route path="/terms" element={<LegalPage slug="terms" />} />
    <Route path="/privacy" element={<LegalPage slug="privacy" />} />
    <Route path="/cookies" element={toChat} />
    <Route path="/refund" element={<LegalPage slug="refund" />} />
    <Route path="/restore" element={<RestorePurchasePage />} />
    <Route path="/policies/*" element={toChat} />
    <Route path="/legal/*" element={toChat} />


    {/* ── Legacy aliases — everything retired now redirects ──── */}
    <Route path="/landing" element={toChat} />
    <Route path="/showcase" element={toChat} />
    <Route path="/welcome" element={<OnboardingPage />} />
    <Route path="/test" element={<SplashTestPage />} />
    <Route path="/code" element={toChat} />
    <Route path="/build" element={toChat} />
    <Route path="/anything" element={toChat} />
    <Route path="/apps" element={toChat} />
    <Route path="/library" element={toChat} />
    <Route path="/learn" element={toChat} />
    <Route path="/agent" element={toChat} />
    <Route path="/settings/workspaces" element={<Navigate to="/settings" replace />} />
    <Route path="/settings/workspaces/*" element={<Navigate to="/settings" replace />} />
    <Route path="/workspaces" element={<Navigate to="/settings" replace />} />
    <Route path="/workspaces/*" element={<Navigate to="/settings" replace />} />
    <Route path="/workspace" element={<Navigate to="/settings" replace />} />
    <Route path="/x" element={toChat} />
    <Route path="/promo/:code" element={toPricing} />
    <Route path="/eg" element={toChat} />
    <Route path="/eg/*" element={toChat} />
    <Route path="/s/:slug" element={toChat} />
    <Route path="/l/*" element={toPricing} />
    <Route path="/ai/*" element={<LegacyAiRedirect />} />
    <Route path="/tools/*" element={<LegacyToolsRedirect />} />
    <Route path="/services" element={toPricing} />
    <Route path="/media" element={toPricing} />
    <Route path="/gallery" element={toPricing} />
    <Route path="/preview/:type" element={toPricing} />
    <Route path="/template/:id" element={toPricing} />
    <Route path="/images/*" element={toPricing} />
    <Route path="/videos/*" element={toPricing} />
    <Route path="/cinema" element={toPricing} />
    <Route path="/cinema/*" element={toPricing} />
    <Route path="/for" element={toPricing} />
    <Route path="/for/*" element={toPricing} />
    <Route path="/compare" element={toPricing} />
    <Route path="/compare/*" element={toPricing} />
    <Route path="/templates" element={toPricing} />
    <Route path="/templates/*" element={toPricing} />
    <Route path="/models" element={toPricing} />
    <Route path="/models/*" element={toPricing} />
    <Route path="/solutions" element={toPricing} />
    <Route path="/solutions/*" element={toPricing} />
    <Route path="/tools" element={toPricing} />
    <Route path="/comparison" element={toPricing} />
    <Route path="/megsy" element={<Navigate to="/megsy-model" replace />} />
    <Route path="/features" element={<Navigate to="/features-guide" replace />} />
    <Route path="/compliance" element={<Navigate to="/legal/compliance" replace />} />
    <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />
    <Route path="/k" element={<KPage />} />
    <Route path="/billing/referrals" element={<Navigate to="/settings/referrals" replace />} />
    <Route path="/referrals" element={<Navigate to="/settings/referrals" replace />} />
    {/* Sidebar destinations shared as short links must resolve, not 404. */}
    <Route path="/earn" element={<Navigate to="/settings/referrals" replace />} />
    <Route path="/mail" element={<Navigate to="/settings/mail" replace />} />
    <Route path="/settings/general" element={<Navigate to="/settings" replace />} />

    <Route path="/integrations" element={<Navigate to="/chat?integrations=1" replace />} />
    <Route path="/integration" element={<Navigate to="/chat?integrations=1" replace />} />
    <Route path="/settings/help" element={<Navigate to="/settings/support/help" replace />} />

    {/* ── Anything else is a real 404, not a soft-404 chat page ── */}
    <Route path="*" element={<NotFoundPage />} />
  </>
);
