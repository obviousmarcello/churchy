/** Platform hymnal catalog (names/abbreviations only — no songs, PRD §14.1 #7). */
import type { Hymnal } from "@churchy/contracts";

export const HYMNAL_IDS: Record<string, string> = {
  ÉE: "hym-eneklo-egyhaz",
  KÉ: "hym-katolikus-kiseneklo",
  RÉ: "hym-reformatus",
  EÉ: "hym-evangelikus",
  BÉ: "hym-baptista",
};

export const HYMNAL_CATALOG: Hymnal[] = [
  {
    id: "hym-eneklo-egyhaz",
    tenantId: null,
    abbreviation: "ÉE",
    name: "Éneklő Egyház",
    denomination: "rk",
  },
  {
    id: "hym-katolikus-kiseneklo",
    tenantId: null,
    abbreviation: "KÉ",
    name: "Katolikus kiséneklő",
    denomination: "rk",
  },
  {
    id: "hym-reformatus",
    tenantId: null,
    abbreviation: "RÉ",
    name: "Református énekeskönyv",
    denomination: "ref",
  },
  {
    id: "hym-evangelikus",
    tenantId: null,
    abbreviation: "EÉ",
    name: "Evangélikus énekeskönyv",
    denomination: "ev",
  },
  {
    id: "hym-baptista",
    tenantId: null,
    abbreviation: "BÉ",
    name: "Baptista énekeskönyv",
    denomination: "bapt",
  },
];
