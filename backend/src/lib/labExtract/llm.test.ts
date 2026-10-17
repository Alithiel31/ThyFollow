// src/lib/labExtract/llm.test.ts
// Le SDK Anthropic est mocké : aucun appel réseau, aucune clé réelle.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const USER = {
  name: 'Élodie Dupont',
  email: 'elodie.dupont@example.com',
  birthDate: new Date(Date.UTC(1985, 2, 15)),
};

const REPORT = `Patient : Élodie Dupont
Née le 15/03/1985
Email : elodie.dupont@example.com
N° sécurité sociale : 2 85 03 31 555 123 45
Prélevé le 12/03/2026
TSH 2,35 mUI/L
Ferritine 64 ng/mL`;

function textResponse(payload: unknown, stop_reason = 'end_turn') {
  return { stop_reason, content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] };
}

async function load(apiKey = 'sk-test') {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = apiKey;
  return import('./llm.js');
}

beforeEach(() => {
  createMock.mockClear();
});

describe('labExtract/llm', () => {
  it('n’appelle pas le SDK sans consentement', async () => {
    const { extractWithLlm } = await load();
    const r = await extractWithLlm(REPORT, { ...USER, consent: false });
    expect(r).toEqual({ ok: false, reason: 'no_consent' });
    expect(createMock).toHaveBeenCalledTimes(0);
  });

  it('n’appelle pas le SDK sans ANTHROPIC_API_KEY', async () => {
    const { extractWithLlm } = await load('');
    const r = await extractWithLlm(REPORT, { ...USER, consent: true });
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
    expect(createMock).toHaveBeenCalledTimes(0);
  });

  it('n’envoie au SDK ni nom, ni date de naissance, ni email, ni n° de sécu', async () => {
    createMock.mockResolvedValue(textResponse({ date: '2026-03-12', lab: null, measurements: [] }));
    const { extractWithLlm } = await load();
    await extractWithLlm(REPORT, { ...USER, consent: true });

    expect(createMock).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(createMock.mock.calls[0][0]);
    expect(sent).not.toMatch(/dupont/i);
    expect(sent).not.toMatch(/élodie|elodie/i);
    expect(sent).not.toContain('15/03/1985');
    expect(sent).not.toContain('example.com');
    expect(sent).not.toContain('555 123');
    expect(sent).toContain('TSH 2,35 mUI/L');
  });

  it('convertit les unités et signale les valeurs « < »', async () => {
    createMock.mockResolvedValue(
      textResponse({
        date: '2026-03-12',
        lab: 'Biogroup',
        measurements: [
          { marker: 'tsh', value: 2.35, qualifier: 'none', unit: 'mUI/L' },
          { marker: 'ft4', value: 1.1, qualifier: 'none', unit: 'ng/dL' },
          { marker: 'antiTPO', value: null, qualifier: 'less_than', unit: 'UI/mL' },
        ],
      })
    );
    const { extractWithLlm } = await load();
    const r = await extractWithLlm(REPORT, { ...USER, consent: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.values.tsh).toBe(2.35);
    expect(Math.abs((r.result.values.ft4 ?? 0) - 14.2)).toBeLessThan(0.1);
    expect(r.result.values.antiTPO).toBeUndefined();
    expect(r.result.flags).toContainEqual({ marker: 'antiTPO', reason: 'comparator' });
    expect(r.result.lab).toBe('Biogroup');
    expect(r.result.insufficient).toBe(false);
  });

  it('garde la précision d’une valeur non convertie', async () => {
    createMock.mockResolvedValue(
      textResponse({ date: '2026-07-21', lab: null, measurements: [{ marker: 'tsh', value: 1.776, qualifier: 'none', unit: 'mUI/L' }] })
    );
    const { extractWithLlm } = await load();
    const r = await extractWithLlm(REPORT, { ...USER, consent: true });
    expect(r.ok && r.result.values.tsh).toBe(1.776);
  });

  it('renvoie { ok: false } sur une sortie malformée (sans exception)', async () => {
    const { extractWithLlm } = await load();
    for (const bad of ['pas du json', { date: 'hier', lab: null, measurements: [] }, { foo: 1 }]) {
      createMock.mockResolvedValueOnce(textResponse(bad));
      const r = await extractWithLlm(REPORT, { ...USER, consent: true });
      expect(r).toEqual({ ok: false, reason: 'invalid_output' });
    }
  });

  it('refuse un marqueur inconnu du modèle', async () => {
    createMock.mockResolvedValue(
      textResponse({ date: '2026-03-12', lab: null, measurements: [{ marker: 'cortisol', value: 1, qualifier: 'none', unit: null }] })
    );
    const { extractWithLlm } = await load();
    expect(await extractWithLlm(REPORT, { ...USER, consent: true })).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('gère un refus du modèle', async () => {
    createMock.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const { extractWithLlm } = await load();
    expect(await extractWithLlm(REPORT, { ...USER, consent: true })).toEqual({ ok: false, reason: 'refused' });
  });

  it('renvoie { ok: false } sur une erreur réseau/API (sans exception)', async () => {
    createMock.mockImplementation(async () => {
      throw new Error('ECONNRESET');
    });
    const { extractWithLlm } = await load();
    expect(await extractWithLlm(REPORT, { ...USER, consent: true })).toEqual({ ok: false, reason: 'error' });
  });

  it('refuse un texte trop long plutôt que de le tronquer', async () => {
    const { extractWithLlm } = await load();
    const r = await extractWithLlm('TSH 2 mUI/L\n'.repeat(10_000), { ...USER, consent: true });
    expect(r).toEqual({ ok: false, reason: 'too_long' });
    expect(createMock).toHaveBeenCalledTimes(0);
  });
});
