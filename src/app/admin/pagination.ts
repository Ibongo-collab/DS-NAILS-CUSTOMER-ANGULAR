/**
 * Pagination d'un tableau d'administration.
 *
 * La même vingtaine de lignes était recopiée dans les réservations, les
 * notifications et la liste des clients — avec le risque qu'une correction
 * n'atteigne qu'un des trois.
 *
 * L'objet ne détient pas les données : il reçoit la liste **déjà filtrée** à
 * chaque lecture. Les filtres restent ainsi l'affaire de l'écran, et la page
 * courante suit sans que rien n'ait à être synchronisé.
 */
export class Pagination {
  /**
   * Page demandée. Elle n'est jamais corrigée en place : un filtre qui réduit
   * la liste borne l'affichage sans effacer l'intention, si bien qu'un retour
   * en arrière sur le filtre retrouve la page d'origine.
   */
  page = 1;

  /** Modifiable : la liste des clients laisse choisir 10, 25 ou 50 par page. */
  constructor(public pageSize: number) {}

  count(total: number): number {
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  /** La tranche à afficher, page ramenée dans les bornes. */
  slice<T>(items: T[]): T[] {
    const page = Math.min(this.page, this.count(items.length));
    const start = (page - 1) * this.pageSize;
    return items.slice(start, start + this.pageSize);
  }

  /** Première ligne affichée, à partir de 1. Zéro si la liste est vide. */
  start(total: number): number {
    if (!total) return 0;
    return (Math.min(this.page, this.count(total)) - 1) * this.pageSize + 1;
  }

  /** Dernière ligne affichée. */
  end(total: number): number {
    return Math.min(this.start(total) + this.pageSize - 1, total);
  }

  goTo(page: number, total: number): void {
    this.page = Math.min(Math.max(page, 1), this.count(total));
  }

  /** Tout changement de filtre ramène à la première page. */
  reset(): void {
    this.page = 1;
  }
}
