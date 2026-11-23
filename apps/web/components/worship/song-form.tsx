import { SongRightsStatusSchema, type Hymnal, type Song } from "@churchy/contracts";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import type { FieldDef } from "@/lib/admin/content-form";
import { saveSong } from "@/server/worship-actions";

const RIGHTS_STATUSES = SongRightsStatusSchema.options;

/** The song form of *Új ének* and *Szerkesztés* (music-module song fields, PLAN §11; D-64). */
export async function SongForm({
  song,
  hymnals,
}: {
  song: Song | null;
  hymnals: readonly Hymnal[];
}) {
  const t = await getT("munkater.songs.form");
  const hymnalOptions = hymnals.map((h) => ({
    value: h.id,
    label: `${h.abbreviation} – ${h.name}`,
  }));
  const fields: FieldDef[] = [
    { kind: "text", name: "title", label: t("title"), required: true },
    { kind: "text", name: "artist", label: t("artist") },
    {
      kind: "select",
      name: "hymnal1",
      label: t("hymnal1"),
      placeholder: t("none"),
      options: hymnalOptions,
    },
    { kind: "text", name: "number1", label: t("number1"), help: t("numberHelp") },
    {
      kind: "select",
      name: "hymnal2",
      label: t("hymnal2"),
      placeholder: t("none"),
      options: hymnalOptions,
    },
    { kind: "text", name: "number2", label: t("number2") },
    { kind: "text", name: "tags", label: t("tags"), help: t("listHelp") },
    { kind: "text", name: "authors", label: t("authors") },
    { kind: "text", name: "translator", label: t("translator") },
    { kind: "text", name: "originalTitle", label: t("originalTitle") },
    { kind: "text", name: "songbook", label: t("songbook") },
    { kind: "text", name: "copyright", label: t("copyright") },
    {
      kind: "select",
      name: "rightsStatus",
      label: t("rightsStatus"),
      options: RIGHTS_STATUSES.map((v) => ({ value: v, label: t(`rightsStatuses.${v}`) })),
    },
    { kind: "textarea", name: "rightsNote", label: t("rightsNote"), rows: 3 },
  ];
  const [r1, r2] = song?.hymnalRefs ?? [];
  const values = {
    title: song?.title ?? "",
    artist: song?.artist ?? "",
    hymnal1: r1?.hymnalId ?? "",
    number1: r1?.number ?? "",
    hymnal2: r2?.hymnalId ?? "",
    number2: r2?.number ?? "",
    tags: song?.tags.join(", ") ?? "",
    authors: song?.authors ?? "",
    translator: song?.translator ?? "",
    originalTitle: song?.originalTitle ?? "",
    songbook: song?.songbook ?? "",
    copyright: song?.copyright ?? "",
    rightsStatus: song?.rightsStatus ?? "unknown",
    rightsNote: song?.rightsNote ?? "",
  };
  return (
    <EntityForm
      action={saveSong.bind(null, song?.id ?? "")}
      fields={fields}
      values={values}
      submitLabel={t("save")}
      cancelHref={song ? `/munkater/enektar/${song.id}` : "/munkater/enektar"}
      testId="song-form"
    />
  );
}
