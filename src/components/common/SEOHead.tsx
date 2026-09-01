import { Helmet } from "react-helmet-async";
import { LOCALES, type LocaleCode, getLocale } from "@/lib/landing/i18n/locales";
import { translateExactText, getUserLang, type AuthLang } from "@/lib/authI18n";

interface SEOHeadProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: string;
  noindex?: boolean;
  locale?: LocaleCode;
  /** When true, emits hreflang alternates for all landing locales. */
  emitLandingAlternates?: boolean;
}

const SITE_URL = "https://megsyai.com";
const DEFAULT_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fae3cd77-3f99-4a10-8225-ba5e64510390/id-preview-b1f21eef--70a3240c-12ec-46ff-99ea-54f772181a95.lovable.app-1772787005803.png";

const SEOHead = ({
  title,
  description,
  path,
  image,
  type = "website",
  noindex = false,
  locale,
  emitLandingAlternates = false,
}: SEOHeadProps) => {
  const meta = locale ? getLocale(locale) : undefined;

  const brandName = "Megsy AI";
  const twitterHandle = "@MegsyAI";

  const isHomePath = path === "/" || (meta && path === meta.path);
  const fullTitle = isHomePath ? title : `${title} | ${brandName}`;
  const canonical = `${SITE_URL}${path || "/"}`;
  const ogImage = image || DEFAULT_IMAGE;
  // If SEOHead has an explicit locale (localized landing routes), use it.
  // Otherwise defer to the visitor's chosen language (English or Egyptian
  // Arabic) so <html lang/dir> stays in sync with the in-app dictionary.
  const savedLang = getUserLang();
  const htmlLang = meta?.hreflang ?? (savedLang === "ar-eg" ? "ar-EG" : "en");
  const htmlDir = meta?.dir ?? (savedLang === "ar-eg" ? "rtl" : "ltr");
  const ogLocale = meta?.ogLocale ?? (savedLang === "ar-eg" ? "ar_EG" : "en_US");
  const effectiveLang = (meta?.code ?? savedLang) as AuthLang | undefined;

  const localizedTitle = effectiveLang ? translateExactText(title, effectiveLang) : title;
  const localizedDescription = effectiveLang ? translateExactText(description, effectiveLang) : description;
  const localizedFullTitle = isHomePath ? localizedTitle : `${localizedTitle} | ${brandName}`;

  return (
    <Helmet>
      <html lang={htmlLang} dir={htmlDir} />

      <title>{localizedFullTitle}</title>
      <meta name="description" content={localizedDescription} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}

      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={localizedFullTitle} />
      <meta property="og:description" content={localizedDescription} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content={brandName} />
      <meta property="og:locale" content={ogLocale} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={twitterHandle} />
      <meta name="twitter:title" content={localizedFullTitle} />
      <meta name="twitter:description" content={localizedDescription} />
      <meta name="twitter:image" content={ogImage} />

      {emitLandingAlternates && (
        <>
          {LOCALES.map((l) => (
            <link
              key={l.code}
              rel="alternate"
              hrefLang={l.hreflang}
              href={`${SITE_URL}${l.path || "/"}`}
            />
          ))}
          <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}/`} />
        </>
      )}
    </Helmet>
  );
};

export default SEOHead;
