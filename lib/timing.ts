import type { SpinMode } from '../components/SlotMachine';

// ─────────────────────────────────────────────────────────────
// Créneaux horaires des modes de spin.
// Source de vérité unique — utilisée par :
//   - le sélecteur de créneau (index.tsx) : désactiver les créneaux passés
//   - le spin (useSpin.ts) : ne proposer que des événements actifs
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
