/**
 * Placement des rendez-vous qui se chevauchent, dans une colonne de journée.
 *
 * Deux rendez-vous à la même heure ne peuvent pas occuper le même espace : il
 * faut les mettre côte à côte, en partageant la largeur. C'est le
 * comportement d'un agenda classique.
 *
 * La méthode : on regroupe les rendez-vous qui se touchent de proche en proche
 * (un « paquet »), puis on répartit chaque paquet en colonnes. Le nombre de
 * colonnes vaut pour tout le paquet, sans quoi deux rendez-vous voisins
 * n'auraient pas la même largeur et l'ensemble paraîtrait bancal.
 */

export interface TimeRange {
  /** Minutes depuis minuit */
  start: number;
  end: number;
}

export interface Positioned<T> {
  item: T;
  start: number;
  end: number;
  /** Colonne occupée, à partir de 0 */
  column: number;
  /** Nombre de colonnes du paquet — donne la largeur */
  columns: number;
}

/**
 * @param items rendez-vous d'une même journée, dans un ordre quelconque
 * @param range comment lire les bornes horaires d'un élément
 */
export function layoutDay<T>(items: T[], range: (item: T) => TimeRange): Positioned<T>[] {
  const events = items
    .map(item => ({ item, ...range(item) }))
    // Une durée nulle ou négative rendrait le bloc invisible : on lui laisse
    // de quoi être vu et cliqué.
    .map(e => (e.end > e.start ? e : { ...e, end: e.start + 15 }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const resultat: Positioned<T>[] = [];
  let paquet: Positioned<T>[] = [];
  // Fin de colonne la plus récente, une entrée par colonne du paquet
  let finDeColonne: number[] = [];

  const clore = () => {
    const largeur = finDeColonne.length;
    for (const place of paquet) place.columns = largeur;
    resultat.push(...paquet);
    paquet = [];
    finDeColonne = [];
  };

  for (const event of events) {
    // Plus aucun recouvrement avec le paquet en cours : on le referme
    if (finDeColonne.length && event.start >= Math.max(...finDeColonne)) clore();

    // Première colonne libre à cet horaire, sinon on en ouvre une nouvelle
    let colonne = finDeColonne.findIndex(fin => fin <= event.start);
    if (colonne === -1) {
      colonne = finDeColonne.length;
      finDeColonne.push(event.end);
    } else {
      finDeColonne[colonne] = event.end;
    }

    paquet.push({ item: event.item, start: event.start, end: event.end, column: colonne, columns: 1 });
  }

  if (paquet.length) clore();

  return resultat;
}

/** « 09:30:00 » ou « 09:30 » → 570. Renvoie null si illisible. */
export function toMinutes(time: string | null | undefined): number | null {
  const [h, m] = String(time ?? '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
