// src/test/i18nFr.ts
// Vraie instance i18next chargée avec la locale FR, pour les tests qui vérifient un libellé
// tel qu'il s'affiche (src/test/setup.ts remplace sinon `t` par une fonction qui renvoie la clé).
// Usage dans un fichier de test :
//   vi.mock('react-i18next', async () => (await import('../test/i18nFr')).i18nFrMock());
//   beforeAll(loadFr);
import { createInstance, type TFunction } from 'i18next';
import fr from '../locales/fr/common.json';

let t: TFunction | null = null;

export async function loadFr(): Promise<void> {
  const i18n = createInstance();
  await i18n.init({ lng: 'fr', resources: { fr: { common: fr } }, defaultNS: 'common', interpolation: { escapeValue: false } });
  t = i18n.getFixedT('fr');
}

export const i18nFrMock = () => ({
  useTranslation: () => ({ t: t!, i18n: { language: 'fr', changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
  Trans: ({ children }: { children?: unknown }) => children,
});
