import { Booking } from '../models/booking.model';

/**
 * Lecture des prestations d'un rendez-vous.
 *
 * Un rendez-vous peut en compter plusieurs — « nattes collées + manucure ».
 * `bookings.services` ne porte que la principale, la table de liaison porte la
 * liste. Ces fonctions sont partagées par les écrans d'administration : sans
 * elles, chacun afficherait la composition à sa manière.
 */

/** Lignes triées, filtrées sur leur réalisation. */
function lines(booking: Booking, fulfilled: boolean) {
  return [...(booking.booking_services ?? [])]
    // `fulfilled` absent : réservation antérieure à la colonne, donc réalisée
    .filter(l => (l.fulfilled !== false) === fulfilled)
    .sort((a, b) => a.position - b.position)
    .map(l => l.services?.name || 'Prestation supprimée');
}

/**
 * Prestations **réellement réalisées**, dans l'ordre choisi par la cliente.
 *
 * Celles auxquelles elle a renoncé sont écartées : elles ne doivent ni nommer
 * le rendez-vous, ni compter dans les classements. Elles restent en base et
 * sont lisibles par `droppedServiceNames`.
 */
export function serviceNames(booking: Booking): string[] {
  const realisees = lines(booking, true);
  if (realisees.length) return realisees;

  // Aucune ligne réalisée : soit tout a été abandonné — cas que la clôture
  // interdit —, soit la requête n'a pas demandé la table de liaison. On
  // retombe alors sur la prestation principale.
  if ((booking.booking_services ?? []).length) return [];
  return booking.services?.name ? [booking.services.name] : [];
}

/** Prestations réservées puis abandonnées au dernier moment. */
export function droppedServiceNames(booking: Booking): string[] {
  return lines(booking, false);
}

/** « Nattes collées + Manucure », ou « — » si rien n'est connu. */
export function servicesLabel(booking: Booking): string {
  const noms = serviceNames(booking);
  return noms.length ? noms.join(' + ') : '—';
}
