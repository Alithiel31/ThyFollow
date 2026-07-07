// src/lib/calendar.ts — export d'un RDV vers un agenda externe.
// Tout se passe dans le navigateur : aucun backend, aucun compte à connecter.
import type { Appointment } from '../types';

// Format "basic" UTC attendu par ICS et Google : 20260715T083000Z
function toUTCStamp(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Les virgules, points-virgules et retours à la ligne sont réservés en ICS
function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
}

function buildSummary(a: Appointment, typeLabel: string): string {
  return a.doctorName ? `${typeLabel} — ${a.doctorName}` : typeLabel;
}

// Durée par défaut d'un RDV : 1 h
function endDate(a: Appointment): Date {
  return new Date(new Date(a.date).getTime() + 60 * 60 * 1000);
}

export function icsForAppointment(a: Appointment, typeLabel: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ThyroTrack//FR',
    'BEGIN:VEVENT',
    `UID:${a.id}@thyrotrack`,
    `DTSTAMP:${toUTCStamp(new Date())}`,
    `DTSTART:${toUTCStamp(a.date)}`,
    `DTEND:${toUTCStamp(endDate(a))}`,
    `SUMMARY:${escapeICS(buildSummary(a, typeLabel))}`,
    ...(a.location ? [`LOCATION:${escapeICS(a.location)}`] : []),
    ...(a.notes ? [`DESCRIPTION:${escapeICS(a.notes)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadICS(a: Appointment, typeLabel: string): void {
  const blob = new Blob([icsForAppointment(a, typeLabel)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rdv-thyrotrack-${a.date.slice(0, 10)}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(a: Appointment, typeLabel: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: buildSummary(a, typeLabel),
    dates: `${toUTCStamp(a.date)}/${toUTCStamp(endDate(a))}`,
    ...(a.location ? { location: a.location } : {}),
    ...(a.notes ? { details: a.notes } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
