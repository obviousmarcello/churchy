"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatAddress, formatPhone, slugify } from "@churchy/hu";
import { Alert, Badge, Button, Checkbox, FormattedDate, Input } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { SiteDraft } from "@/server/site-builder/draft-schema";
import {
  applyDraftNewChurchAction,
  discardDraftAction,
  saveDraftSelectionAction,
} from "@/server/site-builder-actions";

type Kind = "pages" | "posts" | "announcements" | "locations" | "serviceTimes" | "images";
type Off = Record<Kind, string[]>;

const offOf = (draft: SiteDraft): Off => ({
  pages: draft.pages.filter((i) => !i.include).map((i) => i.id),
  posts: draft.posts.filter((i) => !i.include).map((i) => i.id),
  announcements: draft.announcements.filter((i) => !i.include).map((i) => i.id),
  locations: draft.locations.filter((i) => !i.include).map((i) => i.id),
  serviceTimes: draft.serviceTimes.filter((i) => !i.include).map((i) => i.id),
  images: draft.images.filter((i) => !i.include).map((i) => i.id),
});

function Source({ url }: { url: string }) {
  const t = useT("platform.siteBuilder.review");
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
      {t("sourceLink")}
    </a>
  );
}

/** Review of a draft: facts, items with a keep switch and the source link, warnings, apply. */
export function DraftReview({
  draftId,
  draft,
  existingChurch,
}: {
  draftId: string;
  draft: SiteDraft;
  existingChurch: boolean;
}) {
  const t = useT("platform.siteBuilder.review");
  const a = useT("platform.siteBuilder.apply");
  const router = useRouter();
  const [off, setOff] = useState<Off>(() => offOf(draft));
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(draft.church.name.value);
  const [slug, setSlug] = useState(slugify(draft.church.name.value));
  const [ownerId, setOwnerId] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const toggle = (kind: Kind, id: string) =>
    setOff((o) => ({
      ...o,
      [kind]: o[kind].includes(id) ? o[kind].filter((x) => x !== id) : [...o[kind], id],
    }));
  const keep = (kind: Kind, id: string, label: string, disabled = false) => (
    <Checkbox
      label={label}
      checked={!off[kind].includes(id) && !disabled}
      disabled={disabled}
      onChange={() => toggle(kind, id)}
    />
  );

  const save = () =>
    start(async () => {
      const res = await saveDraftSelectionAction(draftId, off);
      const ok = res.ok && res.value;
      setFailed(!ok);
      setMessage(ok ? t("saved") : t("saveFailed"));
    });

  const discard = () =>
    start(async () => {
      const res = await discardDraftAction(draftId);
      if (res.ok && res.value) router.push("/platform/webhely-epito");
    });

  const apply = () =>
    start(async () => {
      setApplyError(null);
      const saved = await saveDraftSelectionAction(draftId, off);
      if (!saved.ok || !saved.value) {
        setFailed(true);
        setMessage(t("saveFailed"));
        return;
      }
      const res = await applyDraftNewChurchAction(draftId, {
        name,
        slug,
        owner: { authUserId: ownerId, email: ownerEmail, name: ownerName },
      });
      if (!res.ok) {
        setApplyError(a("errors.invalid"));
        return;
      }
      const r = res.value;
      if (!r.ok) {
        setApplyError(a(`errors.${r.reason}`));
        return;
      }
      setApplied(
        a("done", {
          slug: r.slug,
          ...Object.fromEntries(Object.entries(r.summary).filter(([, v]) => typeof v === "number")),
        }) +
          (r.imagesNotApplied > 0
            ? ` ${a("imagesNotApplied", { count: r.imagesNotApplied })}`
            : "") +
          (r.logoMissing ? ` ${a("logoMissing")}` : ""),
      );
    });

  const c = draft.church;
  const fact = (label: string, value: string | null, extra?: string) => (
    <div className="grid gap-0.5">
      <dt className="text-fs-2 text-muted">{label}</dt>
      <dd className="m-0">
        {value ?? <span className="text-muted">{t("facts.none")}</span>}
        {extra ? <span className="ms-2 text-fs-2 text-muted">{extra}</span> : null}
      </dd>
    </div>
  );

  return (
    <div className="grid gap-8" data-testid="draft-review">
      <p className="m-0 text-muted" data-testid="draft-usage">
        {t("usage", {
          pages: draft.meta.usage.pages,
          images: draft.meta.usage.images,
          cost: draft.meta.usage.costUsd.toFixed(2),
        })}
      </p>
      <p className="m-0 text-fs-2 text-muted">{t("consent")}</p>

      <section aria-labelledby="sb-church" className="grid gap-3">
        <h2 id="sb-church" className="m-0 text-fs-5 font-semibold">
          {t("sections.church")}
        </h2>
        <dl className="m-0 grid gap-3 sm:grid-cols-2">
          {fact(
            t("facts.name"),
            c.name.value,
            t("facts.confidence", { percent: Math.round(c.name.confidence * 100) }),
          )}
          {fact(t("facts.shortName"), c.shortName.value)}
          {fact(
            t("facts.denomination"),
            t(`denominations.${c.denomination.value}`),
            t("facts.confidence", { percent: Math.round(c.denomination.confidence * 100) }),
          )}
          {fact(t("facts.tagline"), c.tagline)}
          {fact(t("facts.welcome"), c.welcome)}
          {fact(t("facts.email"), draft.contact.email)}
          {fact(t("facts.phone"), draft.contact.phone ? formatPhone(draft.contact.phone) : null)}
          {fact(
            t("facts.address"),
            draft.contact.address ? formatAddress(draft.contact.address) : null,
          )}
          {fact(t("facts.color"), draft.theme.primary)}
        </dl>
      </section>

      <section aria-labelledby="sb-locations" className="grid gap-3">
        <h2 id="sb-locations" className="m-0 text-fs-5 font-semibold">
          {t("sections.locations")}
        </h2>
        {draft.locations.length === 0 ? <p className="m-0 text-muted">{t("empty")}</p> : null}
        <ul className="m-0 grid list-none gap-2 p-0">
          {draft.locations.map((l) => (
            <li key={l.id} className="grid gap-1" data-testid="draft-location">
              {keep("locations", l.id, l.name)}
              <span className="ps-8 text-fs-2 text-muted">
                {l.address ? formatAddress(l.address) : t("facts.none")} ·{" "}
                <Source url={l.sourceUrl} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sb-times" className="grid gap-3">
        <h2 id="sb-times" className="m-0 text-fs-5 font-semibold">
          {t("sections.serviceTimes")}
        </h2>
        {draft.serviceTimes.length === 0 ? <p className="m-0 text-muted">{t("empty")}</p> : null}
        <ul className="m-0 grid list-none gap-2 p-0">
          {draft.serviceTimes.map((s) => (
            <li key={s.id} className="grid gap-1" data-testid="draft-service-time">
              {keep(
                "serviceTimes",
                s.id,
                `${t(`weekdays.${s.weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7}`)} ${s.time} · ${s.label}`,
              )}
              <span className="ps-8 text-fs-2 text-muted">
                <Source url={s.sourceUrl} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sb-pages" className="grid gap-3">
        <h2 id="sb-pages" className="m-0 text-fs-5 font-semibold">
          {t("sections.pages")}
        </h2>
        {draft.pages.length === 0 ? <p className="m-0 text-muted">{t("empty")}</p> : null}
        <ul className="m-0 grid list-none gap-2 p-0">
          {draft.pages.map((p) => (
            <li key={p.id} className="grid gap-1" data-testid="draft-page">
              {keep("pages", p.id, p.title)}
              <span className="ps-8 text-fs-2 text-muted">
                /{p.slug} · {t(`kinds.${p.kind}`)} · {t("blocks", { count: p.blocks.length })} ·{" "}
                <Source url={p.sourceUrl} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sb-posts" className="grid gap-3">
        <h2 id="sb-posts" className="m-0 text-fs-5 font-semibold">
          {t("sections.posts")}
        </h2>
        {draft.posts.length === 0 ? <p className="m-0 text-muted">{t("empty")}</p> : null}
        <ul className="m-0 grid list-none gap-2 p-0">
          {draft.posts.map((p) => (
            <li key={p.id} className="grid gap-1" data-testid="draft-post">
              {keep("posts", p.id, p.title)}
              <span className="ps-8 text-fs-2 text-muted">
                {p.lead} · <Source url={p.sourceUrl} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sb-ann" className="grid gap-3">
        <h2 id="sb-ann" className="m-0 text-fs-5 font-semibold">
          {t("sections.announcements")}
        </h2>
        {draft.announcements.length === 0 ? <p className="m-0 text-muted">{t("empty")}</p> : null}
        <ul className="m-0 grid list-none gap-2 p-0">
          {draft.announcements.map((x) => (
            <li key={x.id} className="grid gap-1">
              <Checkbox
                labelContent={<FormattedDate value={x.weekSunday} />}
                label={x.weekSunday}
                checked={!off.announcements.includes(x.id)}
                onChange={() => toggle("announcements", x.id)}
              />
              <span className="ps-8 text-fs-2 text-muted">
                <Source url={x.sourceUrl} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sb-images" className="grid gap-3">
        <h2 id="sb-images" className="m-0 text-fs-5 font-semibold">
          {t("sections.images")}
        </h2>
        <p className="m-0 text-fs-2 text-muted">{t("imagesNote")}</p>
        {draft.images.length === 0 ? <p className="m-0 text-muted">{t("empty")}</p> : null}
        <ul className="m-0 grid list-none gap-2 p-0">
          {draft.images.map((i) => (
            <li key={i.id} className="grid gap-1" data-testid="draft-image">
              {keep("images", i.id, i.alt || i.sourceUrl, i.offsite)}
              <span className="flex flex-wrap items-center gap-2 ps-8 text-fs-2 text-muted">
                <Badge>{t(`imageRoles.${i.role}`)}</Badge>
                <Source url={i.sourceUrl} />
                {i.offsite ? <span>{t("imageOffsite")}</span> : null}
                {i.mayShowPeople ? <span>{t("imagePeople")}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sb-warn" className="grid gap-3">
        <h2 id="sb-warn" className="m-0 text-fs-5 font-semibold">
          {t("sections.warnings")}
        </h2>
        {draft.warnings.length === 0 ? <p className="m-0 text-muted">{t("empty")}</p> : null}
        <ul className="m-0 grid list-none gap-2 p-0" data-testid="draft-warnings">
          {draft.warnings.map((w, index) => (
            <li key={`${w.code}-${index}`}>
              <Alert tone="warning">
                <p>{t(`warnings.${w.code}`, { url: w.url ?? "", count: w.count ?? 0 })}</p>
              </Alert>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending} data-testid="draft-save">
          {t("save")}
        </Button>
        <Button type="button" variant="secondary" onClick={discard} disabled={pending}>
          {t("discard")}
        </Button>
        {message ? (
          <p
            role="status"
            className={failed ? "m-0 text-danger" : "m-0 text-muted"}
            data-testid="draft-message"
          >
            {message}
          </p>
        ) : null}
      </div>
      <p className="m-0 text-fs-2 text-muted">
        {t("expires", {
          when: new Date(draft.meta.expiresAt).toLocaleString("hu-HU", {
            timeZone: "Europe/Budapest",
          }),
        })}
      </p>

      <section
        aria-labelledby="sb-apply"
        className="grid max-w-prose gap-4 border-t border-border pt-6"
      >
        <h2 id="sb-apply" className="m-0 text-fs-5 font-semibold">
          {existingChurch ? a("existingTitle") : a("newTitle")}
        </h2>
        {existingChurch ? (
          <p className="m-0" data-testid="draft-existing">
            {a("existingBody")}
          </p>
        ) : applied ? (
          <Alert tone="success" data-testid="draft-applied">
            <p>{applied}</p>
          </Alert>
        ) : (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <p className="m-0 text-muted">{a("newLead")}</p>
            <Input label={a("name")} value={name} onChange={(e) => setName(e.target.value)} />
            <Input label={a("slug")} value={slug} onChange={(e) => setSlug(e.target.value)} />
            <Input
              label={a("ownerId")}
              help={a("ownerIdHelp")}
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            />
            <Input
              label={a("ownerEmail")}
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
            <Input
              label={a("ownerName")}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
            {applyError ? (
              <Alert tone="danger" data-testid="draft-apply-error">
                <p>{applyError}</p>
              </Alert>
            ) : null}
            <div>
              <Button type="submit" disabled={pending} data-testid="draft-apply">
                {a("submit")}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
