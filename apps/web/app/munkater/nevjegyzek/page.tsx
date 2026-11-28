import { Button, Input, Select } from "@churchy/ui";
import { PersonCard } from "@/components/workspace/person-card";
import { getT } from "@/i18n/server";
import { getMemberEnv } from "@/server/workspace";
import { filterDirectory, loadDirectory } from "@/server/workspace-people";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.directory"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

/**
 * *Névjegyzék* (D-51): the people of the church, searchable and filterable by team, position and
 * skill, in Hungarian alphabetical order. Each person's email and phone are shown only to those
 * their visibility setting allows (`lib/workspace/contacts.ts`).
 */
export default async function DirectoryPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filter = {
    q: one(raw["q"]).trim(),
    teamId: one(raw["csapat"]),
    position: one(raw["pozicio"]),
    skill: one(raw["keszseg"]),
  };
  const [env, t] = await Promise.all([getMemberEnv(), getT("munkater.directory")]);
  const data = await loadDirectory(env);
  const rows = filterDirectory(data.entries, filter);
  const filtered = Object.values(filter).some((v) => v !== "");

  return (
    <div className="flex flex-col gap-5" data-testid="workspace-directory">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
      </header>
      <form
        method="get"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        role="search"
        aria-label={t("search")}
      >
        <Input
          name="q"
          type="search"
          label={t("q")}
          defaultValue={filter.q}
          wrapperClassName="sm:col-span-2 lg:col-span-4"
        />
        <Select
          name="csapat"
          label={t("team")}
          placeholder={t("any")}
          defaultValue={filter.teamId}
          options={data.teams.map((x) => ({ value: x.id, label: x.name }))}
        />
        <Select
          name="pozicio"
          label={t("position")}
          placeholder={t("any")}
          defaultValue={filter.position}
          options={data.positionNames.map((n) => ({ value: n, label: n }))}
        />
        <Select
          name="keszseg"
          label={t("skill")}
          placeholder={t("any")}
          defaultValue={filter.skill}
          options={data.skills.map((n) => ({ value: n, label: n }))}
        />
        <div className="flex items-end">
          <Button type="submit">{t("apply")}</Button>
        </div>
      </form>
      <p className="text-fs-2 text-muted" role="status" data-testid="directory-count">
        {t("count", { count: rows.length })}
      </p>
      {rows.length === 0 ? (
        <p>{filtered ? t("emptyFiltered") : t("empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((entry) => (
            <PersonCard
              key={entry.person.id}
              entry={entry}
              labels={{ leader: t("leader"), hiddenContact: t("hiddenContact"), teams: t("teams") }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
