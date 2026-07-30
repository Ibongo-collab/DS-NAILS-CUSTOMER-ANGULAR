import { Pipe, PipeTransform } from '@angular/core';

/**
 * Met une heure au format français : « 10:00:00 » → « 10h00 ».
 *
 * Postgres renvoie les heures en « HH:MM:SS », et les créneaux générés côté
 * client en « HH:MM » : les deux formes sont acceptées.
 */
@Pipe({ name: 'time', standalone: true })
export class TimePipe implements PipeTransform {
  transform(time: string | null | undefined): string {
    if (!time) return '';

    const [rawHours, rawMinutes] = time.split(':');
    const hours = Number(rawHours);

    // Valeur inattendue : on la restitue telle quelle plutôt que d'afficher n'importe quoi
    if (Number.isNaN(hours) || rawMinutes === undefined) return time;

    return `${hours}h${rawMinutes.padStart(2, '0').slice(0, 2)}`;
  }
}
