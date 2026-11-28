"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import type { Denomination, ModuleKey, TermForms } from "@churchy/contracts";
import type { TermKey } from "@churchy/presets";
import { Alert, Badge, Button, Input, Select } from "@churchy/ui";
import { changeDenomination, resetTerm, saveTerm } from "@/app/admin/megjelenes/terms-actions";
import { useT } from "@/i18n/client";
import {
  draftFromForms,
  formsFromDraft,
  suggestions,
  termProblem,
  type TermDraft,
} from "@/lib/appearance/terms-editor";

/** One term as the editor shows it. */
export interface TermRow {
  key: TermKey;
  group: "denominational" | "section";
  forms: TermForms;
  /** The wording of the preset, without the church's override. */
  preset: TermForms;
  overridden: boolean;
  /** The term is a URL segment of the public site. */
  routed: boolean;
}

export interface PresetOption {
  key: Denomination;
  name: string;
  beta: boolean;
}

/** The serialisable part of a `PresetDiff` the preview shows. */
export interface DiffView {
  terms: { key: TermKey; from: string; to: string }[];
  modules: { key: ModuleKey; to: boolean }[];
  rites: { added: string[]; removed: string[]; renamed: { from: string; to: string }[] };
  serviceTypes: { added: string[]; removed: string[] };
  calendar: { from: string; to: string } | null;
  redirects: { fromPath: string; toPath: string }[];
  keptOverrides: string[];
}

export interface TermsEditorProps {
  denomination: Denomination;
  presets: PresetOption[];
  diffs: Partial<Record<Denomination, DiffView>>;
  terms: TermRow[];
}

type Feedback = { tone: "success" | "danger" | "info"; text: string } | null;

/**
 * Denomination and terminology (D-23, FR-101, FR-102): pick the preset (with a diff preview of
 * terms, modules and rites before anything changes) and override single terms, with a preview of
 * the labels, headings and URL the new wording produces. Old URLs get a 301 to the new ones.
 */
export function TermsEditor({ denomination, presets, diffs, terms }: TermsEditorProps) {
  return (
    <div className="grid gap-10">
      <DenominationPanel denomination={denomination} presets={presets} diffs={diffs} />
      <TermsPanel terms={terms} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Denomination
// ---------------------------------------------------------------------------------------------

function DenominationPanel({
  denomination,
  presets,
  diffs,
}: Pick<TermsEditorProps, "denomination" | "presets" | "diffs">) {
  const t = useT("admin.appearance.terms.denomination");
  const router = useRouter();
  const [target, setTarget] = useState<Denomination>(denomination);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();
  const diff = target === denomination ? null : (diffs[target] ?? null);
  const current = presets.find((p) => p.key === denomination);
  const targetPreset = presets.find((p) => p.key === target);

  function apply() {
    start(async () => {
      const res = await changeDenomination(target);
      if (!res.ok) setFeedback({ tone: "danger", text: t("forbidden") });
      else if (!res.value.ok) setFeedback({ tone: "danger", text: t("invalid") });
      else {
        setFeedback({ tone: "success", text: t("applied", { name: targetPreset?.name ?? "" }) });
        router.refresh();
      }
    });
  }

  return (
    <section
      aria-labelledby="denomination-heading"
      className="grid max-w-3xl gap-4"
      data-testid="denomination-panel"
    >
      <h3 id="denomination-heading" className="font-heading text-fs-5 font-semibold">
        {t("title")}
      </h3>
      <p className="text-muted">{t("help")}</p>
      <p>
        {t("current")} <strong data-testid="current-denomination">{current?.name}</strong>
        {current?.beta ? (
          <>
            {" "}
            <Badge tone="warning">{t("beta")}</Badge>
          </>
        ) : null}
      </p>
      <Select
        label={t("choose")}
        value={target}
        onChange={(e) => {
          setTarget(e.target.value as Denomination);
          setFeedback(null);
        }}
        options={presets.map((p) => ({
          value: p.key,
          label: p.beta ? `${p.name} (${t("beta")})` : p.name,
        }))}
        data-testid="denomination-select"
      />
      {targetPreset?.beta && target !== denomination ? (
        <Alert tone="warning">
          <p>{t("betaNote")}</p>
        </Alert>
      ) : null}

      {diff ? (
        <div
          className="grid gap-4 rounded-md border-2 border-border p-4"
          data-testid="denomination-diff"
        >
          <h4 className="font-semibold">
            {t("diffTitle", { from: current?.name ?? "", to: targetPreset?.name ?? "" })}
          </h4>
          <DiffList
            title={t("diffTerms")}
            empty={t("none")}
            testId="diff-terms"
            items={diff.terms.map((c) => (
              <li key={c.key}>{t("termChange", { from: c.from, to: c.to })}</li>
            ))}
          />
          <DiffList
            title={t("diffModules")}
            empty={t("none")}
            testId="diff-modules"
            items={diff.modules.map((m) => (
              <li key={m.key}>
                {t(m.to ? "moduleOn" : "moduleOff", { name: t(`modules.${m.key}`) })}
              </li>
            ))}
          />
          <DiffList
            title={t("diffRites")}
            empty={t("none")}
            testId="diff-rites"
            items={[
              ...diff.rites.added.map((r) => <li key={`a-${r}`}>{t("riteAdded", { name: r })}</li>),
              ...diff.rites.removed.map((r) => (
                <li key={`r-${r}`}>{t("riteRemoved", { name: r })}</li>
              )),
              ...diff.rites.renamed.map((r) => (
                <li key={`n-${r.from}`}>{t("riteRenamed", { from: r.from, to: r.to })}</li>
              )),
            ]}
          />
          <DiffList
            title={t("diffServiceTypes")}
            empty={t("none")}
            testId="diff-service-types"
            items={[
              ...diff.serviceTypes.added.map((x) => (
                <li key={`a-${x}`}>{t("riteAdded", { name: x })}</li>
              )),
              ...diff.serviceTypes.removed.map((x) => (
                <li key={`r-${x}`}>{t("riteRemoved", { name: x })}</li>
              )),
            ]}
          />
          {diff.redirects.length > 0 ? (
            <DiffList
              title={t("diffRedirects")}
              empty={t("none")}
              testId="diff-redirects"
              items={diff.redirects.map((r) => (
                <li key={r.fromPath}>
                  <code>{r.fromPath}</code> → <code>{r.toPath}</code>
                </li>
              ))}
            />
          ) : null}
          {diff.keptOverrides.length > 0 ? (
            <p className="text-fs-2 text-muted">
              {t("keptOverrides", { terms: diff.keptOverrides.join(", ") })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={apply} disabled={pending} data-testid="denomination-apply">
              {t("apply", { name: targetPreset?.name ?? "" })}
            </Button>
            <Button variant="ghost" onClick={() => setTarget(denomination)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {feedback ? (
        <div data-testid="denomination-feedback">
          <Alert tone={feedback.tone}>
            <p>{feedback.text}</p>
          </Alert>
        </div>
      ) : null}
    </section>
  );
}

function DiffList({
  title,
  empty,
  testId,
  items,
}: {
  title: string;
  empty: string;
  testId: string;
  items: ReactNode[];
}) {
  return (
    <div data-testid={testId}>
      <h5 className="text-fs-3 font-semibold">{title}</h5>
      {items.length === 0 ? (
        <p className="text-fs-2 text-muted">{empty}</p>
      ) : (
        <ul className="mt-1 grid list-disc gap-1 pl-5 text-fs-2">{items}</ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------------------------

function TermsPanel({ terms }: { terms: TermRow[] }) {
  const t = useT("admin.appearance.terms");
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const row = terms.find((x) => x.key === editing) ?? null;

  return (
    <section aria-labelledby="terms-heading" className="grid gap-4" data-testid="terms-panel">
      <h3 id="terms-heading" className="font-heading text-fs-5 font-semibold">
        {t("title")}
      </h3>
      <p className="max-w-prose text-muted">{t("help")}</p>
      {feedback ? (
        <div data-testid="terms-feedback">
          <Alert tone={feedback.tone}>
            <p>{feedback.text}</p>
          </Alert>
        </div>
      ) : null}

      {(["denominational", "section"] as const).map((group) => (
        <div key={group} className="overflow-x-auto">
          <table
            className="w-full min-w-[34rem] border-collapse text-left"
            data-testid={`terms-${group}`}
          >
            <caption className="py-2 text-left font-semibold">{t(`groups.${group}`)}</caption>
            <thead>
              <tr className="border-b-2 border-border text-fs-2 text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t("columns.term")}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t("columns.wording")}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t("columns.url")}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t("columns.state")}
                </th>
                <th scope="col" className="py-2 font-semibold">
                  <span className="sr-only">{t("columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {terms
                .filter((x) => x.group === group)
                .map((x) => (
                  <tr key={x.key} className="border-b border-border" data-term={x.key}>
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {t(`keys.${x.key}`)}
                    </th>
                    <td className="py-2 pr-3 font-semibold">{x.forms.nom}</td>
                    <td className="py-2 pr-3 text-fs-2 text-muted">
                      {x.routed ? <code>/{x.forms.slug}</code> : "–"}
                    </td>
                    <td className="py-2 pr-3">
                      {x.overridden ? (
                        <Badge tone="info">{t("own")}</Badge>
                      ) : (
                        <span className="text-fs-2 text-muted">{t("preset")}</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(x.key);
                          setFeedback(null);
                        }}
                        aria-label={t("editAria", { term: t(`keys.${x.key}`) })}
                      >
                        {t("edit")}
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}

      {row ? (
        <TermForm
          key={row.key}
          row={row}
          terms={terms}
          onClose={() => setEditing(null)}
          onDone={(text) => {
            setFeedback({ tone: "success", text });
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function TermForm({
  row,
  terms,
  onClose,
  onDone,
}: {
  row: TermRow;
  terms: TermRow[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const t = useT("admin.appearance.terms.form");
  const keyName = useT("admin.appearance.terms.keys");
  const [draft, setDraft] = useState<TermDraft>(() => draftFromForms(row.forms));
  const [slugTouched, setSlugTouched] = useState(false);
  const [articleTouched, setArticleTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const others = useMemo(
    () =>
      Object.fromEntries(terms.filter((x) => x.key !== row.key).map((x) => [x.forms.slug, x.key])),
    [terms, row.key],
  );
  const problem = termProblem(draft, others);
  const forms = formsFromDraft(draft);
  const slugChanged = row.routed && forms.slug !== row.forms.slug;

  function setNom(nom: string) {
    const s = suggestions(nom);
    setDraft((d) => ({
      ...d,
      nom,
      slug: slugTouched || !row.routed ? d.slug : s.slug,
      article: articleTouched ? d.article : s.article,
    }));
  }

  function submit() {
    if (problem) {
      setError(t(`problems.${problem}`));
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveTerm(row.key, forms);
      if (!res.ok) setError(t("forbidden"));
      else if (!res.value.ok)
        setError(t(res.value.error === "slugTaken" ? "problems.slugTaken" : "invalid"));
      else onDone(t("saved"));
    });
  }

  function reset() {
    start(async () => {
      const res = await resetTerm(row.key);
      if (res.ok && res.value.ok) onDone(t("resetDone"));
      else setError(t("forbidden"));
    });
  }

  const term = keyName(row.key);
  return (
    <form
      className="flex flex-col gap-6 rounded-md border-2 border-primary p-4 lg:grid lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      data-testid="term-form"
      aria-labelledby="term-form-heading"
    >
      <h4 id="term-form-heading" className="font-heading text-fs-4 font-semibold lg:col-span-2">
        {t("title", { term })}
      </h4>
      <div className="grid content-start gap-4">
        <Input
          label={t("nom")}
          help={t("nomHelp")}
          value={draft.nom}
          onChange={(e) => setNom(e.target.value)}
          error={error && problem === "nom" ? t("problems.nom") : undefined}
          maxLength={200}
          required
        />
        <Input
          label={t("plural")}
          help={t("pluralHelp")}
          value={draft.plural}
          onChange={(e) => setDraft((d) => ({ ...d, plural: e.target.value }))}
          optionalLabel={t("optional")}
        />
        {row.routed ? (
          <Input
            label={t("slug")}
            help={t("slugHelp")}
            value={draft.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setDraft((d) => ({ ...d, slug: e.target.value }));
            }}
            error={
              error && (problem === "slug" || problem === "slugTaken")
                ? t(`problems.${problem}`)
                : undefined
            }
          />
        ) : null}
        <Select
          label={t("article")}
          help={t("articleHelp")}
          value={draft.article}
          onChange={(e) => {
            setArticleTouched(true);
            setDraft((d) => ({ ...d, article: e.target.value as "a" | "az" }));
          }}
          options={[
            { value: "a", label: t("articleA") },
            { value: "az", label: t("articleAz") },
          ]}
        />
      </div>

      <div className="grid content-start gap-3" data-testid="term-preview">
        <h5 className="font-semibold">{t("previewTitle")}</h5>
        <dl className="grid gap-2 rounded-md bg-surface-sunken p-4 text-fs-3">
          <PreviewRow label={t("previewNav")} value={forms.nom} id="nav" />
          <PreviewRow label={t("previewHeading")} value={forms.nom} id="heading" strong />
          <PreviewRow label={t("previewAdmin")} value={forms.nom} id="admin" />
          <PreviewRow
            label={t("previewSentence")}
            value={t("sentence", { article: forms.article, lower: forms.lower })}
            id="sentence"
          />
          {forms.plural ? (
            <PreviewRow label={t("previewPlural")} value={forms.plural} id="plural" />
          ) : null}
          {row.routed ? (
            <PreviewRow label={t("previewUrl")} value={`/${forms.slug}`} id="url" code />
          ) : null}
        </dl>
        {slugChanged ? (
          <div data-testid="term-redirect-note">
            <Alert tone="info">
              <p>{t("redirectNote", { from: `/${row.forms.slug}`, to: `/${forms.slug}` })}</p>
            </Alert>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="lg:col-span-2" role="alert">
          <Alert tone="danger">
            <p>{error}</p>
          </Alert>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <Button type="submit" disabled={pending} data-testid="term-save">
          {t("save")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        {row.overridden ? (
          <Button variant="secondary" onClick={reset} disabled={pending} data-testid="term-reset">
            {t("reset", { preset: row.preset.nom })}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function PreviewRow({
  label,
  value,
  id,
  strong,
  code,
}: {
  label: string;
  value: string;
  id: string;
  strong?: boolean;
  code?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="min-w-32 text-fs-2 text-muted">{label}</dt>
      <dd className={strong ? "font-heading font-bold" : undefined} data-preview={id}>
        {code ? <code>{value}</code> : value}
      </dd>
    </div>
  );
}
