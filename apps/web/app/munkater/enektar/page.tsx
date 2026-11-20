import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@churchy/policy";
import { Badge, Button, ButtonLink } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { formatChord, type Notation } from "@/lib/worship/music";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import { hymnalRefLabels } from "@/server/worship";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.songs"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

/** *Énektár* (D-64): search by title, first line, hymnal number (*RÉ 42*), theme and season. */
export default async function SongLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspaceModule("ws.worship");
  const [query, env, t] = await Promise.all([searchParams, getMemberEnv(), getT("munkater.songs")]);
  const { repos, ctx, actor, tenantId } = env;
  if (!can(actor, "song.edit", { tenantId })) notFound();
  const q = one(query["q"]);
  const theme = one(query["tema"]);
  const season = one(query["evszak"]);
  const hymnalId = one(query["enekeskonyv"]);
  const notation: Notation = one(query["jeloles"]) === "en" ? "en" : "hu";

  const [all, hymnals] = await Promise.all([repos.songs.search(ctx), repos.songs.listHymnals(ctx)]);
  const songs = (
    await repos.songs.search(ctx, {
      ...(q ? { query: q } : {}),
      ...(theme ? { theme } : {}),
      ...(season ? { season } : {}),
    })
  ).filter((s) => hymnalId === "" || s.hymnalRefs.some((r) => r.hymnalId === hymnalId));
  const themes = [...new Set(all.flatMap((s) => s.themes))].sort((a, b) =>
    a.localeCompare(b, "hu"),
  );
  const seasons = [...new Set(all.flatMap((s) => s.seasons))].sort((a, b) =>
    a.localeCompare(b, "hu"),
  );
  const usedHymnals = hymnals.filter((h) =>
    all.some((s) => s.hymnalRefs.some((r) => r.hymnalId === h.id)),
  );
  const selectClass =
    "min-h-11 rounded-md border-2 border-border-strong bg-surface-raised px-3 text-fs-3";

  return (
    <div className="flex flex-col gap-5" data-testid="song-library">
      <header className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="mt-1 text-fs-4 text-muted">{t("lead", { count: all.length })}</p>
        </div>
        <ButtonLink href="/munkater/enektar/uj" className="ml-auto" data-testid="song-new">
          {t("new")}
        </ButtonLink>
      </header>

      <form
        method="get"
        role="search"
        aria-label={t("search.label")}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex min-w-60 flex-1 flex-col gap-1.5 font-semibold">
          {t("search.query")}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("search.placeholder")}
            className={`${selectClass} font-normal`}
            data-testid="song-search"
          />
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("search.hymnal")}
          <select
            name="enekeskonyv"
            defaultValue={hymnalId}
            className={`${selectClass} font-normal`}
          >
            <option value="">{t("search.any")}</option>
            {usedHymnals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.abbreviation}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("search.theme")}
          <select name="tema" defaultValue={theme} className={`${selectClass} font-normal`}>
            <option value="">{t("search.any")}</option>
            {themes.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("search.season")}
          <select name="evszak" defaultValue={season} className={`${selectClass} font-normal`}>
            <option value="">{t("search.any")}</option>
            {seasons.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-semibold">
          {t("search.notation")}
          <select name="jeloles" defaultValue={notation} className={`${selectClass} font-normal`}>
            <option value="hu">{t("notation.hu")}</option>
            <option value="en">{t("notation.en")}</option>
          </select>
        </label>
        <Button type="submit">{t("search.submit")}</Button>
      </form>

      <p role="status" data-testid="song-count" className="text-muted">
        {t("results", { count: songs.length })}
      </p>
      {songs.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="song-list">
          {songs.map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-border bg-surface-raised p-3"
              data-testid="song-row"
            >
              <Link
                href={`/munkater/enektar/${s.id}?jeloles=${notation}`}
                className="inline-flex min-h-11 items-center font-heading text-fs-5 font-bold text-primary"
              >
                {s.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                {hymnalRefLabels(s, hymnals).map((r) => (
                  <Badge key={r} tone="primary">
                    {r}
                  </Badge>
                ))}
                {s.defaultKey ? <Badge>{formatChord(s.defaultKey, notation)}</Badge> : null}
                {s.themes.map((x) => (
                  <Badge key={x}>{x}</Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="hymnals-heading">
        <h2 id="hymnals-heading" className="font-heading text-fs-5 font-bold">
          {t("hymnals")}
        </h2>
        <p className="text-muted">{t("hymnalsLead")}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {hymnals.map((h) => (
            <li key={h.id}>
              <Badge>{`${h.abbreviation} – ${h.name}`}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
