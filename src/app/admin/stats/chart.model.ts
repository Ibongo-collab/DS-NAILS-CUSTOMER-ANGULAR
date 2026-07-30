export interface ChartPoint {
  /** Libellé court affiché sur l'axe */
  label: string;
  /** Libellé complet, utilisé par l'infobulle et la vue tableau */
  fullLabel?: string;
  value: number;
}

/** Échelons d'axe lisibles, assez fins pour ne pas écraser les barres. */
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * Arrondit une valeur max à une graduation lisible.
 *
 * Le facteur de 8 % réserve de la place au-dessus de la plus haute barre : sans
 * lui elle occupe 100 % de la hauteur et son étiquette de valeur, posée au-dessus,
 * déborderait du cadre.
 */
export function niceMax(max: number, headroom = 1.08): number {
  if (max <= 0) return 1;
  const target = max * headroom;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / magnitude;
  const step = NICE_STEPS.find(s => normalized <= s) ?? 10;
  return step * magnitude;
}
