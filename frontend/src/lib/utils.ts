// src/lib/utils.ts
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LAB_RANGES } from '../types';

export function formatDate(date: string | Date, pattern = 'd MMMM yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern, { locale: fr });
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return 'Hier';
  return format(d, 'd MMM', { locale: fr });
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: fr });
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function scoreToLabel(score: number): string {
  const labels = ['', 'Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'];
  return labels[score] ?? '';
}

export function scoreToColor(score: number): string {
  if (score <= 1) return '#ff6b8a';
  if (score === 2) return '#ffb347';
  if (score === 3) return '#ffd700';
  if (score === 4) return '#00d4b4';
  return '#7b61ff';
}

export function tshStatus(tsh: number, profileMin?: number, profileMax?: number): {
  label: string; color: string; status: 'low' | 'normal' | 'high';
} {
  const min = profileMin ?? LAB_RANGES.tsh.min;
  const max = profileMax ?? LAB_RANGES.tsh.max;
  if (tsh < min) return { label: 'Bas', color: '#7b61ff', status: 'low' };
  if (tsh > max) return { label: 'Élevé', color: '#ff6b8a', status: 'high' };
  return { label: 'Normal', color: '#00d4b4', status: 'normal' };
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const SYMPTOM_LABELS: Record<string, string> = {
  energyLevel: 'Énergie',
  moodScore: 'Humeur',
  anxietyLevel: 'Anxiété',
  brainFogLevel: 'Brouillard mental',
  coldSensitivity: 'Sensibilité au froid',
  heatSensitivity: 'Sensibilité à la chaleur',
  hairLoss: 'Perte de cheveux',
  drySkin: 'Peau sèche',
  constipation: 'Constipation',
  bloating: 'Ballonnements',
  muscleWeakness: 'Faiblesse musculaire',
  jointPain: 'Douleurs articulaires',
  neckPain: 'Gêne cervicale',
  swelling: 'Gonflement',
  tremors: 'Tremblements',
  sleepQuality: 'Qualité du sommeil',
};
