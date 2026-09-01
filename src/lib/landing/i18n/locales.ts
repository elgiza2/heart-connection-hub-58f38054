export type LocaleCode = "en" | "ar-eg";

export interface LocaleMeta {
  code: LocaleCode;
  path: string; // url prefix, "" for default english
  nativeName: string;
  englishName: string;
  dir: "ltr" | "rtl";
  hreflang: string; // e.g. en, ar-EG
  ogLocale: string; // en_US, ar_EG
}

export const LOCALES: LocaleMeta[] = [
  {
    code: "en",
    path: "",
    nativeName: "English",
    englishName: "English",
    dir: "ltr",
    hreflang: "en",
    ogLocale: "en_US",
  },
  {
    code: "ar-eg",
    path: "/ar-eg",
    nativeName: "المصري",
    englishName: "Egyptian Arabic",
    dir: "rtl",
    hreflang: "ar-EG",
    ogLocale: "ar_EG",
  },
];

export const getLocale = (code: LocaleCode): LocaleMeta =>
  LOCALES.find((l) => l.code === code) ?? LOCALES[0];
