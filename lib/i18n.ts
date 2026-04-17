import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

const isDevelopment = process.env.NODE_ENV === "development";

// Import translation files
import el from "@/locales/el.json";
import enUS from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import pt from "@/locales/pt.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";

const resources = {
  el: { translation: el },
  en: { translation: enUS },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  ja: { translation: ja },
  zh: { translation: zh },
};

i18n
  .use(LanguageDetector)
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    resources,
    lng: "el",
    fallbackLng: "el",
    debug: isDevelopment,
    ns: ["translation"],
    defaultNS: "translation",
    detection: {
      order: ["cookie", "localStorage", "htmlTag", "navigator"],
      caches: ["localStorage", "cookie"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
