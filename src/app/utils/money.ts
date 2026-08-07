/**
 * Affichage des montants, en francs CFA.
 *
 * Deux formes, et deux seulement — elles étaient auparavant recopiées dans
 * sept écrans, avec trois comportements différents dont deux involontaires :
 * `Intl.NumberFormat` sans options laisse passer jusqu'à trois décimales, si
 * bien qu'un même montant pouvait s'écrire « 7 500 » ici et « 7 500,5 » là.
 */

const ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

const CENTIMES = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * « 7 500 FCFA » — écrans d'administration.
 * Les centimes n'ont pas cours ici : on encaisse et on comptabilise en francs.
 */
export function formatAmount(value: number | null | undefined): string {
  return `${ENTIER.format(Math.round(Number(value) || 0))} FCFA`;
}

/**
 * « 7 500,00 FCFA » — tarifs présentés aux clientes.
 * Les décimales fixes alignent les prix les uns sous les autres dans une liste.
 */
export function formatPrice(value: number | null | undefined): string {
  return `${CENTIMES.format(Number(value) || 0)} FCFA`;
}
