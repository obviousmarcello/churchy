import { notFound } from "next/navigation";
import { can } from "@churchy/policy";
import { Badge, Button, ButtonLink } from "@churchy/ui";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import type { FieldDef } from "@/lib/admin/content-form";
import {
  ALL_KEYS,
  KEYS_MAJOR,
  formatChord,
  parseChordPro,
  transposeChordPro,
  type Notation,
} from "@/lib/worship/music";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import { hymnalRefLabels } from "@/server/worship";
import { deleteArrangement, deleteSong, saveArrangement } from "@/server/worship-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.songs"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

/** One song: data, hymnal numbers, arrangements with transposition, capo and H/B notation. */
export default async function SongPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspaceModule("ws.worship");
  const [{ id }, query, env, t] = await Promise.all([
    params,
    searchParams,
    getMemberEnv(),
    getT("munkater.songs"),
  ]);
  const { repos, ctx, actor, tenantId } = env;
  if (!can(actor, "song.edit", { tenantId })) notFound();
  const [song, hymnals, arrangements] = await Promise.all([
    repos.songs.get(ctx, id),
    repos.songs.listHymnals(ctx),
    repos.songs.listArrangements(ctx, id),
  ]);
  if (song === null) notFound();
  const notation: Notation = one(query["jeloles"]) === "en" ? "en" : "hu";
  const target = one(query["hang"]);
  const capo = Math.max(0, Math.min(11, Number(one(query["capo"])) || 0));
  const arrId = one(query["valtozat"]);

  const arrFields: FieldDef[] = [
    { kind: "text", name: "name", label: t("arr.name"), required: true },
    {
      kind: "select",
      name: "key",
      label: t("arr.key"),
      required: true,
      options: ALL_KEYS.map((k) => ({ value: k, label: formatChord(k, "hu") })),
    },
    { kind: "text", name: "structure", label: t("arr.structure") },
    {
      kind: "textarea",
      name: "chordpro",
      label: t("arr.chordpro"),
      help: t("arr.chordproHelp"),
      rows: 6,
    },
  ];
  const meta: [string, string][] = [
    [t("meta.firstLine"), song.firstLine ?? ""],
    [t("meta.authors"), song.authors.join(", ")],
    [t("meta.composers"), song.composers.join(", ")],
    [t("meta.licence"), t(`form.licences.${song.licence}`)],
    [t("meta.key"), song.defaultKey ? formatChord(song.defaultKey, notation) : ""],
    [t("meta.tempo"), song.tempoBpm ? String(song.tempoBpm) : ""],
    [t("meta.time"), song.timeSignature ?? ""],
    [t("meta.seasons"), song.seasons.join(", ")],
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-testid="song-page">
      <ButtonLink href="/munkater/enektar" variant="secondary" size="sm" className="self-start">
        {t("back")}
      </ButtonLink>
      <header className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {song.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {hymnalRefLabels(song, hymnals).map((r) => (
              <Badge key={r} tone="primary">
                {r}
              </Badge>
            ))}
            {song.themes.map((x) => (
              <Badge key={x}>{x}</Badge>
            ))}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <ButtonLink href={`/munkater/enektar/${id}/szerkesztes`} variant="secondary" size="sm">
            {t("edit")}
          </ButtonLink>
          <DeleteButton
            name={song.title}
            onDelete={deleteSong.bind(null, id)}
            redirectTo="/munkater/enektar"
          />
        </div>
      </header>
      <SavedNotice saved={one(query["mentve"]) === "1"} />

      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
        {meta
          .filter(([, v]) => v !== "")
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {song.lyrics ? (
        <section aria-labelledby="lyrics-h">
          <h2 id="lyrics-h" className="font-heading text-fs-5 font-bold">
            {t("lyrics")}
          </h2>
          <p className="whitespace-pre-line">{song.lyrics}</p>
        </section>
      ) : null}

      <section aria-labelledby="arr-h" className="flex flex-col gap-4">
        <h2 id="arr-h" className="font-heading text-fs-5 font-bold">
          {t("arrangements")}
        </h2>
        {arrangements.length === 0 ? <p className="text-muted">{t("noArrangements")}</p> : null}
        {arrangements.map((a) => {
          const active = arrId === a.id || (arrId === "" && a === arrangements[0]);
          const to = active && target !== "" ? target : a.key;
          const shown =
            a.chordpro === null
              ? null
              : transposeChordPro(a.chordpro, a.key, to, active ? capo : 0);
          return (
            <article
              key={a.id}
              className="rounded-md border border-border bg-surface-raised p-3"
              data-testid="arrangement"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{a.name}</h3>
                <Badge>{formatChord(a.key, notation)}</Badge>
                {a.structure ? <span className="text-muted">{a.structure}</span> : null}
                <span className="ml-auto">
                  <DeleteButton name={a.name} onDelete={deleteArrangement.bind(null, a.id)} />
                </span>
              </div>
              {shown !== null ? (
                <>
                  <form
                    method="get"
                    className="mt-3 flex flex-wrap items-end gap-3"
                    data-testid="transpose-form"
                  >
                    <input type="hidden" name="valtozat" value={a.id} />
                    <input type="hidden" name="jeloles" value={notation} />
                    <label className="flex flex-col gap-1 font-semibold">
                      {t("transpose.key")}
                      <select
                        name="hang"
                        defaultValue={active ? to : a.key}
                        className="min-h-11 rounded-md border-2 border-border-strong bg-surface-raised px-3 font-normal"
                      >
                        {[...new Set([a.key, ...KEYS_MAJOR])].map((k) => (
                          <option key={k} value={k}>
                            {formatChord(k, notation)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 font-semibold">
                      {t("transpose.capo")}
                      <select
                        name="capo"
                        defaultValue={active ? String(capo) : "0"}
                        className="min-h-11 rounded-md border-2 border-border-strong bg-surface-raised px-3 font-normal"
                      >
                        {Array.from({ length: 8 }, (_, n) => (
                          <option key={n} value={n}>
                            {n === 0 ? t("transpose.noCapo") : String(n)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button type="submit">{t("transpose.apply")}</Button>
                  </form>
                  {active && capo > 0 ? (
                    <p className="mt-2 font-semibold" data-testid="capo-note">
                      {t("transpose.capoNote", { fret: capo, key: formatChord(to, notation) })}
                    </p>
                  ) : null}
                  <ChordSheet text={shown} notation={notation} />
                </>
              ) : (
                <p className="mt-2 text-muted">{t("noChords")}</p>
              )}
            </article>
          );
        })}
        <div>
          <h3 className="mb-2 font-semibold">{t("arr.add")}</h3>
          <EntityForm
            action={saveArrangement.bind(null, id)}
            fields={arrFields}
            values={{ name: "", key: song.defaultKey ?? "", structure: "", chordpro: "" }}
            submitLabel={t("arr.save")}
            cancelHref={`/munkater/enektar/${id}`}
            testId="arrangement-form"
          />
        </div>
      </section>
    </div>
  );
}

function ChordSheet({ text, notation }: { text: string; notation: Notation }) {
  const lines = parseChordPro(text);
  return (
    <div className="mt-3 overflow-x-auto font-mono" data-testid="chord-sheet">
      {lines.map((line, i) =>
        line.kind === "directive" ? (
          line.name === "title" || line.name === "key" ? (
            <p key={i} className="font-semibold">
              {line.name === "key" ? formatChord(line.value, notation) : line.value}
            </p>
          ) : null
        ) : (
          <p key={i} className="mt-2 flex flex-wrap">
            {line.parts.map((p, j) => (
              <span key={j} className="inline-flex flex-col">
                <span
                  className="h-6 pr-1 font-bold text-primary"
                  aria-hidden={p.chord ? undefined : true}
                >
                  {p.chord ? formatChord(p.chord, notation) : " "}
                </span>
                <span className="whitespace-pre pr-px">{p.text || " "}</span>
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
