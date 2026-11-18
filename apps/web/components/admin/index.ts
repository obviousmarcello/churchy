/**
 * Admin kit (D-18): the building blocks every admin screen uses. Import from here.
 *
 * - `AdminPage` — standard screen: breadcrumbs, `AdminHeader`, content; `section="news"` makes
 *   `can()` (via `buildAppNav()`) gate the content.
 * - `AdminHeader` — `h1` + lead + one primary action.
 * - `AdminBreadcrumbs` — trail below the dashboard (rendered by `AdminPage` from `breadcrumbs`).
 * - `DataTable` — read-only list table (caption, row headers, empty state, horizontal scroll).
 * - `FormField` — label/help/error wrapper for custom controls; use `Input`, `Select`,
 *   `Textarea`, `Checkbox` from `@churchy/ui` for standard ones.
 * - `SectionPlaceholder` — "coming soon" body of a section that is not built yet.
 *
 * The frame itself (top bar, sidebar, mobile menu) comes from `app/admin/layout.tsx`; pages never
 * render it. Strings come from `messages/hu.json` (`admin.*`), formatting from `@churchy/ui`
 * (`FormattedDate`, …); mutations use `withPolicy()` (`server/policy.ts`).
 */
export { AdminBreadcrumbs, AdminHeader, AdminNoAccess, AdminPage } from "./admin-page";
export type { AdminHeaderProps, AdminPageProps, Crumb } from "./admin-page";
export { DataTable } from "./data-table";
export type { DataTableColumn, DataTableProps } from "./data-table";
export { FormField } from "./form-field";
export type { FormFieldControlProps, FormFieldProps } from "./form-field";
export { SectionPlaceholder } from "./section-placeholder";
export type { AdminSectionId } from "./section-placeholder";
