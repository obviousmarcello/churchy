import type { ReactNode } from "react";
import { cn } from "@churchy/ui";

export interface DataTableColumn<Row> {
  /** Stable key of the column. */
  key: string;
  /** Column heading (translated by the caller). */
  header: string;
  /** Renders the cell. May return links, badges, `<FormattedDate>` … */
  cell: (row: Row) => ReactNode;
  /** Make this column's cells row headers (`<th scope="row">`); use for the title column. */
  rowHeader?: boolean;
  align?: "start" | "end";
}

export interface DataTableProps<Row> {
  /** Accessible name of the table; shown above it unless `captionHidden`. */
  caption: string;
  captionHidden?: boolean;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Shown instead of the table when there are no rows (e.g. "Nincs még hír."). */
  empty: ReactNode;
  testId?: string;
}

/**
 * Simple read-only table for admin lists. Scrolls horizontally on narrow screens (the scroll area
 * is keyboard-focusable and labelled). Sorting and filtering are the caller's job: pass the rows
 * in the order to show (sort with `huCollator`).
 */
export function DataTable<Row>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowKey,
  empty,
  testId,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-md border-2 border-dashed border-border-strong p-6 text-muted"
        data-testid={testId}
      >
        {empty}
      </div>
    );
  }
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      data-testid={testId}
      className="overflow-x-auto rounded-md border-2 border-border-strong bg-surface-raised"
    >
      <table className="w-full min-w-[32rem] border-collapse text-left text-fs-3">
        <caption className={cn("p-3 text-left font-bold", captionHidden && "sr-only")}>
          {caption}
        </caption>
        <thead className="bg-surface-sunken text-fs-2">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "border-b-2 border-border-strong px-4 py-3 font-bold",
                  c.align === "end" && "text-right",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-b-0">
              {columns.map((c) =>
                c.rowHeader ? (
                  <th
                    key={c.key}
                    scope="row"
                    className={cn("px-4 py-3 font-semibold", c.align === "end" && "text-right")}
                  >
                    {c.cell(row)}
                  </th>
                ) : (
                  <td key={c.key} className={cn("px-4 py-3", c.align === "end" && "text-right")}>
                    {c.cell(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
