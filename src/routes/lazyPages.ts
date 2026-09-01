import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";

/* ── Shell / chrome ───────────────────────────────────────────── */
export const CommandPalette = lazy(() => import("@/components/CommandPalette"));
export const ShortcutsHelp = lazy(() => import("@/components/ShortcutsHelp"));
export const SettingsShell = lazy(() =>
  import("@/components/settings/SettingsShell").then((m) => ({ default: m.SettingsShell })),
);
export const OfflineBanner = lazy(() => import("@/components/common/OfflineBanner"));
export const CookieConsent = lazy(() => import("@/components/common/CookieConsent"));
export const UnlimitedPromoBanner = lazy(() => import("@/components/promo/UnlimitedPromoBanner"));
export const Analytics = lazy(() => import("@vercel/analytics/react").then((m) => ({ default: m.Analytics })));
export const SpeedInsights = lazy(() => import("@vercel/speed-insights/react").then((m) => ({ default: m.SpeedInsights })));

/* ── Chat ─────────────────────────────────────────────────────── */
export const ChatPage = lazy(() => import("@/pages/chat/ChatPage"));
export const SharedChatPage = lazy(() => import("@/pages/chat/SharedChatPage"));
export const ResearchPreviewPage = lazy(() => import("@/pages/chat/ResearchPreviewPage"));

/* ── Auth (single animated hub) ───────────────────────────────── */
export const AuthPage = lazy(() => import("@/pages/auth/AuthPage"));
export const AppleCallbackPage = lazy(() => import("@/pages/auth/AppleCallbackPage"));
export const OAuthCallbackPage = lazy(() => import("@/pages/auth/OAuthCallbackPage"));
export const OAuthAuthorizePage = lazy(() => import("@/pages/auth/OAuthAuthorizePage"));
export const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
export const ChangeEmailPage = lazy(() => import("@/pages/auth/ChangeEmailPage"));
export const ChangePasswordPage = lazy(() => import("@/pages/auth/ChangePasswordPage"));
export const TwoFactorPage = lazy(() => import("@/pages/auth/TwoFactorPage"));
export const MfaChallengePage = lazy(() => import("@/pages/auth/MfaChallengePage"));
export const DeleteAccountPage = lazy(() => import("@/pages/auth/DeleteAccountPage"));
export const AcceptInvitePage = lazy(() => import("@/pages/auth/AcceptInvitePage"));
export const ReferralRedirectPage = lazy(() => import("@/pages/auth/ReferralRedirectPage"));

/* ── Billing (single animated hub) ────────────────────────────── */
export const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
export const BillingSuccessPage = lazy(() => import("@/pages/billing/BillingSuccessPage"));
export const ReferralsPage = lazy(() => import("@/pages/billing/ReferralsPage"));
export const ReferralsDashboardTab = lazy(() => import("@/pages/billing/referrals/DashboardTab"));
export const KPage = lazy(() => import("@/pages/KPage"));
export const ReferralsRewardsTab = lazy(() => import("@/pages/billing/referrals/RewardsTab"));
export const ReferralResourcesPage = lazy(() => import("@/pages/billing/ReferralResourcesPage"));

/* ── Integrations (single animated hub) ───────────────────────── */

/* ── Settings ─────────────────────────────────────────────────── */
export const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
export const CustomizationPage = lazy(() => import("@/pages/settings/CustomizationPage"));
export const ProfileEditPage = lazy(() => import("@/pages/settings/ProfileEditPage"));
export const SecuritySettingsPage = lazy(() => import("@/pages/settings/SecuritySettingsPage"));
export const SecurityPage = lazy(() => import("@/pages/settings/SecurityPage"));
export const LanguagePage = lazy(() => import("@/pages/settings/LanguagePage"));
export const MailPage = lazy(() => import("@/pages/settings/MailPage"));
export const PasswordsPage = lazy(() => import("@/pages/settings/PasswordsPage"));
export const NotificationsPage = lazy(() => import("@/pages/settings/NotificationsPage"));
export const UsagePage = lazy(() => import("@/pages/usage/UsagePage"));
export const NotificationsInboxPage = lazy(() => import("@/pages/notifications/NotificationsInboxPage"));
export const McpSettingsPage = lazy(() => import("@/pages/settings/McpSettingsPage"));
export const McpCallbackPage = lazy(() => import("@/pages/settings/McpCallbackPage"));
export const AIPersonalizationPage = lazy(() => import("@/pages/settings/AIPersonalizationPage"));
export const SettingsSupportPage = lazy(() => import("@/pages/settings/SettingsSupportPage"));
export const SettingsHelpPage = lazy(() => import("@/pages/settings/SettingsHelpPage"));
export const SettingsContactPage = lazy(() => import("@/pages/settings/SettingsContactPage"));
export const DataControlsPage = lazy(() => import("@/pages/settings/DataControlsPage"));
export const DataCategoryPage = lazy(() => import("@/pages/settings/DataCategoryPage"));
export const SettingsPrivacyPage = lazy(() => import("@/pages/settings/SettingsPrivacyPage"));
export const CapabilitiesPage = lazy(() => import("@/pages/settings/CapabilitiesPage"));
export const CloudBrowserPage = lazy(() => import("@/pages/settings/CloudBrowserPage"));
export const SystemStatusPage = lazy(() => import("@/pages/settings/SystemStatusPage"));
export const SkillsSettingsPage = lazy(() => import("@/pages/settings/SkillsSettingsPage"));
export const SkillsNewPage = lazy(() => import("@/pages/settings/SkillsNewPage"));
export const SkillsLibraryPage = lazy(() => import("@/pages/settings/SkillsLibraryPage"));

/* ── Marketing / legal ────────────────────────────────────────── */
export const PricingPage = lazy(() => import("@/pages/marketing/PricingPage"));
export const LegalPage = lazy(() => import("@/pages/legal/LegalPage"));
export const RestorePurchasePage = lazy(() => import("@/pages/legal/RestorePurchasePage"));
export const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));
export const OnboardingPage = lazy(() => import("@/pages/onboarding/WelcomeShowcasePage"));
export const SplashTestPage = lazy(() => import("@/pages/test/SplashTestPage"));

/* ── Standalone utilities ─────────────────────────────────────── */
export const SlidesPreviewPage = lazy(() => import("@/pages/SlidesPreviewPage"));
export const SlidesFilePreviewPage = lazy(() => import("@/pages/SlidesFilePreviewPage"));
export const DocumentPreviewPage = lazy(() => import("@/pages/DocumentPreviewPage"));
export const KnowledgePage = lazy(() => import("@/pages/settings/KnowledgePage"));

/* ── Hidden admin ─────────────────────────────────────────────── */
export const ManusKeysPage = lazy(() => import("@/pages/admin/ManusKeysPage"));
