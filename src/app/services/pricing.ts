import { PricedService, Promotion, Service } from '../models/booking.model';

/**
 * Règles de remise, côté application.
 *
 * Elles doivent rester le miroir exact de `active_discount()` et
 * `effective_price()` (supabase-promotions.sql). Le prix qui fait foi est
 * toujours celui calculé par la base et figé dans `price_at_booking` : ce qui
 * suit ne sert qu'à annoncer le bon montant avant l'enregistrement.
 */

/**
 * Remise applicable à une prestation, en pourcentage.
 *
 * En cas de promotions qui se chevauchent, c'est la PLUS FORTE qui l'emporte,
 * jamais la somme : additionner pourrait dépasser 100 % et donner un prix
 * négatif, et la règle joue toujours en faveur de la cliente.
 *
 * @param onDate jour du rendez-vous au format YYYY-MM-DD. Omis, les promotions
 *               reçues sont considérées comme déjà filtrées sur la bonne date.
 */
export function bestPromotion(
  promotions: Promotion[],
  serviceId: string,
  onDate?: string
): Promotion | null {
  const applicable = promotions.filter(promotion => {
    if (promotion.active === false) return false;
    if (promotion.service_id !== null && promotion.service_id !== serviceId) return false;
    if (onDate && (onDate < promotion.starts_on || onDate > promotion.ends_on)) return false;
    return true;
  });

  if (!applicable.length) return null;

  return applicable.reduce((best, promotion) =>
    Number(promotion.discount_percent) > Number(best.discount_percent) ? promotion : best
  );
}

/** Prix remisé, arrondi au centime comme le `ROUND(..., 2)` de la base. */
export function applyDiscount(basePrice: number, discountPercent: number): number {
  const base = Number(basePrice) || 0;
  const percent = Number(discountPercent) || 0;
  return Math.round(base * (100 - percent)) / 100;
}

/** Prix d'une prestation, meilleure remise déduite. */
export function priceService(
  service: Service,
  promotions: Promotion[],
  onDate?: string
): PricedService {
  const base = Number(service.price) || 0;
  const promotion = bestPromotion(promotions, service.id, onDate);

  if (!promotion) {
    return { basePrice: base, finalPrice: base, discountPercent: 0, promotionName: null };
  }

  const percent = Number(promotion.discount_percent) || 0;

  return {
    basePrice: base,
    finalPrice: applyDiscount(base, percent),
    discountPercent: percent,
    promotionName: promotion.name
  };
}
