import type { Metadata } from "next";
import { LegalPlaceholder, legalMetadata } from "@/components/public/legal-placeholder";
import { LEGAL_PATHS } from "@/lib/footer";

/**
 * *Adatkezelési tájékoztató* (PRD C-02, FR-109): placeholder until it is generated from the
 * church's privacy data. The contact form already links here (D-12).
 */
export function generateMetadata(): Promise<Metadata> {
  return legalMetadata("privacy", LEGAL_PATHS.privacy);
}

export default function PrivacyPage() {
  return <LegalPlaceholder page="privacy" />;
}
