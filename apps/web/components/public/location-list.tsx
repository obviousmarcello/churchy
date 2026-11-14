import type { Location } from "@churchy/contracts";
import { Address, Card } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { LOCATIONS_PATH, toHuAddress } from "@/lib/locations";

/** Cards linking to the location pages (used on the list page and the contact page). */
export async function LocationList({
  locations,
  headingLevel = 2,
}: {
  locations: Location[];
  headingLevel?: 2 | 3;
}) {
  const t = await getT("public.locations");
  if (locations.length === 0) return <p className="text-muted">{t("empty")}</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2" data-testid="location-list">
      {locations.map((location) => (
        <Card
          key={location.id}
          as="li"
          href={`${LOCATIONS_PATH}/${location.slug}`}
          title={location.name}
          headingLevel={headingLevel}
          eyebrow={t(`kind.${location.kind}`)}
        >
          {location.address ? <Address address={toHuAddress(location.address)} /> : null}
        </Card>
      ))}
    </ul>
  );
}
