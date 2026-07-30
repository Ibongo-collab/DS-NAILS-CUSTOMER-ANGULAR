import { CountryCode, isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import { getCountryByDigits } from '../data/countries';

function safeIsValid(candidate: string): boolean {
  try {
    return isValidPhoneNumber(candidate);
  } catch {
    return false;
  }
}

/**
 * Valide un numéro international complet (ex. « +221 77 848 54 51 »).
 *
 * Le point délicat est le zéro initial. Selon les pays il s'agit d'un préfixe
 * interurbain à retirer (France : 06… → +33 6…), ou d'un chiffre qui fait
 * partie intégrante du numéro national (Congo : +242 066 671 384 est valide,
 * +242 66 671 384 ne l'est pas). Impossible de trancher par une règle unique :
 * on laisse libphonenumber-js appliquer les règles propres à chaque pays.
 */
export function isValidPhone(phone: string): boolean {
  if (!phone?.trim()) return false;

  const cleaned = phone.replace(/[\s.\-()]/g, '');
  if (!/^\+\d{6,16}$/.test(cleaned)) return false;

  // 1. Tel quel — couvre les pays où le zéro appartient au numéro national
  if (safeIsValid(cleaned)) return true;

  const digits = cleaned.slice(1);
  const country = getCountryByDigits(digits);
  if (!country) return false;

  const local = digits.slice(country.dialCode.length);
  if (!local) return false;

  // 2. Interprété comme un numéro local du pays choisi : la bibliothèque
  //    applique alors le préfixe interurbain propre à ce pays, s'il en a un
  try {
    const parsed = parsePhoneNumberFromString(local, country.iso as CountryCode);
    if (parsed?.isValid()) return true;
  } catch {
    /* pays inconnu de la bibliothèque : on tente le repli ci-dessous */
  }

  // 3. Repli explicite : retrait du zéro initial
  if (local.startsWith('0')) {
    return safeIsValid('+' + country.dialCode + local.replace(/^0+/, ''));
  }

  return false;
}

// Normalise le numéro : trim uniquement (le composant PhoneInput formate déjà)
export function normalizePhone(phone: string): string {
  return phone.trim();
}

export const PHONE_ERROR_MESSAGE = 'Numéro invalide pour le pays sélectionné. Vérifiez le numéro saisi.';
