"use client";

import type { ReactNode } from "react";
import { DENOMINATIONS, getPreset, isBeta } from "@churchy/presets";
import { weekdayName } from "@churchy/hu";
import { THEME_IDS } from "@churchy/themes";
import { Alert, Badge, Button, Checkbox, Input, Select, TimeInput } from "@churchy/ui";
import type { Denomination } from "@churchy/contracts";
import { ColorField } from "@/components/appearance/branding-form";
import { useT } from "@/i18n/client";
import { checkColors, selectTheme } from "@/lib/appearance/branding";
import {
  EDITABLE_TERMS,
  draftConfig,
  flaggedKeys,
  isFlagged,
  markReviewed,
  reviewProblems,
  type DraftLocation,
  type DraftServiceTime,
  type SetupDraft,
} from "@/lib/setup/draft";
import { DraftPreview } from "./draft-preview";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Step 2: the draft site next to an editable summary of what the importer found. */
export function ReviewStep({
  draft,
  onChange,
  onBack,
  onNext,
}: {
  draft: SetupDraft;
  onChange: (draft: SetupDraft) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useT("admin.setup.review");
  const flagged = flaggedKeys(draft);
  const problems = reviewProblems(draft);
  const config = draftConfig(draft);

  /** Edit helper: applies `patch` and marks the item as checked. */
  const edit = (key: string | null, patch: Partial<SetupDraft>) =>
    onChange(key === null ? { ...draft, ...patch } : markReviewed({ ...draft, ...patch }, key));

  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-fs-4 text-muted">{t("lead")}</p>

      {flagged.length > 0 ? (
        <Alert tone="warning" title={t("flagged.title", { count: flagged.length })}>
          <p data-testid="flagged-summary">{t("flagged.body")}</p>
        </Alert>
      ) : (
        <Alert tone="success" title={t("flagged.noneTitle")} />
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <div className="grid gap-8">
          <Section title={t("sections.basics")}>
            <Item id="name" draft={draft} onChange={onChange}>
              <Input
                label={t("name")}
                value={draft.name}
                maxLength={200}
                required
                onChange={(e) => edit("name", { name: e.target.value })}
              />
            </Item>
            <Item id="shortName" draft={draft} onChange={onChange}>
              <Input
                label={t("shortName")}
                help={t("shortNameHelp")}
                value={draft.shortName}
                maxLength={100}
                required
                onChange={(e) => edit("shortName", { shortName: e.target.value })}
              />
            </Item>
            <Item id="tagline" draft={draft} onChange={onChange}>
              <Input
                label={t("tagline")}
                optionalLabel={t("optional")}
                value={draft.tagline}
                maxLength={200}
                onChange={(e) => edit("tagline", { tagline: e.target.value })}
              />
            </Item>
          </Section>

          <Section title={t("sections.preset")} lead={t("presetLead")}>
            <Item id="denomination" draft={draft} onChange={onChange}>
              <Select
                label={t("denomination")}
                help={isBeta(draft.denomination) ? t("betaHelp") : undefined}
                value={draft.denomination}
                options={DENOMINATIONS.map((d) => ({ value: d, label: getPreset(d).name }))}
                onChange={(e) =>
                  edit("denomination", { denomination: e.target.value as Denomination })
                }
              />
            </Item>
            {EDITABLE_TERMS.map((key) => (
              <Item key={key} id={`term:${key}`} draft={draft} onChange={onChange}>
                <Input
                  label={t(`terms.${key}`)}
                  help={t("termHelp")}
                  value={draft.termOverrides[key] ?? config.terminology[key].nom}
                  maxLength={100}
                  onChange={(e) =>
                    edit(`term:${key}`, {
                      termOverrides: { ...draft.termOverrides, [key]: e.target.value },
                    })
                  }
                />
              </Item>
            ))}
          </Section>

          <Section title={t("sections.services")}>
            <ul className="grid gap-4" data-testid="service-rows">
              {draft.serviceTimes.map((s) => (
                <li key={s.id}>
                  <Item id={`serviceTime:${s.id}`} draft={draft} onChange={onChange}>
                    <ServiceRow
                      row={s}
                      draft={draft}
                      onEdit={(next) =>
                        edit(`serviceTime:${s.id}`, {
                          serviceTimes: draft.serviceTimes.map((x) => (x.id === s.id ? next : x)),
                        })
                      }
                      onRemove={() =>
                        edit(null, {
                          serviceTimes: draft.serviceTimes.filter((x) => x.id !== s.id),
                        })
                      }
                    />
                  </Item>
                </li>
              ))}
            </ul>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  edit(null, {
                    serviceTimes: [
                      ...draft.serviceTimes,
                      {
                        id: `st-new-${draft.serviceTimes.length + 1}`,
                        label: "",
                        weekday: 7,
                        time: "10:00",
                        locationId: null,
                      },
                    ],
                  })
                }
              >
                {t("addService")}
              </Button>
            </div>
          </Section>

          <Section title={t("sections.locations")}>
            <ul className="grid gap-4" data-testid="location-rows">
              {draft.locations.map((l) => (
                <li key={l.id}>
                  <Item id={`location:${l.id}`} draft={draft} onChange={onChange}>
                    <LocationRow
                      row={l}
                      onEdit={(next) =>
                        edit(`location:${l.id}`, {
                          locations: draft.locations.map((x) => (x.id === l.id ? next : x)),
                        })
                      }
                      onRemove={() =>
                        edit(null, {
                          locations: draft.locations.filter((x) => x.id !== l.id),
                          serviceTimes: draft.serviceTimes.map((s) =>
                            s.locationId === l.id ? { ...s, locationId: null } : s,
                          ),
                        })
                      }
                    />
                  </Item>
                </li>
              ))}
            </ul>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  edit(null, {
                    locations: [
                      ...draft.locations,
                      {
                        id: `loc-new-${draft.locations.length + 1}`,
                        name: "",
                        postalCode: "",
                        city: "",
                        line1: "",
                      },
                    ],
                  })
                }
              >
                {t("addLocation")}
              </Button>
            </div>
          </Section>

          <Section title={t("sections.contact")}>
            <Item id="email" draft={draft} onChange={onChange}>
              <Input
                label={t("email")}
                type="email"
                value={draft.email}
                onChange={(e) => edit("email", { email: e.target.value })}
              />
            </Item>
            <Item id="phone" draft={draft} onChange={onChange}>
              <Input
                label={t("phone")}
                type="tel"
                value={draft.phone}
                onChange={(e) => edit("phone", { phone: e.target.value })}
              />
            </Item>
          </Section>

          <Section title={t("sections.theme")}>
            <ThemeEditor draft={draft} onChange={onChange} />
          </Section>

          <Section title={t("sections.staff")} lead={t("staffLead")}>
            <ul className="grid gap-4" data-testid="staff-rows">
              {draft.staff.map((p) => (
                <li
                  key={p.id}
                  data-person={p.id}
                  className="grid gap-1 rounded-md border border-border bg-surface-raised p-3"
                >
                  <p className="font-semibold">
                    {p.name} <span className="font-normal text-muted">· {p.role}</span>
                  </p>
                  <Checkbox
                    label={t("staffInclude")}
                    checked={p.include}
                    onChange={(e) =>
                      edit(null, {
                        staff: draft.staff.map((x) =>
                          x.id === p.id
                            ? {
                                ...x,
                                include: e.target.checked,
                                photo: e.target.checked && x.photo,
                                consent: e.target.checked && x.consent,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                  {p.include && p.hasPhoto ? (
                    <Checkbox
                      label={t("staffPhoto")}
                      checked={p.photo}
                      onChange={(e) =>
                        edit(null, {
                          staff: draft.staff.map((x) =>
                            x.id === p.id ? { ...x, photo: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                  ) : null}
                  {p.include ? (
                    <Checkbox
                      label={t("staffConsent", { name: p.name })}
                      checked={p.consent}
                      required
                      error={p.consent ? undefined : t("staffConsentMissing")}
                      onChange={(e) =>
                        edit(null, {
                          staff: draft.staff.map((x) =>
                            x.id === p.id ? { ...x, consent: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="lg:sticky lg:top-6">
          <DraftPreview draft={draft} />
        </div>
      </div>

      {problems.length > 0 ? (
        <Alert tone="danger" title={t("problems.title")} role="status">
          <ul className="list-disc pl-6">
            {problems.map((p) => (
              <li key={p}>{t(`problems.${p as "name"}`)}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
        <Button disabled={problems.length > 0} onClick={onNext} data-testid="review-next">
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-1 font-heading text-fs-5 font-semibold">{title}</legend>
      {lead ? <p className="max-w-prose text-muted">{lead}</p> : null}
      {children}
    </fieldset>
  );
}

/** Wraps an editable item; while the importer was unsure and the owner has not checked it, it is flagged. */
function Item({
  id,
  draft,
  onChange,
  children,
}: {
  id: string;
  draft: SetupDraft;
  onChange: (draft: SetupDraft) => void;
  children: ReactNode;
}) {
  const t = useT("admin.setup.review.flag");
  const flagged = isFlagged(draft, id);
  if (!flagged) return <div data-review-item={id}>{children}</div>;
  const percent = Math.round((draft.confidence[id] ?? 0) * 100);
  return (
    <div
      data-review-item={id}
      data-flagged="true"
      className="grid gap-2 rounded-md border-2 border-warning bg-warning-soft p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="warning">{t("badge")}</Badge>
        <span className="text-fs-2">{t("text", { percent })}</span>
        <Button variant="secondary" size="sm" onClick={() => onChange(markReviewed(draft, id))}>
          {t("confirm")}
        </Button>
      </div>
      {children}
    </div>
  );
}

function ServiceRow({
  row,
  draft,
  onEdit,
  onRemove,
}: {
  row: DraftServiceTime;
  draft: SetupDraft;
  onEdit: (row: DraftServiceTime) => void;
  onRemove: () => void;
}) {
  const t = useT("admin.setup.review");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label={t("serviceLabel")}
        value={row.label}
        maxLength={100}
        required
        onChange={(e) => onEdit({ ...row, label: e.target.value })}
      />
      <Select
        label={t("serviceWeekday")}
        value={String(row.weekday)}
        options={WEEKDAYS.map((d) => ({
          value: String(d),
          label: weekdayName(d, { capitalize: true }),
        }))}
        onChange={(e) => onEdit({ ...row, weekday: Number(e.target.value) })}
      />
      <TimeInput
        label={t("serviceTime")}
        value={row.time}
        required
        onChange={(e) => onEdit({ ...row, time: e.target.value })}
      />
      <Select
        label={t("serviceLocation")}
        value={row.locationId ?? ""}
        options={[
          { value: "", label: t("noLocation") },
          ...draft.locations.map((l) => ({ value: l.id, label: l.name || l.line1 })),
        ]}
        onChange={(e) => onEdit({ ...row, locationId: e.target.value || null })}
      />
      <div>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          {t("remove")}
        </Button>
      </div>
    </div>
  );
}

function LocationRow({
  row,
  onEdit,
  onRemove,
}: {
  row: DraftLocation;
  onEdit: (row: DraftLocation) => void;
  onRemove: () => void;
}) {
  const t = useT("admin.setup.review");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label={t("locationName")}
        value={row.name}
        maxLength={200}
        required
        wrapperClassName="sm:col-span-2"
        onChange={(e) => onEdit({ ...row, name: e.target.value })}
      />
      <Input
        label={t("postalCode")}
        value={row.postalCode}
        inputMode="numeric"
        maxLength={4}
        onChange={(e) => onEdit({ ...row, postalCode: e.target.value })}
      />
      <Input
        label={t("city")}
        value={row.city}
        maxLength={100}
        onChange={(e) => onEdit({ ...row, city: e.target.value })}
      />
      <Input
        label={t("street")}
        value={row.line1}
        maxLength={200}
        wrapperClassName="sm:col-span-2"
        onChange={(e) => onEdit({ ...row, line1: e.target.value })}
      />
      <div>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          {t("remove")}
        </Button>
      </div>
    </div>
  );
}

function ThemeEditor({
  draft,
  onChange,
}: {
  draft: SetupDraft;
  onChange: (draft: SetupDraft) => void;
}) {
  const t = useT("admin.setup.review");
  const branding = useT("admin.appearance.branding");
  const checks = checkColors(draft.theme);
  const edit = (theme: SetupDraft["theme"]) => onChange(markReviewed({ ...draft, theme }, "theme"));
  return (
    <Item id="theme" draft={draft} onChange={onChange}>
      <div className="grid gap-4">
        <Select
          label={t("themeLabel")}
          value={draft.theme.themeId}
          options={THEME_IDS.map((id) => ({ value: id, label: branding(`themeNames.${id}`) }))}
          onChange={(e) =>
            edit(selectTheme(draft.theme, e.target.value as (typeof THEME_IDS)[number]))
          }
        />
        <ColorField
          label={branding("primary")}
          help={branding("primaryHelp")}
          value={draft.theme.colors.primary}
          check={checks.primary}
          onChange={(v) => edit({ ...draft.theme, colors: { ...draft.theme.colors, primary: v } })}
        />
        <ColorField
          label={branding("secondary")}
          help={branding("secondaryHelp")}
          value={draft.theme.colors.secondary}
          check={checks.secondary}
          onChange={(v) =>
            edit({ ...draft.theme, colors: { ...draft.theme.colors, secondary: v } })
          }
        />
      </div>
    </Item>
  );
}
