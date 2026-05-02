export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "tr";

export const LANGUAGES: readonly {
  code: Locale;
  label: string;
  name: string;
  flag: string;
}[] = [
  { code: "tr", label: "TR", name: "Türkçe", flag: "🇹🇷" },
  { code: "en", label: "EN", name: "English", flag: "🇺🇸" },
] as const;

export const RTL_LOCALES: readonly Locale[] = [];

export const LOCALE_COOKIE = "NEXT_LOCALE";
