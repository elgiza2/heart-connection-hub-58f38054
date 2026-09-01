/** @doc iOS Settings-style icon tiles for settings menu. */
import { type SVGProps } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IOS26_ICONS } from "@/assets/ios26-icons";

type IconProps = SVGProps<SVGSVGElement>;

const tile = (src: string) => ({ className, ...props }: IconProps) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
    <image href={src} width="32" height="32" preserveAspectRatio="xMidYMid meet" />
  </svg>
);

const wrap =
  (Icon: React.ComponentType<any>) =>
  (p: IconProps) =>
    <Icon strokeWidth={2} {...(p as any)} />;

export const AccountIcon = tile(IOS26_ICONS.account);
export const WorkspacesIcon = tile(IOS26_ICONS.workspaces);
export const BillingIcon = tile(IOS26_ICONS.billing);
export const AiPersonalizationIcon = tile(IOS26_ICONS.ai);
export const MemoryIcon = tile(IOS26_ICONS.memory);
export const SkillsIcon = tile(IOS26_ICONS.skills);
export const AppearanceIcon = tile(IOS26_ICONS.appearance);
export const ThemeIcon = AppearanceIcon;
export const NotificationsIcon = tile(IOS26_ICONS.notifications);
export const IntegrationsIcon = tile(IOS26_ICONS.integrations);
export const SupportIcon = tile(IOS26_ICONS.support);
export const HumanSupportIcon = SupportIcon;
export const AISupportIcon = tile(IOS26_ICONS.ai);
export const FAQIcon = tile(IOS26_ICONS.faq);
export const PrivacyIcon = tile(IOS26_ICONS.privacy);
export const StatusIcon = tile(IOS26_ICONS.status);
export const LogoutIcon = tile(IOS26_ICONS.logout);
export const SignOutIcon = LogoutIcon;
export const HelpIcon = SupportIcon;
export const LanguageIcon = tile(IOS26_ICONS.language);
export const GiftIcon = tile(IOS26_ICONS.gift);
export const SwitchIcon = tile(IOS26_ICONS.switch);
export const ChevronIcon = wrap(ChevronRight);
export const BackIcon = wrap(ChevronLeft);
export const SparkleIcon = tile(IOS26_ICONS.sparkle);
export const ApiIcon = tile(IOS26_ICONS.api);
