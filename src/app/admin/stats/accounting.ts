import { Booking } from '../../models/booking.model';
import { ChartPoint } from './chart.model';

/**
 * Base comptable : seules les réservations **terminées** comptent.
 *
 * Une réservation confirmée est un engagement, pas une prestation rendue :
 * elle peut encore être annulée ou ne pas avoir lieu. La comptabiliser
 * gonflerait le chiffre d'affaires avec des recettes non réalisées.
 */
export const BILLABLE_STATUSES = ['completed'];

/**
 * Statuts « honorés » : non annulés et sortis de l'attente. Sert aux
 * indicateurs d'exploitation (taux de désistement), jamais aux montants.
 */
export const HONORED_STATUSES = ['confirmed', 'completed'];

const MONTH_LABELS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
const MONTH_FULL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export interface LoyalClient {
  /** Clé de regroupement : email si connu, sinon téléphone */
  key: string;
  name: string;
  email: string;
  phone: string;
  /**
   * Aucune adresse e-mail sur la réservation : elle n'est rattachable à aucun
   * compte, elle a donc été prise sans connexion.
   */
  isGuest: boolean;
  bookings: number;
  revenue: number;
  lastVisit: string;
}

export interface AccountingStats {
  revenueCurrentMonth: number;
  revenuePreviousMonth: number;
  revenueTotal: number;
  /** Réservations terminées : la base de tous les montants */
  completedCount: number;
  honoredCount: number;
  cancelledCount: number;
  pendingCount: number;
  /** annulées / (annulées + honorées), en % — les « en attente » sont exclues */
  cancellationRate: number;
  averageBasket: number;
  revenueByMonth: ChartPoint[];
  bookingsByDay: ChartPoint[];
  topServices: ChartPoint[];
  busiestHours: ChartPoint[];
  loyalClients: LoyalClient[];
}

export function isHonored(booking: Booking): boolean {
  return HONORED_STATUSES.includes(booking.status);
}

/** Réservation effectivement réalisée : la seule qui produit du chiffre d'affaires. */
export function isBillable(booking: Booking): boolean {
  return BILLABLE_STATUSES.includes(booking.status);
}

/**
 * Montant d'une réservation.
 *
 * On lit `price_at_booking`, figé à la création : le chiffre d'affaires passé
 * ne bouge donc pas quand un tarif est modifié. Le repli sur le tarif courant
 * ne sert qu'aux lignes antérieures à la migration qui n'auraient pas été
 * reprises ; il ne devrait jamais s'appliquer en pratique.
 */
export function bookingRevenue(booking: Booking): number {
  if (!isBillable(booking)) return 0;
  const frozen = booking.price_at_booking;
  if (frozen !== null && frozen !== undefined) return Number(frozen);
  return Number(booking.services?.price ?? 0);
}

function monthKey(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string, withYear = false): string {
  const [year, month] = key.split('-');
  const index = Number(month) - 1;
  return withYear ? `${MONTH_LABELS[index]} ${year.slice(2)}` : MONTH_LABELS[index];
}

function monthFullLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_FULL[Number(month) - 1]} ${year}`;
}

/** Suite continue de mois, pour qu'un mois sans réservation apparaisse à zéro. */
function monthRange(months: number, today: Date): string[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/** Suite continue de jours, même logique que les mois. */
function dayRange(days: number, today: Date): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  }
  return keys;
}

export interface ClientSignupRow {
  signup_date: string;
  verified_count: number;
  unverified_count: number;
}

export interface ClientGrowth {
  totalVerified: number;
  totalUnverified: number;
  /** Nouvelles inscriptions vérifiées sur la fenêtre affichée */
  newVerifiedInPeriod: number;
  /** Cumul des comptes vérifiés, jour par jour */
  curve: ChartPoint[];
}

/**
 * Progression du nombre de clients inscrits avec email vérifié.
 *
 * La courbe est cumulative et démarre au total déjà atteint avant la fenêtre :
 * repartir de zéro à chaque changement de période afficherait une clientèle
 * bien plus faible qu'elle ne l'est.
 */
export function computeClientGrowth(
  signups: ClientSignupRow[],
  options: { days?: number; today?: Date } = {}
): ClientGrowth {
  const days = options.days ?? 30;
  const today = options.today ?? new Date();

  const totalVerified = signups.reduce((sum, row) => sum + Number(row.verified_count ?? 0), 0);
  const totalUnverified = signups.reduce((sum, row) => sum + Number(row.unverified_count ?? 0), 0);

  const window = dayRange(days, today);
  const windowStart = window[0];

  const perDay = new Map<string, number>();
  let baseline = 0;
  for (const row of signups) {
    const date = (row.signup_date || '').slice(0, 10);
    const verified = Number(row.verified_count ?? 0);
    if (!date) continue;
    if (date < windowStart) {
      baseline += verified;
    } else {
      perDay.set(date, (perDay.get(date) ?? 0) + verified);
    }
  }

  let running = baseline;
  const curve: ChartPoint[] = window.map(key => {
    running += perDay.get(key) ?? 0;
    const [, month, day] = key.split('-');
    return { label: `${day}/${month}`, fullLabel: `${day}/${month}`, value: running };
  });

  return {
    totalVerified,
    totalUnverified,
    newVerifiedInPeriod: running - baseline,
    curve
  };
}

export function computeAccountingStats(
  bookings: Booking[],
  options: { months?: number; days?: number; today?: Date } = {}
): AccountingStats {
  const months = options.months ?? 12;
  const days = options.days ?? 30;
  const today = options.today ?? new Date();

  const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;

  // Base comptable : uniquement les prestations réellement rendues
  const billable = bookings.filter(isBillable);
  const honored = bookings.filter(isHonored);
  const cancelled = bookings.filter(b => b.status === 'cancelled');
  const pending = bookings.filter(b => b.status === 'pending');

  // --- Chiffre d'affaires ---

  const revenuePerMonth = new Map<string, number>();
  for (const booking of billable) {
    const key = monthKey(booking.booking_date);
    revenuePerMonth.set(key, (revenuePerMonth.get(key) ?? 0) + bookingRevenue(booking));
  }

  const revenueByMonth: ChartPoint[] = monthRange(months, today).map(key => ({
    label: monthLabel(key),
    fullLabel: monthFullLabel(key),
    value: revenuePerMonth.get(key) ?? 0
  }));

  const revenueTotal = billable.reduce((sum, b) => sum + bookingRevenue(b), 0);

  // --- Réservations par jour ---

  const perDay = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue;
    perDay.set(booking.booking_date, (perDay.get(booking.booking_date) ?? 0) + 1);
  }

  const bookingsByDay: ChartPoint[] = dayRange(days, today).map(key => {
    const [, month, day] = key.split('-');
    return {
      label: `${day}/${month}`,
      fullLabel: `${day}/${month}`,
      value: perDay.get(key) ?? 0
    };
  });

  // --- Prestations ---

  const perService = new Map<string, number>();
  for (const booking of billable) {
    const name = booking.services?.name || 'Prestation supprimée';
    perService.set(name, (perService.get(name) ?? 0) + 1);
  }

  const topServices: ChartPoint[] = [...perService.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({
      label: name.length > 24 ? `${name.slice(0, 23)}…` : name,
      fullLabel: name,
      value: count
    }));

  // --- Créneaux horaires ---

  const perHour = new Map<number, number>();
  for (const booking of billable) {
    const hour = Number((booking.start_time || '').slice(0, 2));
    if (Number.isNaN(hour)) continue;
    perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
  }

  const busiestHours: ChartPoint[] = [...perHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, count]) => ({
      label: `${hour}h`,
      fullLabel: `${hour}h – ${hour + 1}h`,
      value: count
    }));

  // --- Fidélité ---

  const perClient = new Map<string, LoyalClient>();
  for (const booking of billable) {
    const email = (booking.client_email || '').trim();
    const phone = (booking.client_phone || '').trim();
    const key = (email || phone).toLowerCase();
    if (!key) continue;

    const existing = perClient.get(key);
    if (existing) {
      existing.bookings += 1;
      existing.revenue += bookingRevenue(booking);
      // Un téléphone renseigné plus tard complète une fiche qui n'en avait pas
      if (!existing.phone && phone) existing.phone = phone;
      if (booking.booking_date > existing.lastVisit) existing.lastVisit = booking.booking_date;
    } else {
      perClient.set(key, {
        key,
        name: booking.client_name,
        email,
        phone,
        isGuest: !email,
        bookings: 1,
        revenue: bookingRevenue(booking),
        lastVisit: booking.booking_date
      });
    }
  }

  const loyalClients = [...perClient.values()]
    .sort((a, b) => b.bookings - a.bookings || b.revenue - a.revenue)
    .slice(0, 8);

  // --- Indicateurs ---

  const decided = honored.length + cancelled.length;

  return {
    revenueCurrentMonth: revenuePerMonth.get(currentKey) ?? 0,
    revenuePreviousMonth: revenuePerMonth.get(previousKey) ?? 0,
    revenueTotal,
    completedCount: billable.length,
    honoredCount: honored.length,
    cancelledCount: cancelled.length,
    pendingCount: pending.length,
    cancellationRate: decided === 0 ? 0 : (cancelled.length / decided) * 100,
    // Panier moyen sur la même base que le chiffre d'affaires
    averageBasket: billable.length === 0 ? 0 : revenueTotal / billable.length,
    revenueByMonth,
    bookingsByDay,
    topServices,
    busiestHours,
    loyalClients
  };
}
