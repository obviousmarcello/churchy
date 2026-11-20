import type { Metadata } from "next";
import { LegalPlaceholder, legalMetadata } from "@/components/public/legal-placeholder";
import { LEGAL_PATHS } from "@/lib/footer";

/** *Impresszum* (PRD C-01, FR-109): placeholder until it is generated from the legal data. */
export function generateMetadata(): Promise<Metadata> {
  return legalMetadata("impresszum", LEGAL_PATHS.impresszum);
}

export default function ImpresszumPage() {
  return <LegalPlaceholder page="impresszum" />;
}
