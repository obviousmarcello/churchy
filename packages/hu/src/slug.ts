/**
 * URL slug without diacritics: lower-case ASCII letters and digits separated by single hyphens.
 * Handles the Hungarian long vowels ő/ű (double acute) as well as ö/ü and the acute vowels.
 *
 * @example slugify("Történetünk") // "tortenetunk"
 * @example slugify("Ünnepi miserend") // "unnepi-miserend"
 * @example slugify("Hősök tere, 1.") // "hosok-tere-1"
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
