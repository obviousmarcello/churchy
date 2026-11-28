import type { ExtractedPage, TextBlock } from "./extract";
import { findPatterns } from "./extract";

/**
 * Personal-data stripping before anything leaves the extractor (to the model or into a draft):
 * only institutional contact data (office e-mail / phone) is kept; e-mails and phone numbers of
 * private individuals, health and pastoral content, and name lists (members, baptisms, funerals)
 * are removed. Deterministic and conservative (a false positive drops a paragraph the church can
 * re-add; a false negative would publish personal data). The model is told the same rules, this is
 * the guarantee.
 */

/** Local parts that name an office, not a person. */
const GENERIC_LOCAL =
  /^(info|iroda|irodavezeto|plebania|parokia|lelkeszi\.?hivatal|lelkesz|titkarsag|titkar|hivatal|kapcsolat|contact|office|egyhaz|gyulekezet|templom|hirek|news|webmester|web|admin|ugyfelszolgalat|adomany|penztar|hittan|ifjusag|karitasz|kor|korus|zene)$/i;

const OFFICE_PHONE_LABEL =
  /(iroda|plébánia|plebánia|lelkészi hivatal|hivatal|titkárság|ügyfélfogadás|központ|templom|gyülekezet|egyházközség)/i;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function isOfficeEmail(email: string): boolean {
  return GENERIC_LOCAL.test(fold(email.split("@")[0] ?? ""));
}

const digits = (s: string) => s.replace(/\D/g, "");

export interface OfficeContacts {
  readonly emails: ReadonlySet<string>;
  /** Digits only, e.g. `36301234567` → compared by suffix. */
  readonly phones: ReadonlySet<string>;
  /** The phone numbers as written on the site (first found first), for the contact fact. */
  readonly phoneTexts: readonly string[];
}

function schemaContacts(jsonLd: readonly Record<string, unknown>[]): {
  emails: string[];
  phones: string[];
} {
  const emails: string[] = [];
  const phones: string[] = [];
  const org = /Organization|Church|PlaceOfWorship|LocalBusiness|Place/i;
  for (const item of jsonLd) {
    const type = String(
      Array.isArray(item["@type"]) ? item["@type"].join(" ") : (item["@type"] ?? ""),
    );
    if (!org.test(type)) continue;
    if (typeof item.email === "string")
      emails.push(item.email.replace(/^mailto:/i, "").toLowerCase());
    if (typeof item.telephone === "string") phones.push(item.telephone);
  }
  return { emails, phones };
}

/** The institutional contacts of a whole crawl: generic mailboxes, structured data, labelled phones. */
export function officeContactsOf(pages: readonly ExtractedPage[]): OfficeContacts {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const phoneTexts: string[] = [];
  for (const page of pages) {
    for (const e of page.emails) if (isOfficeEmail(e)) emails.add(e);
    const ld = schemaContacts(page.jsonLd);
    for (const e of ld.emails) emails.add(e);
    for (const p of ld.phones) {
      phones.add(digits(p));
      phoneTexts.push(p);
    }
    for (const b of page.blocks) {
      const texts = b.type === "list" ? b.items : b.type === "paragraph" ? [b.text] : [];
      for (const t of texts) {
        if (!OFFICE_PHONE_LABEL.test(t)) continue;
        // A line that also names a person-like role ("Kovács atya: ...") is not an office line.
        for (const p of findPatterns(t).phones) {
          phones.add(digits(p));
          phoneTexts.push(p);
        }
      }
    }
  }
  return { emails, phones, phoneTexts };
}

const isOfficePhone = (phone: string, office: OfficeContacts): boolean => {
  const d = digits(phone);
  const tail = d.slice(-8);
  return [...office.phones].some((o) => o.length >= 8 && o.slice(-8) === tail);
};

const EMAIL_G = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_G = /(?<![\d])(?:\+36|06)[\s\-/().]*\d{1,2}[\s\-/().]*\d{3}[\s\-.]*\d{3,4}(?![\d])/g;

/** Keeps office contacts, removes every other e-mail and phone number from a text. */
export function scrubText(text: string, office: OfficeContacts): { text: string; removed: number } {
  let removed = 0;
  let out = text.replace(EMAIL_G, (e) => {
    if (office.emails.has(e.toLowerCase())) return e;
    removed++;
    return "";
  });
  out = out.replace(PHONE_G, (p) => {
    if (isOfficePhone(p, office)) return p;
    removed++;
    return "";
  });
  return {
    text: out
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .trim(),
    removed,
  };
}

// Personal health and bereavement content (prayer requests, obituaries). General information about
// rites (funerals, confession times, the sacrament of the sick) is institutional and stays.
const SENSITIVE =
  /(súlyos(an)? beteg|műtét|kórház|gyógyulás(áért|ukért|áról)|kemoterápi|daganat|diagnózis|hospice|elhunyt|elhalálozott|meghalt|megh[aá]lt|elhunytak|gyászol|örök nyugalmat|nyugodjék békében|gyászhír)/i;
const NAME_EVENT_LIST =
  /^(megkeresztelkedett|megkeresztelték|keresztelő:|házasságot kötött|házasságot kötöttek|esküvő:|névnap|születésnap|szülinap|jubilálók|elhunytak?:)/i;
const PERSON_LIST_HEADING =
  /(tagjai|tagok névsora|névsor|jelentkezők|résztvevők|névnaposok|születésnaposok|keresztelések|házasságkötések|elhunytak|gyászhírek|imakérések)/i;

export interface ScrubStats {
  readonly paragraphsDropped: number;
  readonly contactsRemoved: number;
}

export function scrubBlocks(
  blocks: readonly TextBlock[],
  office: OfficeContacts,
): { blocks: TextBlock[]; stats: ScrubStats } {
  const out: TextBlock[] = [];
  let paragraphsDropped = 0;
  let contactsRemoved = 0;
  let dropLevel: number | null = null; // inside a person-list section until a heading of this level or higher
  for (const b of blocks) {
    if (b.type === "heading") {
      if (dropLevel !== null && b.level <= dropLevel) dropLevel = null;
      if (PERSON_LIST_HEADING.test(b.text)) {
        dropLevel = b.level;
        paragraphsDropped++;
        continue;
      }
    }
    if (dropLevel !== null) {
      paragraphsDropped++;
      continue;
    }
    if (b.type === "image") {
      out.push(b);
      continue;
    }
    const texts = b.type === "list" ? b.items : [b.text];
    if (texts.some((t) => SENSITIVE.test(t) || NAME_EVENT_LIST.test(t.trim()))) {
      paragraphsDropped++;
      continue;
    }
    const cleaned = texts.map((t) => scrubText(t, office));
    contactsRemoved += cleaned.reduce((n, c) => n + c.removed, 0);
    if (b.type === "list") {
      const items = cleaned.map((c) => c.text).filter(Boolean);
      if (items.length) out.push({ type: "list", items });
    } else if (cleaned[0]!.text) {
      out.push({ ...b, text: cleaned[0]!.text });
    }
  }
  return { blocks: out, stats: { paragraphsDropped, contactsRemoved } };
}
