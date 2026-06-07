export interface Country {
  name: string;
  iso: string;
  dialCode: string;
  // Validation du numéro local (chiffres uniquement, après l'indicatif)
  localDigits?: number | [number, number]; // longueur exacte ou [min, max]
  localPattern?: RegExp;                   // regex prioritaire sur localDigits
}

export function getFlag(iso: string): string {
  return [...iso.toUpperCase()]
    .map(c => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join('');
}

// Retrouve le pays à partir des chiffres complets (sans +), plus long indicatif d'abord
export function getCountryByDigits(digits: string): Country | undefined {
  return COUNTRIES
    .filter(c => digits.startsWith(c.dialCode))
    .sort((a, b) => b.dialCode.length - a.dialCode.length)[0];
}

// Valide le numéro local (sans indicatif) selon les règles du pays
export function isValidLocalNumber(country: Country, localNumber: string): boolean {
  let digits = localNumber.replace(/\D/g, '');
  if (!digits) return false;

  // Tolère un préfixe national « 0 » (ex. 077... ou 06...) que l'on retire
  if (digits.length > 1 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (country.localPattern) return country.localPattern.test(digits);

  if (country.localDigits !== undefined) {
    if (Array.isArray(country.localDigits)) {
      const [min, max] = country.localDigits;
      return digits.length >= min && digits.length <= max;
    }
    return digits.length === country.localDigits;
  }

  // Repli générique
  return digits.length >= 4 && digits.length <= 14;
}

export const COUNTRIES: Country[] = [
  // ── Afrique de l'Ouest ──────────────────────────────────────────
  { name: 'Sénégal',        iso: 'SN', dialCode: '221', localPattern: /^(7[05678]|33)\d{7}$/ },
  { name: 'Bénin',          iso: 'BJ', dialCode: '229', localDigits: 8 },
  { name: 'Burkina Faso',   iso: 'BF', dialCode: '226', localDigits: 8 },
  { name: 'Cap-Vert',       iso: 'CV', dialCode: '238', localDigits: 7 },
  { name: "Côte d'Ivoire",  iso: 'CI', dialCode: '225', localDigits: [8, 10] },
  { name: 'Gambie',         iso: 'GM', dialCode: '220', localDigits: 7 },
  { name: 'Ghana',          iso: 'GH', dialCode: '233', localPattern: /^[235]\d{8}$/ },
  { name: 'Guinée',         iso: 'GN', dialCode: '224', localDigits: 9 },
  { name: 'Guinée-Bissau',  iso: 'GW', dialCode: '245', localDigits: 7 },
  { name: 'Liberia',        iso: 'LR', dialCode: '231', localDigits: [7, 8] },
  { name: 'Mali',           iso: 'ML', dialCode: '223', localDigits: 8 },
  { name: 'Mauritanie',     iso: 'MR', dialCode: '222', localDigits: 8 },
  { name: 'Niger',          iso: 'NE', dialCode: '227', localDigits: 8 },
  { name: 'Nigeria',        iso: 'NG', dialCode: '234', localDigits: [7, 8] },
  { name: 'Sierra Leone',   iso: 'SL', dialCode: '232', localDigits: 8 },
  { name: 'Togo',           iso: 'TG', dialCode: '228', localDigits: 8 },
  // ── Afrique centrale ─────────────────────────────────────────────
  { name: 'Cameroun',             iso: 'CM', dialCode: '237', localPattern: /^[26]\d{7}$/ },
  { name: 'Congo',                iso: 'CG', dialCode: '242', localDigits: 9 },
  { name: 'DR Congo',             iso: 'CD', dialCode: '243', localDigits: 9 },
  { name: 'Gabon',                iso: 'GA', dialCode: '241', localDigits: [7, 8] },
  { name: 'Guinée équatoriale',   iso: 'GQ', dialCode: '240', localDigits: 9 },
  { name: 'Tchad',                iso: 'TD', dialCode: '235', localDigits: 8 },
  // ── Afrique du Nord ───────────────────────────────────────────────
  { name: 'Algérie',  iso: 'DZ', dialCode: '213', localPattern: /^[567]\d{8}$/ },
  { name: 'Égypte',   iso: 'EG', dialCode: '20',  localDigits: [9, 10] },
  { name: 'Libye',    iso: 'LY', dialCode: '218', localDigits: 9 },
  { name: 'Maroc',    iso: 'MA', dialCode: '212', localPattern: /^[5-9]\d{8}$/ },
  { name: 'Soudan',   iso: 'SD', dialCode: '249', localDigits: 9 },
  { name: 'Tunisie',  iso: 'TN', dialCode: '216', localDigits: 8 },
  // ── Afrique de l'Est & Australe ───────────────────────────────────
  { name: 'Afrique du Sud', iso: 'ZA', dialCode: '27',  localPattern: /^[6-8]\d{8}$/ },
  { name: 'Angola',         iso: 'AO', dialCode: '244', localDigits: 9 },
  { name: 'Éthiopie',       iso: 'ET', dialCode: '251', localDigits: 9 },
  { name: 'Kenya',          iso: 'KE', dialCode: '254', localPattern: /^[17]\d{8}$/ },
  { name: 'Madagascar',     iso: 'MG', dialCode: '261', localDigits: 9 },
  { name: 'Mozambique',     iso: 'MZ', dialCode: '258', localDigits: 9 },
  { name: 'Tanzanie',       iso: 'TZ', dialCode: '255', localPattern: /^[67]\d{8}$/ },
  { name: 'Ouganda',        iso: 'UG', dialCode: '256', localDigits: 9 },
  { name: 'Zimbabwe',       iso: 'ZW', dialCode: '263', localDigits: [7, 9] },
  // ── Europe ────────────────────────────────────────────────────────
  { name: 'Allemagne',  iso: 'DE', dialCode: '49',  localDigits: [3, 12] },
  { name: 'Belgique',   iso: 'BE', dialCode: '32',  localDigits: [8, 9] },
  { name: 'Danemark',   iso: 'DK', dialCode: '45',  localDigits: 8 },
  { name: 'Espagne',    iso: 'ES', dialCode: '34',  localPattern: /^[6789]\d{8}$/ },
  { name: 'France',     iso: 'FR', dialCode: '33',  localPattern: /^[1-9]\d{8}$/ },
  { name: 'Grèce',      iso: 'GR', dialCode: '30',  localDigits: 10 },
  { name: 'Irlande',    iso: 'IE', dialCode: '353', localDigits: [7, 9] },
  { name: 'Italie',     iso: 'IT', dialCode: '39',  localDigits: [6, 11] },
  { name: 'Luxembourg', iso: 'LU', dialCode: '352', localDigits: [4, 9] },
  { name: 'Norvège',    iso: 'NO', dialCode: '47',  localDigits: 8 },
  { name: 'Pays-Bas',   iso: 'NL', dialCode: '31',  localDigits: 9 },
  { name: 'Pologne',    iso: 'PL', dialCode: '48',  localDigits: 9 },
  { name: 'Portugal',   iso: 'PT', dialCode: '351', localPattern: /^[279]\d{8}$/ },
  { name: 'Royaume-Uni',iso: 'GB', dialCode: '44',  localDigits: 10 },
  { name: 'Russie',     iso: 'RU', dialCode: '7',   localDigits: 10 },
  { name: 'Suède',      iso: 'SE', dialCode: '46',  localDigits: [7, 9] },
  { name: 'Suisse',     iso: 'CH', dialCode: '41',  localDigits: 9 },
  { name: 'Türkiye',    iso: 'TR', dialCode: '90',  localDigits: 10 },
  // ── Amériques ─────────────────────────────────────────────────────
  { name: 'Argentine', iso: 'AR', dialCode: '54', localDigits: 10 },
  { name: 'Brésil',    iso: 'BR', dialCode: '55', localDigits: [10, 11] },
  { name: 'Canada',    iso: 'CA', dialCode: '1',  localDigits: 10 },
  { name: 'Chili',     iso: 'CL', dialCode: '56', localDigits: 9 },
  { name: 'Colombie',  iso: 'CO', dialCode: '57', localDigits: 10 },
  { name: 'États-Unis',iso: 'US', dialCode: '1',  localDigits: 10 },
  { name: 'Mexique',   iso: 'MX', dialCode: '52', localDigits: 10 },
  // ── Moyen-Orient ──────────────────────────────────────────────────
  { name: 'Arabie Saoudite',     iso: 'SA', dialCode: '966', localDigits: 9 },
  { name: 'Émirats arabes unis', iso: 'AE', dialCode: '971', localDigits: 9 },
  { name: 'Israël',              iso: 'IL', dialCode: '972', localDigits: [8, 9] },
  { name: 'Jordanie',            iso: 'JO', dialCode: '962', localDigits: [8, 9] },
  { name: 'Koweït',              iso: 'KW', dialCode: '965', localDigits: 8 },
  { name: 'Liban',               iso: 'LB', dialCode: '961', localDigits: [7, 8] },
  { name: 'Qatar',               iso: 'QA', dialCode: '974', localDigits: 8 },
  // ── Asie ──────────────────────────────────────────────────────────
  { name: 'Chine',         iso: 'CN', dialCode: '86', localDigits: 11 },
  { name: 'Corée du Sud',  iso: 'KR', dialCode: '82', localDigits: [9, 10] },
  { name: 'Inde',          iso: 'IN', dialCode: '91', localDigits: 10 },
  { name: 'Indonésie',     iso: 'ID', dialCode: '62', localDigits: [9, 12] },
  { name: 'Japon',         iso: 'JP', dialCode: '81', localDigits: [9, 10] },
  { name: 'Pakistan',      iso: 'PK', dialCode: '92', localDigits: 10 },
  // ── Océanie ───────────────────────────────────────────────────────
  { name: 'Australie',       iso: 'AU', dialCode: '61', localDigits: 9 },
  { name: 'Nouvelle-Zélande',iso: 'NZ', dialCode: '64', localDigits: [8, 9] },
];
