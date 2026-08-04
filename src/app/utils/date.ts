/**
 * Dates de calendrier, en heure locale.
 *
 * Une date de rendez-vous (`2026-08-04`) désigne un jour du calendrier du
 * salon, pas un instant. Deux pièges la décalent d'un jour et sont la cause de
 * bugs qui ne se manifestent qu'à certaines heures :
 *
 * - `new Date().toISOString()` convertit en UTC. À Brazzaville (UTC+1), entre
 *   minuit et 1 h du matin, il renvoie la veille.
 * - `new Date('2026-08-04')` est interprété comme minuit **UTC**, puis relu en
 *   heure locale : dans un fuseau négatif, on retombe sur le 3.
 *
 * Ces deux fonctions sont le seul moyen autorisé de passer d'une date de
 * calendrier à un `Date`, et inversement.
 */

/** Jour du calendrier local au format `YYYY-MM-DD`. */
export function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Aujourd'hui, au format `YYYY-MM-DD`, dans le fuseau du navigateur. */
export function todayString(): string {
  return toDateString(new Date());
}

/**
 * `YYYY-MM-DD` → `Date` à minuit **local**.
 *
 * Les composants sont passés un par un plutôt que par concaténation : le
 * comportement de `new Date(string)` dépend du format exact reçu.
 */
export function parseDateString(dateString: string): Date {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return new Date(NaN);
  return new Date(year, month - 1, day);
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche (colonne `day_of_week`). */
export function isoDayOfWeek(dateString: string): number {
  return parseDateString(dateString).getDay() || 7;
}
