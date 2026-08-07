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

// ==================== AFFICHAGE ====================
// Ces libellés étaient recopiés dans une dizaine d'écrans, avec des variantes.
// Les réunir ici évite qu'un « fév. » apparaisse ici et un « fév » là.

export const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const JOURS_LONGS =
  ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export const MOIS_COURTS =
  ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
export const MOIS_LONGS =
  ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
   'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Ven 7 août 2026 » — listes et tableaux, où la place manque. */
export function formatDayDate(dateString: string): string {
  const date = parseDateString(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return `${JOURS_COURTS[date.getDay()]} ${date.getDate()} ${MOIS_COURTS[date.getMonth()]} ${date.getFullYear()}`;
}

/** « 7 août 2026 » — quand le jour de la semaine n'apporte rien. */
export function formatShortDate(dateString: string): string {
  const date = parseDateString(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return `${date.getDate()} ${MOIS_COURTS[date.getMonth()]} ${date.getFullYear()}`;
}

/** « Vendredi 7 août 2026 » — écrans clients, où la lecture prime. */
export function formatLongDate(dateString: string): string {
  const date = parseDateString(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return `${JOURS_LONGS[date.getDay()]} ${date.getDate()} ${MOIS_LONGS[date.getMonth()]} ${date.getFullYear()}`;
}

/** « vendredi 7 août » — au fil d'une phrase, sans l'année. */
export function formatDayMonth(dateString: string): string {
  const date = parseDateString(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return `${JOURS_LONGS[date.getDay()].toLowerCase()} ${date.getDate()} ${MOIS_LONGS[date.getMonth()]}`;
}

/**
 * Dernier jour du mois de la date donnée, au format `YYYY-MM-DD`.
 *
 * Le jour 0 du mois suivant est le dernier du mois courant : `Date` gère ainsi
 * les mois de 30 ou 31 jours et les années bissextiles sans table de longueurs.
 */
export function endOfMonth(dateString: string): string {
  const date = parseDateString(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return toDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/** Nombre de jours entre deux dates de calendrier, bornes comprises. */
export function daysBetween(fromDate: string, toDate: string): number {
  const debut = parseDateString(fromDate);
  const fin = parseDateString(toDate);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return 0;
  // Arrondi : un changement d'heure d'été décale la différence d'une heure
  return Math.round((fin.getTime() - debut.getTime()) / 86_400_000) + 1;
}
