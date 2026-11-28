import { getT } from "@/i18n/server";
import { whenText } from "@/server/content-admin";
import { PublishPanel, type PublishPanelProps } from "./publish-panel";

/**
 * Server wrapper of the publishing panel (D-20): turns the state and its date into the translated
 * label and detail line ("Megjelenik: 2026. november 20., péntek, 18:00").
 */
export async function PublishSection({
  at,
  ...props
}: Omit<PublishPanelProps, "stateLabel" | "detail"> & {
  /** Date the state refers to: publish date (scheduled, published) or expiry (expired). */
  at?: string | null;
}) {
  const [states, t] = await Promise.all([
    getT("admin.content.states"),
    getT("admin.content.publish"),
  ]);
  const when = at ? whenText(at) : null;
  const detail =
    when === null
      ? undefined
      : props.state === "scheduled"
        ? t("scheduledFor", { when })
        : props.state === "published"
          ? t("publishedOn", { when })
          : props.state === "expired"
            ? t("expiredOn", { when })
            : undefined;
  return <PublishPanel {...props} stateLabel={states(props.state)} detail={detail} />;
}
