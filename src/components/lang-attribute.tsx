"use client";

import { useEffect } from "react";
import { useTranslations } from "@/components/i18n-provider";

export function LangAttribute() {
  const { locale } = useTranslations();
  useEffect(() => {
    document.documentElement.lang = locale === "es-ES" ? "es" : "en";
  }, [locale]);
  return null;
}
