// src/lib/i18n.ts — i18next côté serveur : langue détectée depuis l'en-tête
// Accept-Language envoyé par le navigateur (ou ?lng=xx en query, utile pour
// les tests). Les messages d'erreur de l'API sont ainsi traduits par requête.
import i18next from 'i18next';
import { LanguageDetector, handle } from 'i18next-http-middleware';
import fr from '../locales/fr/translation.json' with { type: 'json' };
import en from '../locales/en/translation.json' with { type: 'json' };

i18next
  .use(LanguageDetector)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    preload: ['fr', 'en'],
    detection: {
      order: ['querystring', 'header'],
      lookupQuerystring: 'lng',
      caches: false,
    },
    interpolation: { escapeValue: false },
  });

export default i18next;
export const middleware = { handle };
