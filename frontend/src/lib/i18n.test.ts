// src/lib/i18n.test.ts
import { describe, it, expect } from 'vitest';
import i18n from './i18n';

describe('i18n', () => {
  it('keeps <html lang> in sync with the interface language', async () => {
    await i18n.changeLanguage('en-GB');
    expect(document.documentElement.lang).toBe('en');

    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
