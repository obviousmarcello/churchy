# @churchy/ui

Accessible core components for the public sites and the admin / workspace. Built on Tailwind CSS v4,
the CSS-variable tokens of `@churchy/themes`, and Radix primitives for dialogs and tabs.

See the live catalogue at **`/fejlesztes/komponensek`** in `apps/web` (dev-only; set
`HIDE_DEV_ROUTES=1` to return 404 in production). It lists every component, variant and state and
is the target of the visual and axe tests.

## The one rule: text comes from props

Components contain **no user-visible strings**, in any language. Labels, headings, aria-labels, help
and error messages, "close" buttons: all arrive as props, and the app reads them from
`messages/hu.json`.

```tsx
<Input label={t("nameLabel")} help={t("nameHelp")} error={errors.name} />
<Dialog title={t("title")} closeLabel={common("closeDialog")} trigger={…} />
<IconButton label={t("edit")} icon={<EditIcon />} />
```

Icons are decorative (`aria-hidden`). Anything that needs an accessible name (icon buttons, menu
toggle, dialog close, nav landmarks, table captions, toast region) has a required label prop, so
TypeScript reminds you.

## Setup in an app

```css
/* app/globals.css */
@import "tailwindcss";
@import "@churchy/themes/styles.css";
@source "../../../packages/ui/src"; /* Tailwind must scan the component sources */
```

```tsx
// app/layout.tsx
import { themeAttributes } from "@churchy/themes";
<html lang="hu" {...themeAttributes(siteConfig.theme)}>
```

Add `@churchy/ui` and `@churchy/themes` to `transpilePackages`, and `@tailwindcss/postcss` to
`postcss.config.mjs` (all done in `apps/web`).

## Design principles (UI-01, design v2 / UI-05)

The system is calm on purpose: church office staff and volunteers use it for hours, on old laptops
and phones.

1. **One loud thing per view.** At most one filled `primary` button per form or page header.
   Everything else is `secondary` (tinted), `outline` or `ghost`.
2. **Hierarchy by size, not by weight everywhere.** One `h1` per page (`text-page-title`), section
   titles at `text-section-title`, card titles at `text-card-title`, body 17 px, captions 15 px.
   Don't put `font-bold` on body text to "make it pop".
3. **Layered surfaces, not outlined boxes (v2).** Cards are white on the page with a faint
   `border-hairline` ring or a soft diffuse shadow; secondary panels use a tinted surface
   (`bg-surface-tint`, `Card variant="tinted"`). Rows are separated by whitespace. Only form
   controls keep the 3:1 `border-border-strong` (WCAG 1.4.11).
4. **Four spacing rhythms.** `--space-inline` (8) between icon and label, `--space-stack` (16)
   between fields and card items, `--space-card` (20) inside cards, `--space-section` (48/64)
   between page sections. Use the matching Tailwind steps (`gap-2`, `gap-4`, `p-5`, `py-12`).
5. **Never colour alone.** Status = text + icon (`StatusPill`), errors = text + icon, current
   tab = raised thumb + `aria-current`.
6. **44 px targets.** Every button size, icon button, tab, row action and menu option is at least
   44 x 44 px (`--control-h-*`). Base font 17 px.
7. **Soft, rounded shapes (v2).** Use the semantic radius utilities, never a raw number:
   `rounded-control` (inputs), `rounded-button`, `rounded-card`, `rounded-overlay` (dialogs,
   popovers, menus), `rounded-tile` (icon tiles, avatars), `rounded-image`, `rounded-full` (chips,
   pills, badges). Nested shapes are smaller than their container
   (`rounded-[calc(var(--radius-card)_-_0.5rem)]` for an image inset 8 px in a card).
8. **Motion answers the user (v2).** Hover lifts, press scales down, things that open grow out of
   their trigger, things that leave go faster than they came. Animate `transform` and `opacity`
   only, use the tokens, and never wrap the LCP element (hero, page title) in a reveal. See
   "Motion" below.

## Tokens

All tokens are CSS custom properties (SDD 5.4) in `@churchy/themes` (`css/tokens.css` and one file
per theme). Tailwind utilities map onto them, so a runtime change of a variable re-themes every
component without a rebuild.

| Group       | Variables                                                                                                           | Utilities                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Type roles  | `--fs-page-title` (28-38), `--fs-section-title` (22), `--fs-card-title` (19), `--fs-body` (17), `--fs-caption` (15) | `text-page-title`, `text-section-title`, `text-card-title`, `text-body`, `text-caption` (with line height) |
| Type steps  | `--fs-1…--fs-8` (13, 15, 17, 19, 22, 24-30, 28-38, 36-56 hero only)                                                 | `text-fs-1…text-fs-8`                                                                                      |
| Weights     | `--fw-heading` (per theme), `--fw-heading-sm` (small serif titles, Klasszikus)                                      | `[font-weight:var(--fw-heading)]`                                                                          |
| Surfaces    | `--c-surface`, `--c-surface-raised`, `--c-surface-sunken`, `--c-inverse`                                            | `bg-surface`, `bg-surface-raised`, `bg-surface-sunken`                                                     |
| Text        | `--c-text`, `--c-muted`, `--c-primary`, `--c-accent-text`                                                           | `text-text`, `text-muted`, `text-primary`                                                                  |
| Lines       | `--c-border` (decorative), `--c-divider` (lighter), `--c-border-strong` (controls, 3:1)                             | `border-border`, `border-divider`, `border-border-strong`                                                  |
| Interaction | `--c-hover`, `--c-selected`, `--c-focus`                                                                            | `bg-hover`, `bg-selected`; focus ring is global                                                            |
| Status      | `--c-success/-soft`, `--c-warning/-soft`, `--c-danger/-soft`, `--c-info/-soft`                                      | `text-success bg-success-soft` …                                                                           |
| Shape       | `--radius-sm/md/lg/xl` (configurable step) and semantic `--radius-control/button/card/overlay/tile/image`           | `rounded-sm…xl`, `rounded-control`, `rounded-button`, `rounded-card`, `rounded-overlay`, `rounded-tile`    |
| Elevation   | `--shadow-xs`, `--shadow-card`, `--shadow-raised`, `--shadow-overlay`, `--shadow-primary` (glow)                    | `shadow-xs`, `shadow-card`, `shadow-raised`, `shadow-overlay`, `shadow-primary`                            |
| Layers (v2) | `--c-surface-app`, `--c-surface-tint`, `--c-surface-glass`, `--c-hairline`, `--c-press`                             | `bg-surface-app`, `bg-surface-tint`, `bg-surface-glass`, `border-hairline`, `bg-press`                     |
| Motion (v2) | `--dur-1…4` (120/200/320/480), `--ease-standard/emphasized/exit/spring`, `--motion-lift(-sm)`, `--motion-press`     | `duration-(--dur-2)`, `ease-spring`, `hover:translate-y-(--motion-lift)`, `active:scale-(--motion-press)`  |
| Spacing     | `--space-1…12` (4 px grid), `--space-inline/stack/card/section`                                                     | Tailwind's own steps (`p-4` = 16 px), `gap-(--space-stack)`                                                |
| Controls    | `--control-h-sm/md/lg` (44/44/52; admin 44/48/56), `--focus-width`                                                  | `min-h-(--control-h-md)`                                                                                   |
| Layout      | `--content-max` (1200), `--gutter`, `--header-h`, `--demo-bar-h`                                                    | `max-w-(--content-max) px-(--gutter)`                                                                      |

Rules:

- Use token utilities, never raw hex values or Tailwind's default palette (it is removed on purpose).
- `className` props are for layout (margin, width, grid placement). Don't override colours with
  them: `cn()` does not merge classes, so two conflicting utilities resolve by stylesheet order.
- Motion must respect `prefers-reduced-motion`; the base stylesheet already shortens all
  transitions and the motion tokens drop to 0 movement. Keep focus outlines (`:focus-visible` is
  styled globally and draws in with a short animation).

### Radius per theme (design v2)

The church picks a radius step (stored as `none` / `small` / `large` → `square` / `soft` /
`round`; labels "Visszafogott", "Lekerekített", "Erősen lekerekített"). Every step is soft;
each theme derives its semantic radii from the step, so the three themes stay distinct:

| Theme (default step)    | sm/md/lg/xl | control | button | card | overlay | tile |
| ----------------------- | ----------- | ------- | ------ | ---- | ------- | ---- |
| Klasszikus (`soft`)     | 10/14/20/24 | 14      | 14     | 20   | 24      | 12   |
| Letisztult (`square`)   | 8/12/18/22  | 14      | 16     | 22   | 24      | 14   |
| Közösségi (`round`)     | 12/16/26/32 | 16      | pill   | 28   | 32      | 16   |
| Admin / workspace (fix) | 10/14/20/24 | 14      | 14     | 20   | 24      | 12   |

Semantic radii are redeclared in every theme block and in `[data-ui="admin"]`, because a custom
property's `var()` resolves where it is declared.

## Motion (design v2)

CSS-first, no runtime dependency. Tokens in `@churchy/themes` (`tokens.css`, `tailwind.css`), rules
in `css/motion.css`.

| Token              | Value / use                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `--dur-1` 120 ms   | press, colour changes                                                        |
| `--dur-2` 200 ms   | hover, focus ring, tabs, menus, exits                                        |
| `--dur-3` 320 ms   | opening dialogs, drawers, disclosures, toasts, sliding thumbs                |
| `--dur-4` 480 ms   | page transitions, staggered reveals, progress                                |
| `ease-standard`    | most state changes                                                           |
| `ease-emphasized`  | things arriving (strong deceleration)                                        |
| `ease-exit`        | things leaving (accelerate out)                                              |
| `ease-spring`      | playful overshoot for press / pop feedback; short durations only             |
| `--motion-lift-sm` | -1 px hover lift of buttons; `--motion-lift` -3 px for cards; 0 when reduced |
| `--motion-press`   | 0.97 scale while pressed; 1 when reduced                                     |
| `--stagger-step`   | 55 ms between staggered items (capped at 8 steps)                            |

What is already wired in the components:

- **Buttons, chips, icon buttons, tab triggers:** spring hover lift, quick press-down, coloured glow
  under `primary`. `loading` morphs the spinner in (pass a boolean from the first render).
- **Cards (`href`):** lift, deeper shadow, image zoom; press-down on click.
- **Focus ring:** draws in from a wider offset (`:focus-visible`, global).
- **Tabs:** the raised thumb slides to the active tab; panels fade up after a switch (never on load).
  **SegmentedControl:** the thumb slides with pure CSS (`:has(:checked)`).
- **Dialog:** spring pop in (scale only, never semi-transparent text), faster fade out, scrim fades; `placement="end"` is a drawer that slides
  from the right (a bottom sheet on phones). **Popover** (native Popover API) pops in and fades out
  (`@starting-style`, `allow-discrete`). **Disclosure** glides open (`::details-content`,
  `interpolate-size`). `<details data-menu>` panels pop in. Header menus pop in.
- **Toast:** springs in from below. **Skeleton:** shimmer band. **Progress / AnimatedNumber:** values
  glide / count to the new value (not on page load).
- **Reveal / Stagger:** `<Stagger as="ul" className="grid …">` fades its children up one after
  another on first render (`data-stagger`, `--i` per child). No IntersectionObserver. Use it for one
  orchestrated moment per page (a dashboard's tiles, a list of cards), not for every section.
- **Page transitions:** plain `<a>` navigations use the cross-document View Transitions API
  (`@view-transition { navigation: auto }`, only with scripting enabled, a quick 200 ms swap because
  the browser holds clicks while the document changes); Next `<Link transitionTypes={pageTransitionTypes}>`
  navigations are animated by `<PageTransition>` (React `<ViewTransition>`, wrapped once in the root
  layout). Server actions and refreshes never animate. The demo bar is anchored
  (`view-transition-name: demo-bar`). `SideNav` / `NavTabs` take an optional `transitionName` so the
  current-item highlight glides between pages. Unsupported browsers switch instantly.

Rules:

- **Reduced motion:** everything above becomes instant (durations 0.01 ms, movement tokens 0,
  reveals and view transitions off). Don't add motion that bypasses the tokens or the
  `motion-safe:` variant.
- **No layout shift:** animate `transform` / `opacity` (and `grid-template-rows` /
  `block-size` for disclosures). Never animate `width`/`height` of page content.
- **Never block interaction:** `::view-transition` has `pointer-events: none`; nothing waits for an
  animation before it can be clicked (the only exception is the 200 ms cross-document swap itself).
- **Entrances never fade text that axe or a reader might check right away:** dialogs scale in
  without opacity; reveals are opt-in.
- **Testing:** axe measures contrast with the current opacity. In e2e, run axe after
  `document.getAnimations()` have finished, or with `reducedMotion: "reduce"` (see
  `apps/web/e2e/motion.spec.ts`). Visual tests run with reduced motion.

## Components: when to use what

Server components unless marked _client_.

### Page structure

| Component                             | Use it for                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `PageShell`, `SkipLink`, `Container`  | Every page: skip link, landmarks, 1200 px column.                                                                                |
| `PageHeader`                          | Top of every admin / workspace page: `breadcrumbs`, the one `h1`, `description`, `meta` (status, last saved), `actions`, `tabs`. |
| `Breadcrumbs`                         | Pages two or more levels deep. Last item has no `href` (current page). On phones only the parent shows, as a back link.          |
| `NavTabs`                             | Sub-pages of one record or settings area, one URL per tab (`aria-current`).                                                      |
| `Tabs` _(client)_                     | Switching panels inside one page without a URL change. Items take `icon` and `count`.                                            |
| `SectionHeading`                      | Public-site section titles (with the Klasszikus ornament; hidden in admin). In admin use a plain `h2` with `text-section-title`. |
| `Header`, `Footer` _(Header: client)_ | Public site chrome.                                                                                                              |
| `Hero`                                | Public home page only (`image-full` / `image-split` / `text-only`).                                                              |

```tsx
<PageHeader
  breadcrumbs={
    <Breadcrumbs
      label={t("breadcrumbs")}
      items={[{ label: t("news"), href: "/admin/hirek" }, { label: post.title }]}
    />
  }
  title={post.title}
  description={t("editLead")}
  meta={<StatusPill status="warning">{t("draft")}</StatusPill>}
  actions={
    <>
      <Button variant="secondary" iconStart={<EyeIcon />}>
        {t("preview")}
      </Button>
      <Button>{t("publish")}</Button>
    </>
  }
  tabs={
    <NavTabs label={t("sections")} items={[{ label: t("content"), href: "…", current: true }]} />
  }
/>
```

### Actions

| Variant / component                                 | Use it for                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Button variant="primary"` (default)                | The one main action: _Mentés_, _Közzététel_, _Küldés_.                                        |
| `variant="secondary"`                               | Other actions next to it, "see all" links in cards, empty-state actions.                      |
| `variant="outline"`                                 | Neutral actions on tinted or busy backgrounds (alerts, images, the demo menu).                |
| `variant="ghost"`                                   | Low-emphasis: _Mégse_, toolbar actions, navigation-like buttons.                              |
| `variant="destructive"` (`danger` is the old alias) | Irreversible: delete, withdraw. Usually behind a `Dialog` confirmation.                       |
| `IconButton label icon`                             | Row actions, toolbars, card menus. `label` is required (accessible name + tooltip).           |
| `ButtonLink`                                        | Navigation that looks like a button (`<a>`).                                                  |
| `buttonClasses({ variant, size, iconOnly })`        | Style another element (e.g. Next `<Link>`) as a button.                                       |
| Sizes `sm` / `md` / `lg`                            | `sm` in tables and dense toolbars, `md` default, `lg` only in heroes. All are ≥ 44 px tall.   |
| `iconStart` / `iconEnd`                             | Decorative icon, sized by the button (16 / 20 px).                                            |
| `loading`                                           | While a server action runs (`useFormStatus().pending`): spinner, `aria-busy`, clicks blocked. |

### Content containers

| Component                         | Use it for                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Card` (default `variant="flat"`) | Lists of similar items, form panels, dashboard tiles. Title optional (then it is a plain panel).                    |
| `Card variant="raised"`           | One summary or featured item that should stand off the page. Don't raise every card.                                |
| `Card href` (`interactive`)       | The whole card is one link (news, events, rooms). Interactive bits go in `actions` / `footer`, they stay clickable. |
| `Card tone="highlight"`           | Something that needs attention (schedule exception).                                                                |
| `Card icon actions padding`       | Tinted icon before the title; top-right slot (badge, `IconButton`); `padding="none"` for full-bleed lists.          |

### Data

`DataTable` is the only table component. Pass `caption` (required, visually hidden unless
`captionVisible`), `columns` (`header`, `cell(row)`, `primary` on the name column, `align: "end"` for
numbers, `nowrap` for dates, `hideBelow` for optional columns), `rows`, `rowKey`, and optionally
`rowActions(row)` + `actionsHeader`, `empty`, `rowProps(row)` (`data-testid`, `selected`).

- **`layout="stack"` (default):** a table from 48rem, and on phones every row becomes a card of
  label/value pairs. Nothing scrolls sideways; cells wrap instead of being clipped.
- **`layout="scroll"`:** grids that must stay a grid (timetables, room calendars). The table sits in
  a focusable, named scroll region. Add `maxHeight` to scroll vertically with the header stuck.
- The header is `sticky`; set `--table-sticky-top` on a parent if a sticky page header covers it.

```tsx
<DataTable
  caption={t("requests")}
  columns={[
    { key: "name", header: t("colName"), cell: (r) => <PersonName name={r.name} />, primary: true },
    {
      key: "date",
      header: t("colDate"),
      cell: (r) => <FormattedDate value={r.date} format="short" />,
      nowrap: true,
    },
    {
      key: "status",
      header: t("colStatus"),
      cell: (r) => <StatusPill status={r.tone}>{t(r.statusKey)}</StatusPill>,
    },
  ]}
  rows={requests}
  rowKey={(r) => r.id}
  actionsHeader={t("actions")}
  rowActions={(r) => <IconButton size="sm" label={t("open", { name: r.ref })} icon={<EyeIcon />} />}
  empty={<EmptyState size="sm" icon={<InboxIcon />} title={t("noRequests")} />}
/>
```

### Status and feedback

| Component                                 | Use it for                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatusPill status`                       | The state of a record: `pending` (beérkezett), `info` (folyamatban), `success` (jóváhagyva), `warning` (pótlásra vár), `danger`, `neutral`. Icon + text.                  |
| `Badge tone`                              | Categories, tags, counts, "Élő" (`dot`). Not for workflow state.                                                                                                          |
| `Alert tone`                              | A message that stays on the page (warnings, results of a check). `variant="banner"` spans the width.                                                                      |
| `SaveStatus state messages`               | Inline confirmation next to a form's buttons after saving ("Mentve"). Always rendered: it is the live region.                                                             |
| `ToastProvider` + `useToast()` _(client)_ | A short confirmation after an action that leaves or changes the view ("A hirdetés mentve."). Errors stay until dismissed; prefer an `Alert` for errors that need reading. |
| `EmptyState`                              | No data yet: say what is missing and offer the next step (one button). `size="sm"` inside tables and cards.                                                               |
| `Skeleton` in `LoadingRegion label`       | Loading placeholders (`text` lines, `rect`, `circle`). The region announces one status text.                                                                              |
| `Dialog` _(client)_                       | Confirm destructive actions; short forms. Footer buttons in `DialogClose asChild`.                                                                                        |

Save pattern for a form with a server action:

```tsx
const [state, action, pending] = useActionState(save, initial);
<form action={action}>
  …fields…
  <FormActions>
    <Button type="submit" loading={pending}>
      {t("save")}
    </Button>
    <SaveStatus
      state={pending ? "saving" : state.status}
      messages={{ saving: t("saving"), saved: t("saved"), error: t("saveError") }}
    />
  </FormActions>
</form>;
```

### Forms

`Input`, `Textarea`, `Select`, `Checkbox`, `DateInput`, `TimeInput`: every control requires `label`.
`help` and `error` are linked with `aria-describedby`; `error` also sets `aria-invalid` and shows an
icon. Mark optional fields with `optionalLabel` instead of asterisks. Group related fields in
`Fieldset legend description`, end the form with `FormActions` (primary first).

### Icons

`packages/ui/src/icons` holds ~65 inline SVG icons on a 24 px grid with a 1.75 px stroke and
`currentColor`. They are `aria-hidden` by default; pass `title` only for a standalone meaningful
icon. Sizes: `size="xs" | "sm" | "md" | "lg"` (14/16/20/24) or a number; inside buttons, cards,
tabs and pills the container sizes them.

```tsx
import { CalendarIcon, Icon } from "@churchy/ui";
<CalendarIcon />                 // 20 px
<Icon name="door" size="lg" />   // by name, for data-driven menus (type IconName)
```

Groups: navigation (`home`, `dashboard`, `menu`, chevrons, arrows, `search`, `globe`, `logOut`),
actions (`plus`, `edit`, `trash`, `copy`, `download`, `upload`, `eye`, `filter`, `more`, `save`,
`send`, `print`, `link`, `refresh`), status (`check`, `info`, `success`, `warning`, `danger`,
`lock`, `bell`, `hourglass`), calendar (`calendar`, `calendarCheck`, `clock`, `repeat`), people
(`user`, `users`, `userPlus`, `mail`, `phone`, `heart`), rooms and places (`church`, `door`,
`building`, `mapPin`, `key`), HR and documents (`fileText`, `inbox`, `briefcase`, `clipboard`,
`megaphone`, `newspaper`, `image`, `book`), music (`music`), settings (`settings`, `sliders`,
`palette`, `shield`). Add new icons to `ICONS` so the showcase and tests pick them up.

### Formatting

`FormattedDate`, `FormattedTime`, `PersonName`, `Address`, `Phone`, `BankAccount` (props only, on
`@churchy/hu`). Always use them for Hungarian output.

### Design v2 primitives and additions (UI-05)

All additive: existing props keep working.

| Component / prop                                       | Use it for                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `IconTile icon tone size`                              | Tinted rounded square with an icon: section and card headers, dashboard tiles, list items. Decorative.                    |
| `Avatar label initials src size shape`                 | Person picture or initials in a rounded tile (or `shape="circle"`). With `label` it is a named image.                     |
| `Chip` (`href` + `current`, or `onClick` + `selected`) | 44 px filter / quick-choice pills. A static chip is a span; for categories without interaction use `Badge`.               |
| `SegmentedControl label name options`                  | 2–6 equal, mutually exclusive views or filters (Nap / Hét / Hónap). Native radios: works in forms and without JavaScript. |
| `Popover` + `MenuItem`                                 | Row / card / toolbar menus and small popovers on the native Popover API (light dismiss, Escape, top layer). Server-safe.  |
| `Disclosure summary`                                   | FAQ, details, advanced options (`<details>`, animated).                                                                   |
| `SideNav label items transitionName`                   | Vertical app navigation (admin / workspace sidebars).                                                                     |
| `Radio`                                                | One radio option; group with the same `name` in a `Fieldset`.                                                             |
| `Progress label value max valueText`                   | Rounded progress bar; omit `value` for indeterminate.                                                                     |
| `AnimatedNumber value` _(client)_                      | Counters that change in place (dashboards).                                                                               |
| `Reveal`, `Stagger`                                    | One fade-up entrance (see Motion).                                                                                        |
| `PageTransition`, `pageTransitionTypes`                | Page transitions (root layout; pass the types to Next `<Link transitionTypes>`).                                          |
| `Card variant="tinted"`                                | Secondary panels and bands on a brand-tinted surface (no ring, no shadow).                                                |
| `PageHeader icon`                                      | An icon tile before the page title.                                                                                       |
| `Dialog placement="end"`                               | A drawer from the right (bottom sheet on phones): filters, item details.                                                  |
| `NavTabs transitionName`                               | Lets the current-tab thumb glide between pages.                                                                           |

## Admin / workspace variant

Wrap the admin shell once. Every component inside switches to the admin variant (SDD 11.2): white
surfaces, sans-serif headings, no ornaments, AAA text contrast, and controls of at least 44 px
(48 px for `md`).

```tsx
<AdminScope>…admin pages…</AdminScope>
```

Dialogs rendered inside portal back into the scope, so they stay in the admin variant. The variant
is independent of the tenant's public colours. Its decorative hairlines are light; control borders
(`--c-border-strong`) keep 3:1.

## Theming at runtime

`@churchy/themes` turns a `ThemeConfig` into CSS variables (`themeAttributes(config)` for SSR,
`applyTheme(element, config)` in the browser). Colours are validated for WCAG AA
(`validateThemeConfig`) and foreground colours are derived automatically. See
`packages/themes/src` and the "Téma" block in the showcase.

## Tests

- Unit (Vitest, jsdom, Testing Library): `pnpm --filter @churchy/ui test`
  (`components.test.tsx`, `design-system.test.tsx`).
- Visual regression, axe, fonts, 44 px targets, runtime theming: `apps/web/e2e/` (`pnpm e2e`).
  Update baselines with `pnpm e2e --project=visual --update-snapshots`, then review the diff.

When you add a component, add it to the showcase (with its variants and states) and to the tests.
