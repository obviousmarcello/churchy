import type { Location } from "@churchy/contracts";
import { getT } from "@/i18n/server";
import { osmPlaceUrl, routePlanningUrl } from "@/lib/locations";

const FEATURES = ["wheelchair", "accessibleToilet", "hearingLoop", "parking"] as const;

/** Route-planning deep link (+ OSM link) — plain links, no third-party script (D-12 AC1). */
export async function RouteLinks({ location }: { location: Pick<Location, "geo" | "address"> }) {
  const t = await getT("public.map");
  const route = routePlanningUrl(location);
  if (route === null) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <a
        href={route}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-(--control-h-md) items-center rounded-md border-2 border-primary bg-primary px-(--control-px) font-semibold text-primary-contrast hover:bg-primary-hover"
        data-testid="route-link"
      >
        {t("route")}
        <span className="sr-only"> ({t("routeHint")})</span>
      </a>
      {location.geo ? (
        <a
          href={osmPlaceUrl(location.geo)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary underline"
        >
          {t("openOsm")}
        </a>
      ) : null}
    </p>
  );
}

/** Accessibility facts of a location, each stated in words (never by an icon alone). */
export async function AccessibilityInfo({ accessibility }: Pick<Location, "accessibility">) {
  const t = await getT("public.locations.accessibility");
  return (
    <div className="grid gap-3" data-testid="accessibility">
      <ul className="grid gap-2 sm:grid-cols-2">
        {FEATURES.map((feature) => {
          const available = accessibility[feature];
          return (
            <li
              key={feature}
              data-feature={feature}
              data-available={available}
              className="flex items-center gap-2 text-fs-3"
            >
              {available ? (
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="size-5 shrink-0 fill-none stroke-success stroke-[2.5]"
                >
                  <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-block size-5 shrink-0 text-center text-muted"
                >
                  –
                </span>
              )}
              <span>
                {t(feature)}: <strong>{available ? t("available") : t("unavailable")}</strong>
              </span>
            </li>
          );
        })}
      </ul>
      {accessibility.note ? <p className="text-fs-3">{accessibility.note}</p> : null}
    </div>
  );
}
