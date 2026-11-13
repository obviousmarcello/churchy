# @churchy/ui

Accessible core components for the public sites and the admin / workspace. Built on Tailwind CSS v4,
the CSS-variable tokens of `@churchy/themes`, and Radix primitives for dialogs and tabs.

See the live catalogue at **`/fejlesztes/komponensek`** in `apps/web` (dev-only; set
`HIDE_DEV_ROUTES=1` to return 404 in production). It lists every component and variant and is the
target of the visual and axe tests.

## The one rule: text comes from props

Components contain **no user-visible strings**, in any language. Labels, headings, aria-labels, help
and error messages, "close" buttons: all arrive as props, and the app reads them from
`messages/hu.json`.

```tsx
import messages from "@messages/hu.json";
import { Dialog, Input } from "@churchy/ui";

<Input label={t.nameLabel} help={t.nameHelp} error={errors.name} />
<Dialog title={t.title} closeLabel={messages.common.closeDialog} trigger={…} />
```

Icons are decorative (`aria-hidden`). Anything that needs an accessible name (menu toggle, dialog
close, nav landmarks) has a required label prop, so TypeScript reminds you.

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

## Tokens and Tailwind

Colours, fonts, radii and shadows are CSS custom properties (SDD 5.4). Tailwind utilities map onto
them, so a runtime change of a variable re-themes every component without a rebuild.

| Token group | Variables                                                                                                                      | Utilities                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Colour      | `--c-surface`, `--c-surface-raised`, `--c-text`, `--c-muted`, `--c-primary`, `--c-accent`, `--c-border-strong`, status colours | `bg-surface`, `text-muted`, `bg-primary text-primary-contrast`, `border-border-strong` |
| Typography  | `--font-heading`, `--font-body`, `--fs-1…--fs-7` (base `--fs-3` = 17 px)                                                       | `font-heading`, `text-fs-1…text-fs-7`                                                  |
| Shape       | `--radius-sm/md/lg`, `--shadow-card`                                                                                           | `rounded-md`, `shadow-card`                                                            |
| Spacing     | `--space-1…--space-12` (4 px grid)                                                                                             | Tailwind's own `p-4`, `gap-6` (same 4 px grid)                                         |
| Controls    | `--control-h-sm/md/lg`, `--focus-width`                                                                                        | `min-h-(--control-h-md)`                                                               |

Rules:

- Use token utilities, never raw hex values or Tailwind's default palette (it is removed on purpose).
- Do not rely on colour alone; pair it with text or an icon.
- `className` props are for layout (margin, width). Don't use them to override colours.
- Motion must respect `prefers-reduced-motion`; the base stylesheet already shortens all
  transitions when it is set. Keep focus outlines (`:focus-visible` is styled globally).

## Components

| Group      | Components                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Page       | `PageShell` (skip link, header, `main#tartalom`, footer), `SkipLink`, `Container`                             |
| Navigation | `Header` (responsive disclosure menu, one level of sub-items, CTA), `Footer`, `FooterLink`                    |
| Content    | `Hero` (`image-full` / `image-split` / `text-only`), `Card`, `SectionHeading`, `Ornament`                     |
| Actions    | `Button` (`primary`, `secondary`, `ghost`, `danger`; `sm`/`md`/`lg`), `ButtonLink`, `buttonClasses()`         |
| Forms      | `Input`, `Textarea`, `Select`, `Checkbox`, `DateInput`, `TimeInput`: each with label, help, error             |
| Feedback   | `Badge`, `Alert` (`inline` / `banner`)                                                                        |
| Overlays   | `Tabs`, `Dialog` + `DialogClose` (Radix)                                                                      |
| Scope      | `AdminScope`                                                                                                  |
| Formatted  | `FormattedDate`, `FormattedTime`, `PersonName`, `Address`, `Phone`, `BankAccount` (props only, `@churchy/hu`) |

Server components unless marked: `Header`, `Tabs`, `Dialog` and `AdminScope` are client components.

### Page skeleton

```tsx
<PageShell
  skipLinkLabel={messages.common.skipToContent}
  header={<Header brand={…} nav={…} cta={…} labels={{ navigation, openMenu, closeMenu }} />}
  footer={<Footer brand={…} columns={…} legal={…} legalLabel={…} />}
>
  <Hero variant={theme.heroStyle} title={…} image={{ src, alt, width, height }} />
</PageShell>
```

### Forms

Every control requires `label`. `help` and `error` are linked with `aria-describedby`; `error` also
sets `aria-invalid` and shows an icon (never colour alone). Mark optional fields with
`optionalLabel` instead of an asterisk on required ones.

### Images

`Hero` and `Card` take `{ src, alt, width, height }`. `alt` is required; pass `""` only for purely
decorative images. The hero image is fetched with high priority (it is the LCP element); card images
are lazy.

## Admin / workspace variant

Wrap the admin shell once. Every component inside switches to the high-contrast variant (SDD 11.2):
17 px base, sans-serif headings, no ornaments, stronger borders, and every control at least 44 px
tall.

```tsx
<AdminScope>…admin pages…</AdminScope>
```

Dialogs rendered inside portal back into the scope, so they stay in the admin variant. The variant
is independent of the tenant's public colours.

## Theming at runtime

`@churchy/themes` turns a `ThemeConfig` into CSS variables (`themeAttributes(config)` for SSR,
`applyTheme(element, config)` in the browser). Colours are validated for WCAG AA
(`validateThemeConfig`) and foreground colours are derived automatically. See
`packages/themes/src` and the "Téma" block in the showcase.

## Tests

- Unit (Vitest, jsdom, Testing Library): `pnpm --filter @churchy/ui test`
- Visual regression, axe, fonts, 44 px targets, runtime theming: `apps/web/e2e/` (`pnpm e2e`).
  Update baselines with `pnpm e2e --project=visual --update-snapshots`, then review the diff.

When you add a component, add it to the showcase (with its variants and states) and to the tests.
