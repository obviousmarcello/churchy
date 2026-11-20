import { describe, expect, it } from "vitest";
import {
  bankAccountToIban,
  formatAddress,
  formatBankAccount,
  formatIban,
  formatPersonName,
  formatPhone,
  ibanToBankAccount,
  isValidBankAccount,
  isValidIban,
  isValidPhone,
  normalizeBankAccount,
  normalizePhone,
  parsePhone,
  phoneToE164,
  slugify,
} from "./index";

describe("formatPersonName", () => {
  it("puts the family name first", () => {
    expect(formatPersonName({ familyName: "Kovács", givenName: "János" })).toBe("Kovács János");
  });

  it("adds prefix titles", () => {
    expect(formatPersonName({ prefix: "dr.", familyName: "Kovács", givenName: "János" })).toBe(
      "dr. Kovács János",
    );
    expect(formatPersonName({ prefix: "P.", familyName: "Nagy", givenName: "Tamás" })).toBe(
      "P. Nagy Tamás",
    );
    expect(formatPersonName({ prefix: "Fr.", familyName: "Szabó", givenName: "Péter" })).toBe(
      "Fr. Szabó Péter",
    );
  });

  it("adds suffixes", () => {
    expect(
      formatPersonName({ prefix: "dr.", familyName: "Tóth", givenName: "Anna", suffix: "PhD" }),
    ).toBe("dr. Tóth Anna PhD");
  });

  it("can omit titles for sort keys", () => {
    expect(
      formatPersonName(
        { prefix: "dr.", familyName: "Tóth", givenName: "Anna", suffix: "PhD" },
        { titles: false },
      ),
    ).toBe("Tóth Anna");
  });

  it("normalises whitespace and tolerates missing parts", () => {
    expect(formatPersonName({ familyName: "  Nagy  ", givenName: "  Mária   Zsuzsanna " })).toBe(
      "Nagy Mária Zsuzsanna",
    );
    expect(formatPersonName({ familyName: "Kovács", prefix: "  ", givenName: "" })).toBe("Kovács");
  });
});

describe("formatAddress", () => {
  it("uses Hungarian order", () => {
    expect(
      formatAddress({ postalCode: "1011", city: "Budapest", street: "Fő utca", houseNumber: "1" }),
    ).toBe("1011 Budapest, Fő utca 1.");
  });

  it("does not double the period after the house number", () => {
    expect(
      formatAddress({
        postalCode: "4026",
        city: "Debrecen",
        street: "Piac utca",
        houseNumber: "12/A.",
      }),
    ).toBe("4026 Debrecen, Piac utca 12/A.");
    expect(
      formatAddress({
        postalCode: "4026",
        city: "Debrecen",
        street: "Piac utca",
        houseNumber: "12/A",
      }),
    ).toBe("4026 Debrecen, Piac utca 12/A.");
    expect(
      formatAddress({
        postalCode: "7621",
        city: "Pécs",
        street: "Széchenyi tér",
        houseNumber: "1-3",
      }),
    ).toBe("7621 Pécs, Széchenyi tér 1-3.");
  });

  it("appends floor/door details", () => {
    expect(
      formatAddress({
        postalCode: "1052",
        city: "Budapest",
        street: "Váci utca",
        houseNumber: "5",
        details: "2. em. 4.",
      }),
    ).toBe("1052 Budapest, Váci utca 5. 2. em. 4.");
  });

  it("copes with missing pieces", () => {
    expect(formatAddress({ city: "Eger" })).toBe("Eger");
    expect(formatAddress({ postalCode: "3300", city: "Eger" })).toBe("3300 Eger");
    expect(formatAddress({ postalCode: "3300", city: "Eger", street: "Dobó tér" })).toBe(
      "3300 Eger, Dobó tér",
    );
    expect(formatAddress({ city: " ", street: "Fő utca", houseNumber: "hrsz. 12" })).toBe(
      "Fő utca hrsz. 12",
    );
  });
});

describe("phone numbers", () => {
  it.each([
    ["06 30 1234567", "+36 30 123 4567"],
    ["+36301234567", "+36 30 123 4567"],
    ["0036 30 123 4567", "+36 30 123 4567"],
    ["36301234567", "+36 30 123 4567"],
    ["+36 (30) 123-4567", "+36 30 123 4567"],
    ["06-30/123-4567", "+36 30 123 4567"],
    ["06 20 987 6543", "+36 20 987 6543"],
    ["06 31 987 6543", "+36 31 987 6543"],
    ["06 50 987 6543", "+36 50 987 6543"],
    ["06 70 987 6543", "+36 70 987 6543"],
    ["06 1 234 5678", "+36 1 234 5678"],
    ["+3612345678", "+36 1 234 5678"],
    ["(06 1) 234-5678", "+36 1 234 5678"],
    ["06 22 123 456", "+36 22 123 456"],
    ["+36 52 123456", "+36 52 123 456"],
    ["06 80 123 456", "+36 80 123 456"],
  ])("normalises %j to %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
    expect(formatPhone(input)).toBe(expected);
    expect(isValidPhone(input)).toBe(true);
  });

  it.each([
    "",
    "123",
    "+44 20 7946 0958",
    "06 30 123456", // mobile too short
    "06 30 12345678", // mobile too long
    "06 1 234567", // Budapest too short
    "06 22 1234567", // landline too long
    "06 20 12345", // mobile prefix but 8 digits
    "06 0 1234567",
    "+36 30 abc 4567",
    "0030 1234567",
  ])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
    expect(isValidPhone(input)).toBe(false);
    expect(phoneToE164(input)).toBeNull();
  });

  it("leaves unparseable numbers as entered", () => {
    expect(formatPhone("  +44 20 7946 0958 ")).toBe("+44 20 7946 0958");
  });

  it("parses into parts", () => {
    expect(parsePhone("06 30 1234567")).toEqual({
      kind: "mobile",
      areaCode: "30",
      subscriber: "1234567",
    });
    expect(parsePhone("06 1 2345678")).toEqual({
      kind: "budapest",
      areaCode: "1",
      subscriber: "2345678",
    });
    expect(parsePhone("06 22 123456")).toEqual({
      kind: "landline",
      areaCode: "22",
      subscriber: "123456",
    });
  });

  it("produces E.164", () => {
    expect(phoneToE164("06 30 123 4567")).toBe("+36301234567");
    expect(phoneToE164("+36 1 234 5678")).toBe("+3612345678");
  });
});

describe("bank accounts", () => {
  it("formats 24-digit accounts as 8-8-8", () => {
    expect(normalizeBankAccount("117730161111101800000000")).toBe("11773016-11111018-00000000");
    expect(normalizeBankAccount("11773016 11111018 00000000")).toBe("11773016-11111018-00000000");
    expect(normalizeBankAccount("11773016-11111018-00000000")).toBe("11773016-11111018-00000000");
  });

  it("formats 16-digit accounts as 8-8", () => {
    expect(normalizeBankAccount("1177301611111018")).toBe("11773016-11111018");
    expect(normalizeBankAccount("11773016 11111018")).toBe("11773016-11111018");
  });

  it.each([
    "",
    "1177301",
    "11773016-1111101",
    "117730161111101800000",
    "1177301611111018000000000",
    "1177301a-11111018",
  ])("rejects %j", (input) => {
    expect(normalizeBankAccount(input)).toBeNull();
    expect(isValidBankAccount(input)).toBe(false);
  });

  it("formatBankAccount falls back to the trimmed input", () => {
    expect(formatBankAccount("11773016 11111018")).toBe("11773016-11111018");
    expect(formatBankAccount(" nincs ")).toBe("nincs");
    expect(isValidBankAccount("11773016-11111018")).toBe(true);
  });

  it("validates and groups IBANs", () => {
    expect(isValidIban("HU42117730161111101800000000")).toBe(true);
    expect(isValidIban("hu42 1177 3016 1111 1018 0000 0000")).toBe(true);
    expect(isValidIban("HU43117730161111101800000000")).toBe(false); // wrong checksum
    expect(isValidIban("HU4211773016111110180000000")).toBe(false); // wrong length
    expect(isValidIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(isValidIban("not an iban")).toBe(false);
    expect(formatIban("HU42117730161111101800000000")).toBe("HU42 1177 3016 1111 1018 0000 0000");
    expect(formatIban("GB82WEST12345698765432")).toBe("GB82 WEST 1234 5698 7654 32");
    expect(formatIban("HU00")).toBeNull();
  });

  it("converts between IBAN and account number", () => {
    expect(ibanToBankAccount("HU42 1177 3016 1111 1018 0000 0000")).toBe(
      "11773016-11111018-00000000",
    );
    expect(ibanToBankAccount("GB82WEST12345698765432")).toBeNull();
    expect(ibanToBankAccount("HU43117730161111101800000000")).toBeNull();
    expect(formatBankAccount("HU42 1177 3016 1111 1018 0000 0000")).toBe(
      "11773016-11111018-00000000",
    );
    expect(bankAccountToIban("11773016-11111018-00000000")).toBe(
      "HU42 1177 3016 1111 1018 0000 0000",
    );
    expect(bankAccountToIban("11773016-11111018")).toBe("HU42 1177 3016 1111 1018 0000 0000");
    expect(bankAccountToIban("123")).toBeNull();
  });
});

describe("slugify", () => {
  it.each([
    ["Történetünk", "tortenetunk"],
    ["Ünnepi miserend", "unnepi-miserend"],
    ["Őrangyalok ŰR", "orangyalok-ur"],
    ["ő ű Ő Ű", "o-u-o-u"],
    ["Árvíztűrő tükörfúrógép", "arvizturo-tukorfurogep"],
    ["ÁÉÍÓÖŐÚÜŰ áéíóöőúüű", "aeiooouuu-aeiooouuu"],
    ["Hősök tere, 1.", "hosok-tere-1"],
    ["  --Hírek & események!  ", "hirek-esemenyek"],
    ["miserend", "miserend"],
    ["Straße", "strasse"],
    ["!!!", ""],
    ["", ""],
  ])("slugifies %j to %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("is idempotent", () => {
    expect(slugify(slugify("Ünnepi miserend"))).toBe("unnepi-miserend");
  });
});
