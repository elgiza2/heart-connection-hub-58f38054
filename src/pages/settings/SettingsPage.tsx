/** @doc Responsive settings home. */
import { useIsMobile } from "@/hooks/use-mobile";
import DesktopSettingsLayout from "@/components/settings/DesktopSettingsLayout";
import DesktopSettingsHome from "@/components/settings/DesktopSettingsHome";
import ManusSettingsMobile from "@/components/settings/ManusSettingsMobile";

const SettingsPage = () => {
  const isMobile = useIsMobile();
  if (!isMobile) {
    return (
      <DesktopSettingsLayout>
        <DesktopSettingsHome />
      </DesktopSettingsLayout>
    );
  }
  return <ManusSettingsMobile />;
};

export default SettingsPage;
