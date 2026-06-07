import { isValidPhoneNumber } from 'libphonenumber-js';
import { getCountryByDigits } from '../data/countries';

// Valide un numéro international complet (ex. "+221 77 848 54 51")
// via libphonenumber-js, qui applique les règles exactes de chaque pays.
export function isValidPhone(phone: string): boolean {
  if (!phone?.trim()) return false;

  const cleaned = phone.replace(/\s/g, '');
  if (!/^\+\d{6,16}$/.test(cleaned)) return false;

  // Tolère un préfixe national « 0 » saisi après l'indicatif (ex. FR 06… → +33 6…)
  let candidate = cleaned;
  const digits = cleaned.slice(1);
  const country = getCountryByDigits(digits);
  if (country) {
    const local = digits.slice(country.dialCode.length);
    if (local.startsWith('0')) {
      candidate = '+' + country.dialCode + local.replace(/^0+/, '');
    }
  }

  try {
    return isValidPhoneNumber(candidate);
  } catch {
    return false;
  }
}

// Normalise le numéro : trim uniquement (le composant PhoneInput formate déjà)
export function normalizePhone(phone: string): string {
  return phone.trim();
}

export const PHONE_ERROR_MESSAGE = 'Numéro invalide pour le pays sélectionné. Vérifiez le numéro saisi.';
