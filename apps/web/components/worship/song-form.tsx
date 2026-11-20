import type { Hymnal, Song } from "@churchy/contracts";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import type { FieldDef } from "@/lib/admin/content-form";
import { ALL_KEYS, formatChord } from "@/lib/worship/music";
import { saveSong } from "@/server/worship-actions";

const LICENCES = ["public_domain", "licensed", "permission", "own", "unknown"] as const;

/** The song form of *Új ének* and *Szerkesztés* (D-64 AC1: all FR-803 fields). */
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
    { kind: "text", name: "firstLine", label: t("firstLine") },
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
    {
      kind: "select",
      name: "defaultKey",
      label: t("defaultKey"),
      placeholder: t("none"),
      options: ALL_KEYS.map((k) => ({ value: k, label: formatChord(k, "hu") })),
    },
    { kind: "number", name: "tempoBpm", label: t("tempoBpm") },
    { kind: "text", name: "timeSignature", label: t("timeSignature"), help: t("timeHelp") },
    { kind: "text", name: "themes", label: t("themes"), help: t("listHelp") },
    { kind: "text", name: "seasons", label: t("seasons"), help: t("listHelp") },
    { kind: "text", name: "authors", label: t("authors"), help: t("listHelp") },
    { kind: "text", name: "composers", label: t("composers"), help: t("listHelp") },
    {
      kind: "select",
      name: "licence",
      label: t("licence"),
      options: LICENCES.map((v) => ({ value: v, label: t(`licences.${v}`) })),
    },
    { kind: "textarea", name: "lyrics", label: t("lyrics"), rows: 6 },
    { kind: "textarea", name: "notes", label: t("notes"), rows: 3 },
  ];
  const [r1, r2] = song?.hymnalRefs ?? [];
  const values = {
    title: song?.title ?? "",
    firstLine: song?.firstLine ?? "",
    hymnal1: r1?.hymnalId ?? "",
    number1: r1?.number ?? "",
    hymnal2: r2?.hymnalId ?? "",
    number2: r2?.number ?? "",
    defaultKey: song?.defaultKey ?? "",
    tempoBpm: song?.tempoBpm?.toString() ?? "",
    timeSignature: song?.timeSignature ?? "",
    themes: song?.themes.join(", ") ?? "",
    seasons: song?.seasons.join(", ") ?? "",
    authors: song?.authors.join(", ") ?? "",
    composers: song?.composers.join(", ") ?? "",
    licence: song?.licence ?? "unknown",
    lyrics: song?.lyrics ?? "",
    notes: song?.notes ?? "",
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
