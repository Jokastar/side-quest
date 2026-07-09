// Créneau horaire d'une escapade (ex-"SpinMode", conservé comme nom de type)
export type SpinMode = 'midi' | 'journee' | 'soiree';

// ─────────────────────────────────────────────────────────────
// Créneaux horaires des modes de spin.
// Source de vérité unique — utilisée par :
//   - le sélecteur de créneau (index.tsx) : désactiver les créneaux passés
//   - les listes (useItemLists.ts) : ne proposer que des items actifs
//     pendant le créneau choisi
//
// La soirée se termine à 3h du matin → end = 27 (heures "étendues").
// ─────────────────────────────────────────────────────────────

export const MODE_HOURS: Record<SpinMode, { start: number; end: number }> = {
  midi:    { start: 10, end: 14 },
  journee: { start: 14, end: 19 },
  soiree:  { start: 19, end: 27 },  // 27h = 3h du matin le lendemain
};

// Mode par défaut selon l'heure actuelle
export function detectMode(): SpinMode {
  const h = new Date().getHours();
  if (h >= 10 && h < 14) return 'midi';
  if (h >= 14 && h < 19) return 'journee';
  return 'soiree'; // 19h–3h, et tôt le matin par défaut
}

// Fenêtre [start, end] du créneau pour AUJOURD'HUI.
// Cas particulier : entre minuit et 3h, la "soirée" en cours est celle
// qui a commencé hier à 19h.
export function modeWindow(mode: SpinMode, now = new Date()): { start: Date; end: Date } {
  const { start, end } = MODE_HOURS[mode];

  const base = new Date(now);
  if (mode === 'soiree' && now.getHours() < 3) {
    base.setDate(base.getDate() - 1); // soirée entamée hier soir
  }

  const startDate = new Date(base);
  startDate.setHours(start, 0, 0, 0);

  const endDate = new Date(base);
  endDate.setHours(end, 0, 0, 0); // setHours(27) déborde proprement sur le lendemain

  return { start: startDate, end: endDate };
}

// Le créneau est-il déjà terminé pour aujourd'hui ?
// (la soirée ne l'est jamais : elle court jusqu'à 3h du matin)
export function isModePast(mode: SpinMode, now = new Date()): boolean {
  return now >= modeWindow(mode, now).end;
}

// ─────────────────────────────────────────────────────────────
// Ordre chronologique de l'escapade.
//
// Les items À HEURE FIXE (concert 20h30) ancrent la timeline.
// Les items FLEXIBLES (expo, resto, bar — pas d'heure précise)
// reçoivent une heure par défaut selon leur type et le créneau,
// pour s'intercaler naturellement : activité → repas → sortie.
// ─────────────────────────────────────────────────────────────

import { itemTimeToday } from './items';
import type { Item, Slot } from '../types/database';

// Heure par défaut (en heures décimales) d'un item flexible, par créneau
export const DEFAULT_STOP_HOURS: Record<SpinMode, Record<Slot, { hour: number; label: string }>> = {
  midi: {
    activite: { hour: 10.5, label: '10h30' },
    table:    { hour: 12,   label: '12h00' },
    sortie:   { hour: 13.5, label: '13h30' },
  },
  journee: {
    activite: { hour: 15, label: '15h00' },
    table:    { hour: 17, label: '17h00' },
    sortie:   { hour: 18.5, label: '18h30' },
  },
  soiree: {
    activite: { hour: 19,   label: '19h00' },
    table:    { hour: 20.5, label: '20h30' },
    sortie:   { hour: 22.5, label: '22h30' },
  },
};

// Heure d'ancrage d'un item dans la journée (timestamp comparable) :
// son heure réelle si connue, sinon l'heure par défaut de son type
export function anchorTime(realTime: Date | null, slot: Slot, mode: SpinMode): number {
  if (realTime) return realTime.getTime();
  const base = new Date();
  const { hour } = DEFAULT_STOP_HOURS[mode][slot];
  base.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
  return base.getTime();
}

// Ordonne la sélection en itinéraire chronologique.
// Utilisé par plan.tsx ET checkin.tsx (l'ordre doit être identique).
export function sortChronologically(items: Item[], mode: SpinMode): Item[] {
  return [...items].sort(
    (a, b) =>
      anchorTime(itemTimeToday(a), a.slot, mode) -
      anchorTime(itemTimeToday(b), b.slot, mode),
  );
}
