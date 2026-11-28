import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { orgActor, tenantActor, type Actor } from "@churchy/policy";
import { Can, PermissionsProvider, useCan } from "./client";
import { filterNav, type PermissionNavItem } from "./nav";

const TENANT = "t-1";
const editor = tenantActor({
  tenantId: TENANT,
  userId: "u",
  personId: "p",
  websiteRoles: ["editor"],
});
const owner = tenantActor({
  tenantId: TENANT,
  userId: "u",
  personId: "p",
  websiteRoles: ["owner"],
});
const anonymous: Actor = { kind: "anonymous" };
const ctx = { tenantId: TENANT };

function Probe() {
  return <span>{useCan("news.publish", { tenantId: TENANT }) ? "yes" : "no"}</span>;
}

describe("client helpers", () => {
  it("useCan follows the real policy", () => {
    render(
      <PermissionsProvider actor={owner}>
        <Probe />
      </PermissionsProvider>,
    );
    expect(screen.getByText("yes")).toBeInTheDocument();
  });

  it("denies without a provider and for anonymous actors", () => {
    const { unmount } = render(<Probe />);
    expect(screen.getByText("no")).toBeInTheDocument();
    unmount();
    render(
      <PermissionsProvider actor={anonymous}>
        <Probe />
      </PermissionsProvider>,
    );
    expect(screen.getByText("no")).toBeInTheDocument();
  });

  it("<Can> renders children or the fallback", () => {
    const ui = (actor: Actor) => (
      <PermissionsProvider actor={actor}>
        <Can action="site.delete" resource={{ tenantId: TENANT }} fallback={<i>denied</i>}>
          <b>allowed</b>
        </Can>
      </PermissionsProvider>
    );
    const { rerender } = render(ui(owner));
    expect(screen.getByText("allowed")).toBeInTheDocument();
    rerender(ui(editor));
    expect(screen.queryByText("allowed")).toBeNull();
    expect(screen.getByText("denied")).toBeInTheDocument();
  });
});

const items: PermissionNavItem[] = [
  { id: "public", label: "Public", href: "/" },
  { id: "admin", label: "Admin", href: "/admin", requires: { action: "site.delete" } },
  {
    id: "content",
    label: "Content",
    href: "#",
    children: [
      { id: "news", label: "News", href: "/n", requires: { action: "news.publish" } },
      { id: "nav", label: "Menu", href: "/m", requires: { action: "site.navigation.edit" } },
    ],
  },
  {
    id: "org",
    label: "Org",
    href: "/o",
    requires: { action: "org.portal.open", resource: () => ({ orgId: "o-1" }) },
  },
  { id: "mod", label: "Mod", href: "/mod", module: "news" },
  { id: "ent", label: "Ent", href: "/ent", entitlement: "x" },
];
const ids = (list: readonly PermissionNavItem[]) => list.map((i) => i.id);

describe("filterNav", () => {
  it("shows only ungated items to anonymous visitors", () => {
    expect(ids(filterNav(items, anonymous, ctx))).toEqual(["public", "mod", "ent"]);
  });

  it("filters by can() and prunes children", () => {
    const result = filterNav(items, editor, ctx);
    expect(ids(result)).toEqual(["public", "content", "mod", "ent"]);
    expect(ids(result[1]?.children ?? [])).toEqual(["news"]);
    expect(ids(filterNav(items, owner, ctx))).toContain("admin");
  });

  it("drops parents whose children are all denied", () => {
    expect(ids(filterNav(items, anonymous, ctx))).not.toContain("content");
  });

  it("resolves org resources", () => {
    const org = orgActor({ orgId: "o-1", userId: "u", personId: null, orgRoles: ["orgHrAdmin"] });
    expect(ids(filterNav(items, org, { orgId: "o-1" }))).toContain("org");
  });

  it("applies module and entitlement stubs", () => {
    const gated = { ...ctx, isModuleEnabled: () => false, hasEntitlement: () => false };
    expect(ids(filterNav(items, anonymous, gated))).toEqual(["public"]);
  });
});
