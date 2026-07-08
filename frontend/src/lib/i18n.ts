// src/lib/i18n.ts — configuration i18next : détection de la langue du
// navigateur au premier passage, puis mémorisation du choix en localStorage.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from '../locales/fr/common.json';
import en from '../locales/en/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: fr },
      en: { common: en },
    },
    defaultNS: 'common',
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'thyro_lang',
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
