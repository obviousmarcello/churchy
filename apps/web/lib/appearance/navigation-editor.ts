import type { NavItem } from "@churchy/contracts";

/**
 * Pure state operations of the navigation and footer-link editors (FR-106, D-24): rename, reorder,
 * nest (max 2 levels), add and remove entries, external links. A *path* addresses an entry:
 * `[i]` is a top-level item, `[i, j]` the j-th child of item i.
 */

export type NavPath = readonly [number] | readonly [number, number];
export type NavLink = Omit<NavItem, "children">;

export const MAX_TOP_LEVEL = 12;
export const MAX_CHILDREN = 20;

const isExternal = (href: string) => /^https?:\/\//i.test(href.trim());

/** `external` follows the address, so it can never disagree with it. */
function normalise<T extends NavLink>(link: T): T {
  const href = link.href.trim();
  return { ...link, href, external: isExternal(href) };
}

export function addItem(items: readonly NavItem[], link: NavLink, parent?: number): NavItem[] {
  const entry = normalise(link);
  if (parent === undefined) {
    return items.length >= MAX_TOP_LEVEL ? [...items] : [...items, { ...entry, children: [] }];
  }
  return items.map((item, i) =>
    i === parent && item.children.length < MAX_CHILDREN
      ? { ...item, children: [...item.children, entry] }
      : item,
  );
}

export function removeItem(items: readonly NavItem[], path: NavPath): NavItem[] {
  if (path.length === 1) return items.filter((_, i) => i !== path[0]);
  return items.map((item, i) =>
    i === path[0] ? { ...item, children: item.children.filter((_, j) => j !== path[1]) } : item,
  );
}

function shift<T>(list: readonly T[], from: number, delta: number): T[] {
  const to = Math.min(Math.max(from + delta, 0), list.length - 1);
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Moves an entry up (`-1`) or down (`+1`) among its siblings. */
export function moveItem(items: readonly NavItem[], path: NavPath, delta: number): NavItem[] {
  if (path.length === 1) return shift(items, path[0], delta);
  return items.map((item, i) =>
    i === path[0] ? { ...item, children: shift(item.children, path[1], delta) } : item,
  );
}

/** Whether a top-level item can become a child of the item before it (max depth 2). */
export function canIndent(items: readonly NavItem[], path: NavPath): boolean {
  if (path.length !== 1 || path[0] === 0) return false;
  const item = items[path[0]];
  const previous = items[path[0] - 1];
  return (
    item !== undefined &&
    previous !== undefined &&
    item.children.length === 0 &&
    previous.children.length < MAX_CHILDREN
  );
}

/** Makes a top-level item a child of the previous one (it must not have children itself). */
export function indentItem(items: readonly NavItem[], path: NavPath): NavItem[] {
  if (!canIndent(items, path)) return [...items];
  const index = path[0];
  const { children: _children, ...link } = items[index]!;
  return items
    .map((item, i) => (i === index - 1 ? { ...item, children: [...item.children, link] } : item))
    .filter((_, i) => i !== index);
}

/** Moves a child back to the top level, right after its parent. */
export function outdentItem(items: readonly NavItem[], path: NavPath): NavItem[] {
  if (path.length !== 2 || items.length >= MAX_TOP_LEVEL) return [...items];
  const [parent, child] = path;
  const link = items[parent]?.children[child];
  if (link === undefined) return [...items];
  const next = items.map((item, i) =>
    i === parent ? { ...item, children: item.children.filter((_, j) => j !== child) } : item,
  );
  next.splice(parent + 1, 0, { ...link, children: [] });
  return next;
}

export function updateItem(
  items: readonly NavItem[],
  path: NavPath,
  patch: Partial<Pick<NavLink, "label" | "href">>,
): NavItem[] {
  const apply = <T extends NavLink>(link: T): T => normalise({ ...link, ...patch });
  if (path.length === 1) return items.map((item, i) => (i === path[0] ? apply(item) : item));
  return items.map((item, i) =>
    i === path[0]
      ? { ...item, children: item.children.map((c, j) => (j === path[1] ? apply(c) : c)) }
      : item,
  );
}

export type NavProblem = "label" | "href" | "tooMany";

/** Internal paths (`/hirek`) or absolute http(s) addresses; nothing else (no `javascript:`). */
export function hrefValid(href: string): boolean {
  const value = href.trim();
  if (value.length === 0 || value.length > 500) return false;
  if (value.startsWith("/")) return !value.startsWith("//") && !/\s/.test(value);
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export interface NavIssue {
  path: NavPath;
  problem: NavProblem;
}

function linkIssues(link: NavLink, path: NavPath): NavIssue[] {
  const issues: NavIssue[] = [];
  if (link.label.trim() === "" || link.label.length > 500) issues.push({ path, problem: "label" });
  if (!hrefValid(link.href)) issues.push({ path, problem: "href" });
  return issues;
}

/** Everything that blocks saving; empty when the navigation is valid. */
export function navigationIssues(items: readonly NavItem[]): NavIssue[] {
  const issues: NavIssue[] = [];
  items.forEach((item, i) => {
    issues.push(...linkIssues(item, [i]));
    item.children.forEach((child, j) => issues.push(...linkIssues(child, [i, j])));
  });
  return issues;
}

/** The same checks for a flat link list (footer). */
export function linkListIssues(links: readonly NavLink[]): NavIssue[] {
  return links.flatMap((link, i) => linkIssues(link, [i]));
}

export const samePath = (a: NavPath, b: NavPath) =>
  a.length === b.length && a.every((n, i) => n === b[i]);
