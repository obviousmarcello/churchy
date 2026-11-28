"use client";

import { useMemo, useState, useTransition } from "react";
import type { NavItem } from "@churchy/contracts";
import { themeToCssVars, type ThemeConfig } from "@churchy/themes";
import { Alert, Button, Input } from "@churchy/ui";
import { saveFooter, saveNavigation } from "@/app/admin/megjelenes/actions";
import {
  MAX_CHILDREN,
  MAX_TOP_LEVEL,
  addItem,
  canIndent,
  hrefValid,
  indentItem,
  linkListIssues,
  moveItem,
  navigationIssues,
  outdentItem,
  removeItem,
  samePath,
  updateItem,
  type NavIssue,
  type NavLink,
  type NavPath,
} from "@/lib/appearance/navigation-editor";
import { useT } from "@/i18n/client";

type Feedback = { tone: "success" | "danger"; text: string } | null;

/**
 * Navigation editor (FR-106, D-24): rename, reorder, nest (two levels at most) and add internal or
 * external links, with a live preview of the resulting menu. The footer editor below shares the row
 * component with nesting switched off.
 */
export function NavigationEditor({ initial, theme }: { initial: NavItem[]; theme: ThemeConfig }) {
  const t = useT("admin.appearance.navigation");
  const [items, setItems] = useState(initial);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();
  const issues = useMemo(() => navigationIssues(items), [items]);

  function submit() {
    setFeedback(null);
    start(async () => {
      const res = await saveNavigation(items);
      if (!res.ok) setFeedback({ tone: "danger", text: t("forbidden") });
      else if (res.value.ok) setFeedback({ tone: "success", text: t("saved") });
      else setFeedback({ tone: "danger", text: t("invalid") });
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <div className="grid gap-5">
        <p className="max-w-prose text-muted">{t("help")}</p>
        <ul className="grid gap-3" data-testid="nav-items" aria-label={t("listLabel")}>
          {items.map((item, i) => (
            <li key={i} className="grid gap-2">
              <LinkRow
                path={[i]}
                link={item}
                siblings={items.length}
                issues={issues}
                nesting
                canIndent={canIndent(items, [i])}
                onChange={(patch) => setItems((c) => updateItem(c, [i], patch))}
                onMove={(d) => setItems((c) => moveItem(c, [i], d))}
                onIndent={() => setItems((c) => indentItem(c, [i]))}
                onRemove={() => setItems((c) => removeItem(c, [i]))}
              />
              {item.children.length > 0 ? (
                <ul className="ml-6 grid gap-2 border-l-2 border-border pl-4">
                  {item.children.map((child, j) => (
                    <li key={j}>
                      <LinkRow
                        path={[i, j]}
                        link={child}
                        siblings={item.children.length}
                        issues={issues}
                        nesting
                        canIndent={false}
                        onChange={(patch) => setItems((c) => updateItem(c, [i, j], patch))}
                        onMove={(d) => setItems((c) => moveItem(c, [i, j], d))}
                        onOutdent={() => setItems((c) => outdentItem(c, [i, j]))}
                        onRemove={() => setItems((c) => removeItem(c, [i, j]))}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              {item.children.length < MAX_CHILDREN ? (
                <div className="ml-6">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setItems((c) =>
                        addItem(c, { label: t("newLabel"), href: "/", external: false }, i),
                      )
                    }
                  >
                    {t("addChild", { name: item.label || t("newLabel") })}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div>
          <Button
            variant="secondary"
            disabled={items.length >= MAX_TOP_LEVEL}
            onClick={() =>
              setItems((c) => addItem(c, { label: t("newLabel"), href: "/", external: false }))
            }
          >
            {t("add")}
          </Button>
          {items.length >= MAX_TOP_LEVEL ? (
            <span className="ml-3 text-fs-2 text-muted">
              {t("maxItems", { max: MAX_TOP_LEVEL })}
            </span>
          ) : null}
        </div>
        {feedback ? (
          <Alert tone={feedback.tone} role={feedback.tone === "danger" ? "alert" : "status"}>
            {feedback.text}
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={issues.length > 0 || pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          {issues.length > 0 ? <span className="text-fs-2 text-muted">{t("blocked")}</span> : null}
        </div>
      </div>

      <div className="lg:sticky lg:top-6">
        <MenuPreview items={items} theme={theme} />
      </div>
    </div>
  );
}

interface FooterInitial {
  links: NavLink[];
  dioceseLink: { label: string; url: string } | null;
}

/** Footer editor (FR-109, D-24): the further links of the footer and the diocese link. */
export function FooterEditor({ initial }: { initial: FooterInitial & { showMap: boolean } }) {
  const t = useT("admin.appearance.footer");
  const [links, setLinks] = useState<NavLink[]>(initial.links);
  const [diocese, setDiocese] = useState(initial.dioceseLink ?? { label: "", url: "" });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  const issues = useMemo(() => linkListIssues(links), [links]);
  const dioceseUsed = diocese.label.trim() !== "" || diocese.url.trim() !== "";
  const dioceseOk =
    !dioceseUsed ||
    (diocese.label.trim() !== "" && /^https?:\/\//i.test(diocese.url) && hrefValid(diocese.url));

  // The shared row works on nav items; footer links are the same without children.
  const asItems: NavItem[] = links.map((l) => ({ ...l, children: [] }));

  function submit() {
    setFeedback(null);
    start(async () => {
      const res = await saveFooter({
        showMap: initial.showMap,
        links: links.map(({ label, href, external }) => ({ label, href, external })),
        dioceseLink: dioceseUsed ? { label: diocese.label.trim(), url: diocese.url.trim() } : null,
      });
      if (!res.ok) setFeedback({ tone: "danger", text: t("forbidden") });
      else if (res.value.ok) setFeedback({ tone: "success", text: t("saved") });
      else setFeedback({ tone: "danger", text: t("invalid") });
    });
  }

  const setList = (next: NavItem[]) => setLinks(next.map(({ children: _c, ...link }) => link));

  return (
    <div className="grid max-w-3xl gap-6">
      <p className="max-w-prose text-muted">{t("help")}</p>
      <ul className="grid gap-3" data-testid="footer-link-items" aria-label={t("listLabel")}>
        {asItems.map((link, i) => (
          <li key={i}>
            <LinkRow
              path={[i]}
              link={link}
              siblings={asItems.length}
              issues={issues}
              nesting={false}
              canIndent={false}
              onChange={(patch) => setList(updateItem(asItems, [i], patch))}
              onMove={(d) => setList(moveItem(asItems, [i], d))}
              onRemove={() => setList(removeItem(asItems, [i]))}
            />
          </li>
        ))}
      </ul>
      <div>
        <Button
          variant="secondary"
          disabled={links.length >= MAX_TOP_LEVEL}
          onClick={() =>
            setLinks((c) => [...c, { label: t("newLabel"), href: "/", external: false }])
          }
        >
          {t("add")}
        </Button>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 font-heading text-fs-5 font-semibold">{t("diocese")}</legend>
        <Input
          label={t("dioceseLabel")}
          optionalLabel={t("optional")}
          value={diocese.label}
          maxLength={200}
          error={dioceseUsed && diocese.label.trim() === "" ? t("dioceseLabelMissing") : undefined}
          onChange={(e) => setDiocese({ ...diocese, label: e.target.value })}
        />
        <Input
          label={t("dioceseUrl")}
          optionalLabel={t("optional")}
          type="url"
          value={diocese.url}
          error={
            dioceseUsed && !dioceseOk && diocese.label.trim() !== ""
              ? t("dioceseUrlInvalid")
              : undefined
          }
          onChange={(e) => setDiocese({ ...diocese, url: e.target.value })}
        />
      </fieldset>

      {feedback ? (
        <Alert tone={feedback.tone} role={feedback.tone === "danger" ? "alert" : "status"}>
          {feedback.text}
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={issues.length > 0 || !dioceseOk || pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        {issues.length > 0 || !dioceseOk ? (
          <span className="text-fs-2 text-muted">{t("blocked")}</span>
        ) : null}
      </div>
    </div>
  );
}

function LinkRow({
  path,
  link,
  siblings,
  issues,
  nesting,
  canIndent: indentable,
  onChange,
  onMove,
  onIndent,
  onOutdent,
  onRemove,
}: {
  path: NavPath;
  link: NavLink;
  siblings: number;
  issues: readonly NavIssue[];
  nesting: boolean;
  canIndent: boolean;
  onChange: (patch: { label?: string; href?: string }) => void;
  onMove: (delta: number) => void;
  onIndent?: () => void;
  onOutdent?: () => void;
  onRemove: () => void;
}) {
  const t = useT("admin.appearance.navigation");
  const position = path[path.length - 1]!;
  const own = issues.filter((i) => samePath(i.path, path)).map((i) => i.problem);
  const name = link.label.trim() || t("newLabel");
  return (
    <div
      className="grid gap-3 rounded-md border-2 border-border-strong bg-surface-raised p-3"
      data-nav-row={path.join("-")}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t("label")}
          value={link.label}
          maxLength={500}
          error={own.includes("label") ? t("labelMissing") : undefined}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <Input
          label={t("href")}
          help={link.external ? t("externalHint") : t("internalHint")}
          value={link.href}
          error={own.includes("href") ? t("hrefInvalid") : undefined}
          spellCheck={false}
          onChange={(e) => onChange({ href: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={position === 0}
          aria-label={t("moveUp", { name })}
          onClick={() => onMove(-1)}
        >
          {t("up")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={position === siblings - 1}
          aria-label={t("moveDown", { name })}
          onClick={() => onMove(1)}
        >
          {t("down")}
        </Button>
        {nesting && path.length === 1 ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={!indentable}
            aria-label={t("indent", { name })}
            onClick={onIndent}
          >
            {t("nest")}
          </Button>
        ) : null}
        {nesting && path.length === 2 ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={t("outdent", { name })}
            onClick={onOutdent}
          >
            {t("unnest")}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" aria-label={t("remove", { name })} onClick={onRemove}>
          {t("removeShort")}
        </Button>
      </div>
    </div>
  );
}

function MenuPreview({ items, theme }: { items: readonly NavItem[]; theme: ThemeConfig }) {
  const t = useT("admin.appearance.navigation");
  return (
    <figure className="m-0" data-testid="nav-preview">
      <figcaption className="mb-2 text-fs-2 font-semibold">{t("previewCaption")}</figcaption>
      <div
        data-theme={theme.themeId}
        style={themeToCssVars(theme)}
        className="rounded-lg border border-border-strong bg-surface p-4 text-text"
        inert
      >
        <ul className="grid gap-2">
          {items.map((item, i) => (
            <li key={i}>
              <span className="font-semibold text-primary">{item.label}</span>
              {item.external ? (
                <span className="ml-2 text-fs-1 text-muted">{t("externalBadge")}</span>
              ) : null}
              {item.children.length > 0 ? (
                <ul className="ml-4 grid gap-1 border-l-2 border-accent pl-3">
                  {item.children.map((c, j) => (
                    <li key={j} className="text-fs-2">
                      {c.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
