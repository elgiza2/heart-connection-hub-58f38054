import { useEffect, type ReactNode } from "react";
import {
  getUserLang,
  initUserLang,
  setUserLang,
  isSupportedLang,
  useUserLang,
} from "@/lib/authI18n";
import { startEgyptianDom, stopEgyptianDom } from "@/lib/i18n/egyptianDom";

interface TranslationWrapperProps {
  children: ReactNode;
}

/**
 * Keeps <html lang/dir> in sync with the selected language and, when the user
 * is on المصري, applies the bundled Egyptian dictionary to the rendered UI.
 *
 * The app ships exactly two languages (English + Egyptian Arabic) and the
 * whole dictionary lives inside the JS bundle, so there is no dictionary
 * download and no network round-trip — only in-memory hash lookups.
 */
const TranslationWrapper = ({ children }: TranslationWrapperProps) => {
  const lang = useUserLang();

  useEffect(() => {
    // A `/ar-eg` or `/en` route prefix wins over the stored preference.
    const routeLang = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (routeLang && isSupportedLang(routeLang) && routeLang !== getUserLang()) {
      void setUserLang(routeLang, { syncRemote: false });
    } else {
      void initUserLang();
    }
  }, []);

  useEffect(() => {
    if (lang === "ar-eg") {
      startEgyptianDom();
      return () => stopEgyptianDom();
    }
    stopEgyptianDom();
    return undefined;
  }, [lang]);

  return <>{children}</>;
};

export default TranslationWrapper;
