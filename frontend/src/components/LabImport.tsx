// src/components/LabImport.tsx
// Import de bilans sanguins PDF dans le carnet : dépôt multi-fichiers, mot de
// passe par fichier (mémorisable), puis écran de vérification des valeurs lues
// AVANT l'ajout au carnet — l'extraction automatique peut se tromper.
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FileUp, Download, X, Sparkles, AlertTriangle } from 'lucide-react';
import { labApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import {
  LAB_MARKER_KEYS, type ImportDraft, type ImportFileResult, type LabMarkerKey, type LabResult,
} from '../types';
import styles from './LabImport.module.css';

const MAX_FILES = 10;
// Champs toujours proposés à la relecture, même vides (comme le formulaire manuel)
const MAIN_MARKERS: LabMarkerKey[] = ['tsh', 'ft4', 'ft3', 'antiTPO', 'antiTG', 'antiTSHR', 'ferritin', 'vitaminD', 'vitaminB12'];

interface Form {
  date: string;
  lab: string;
  orderedBy: string;
  values: Partial<Record<LabMarkerKey, string>>;
}

interface Item {
  id: number;
  file: File;
  state: 'uploading' | ImportFileResult['status'] | 'rate_limited' | 'error';
  // Délai d'attente (minutes) annoncé par le serveur après un 429, si connu
  retryMinutes?: number | null;
  result?: ImportFileResult;
  password: string;
  remember: boolean;
  passwordLabel: string;
  form: Form;
  busy: boolean;
}

const EMPTY_FORM: Form = { date: '', lab: '', orderedBy: '', values: {} };

function toForm(draft: ImportDraft | undefined): Form {
  if (!draft) return EMPTY_FORM;
  return {
    date: draft.date ?? '',
    lab: draft.lab ?? '',
    orderedBy: draft.orderedBy ?? '',
    values: Object.fromEntries(Object.entries(draft.values).map(([k, v]) => [k, String(v)])),
  };
}

// Réponse 429 du serveur (limite de débit) : `express-rate-limit` renvoie `Retry-After` en
// secondes. On le convertit en minutes (au supérieur) ; null si absent ou illisible.
function tooManyRequests(err: unknown): { minutes: number | null } | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 429) return null;
  const seconds = Number(err.response.headers?.['retry-after']);
  return { minutes: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : null };
}

function rateLimitMessage(t: TFunction, minutes: number | null): string {
  return minutes ? t('labImport.rateLimited', { minutes }) : t('labImport.rateLimitedSoon');
}

// Message d'erreur d'une requête : précis pour une limite de débit (pour qu'on ne croie pas
// à un bug), générique sinon.
function requestErrorMessage(t: TFunction, err: unknown, fallbackKey: string): string {
  const limit = tooManyRequests(err);
  return limit ? rateLimitMessage(t, limit.minutes) : t(fallbackKey);
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// Télécharge un PDF du carnet : le jeton est porté par l'en-tête Authorization
// (intercepteur axios), un simple lien <a href> ne serait donc pas authentifié.
export function DocumentLink({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data } = await labApi.downloadDocument(documentId);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bilan.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(requestErrorMessage(t, err, 'labImport.downloadError'));
    }
  };
  return (
    <button type="button" className={styles.downloadBtn} onClick={onClick}>
      <Download size={13} /> {t('labImport.download')}
    </button>
  );
}

export function LabImport({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const hasAiConsent = Boolean(user?.profile?.aiExtractionConsentAt);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (id: number, changes: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  const remove = (id: number) => setItems((list) => list.filter((it) => it.id !== id));

  // Envoie `targets` en un seul lot et répartit les résultats (même ordre).
  const send = async (
    targets: Item[],
    opts: { password?: string; remember?: boolean; passwordLabel?: string; forceAi?: boolean } = {}
  ) => {
    targets.forEach((it) => patch(it.id, { state: 'uploading', busy: true }));
    try {
      const { data } = await labApi.importFiles(targets.map((it) => it.file), opts);
      data.results.forEach((result, index) => {
        const target = targets[index];
        if (!target) return;
        patch(target.id, { state: result.status, result, form: toForm(result.draft), busy: false });
      });
    } catch (err) {
      // 429 : limite de débit, pas un échec de lecture ; autre erreur : l'envoi n'a pas abouti.
      const limit = tooManyRequests(err);
      toast.error(requestErrorMessage(t, err, 'labImport.uploadError'));
      targets.forEach((it) =>
        patch(it.id, { state: limit ? 'rate_limited' : 'error', retryMinutes: limit?.minutes ?? null, busy: false })
      );
    }
  };

  const addFiles = (fileList: FileList | File[]) => {
    const all = Array.from(fileList);
    const pdfs = all.filter(isPdf);
    if (pdfs.length < all.length) toast.error(t('labImport.notPdf'));
    const room = MAX_FILES - items.length;
    if (pdfs.length > room) toast.error(t('labImport.tooMany', { max: MAX_FILES }));
    const accepted = pdfs.slice(0, Math.max(room, 0));
    if (accepted.length === 0) return;
    const created: Item[] = accepted.map((file) => ({
      id: nextId.current++, file, state: 'uploading', password: '', remember: false, passwordLabel: '',
      form: EMPTY_FORM, busy: true,
    }));
    setItems((list) => [...list, ...created]);
    void send(created);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const confirm = async (item: Item) => {
    const documentId = item.result?.documentId;
    if (!documentId) return;
    if (!item.form.date) return toast.error(t('labResults.dateRequired'));
    const payload: Partial<LabResult> & { date: string } = {
      date: item.form.date,
      lab: item.form.lab.trim() || null,
      orderedBy: item.form.orderedBy.trim() || null,
    };
    for (const [key, raw] of Object.entries(item.form.values)) {
      if (raw === undefined || raw === '') continue;
      const value = parseFloat(raw.replace(',', '.'));
      if (!Number.isNaN(value)) (payload as Record<string, unknown>)[key] = value;
    }
    patch(item.id, { busy: true });
    try {
      await labApi.confirmImport(documentId, payload);
      toast.success(t('labImport.added'));
      await qc.invalidateQueries({ queryKey: ['lab-results'] });
      remove(item.id);
    } catch (err) {
      toast.error(requestErrorMessage(t, err, 'labResults.error'));
      patch(item.id, { busy: false });
    }
  };

  const discard = async (item: Item) => {
    const documentId = item.result?.documentId;
    if (documentId) {
      patch(item.id, { busy: true });
      try {
        await labApi.discardImport(documentId);
      } catch (err) {
        toast.error(requestErrorMessage(t, err, 'labResults.error'));
        patch(item.id, { busy: false });
        return;
      }
    }
    remove(item.id);
  };

  return (
    <section className={styles.panel} aria-label={t('labImport.title')}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{t('labImport.title')}</h2>
          <p className={styles.panelSub}>{t('labImport.subtitle')}</p>
        </div>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={t('labImport.close')}>
          <X size={16} />
        </button>
      </div>

      <div
        className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp size={22} />
        <span className={styles.dropText}>{t('labImport.dropLabel')}</span>
        <span className={styles.dropHint}>{t('labImport.dropHint', { max: MAX_FILES })}</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          aria-label={t('labImport.dropLabel')}
          onChange={onPick}
        />
      </div>

      <ul className={styles.items}>
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            hasAiConsent={hasAiConsent}
            onChange={(changes) => patch(item.id, changes)}
            onRetryPassword={() =>
              send([item], { password: item.password, remember: item.remember, passwordLabel: item.passwordLabel })
            }
            onRetryAi={() => send([item], { forceAi: true })}
            onRetry={() => send([item])}
            onConfirm={() => confirm(item)}
            onDiscard={() => discard(item)}
          />
        ))}
      </ul>
    </section>
  );
}

function ItemRow({ item, hasAiConsent, onChange, onRetryPassword, onRetryAi, onRetry, onConfirm, onDiscard }: {
  item: Item;
  hasAiConsent: boolean;
  onChange: (changes: Partial<Item>) => void;
  onRetryPassword: () => void;
  onRetryAi: () => void;
  onRetry: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const draft = item.result?.draft;
  const needsPassword = item.state === 'password_required' || item.state === 'wrong_password';
  const finished = item.state !== 'uploading' && item.state !== 'ready' && !needsPassword;

  const setForm = (changes: Partial<Form>) => onChange({ form: { ...item.form, ...changes } });
  const setValue = (key: LabMarkerKey, raw: string) =>
    setForm({ values: { ...item.form.values, [key]: raw } });

  // Champs de relecture : marqueurs habituels + tout ce qui a été lu ou signalé
  const fieldKeys = LAB_MARKER_KEYS.filter(
    (key) =>
      MAIN_MARKERS.includes(key) || key in (draft?.values ?? {}) ||
      draft?.flags.some((f) => f.marker === key) || draft?.conflicts.some((c) => c.field === key)
  );

  return (
    <li className={styles.item} data-status={item.state}>
      <div className={styles.itemHead}>
        <span className={styles.fileName}>{item.file.name}</span>
        <span className={styles.status}>{t(`labImport.status.${item.state}`)}</span>
      </div>

      {item.state === 'failed' && item.result?.reason === 'no_text' && (
        <p className={styles.note}>{t('labImport.reason.no_text')}</p>
      )}
      {item.state === 'duplicate' && <p className={styles.note}>{t('labImport.duplicate')}</p>}
      {item.state === 'rate_limited' && (
        <p className={styles.note} role="status">{rateLimitMessage(t, item.retryMinutes ?? null)}</p>
      )}
      {item.state === 'error' && <p className={styles.note} role="status">{t('labImport.uploadFailedHint')}</p>}

      {needsPassword && (
        <div className={styles.passwordBox}>
          <label className={styles.label} htmlFor={`${id}-pw`}>{t('labImport.password')}</label>
          <input
            id={`${id}-pw`} className={styles.input} type="password" autoComplete="off"
            value={item.password} onChange={(e) => onChange({ password: e.target.value })}
          />
          <label className={styles.check}>
            <input type="checkbox" checked={item.remember} onChange={(e) => onChange({ remember: e.target.checked })} />
            {t('labImport.rememberPassword')}
          </label>
          {item.remember && (
            <input
              className={styles.input} placeholder={t('labImport.passwordLabelPlaceholder')}
              aria-label={t('labImport.passwordLabel')}
              value={item.passwordLabel} onChange={(e) => onChange({ passwordLabel: e.target.value })}
            />
          )}
          <button type="button" className={styles.primaryBtn} disabled={!item.password || item.busy} onClick={onRetryPassword}>
            {t('labImport.retry')}
          </button>
        </div>
      )}

      {item.state === 'ready' && draft && (
        <div className={styles.review}>
          <p className={styles.note}>
            {t(`labImport.method.${draft.method}`)}
            {draft.insufficient && ` — ${t('labImport.insufficient')}`}
          </p>
          {item.result?.possibleDuplicateOf && (
            <p className={styles.warn}><AlertTriangle size={14} /> {t('labImport.possibleDuplicate')}</p>
          )}
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>{t('labResults.date')}</span>
              <input className={styles.input} type="date" value={item.form.date} onChange={(e) => setForm({ date: e.target.value })} />
              {draft.dateConfidence === 'low' && <span className={styles.flag}>{t('labImport.dateUncertain')}</span>}
              <ConflictNote conflict={draft.conflicts.find((c) => c.field === 'date')} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('labResults.lab')}</span>
              <input className={styles.input} value={item.form.lab} onChange={(e) => setForm({ lab: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('labResults.orderedBy')}</span>
              <input className={styles.input} value={item.form.orderedBy} onChange={(e) => setForm({ orderedBy: e.target.value })} />
            </label>
            {fieldKeys.map((key) => {
              const flags = draft.flags.filter((f) => f.marker === key);
              return (
                <label key={key} className={styles.field}>
                  <span className={styles.label}>{t(`labImport.markers.${key}`)}</span>
                  <input
                    className={styles.input} inputMode="decimal"
                    value={item.form.values[key] ?? ''} onChange={(e) => setValue(key, e.target.value)}
                  />
                  {flags.map((f) => (
                    <span key={f.reason} className={styles.flag}>{t(`labImport.flags.${f.reason}`)}</span>
                  ))}
                  <ConflictNote conflict={draft.conflicts.find((c) => c.field === key)} />
                </label>
              );
            })}
          </div>
          <div className={styles.actions}>
            {hasAiConsent && draft.method === 'rules' && (
              <button type="button" className={styles.secondaryBtn} disabled={item.busy} onClick={onRetryAi}>
                <Sparkles size={14} /> {t('labImport.retryAi')}
              </button>
            )}
            <button type="button" className={styles.secondaryBtn} disabled={item.busy} onClick={onDiscard}>
              {t('labImport.discard')}
            </button>
            <button type="button" className={styles.primaryBtn} disabled={item.busy} onClick={onConfirm}>
              {t('labImport.addToLog')}
            </button>
          </div>
        </div>
      )}

      {finished && (
        <div className={styles.actions}>
          {(item.state === 'rate_limited' || item.state === 'error') && (
            <button type="button" className={styles.primaryBtn} disabled={item.busy} onClick={onRetry}>
              {t('labImport.retry')}
            </button>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={onDiscard}>{t('labImport.discard')}</button>
        </div>
      )}
    </li>
  );
}

// Désaccord entre la lecture automatique (règles) et la lecture par IA : on montre les deux.
function ConflictNote({ conflict }: { conflict?: ImportDraft['conflicts'][number] }) {
  const { t } = useTranslation();
  if (!conflict) return null;
  const show = (v: string | number | null) => (v === null ? t('labImport.conflictNone') : String(v));
  return (
    <span className={styles.conflict} role="note">
      {t('labImport.conflict', { rules: show(conflict.rules), ai: show(conflict.ai) })}
    </span>
  );
}
