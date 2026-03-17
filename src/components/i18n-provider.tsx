"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getTranslation, formatDate as i18nFormatDate, type Locale, type TranslationKey, type DateFormatType } from "@/lib/i18n";
import { usePreferences } from "@/components/preferences-provider";

type TFunction = (key: TranslationKey, params?: Record<string, string>) => string;
type FormatDateFn = (date: Date, formatType: DateFormatType, endDate?: Date) => string;

const I18nContext = createContext<{ t: TFunction; locale: Locale; formatDate: FormatDateFn } | null>(null);

export function useTranslations() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslations must be used within I18nProvider");
  return ctx;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const prefs = usePreferences();
  const locale = (prefs?.preferences?.locale ?? "en-US") as Locale;
  const t: TFunction = (key, params) => getTranslation(locale, key, params);
  const formatDate: FormatDateFn = (date, formatType, endDate) => i18nFormatDate(date, formatType, locale, endDate);
  return (
    <I18nContext.Provider value={{ t, locale, formatDate }}>
      {children}
    </I18nContext.Provider>
  );
}
