// src/lib/utils.ts
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import i18n from './i18n';
import { LAB_RANGES } from '../types';

// La locale date-fns suit la langue active de l'app (fr <-> en-US).
function currentLocale() {
  return i18n.language?.startsWith('en') ? enUS : fr;
}

export function formatDate(date: string | Date, pattern = 'd MMMM yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern, { locale: currentLocale() });
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (isToday(d)) return i18n.t('log.today', { defaultValue: "Aujourd'hui" });
  if (isYesterday(d)) return i18n.t('common.yesterday', { defaultValue: 'Hier' });
  return format(d, 'd MMM', { locale: currentLocale() });
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: currentLocale() });
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function scoreToLabel(score: number): string {
  return i18n.t(`scoreLabels.${score}`, { defaultValue: '' });
}

// Couleurs exprimées en tokens CSS : elles suivent automatiquement le thème.
export function scoreToColor(score: number): string {
  if (score <= 2) return 'var(--danger)';
  if (score === 3) return 'var(--warn)';
  return 'var(--success)';
}

export function tshStatus(tsh: number, profileMin?: number, profileMax?: number): {
  label: string; color: string; bg: string; status: 'low' | 'normal' | 'high';
} {
  const min = profileMin ?? LAB_RANGES.tsh.min;
  const max = profileMax ?? LAB_RANGES.tsh.max;
  if (tsh < min) return { label: i18n.t('tshStatus.low'), color: 'var(--lav)', bg: 'var(--lav-soft)', status: 'low' };
  if (tsh > max) return { label: i18n.t('tshStatus.high'), color: 'var(--danger)', bg: 'var(--danger-soft)', status: 'high' };
  return { label: i18n.t('tshStatus.normal'), color: 'var(--success)', bg: 'var(--success-soft)', status: 'normal' };
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Libellé traduit d'un champ symptôme (utilisé en dehors de composants React,
// d'où l'appel direct à i18n.t plutôt qu'au hook useTranslation).
export function symptomLabel(field: string): string {
  return i18n.t(`symptoms.${field}`, { defaultValue: field });
}
