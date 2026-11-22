import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn";

export interface DataTableColumn<T> {
  /** Stable id of the column. */
  key: string;
  /** Column header text (from messages/hu.json); also the label of the cell in stacked layout. */
  header: string;
  cell: (row: T) => ReactNode;
  /** `end` for numbers and amounts. */
  align?: "start" | "center" | "end";
  /**
   * The row's main column (name, title): a row header (`th scope="row"`), bold, and the title of the
   * card in stacked layout. Use it on exactly one column.
   */
  primary?: boolean;
  /** Keep the cell on one line (dates, times, short codes). Other cells wrap: nothing is clipped. */
  nowrap?: boolean;
  /** Hide on narrow tables (still shown in stacked layout as label + value). */
  hideBelow?: "lg" | "xl";
  /** CSS width hint for the column, e.g. `"10rem"` or `"30%"`. */
  width?: string;
}

export interface DataTableProps<T> {
  /** Names the table (a `caption`); visually hidden unless `captionVisible`. */
  caption: string;
  captionVisible?: boolean;
  columns: DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Per-row actions (`IconButton`s or ghost buttons), right-aligned in the last column. */
  rowActions?: (row: T) => ReactNode;
  /** Header text of the actions column (visually hidden), e.g. "Műveletek". Required with `rowActions`. */
  actionsHeader?: string;
  /** Shown instead of the rows when there are none, usually `<EmptyState size="sm">`. */
  empty?: ReactNode;
  /**
   * - `stack` (default): a table from 48rem; below that every row becomes a card of label + value
   *   pairs, so nothing scrolls sideways or gets clipped on a phone.
   * - `scroll`: always a table, in a keyboard-scrollable region (wide grids, timetables).
   */
  layout?: "stack" | "scroll";
  /** Limits the height (e.g. `"28rem"`); the header then sticks inside the table's own scroll area. */
  maxHeight?: string;
  /** `compact` for dense admin lists. */
  density?: "comfortable" | "compact";
  /** Extra attributes per row (test ids, the selected state). */
  rowProps?: (row: T) => { "data-testid"?: string; selected?: boolean };
  className?: string;
  "data-testid"?: string;
}

const alignClass = { start: "text-left", center: "text-center", end: "text-right" } as const;
const hideClass = { lg: "md:max-lg:hidden", xl: "md:max-xl:hidden" } as const;

/**
 * Data table with a sticky header, row hover, row actions, an empty state and a responsive layout.
 * Server-safe (no client JavaScript); cells are render functions.
 *
 * Explicit ARIA table roles keep the semantics when the stacked layout changes `display`.
 */
export function DataTable<T>({
  caption,
  captionVisible = false,
  columns,
  rows,
  rowKey,
  rowActions,
  actionsHeader,
  empty,
  layout = "stack",
  maxHeight,
  density = "comfortable",
  rowProps,
  className,
  "data-testid": testId,
}: DataTableProps<T>) {
  const stack = layout === "stack";
  const scrolls = layout === "scroll" || maxHeight !== undefined;
  const cellPad = density === "compact" ? "px-3 py-2" : "px-4 py-3";
  const colCount = columns.length + (rowActions ? 1 : 0);

  const table = (
    <table
      role="table"
      className={cn(
        // Design v2: rows are separated by whitespace (border-spacing), not by lines.
        "w-full border-separate border-spacing-x-0 border-spacing-y-1 px-2 pb-1 text-left text-fs-3",
        stack && "max-md:block max-md:p-0",
      )}
    >
      <caption
        className={cn(
          captionVisible ? "px-3 pt-4 pb-1 text-left text-fs-4 font-semibold text-text" : "sr-only",
          captionVisible && stack && "max-md:block",
        )}
      >
        {caption}
      </caption>
      <thead role="rowgroup" className={cn(stack && "max-md:hidden")}>
        <tr role="row">
          {columns.map((col) => (
            <th
              key={col.key}
              role="columnheader"
              scope="col"
              style={col.width ? ({ width: col.width } as CSSProperties) : undefined}
              className={cn(
                "sticky top-(--table-sticky-top,0px) z-[1] bg-surface-raised",
                "text-fs-2 font-semibold whitespace-nowrap text-muted",
                cellPad,
                alignClass[col.align ?? "start"],
                col.hideBelow && hideClass[col.hideBelow],
              )}
            >
              {col.header}
            </th>
          ))}
          {rowActions ? (
            <th
              role="columnheader"
              scope="col"
              className={cn(
                "sticky top-(--table-sticky-top,0px) z-[1] w-px bg-surface-raised",
                cellPad,
              )}
            >
              <span className="sr-only">{actionsHeader}</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody role="rowgroup" className={cn(stack && "max-md:grid max-md:gap-2 max-md:p-2")}>
        {rows.length === 0 ? (
          <tr role="row" className={cn(stack && "max-md:block")}>
            <td role="cell" colSpan={colCount} className={cn(stack && "max-md:block")}>
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const extra = rowProps?.(row);
            return (
              <tr
                key={rowKey(row)}
                role="row"
                data-testid={extra?.["data-testid"]}
                data-selected={extra?.selected || undefined}
                className={cn(
                  "group/row [&>*]:transition-colors [&>*]:duration-(--dur-2) hover:[&>*]:bg-hover data-selected:[&>*]:bg-selected",
                  stack &&
                    "max-md:grid max-md:gap-1 max-md:rounded-[max(calc(var(--radius-card)_-_0.5rem),10px)] max-md:bg-surface-tint max-md:px-4 max-md:py-3 max-md:data-selected:bg-selected max-md:[&>*]:bg-transparent",
                )}
              >
                {columns.map((col) => {
                  const Cell = col.primary ? "th" : "td";
                  return (
                    <Cell
                      key={col.key}
                      role={col.primary ? "rowheader" : "cell"}
                      scope={col.primary ? "row" : undefined}
                      data-label={col.header}
                      className={cn(
                        "align-top [overflow-wrap:anywhere] first:rounded-s-[12px] last:rounded-e-[12px]",
                        cellPad,
                        alignClass[col.align ?? "start"],
                        col.primary ? "font-semibold text-text" : "font-normal text-text",
                        col.nowrap && "md:whitespace-nowrap",
                        col.hideBelow && hideClass[col.hideBelow],
                        stack &&
                          (col.primary
                            ? "max-md:block max-md:border-0 max-md:p-0 max-md:text-left max-md:text-fs-4"
                            : "max-md:grid max-md:grid-cols-[minmax(6.5rem,38%)_minmax(0,1fr)] max-md:gap-3 max-md:border-0 max-md:p-0 max-md:text-left max-md:before:text-fs-2 max-md:before:text-muted max-md:before:content-[attr(data-label)]"),
                      )}
                    >
                      {stack && !col.primary ? (
                        <span className="min-w-0">{col.cell(row)}</span>
                      ) : (
                        col.cell(row)
                      )}
                    </Cell>
                  );
                })}
                {rowActions ? (
                  <td
                    role="cell"
                    className={cn(
                      "text-right align-top whitespace-nowrap last:rounded-e-[12px]",
                      density === "compact" ? "px-2 py-1" : "px-2 py-1.5",
                      stack && "max-md:flex max-md:justify-end max-md:border-0 max-md:p-0",
                    )}
                  >
                    <div className="inline-flex items-center justify-end gap-1">
                      {rowActions(row)}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  return (
    <div
      data-testid={testId}
      data-layout={layout}
      className={cn(
        // Rounded container that clips (overflow: clip keeps the sticky header working).
        "min-w-0 overflow-clip rounded-card border border-hairline bg-surface-raised shadow-xs",
        className,
      )}
    >
      {scrolls ? (
        <div
          role="region"
          aria-label={caption}
          tabIndex={0}
          style={maxHeight ? { maxHeight } : undefined}
          className={cn(
            "overflow-x-auto rounded-[inherit] focus-visible:outline-offset-[-3px]",
            maxHeight && "overflow-y-auto",
          )}
        >
          {table}
        </div>
      ) : (
        table
      )}
    </div>
  );
}

/** Groups row actions (`IconButton`s) with consistent spacing; use inside `rowActions`. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="inline-flex items-center justify-end gap-1">{children}</div>;
}
