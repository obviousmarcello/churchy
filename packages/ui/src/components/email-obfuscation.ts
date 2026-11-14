/**
 * Email obfuscation for public pages (SDD §7.5 *Staff*: "email shown as obfuscated mailto").
 * The address never appears in the server HTML, neither as text nor as a `mailto:` link nor in the
 * serialized client props: the server passes an opaque code (the reversed address, base64), and
 * the client component turns it into a link only after hydration. Addresses are ASCII
 * (`EmailSchema`).
 */

const reverse = (value: string): string => [...value].reverse().join("");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The opaque code of an email address for `ObfuscatedEmail`. */
export function encodeEmail(email: string): string {
  return btoa(reverse(email));
}

/** The address behind a code, or null when the code is not a valid encoded address. */
export function decodeEmail(code: string): string | null {
  try {
    const email = reverse(atob(code));
    return EMAIL.test(email) ? email : null;
  } catch {
    return null;
  }
}

/** `kelemen.ambrus [kukac] pelda [pont] hu` — readable for people, not a parseable address. */
export function spokenEmail(email: string, atWord: string, dotWord: string): string {
  const at = email.lastIndexOf("@");
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${user} [${atWord}] ${domain.split(".").join(` [${dotWord}] `)}`;
}
