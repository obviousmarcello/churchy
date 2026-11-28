"use client";

import { useMemo, useState, useTransition } from "react";
import type { HomeSection, ModuleKey } from "@churchy/contracts";
import { themeToCssVars, type ThemeConfig } from "@churchy/themes";
import { Alert, Button, Input, Select, Textarea, cn } from "@churchy/ui";
import { saveHome } from "@/app/admin/megjelenes/actions";
import {
  addSection,
  addableTypes,
  homeProblems,
  moveSection,
  newSectionId,
  removeSection,
  updateSettings,
  type HomeProblem,
  type HomeSectionType,
} from "@/lib/appearance/home-composer";
import { homeBands } from "@/lib/home/sections";
import { useT } from "@/i18n/client";

/**
 * Home composer (FR-107, D-24): add, remove and reorder the sections of the home page (at least ten
 * types), edit their settings, and see the result in a schematic live preview that uses the same
 * band layout as the real page (`homeBands`) in the church's theme. Reordering uses buttons, so it
 * works with keyboard and screen readers.
 */
export function HomeComposer({
  initial,
  modules,
  theme,
}: {
  initial: HomeSection[];
  modules: Partial<Record<ModuleKey, boolean>>;
  theme: ThemeConfig;
}) {
  const t = useT("admin.appearance.home");
  const [sections, setSections] = useState(initial);
  const [toAdd, setToAdd] = useState<HomeSectionType | "">("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; text: string } | null>(
    null,
  );
  const [announce, setAnnounce] = useState("");
  const [pending, start] = useTransition();

  const addable = useMemo(() => addableTypes(sections, modules), [sections, modules]);
  const problems = useMemo(() => homeProblems(sections), [sections]);
  const blocked = Object.keys(problems).length > 0;
  const typeLabel = (type: HomeSectionType) => t(`types.${type}`);

  function move(section: HomeSection, delta: number) {
    const next = moveSection(sections, section.id, delta);
    setSections(next);
    setAnnounce(
      t("moved", {
        name: typeLabel(section.type),
        position: next.findIndex((s) => s.id === section.id) + 1,
        total: next.length,
      }),
    );
  }

  function add() {
    const type = toAdd === "" ? addable[0] : toAdd;
    if (type === undefined) return;
    setSections((current) => addSection(current, type, newSectionId(current, type)));
    setToAdd("");
    setAnnounce(t("added", { name: typeLabel(type) }));
  }

  function submit() {
    setFeedback(null);
    start(async () => {
      const res = await saveHome(sections);
      if (!res.ok) setFeedback({ tone: "danger", text: t("forbidden") });
      else if (res.value.ok) setFeedback({ tone: "success", text: t("saved") });
      else setFeedback({ tone: "danger", text: t("invalid") });
    });
  }

  const set = (id: string, patch: Record<string, unknown>) =>
    setSections((current) => updateSettings(current, id, patch));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <div className="grid gap-6">
        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>
        {sections.length === 0 ? (
          <p className="text-muted" data-testid="home-empty">
            {t("empty")}
          </p>
        ) : (
          <ol className="grid gap-3" data-testid="home-sections" aria-label={t("listLabel")}>
            {sections.map((section, i) => {
              const name = typeLabel(section.type);
              const own = problems[section.id] ?? [];
              return (
                <li
                  key={section.id}
                  data-section-id={section.id}
                  data-section-type={section.type}
                  className="grid gap-3 rounded-md border-2 border-border-strong bg-surface-raised p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-auto font-semibold">
                      <span className="mr-2 text-muted tabular-nums">{i + 1}.</span>
                      {name}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={i === 0}
                      aria-label={t("moveUp", { name })}
                      onClick={() => move(section, -1)}
                    >
                      {t("up")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={i === sections.length - 1}
                      aria-label={t("moveDown", { name })}
                      onClick={() => move(section, 1)}
                    >
                      {t("down")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("remove", { name })}
                      onClick={() => {
                        setSections((current) => removeSection(current, section.id));
                        setAnnounce(t("removed", { name }));
                      }}
                    >
                      {t("removeShort")}
                    </Button>
                  </div>
                  <SectionSettings section={section} problems={own} onChange={set} />
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t("addLabel")}
            wrapperClassName="min-w-56"
            value={toAdd}
            onChange={(e) => setToAdd(e.target.value as HomeSectionType | "")}
            disabled={addable.length === 0}
            placeholder={addable.length === 0 ? t("nothingToAdd") : t("choose")}
            options={addable.map((type) => ({ value: type, label: typeLabel(type) }))}
          />
          <Button variant="secondary" onClick={add} disabled={toAdd === ""}>
            {t("add")}
          </Button>
        </div>

        {feedback ? (
          <Alert tone={feedback.tone} role={feedback.tone === "danger" ? "alert" : "status"}>
            {feedback.text}
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={blocked || pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          {blocked ? <span className="text-fs-2 text-muted">{t("blocked")}</span> : null}
        </div>
      </div>

      <HomePreview sections={sections} theme={theme} />
    </div>
  );
}

function SectionSettings({
  section,
  problems,
  onChange,
}: {
  section: HomeSection;
  problems: readonly HomeProblem[];
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const t = useT("admin.appearance.home");
  const s = section.settings;
  const str = (key: string) => (typeof s[key] === "string" ? (s[key] as string) : "");
  const err = (problem: HomeProblem) =>
    problems.includes(problem) ? t(`problems.${problem}`) : undefined;
  const id = section.id;

  switch (section.type) {
    case "news":
    case "events":
      return (
        <Input
          label={t("count")}
          help={t("countHelp")}
          type="number"
          min={1}
          max={12}
          value={typeof s.count === "number" ? s.count : ""}
          error={err("count")}
          onChange={(e) =>
            onChange(id, { count: e.target.value === "" ? undefined : Number(e.target.value) })
          }
          wrapperClassName="max-w-40"
        />
      );
    case "quote":
      return (
        <div className="grid gap-3">
          <Textarea
            label={t("quoteText")}
            value={str("text")}
            error={err("quoteText")}
            rows={3}
            maxLength={600}
            onChange={(e) => onChange(id, { text: e.target.value })}
          />
          <Input
            label={t("quoteSource")}
            optionalLabel={t("optional")}
            value={str("source")}
            maxLength={120}
            onChange={(e) => onChange(id, { source: e.target.value })}
          />
        </div>
      );
    case "cta":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={t("ctaTitle")}
            optionalLabel={t("optional")}
            value={str("title")}
            maxLength={120}
            onChange={(e) => onChange(id, { title: e.target.value })}
          />
          <Input
            label={t("ctaLabel")}
            value={str("label")}
            error={err("ctaLabel")}
            maxLength={60}
            onChange={(e) => onChange(id, { label: e.target.value })}
          />
          <Input
            label={t("ctaHref")}
            help={t("ctaHrefHelp")}
            value={str("href")}
            error={err("ctaHref")}
            onChange={(e) => onChange(id, { href: e.target.value })}
            wrapperClassName="sm:col-span-2"
          />
          <Textarea
            label={t("ctaText")}
            optionalLabel={t("optional")}
            value={str("text")}
            rows={2}
            maxLength={600}
            onChange={(e) => onChange(id, { text: e.target.value })}
            wrapperClassName="sm:col-span-2"
          />
        </div>
      );
    case "customText":
      return (
        <div className="grid gap-3">
          <Input
            label={t("textTitle")}
            optionalLabel={t("optional")}
            value={str("title")}
            maxLength={120}
            onChange={(e) => onChange(id, { title: e.target.value })}
          />
          <Textarea
            label={t("textBody")}
            help={t("textBodyHelp")}
            value={str("text")}
            error={err("customText")}
            rows={4}
            maxLength={4000}
            onChange={(e) => onChange(id, { text: e.target.value })}
          />
        </div>
      );
    default:
      return <p className="text-fs-2 text-muted">{t(`hints.${section.type}`)}</p>;
  }
}

/** Schematic page: wide sections span the width, column sections follow the two-column layout. */
function HomePreview({
  sections,
  theme,
}: {
  sections: readonly HomeSection[];
  theme: ThemeConfig;
}) {
  const t = useT("admin.appearance.home");
  const bands = useMemo(() => homeBands(sections), [sections]);
  const block =
    "grid min-h-12 place-items-center rounded-md border border-border bg-surface-raised px-3 py-2 text-center text-fs-2 font-semibold";
  return (
    <figure className="m-0 lg:sticky lg:top-6" data-testid="home-preview">
      <figcaption className="mb-2 text-fs-2 font-semibold">{t("previewCaption")}</figcaption>
      <div
        data-theme={theme.themeId}
        style={themeToCssVars(theme)}
        className="grid gap-2 rounded-lg border border-border-strong bg-surface p-3 text-text"
        inert
      >
        {sections.length === 0 ? <span className={block}>{t("previewEmpty")}</span> : null}
        {bands.map((band, i) =>
          band.kind === "wide" ? (
            <span
              key={band.section.id}
              data-preview-section={band.section.type}
              className={cn(
                block,
                band.section.type === "hero" && "min-h-24 bg-inverse text-inverse-text",
              )}
            >
              {t(`types.${band.section.type}`)}
            </span>
          ) : (
            <div key={i} className="grid grid-cols-2 gap-2">
              {[band.left, band.right].map((column, c) => (
                <div key={c} className="grid content-start gap-2">
                  {column.map(({ section }) => (
                    <span
                      key={section.id}
                      data-preview-section={section.type}
                      className={cn(block, "min-h-16")}
                    >
                      {t(`types.${section.type}`)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ),
        )}
      </div>
    </figure>
  );
}
