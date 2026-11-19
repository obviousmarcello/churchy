import Link from "next/link";
import { Alert, Badge, ButtonLink, type BadgeTone } from "@churchy/ui";
import { AdminPage, DataTable } from "@/components/admin";
import { MemberActiveButton } from "@/components/admin/users/member-active-button";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import {
  activeEditors,
  activeWorkspaceUsers,
  isLastActiveOwner,
  memberState,
  type MemberState,
} from "@/lib/admin/users";
import { limitStatus } from "@/lib/plans/entitlements";
import { tierStatus } from "@/lib/workspace/plan-tier";
import { canServer } from "@/lib/permissions/server";
import { adminData, mayOpen } from "@/server/content-admin";
import { entitlementsFor } from "@/server/plans";
import { getRequestContext } from "@/server/session";
import { setMemberActiveAction } from "@/server/user-actions";
import type { Member } from "@churchy/contracts";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.users")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

const STATE_TONE: Record<MemberState, BadgeTone> = {
  active: "success",
  invited: "info",
  inactive: "neutral",
};

/** *Felhasználók és szerepkörök* (D-26): list, invite, change roles, deactivate. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [nav, t, query] = await Promise.all([
    getT("common.nav"),
    getT("admin.users"),
    searchParams,
  ]);
  const title = nav("sections.users");
  if (!(await mayOpen("users"))) return <AdminPage title={title} section="users" />;
  const { ctx, repos } = await adminData();
  const [members, ent, context] = await Promise.all([
    repos.members.list(ctx),
    entitlementsFor(ctx),
    getRequestContext(),
  ]);
  const tenantId = context.tenantId ?? "";

  // Which rows this actor may change: `can()` decides, per row, on the member's website role.
  const editable = new Map<string, boolean>(
    await Promise.all(
      members.map(
        async (m) =>
          [
            m.userId,
            await canServer("site.users.manage", {
              tenantId,
              targetRoles: m.role === null ? [] : [m.role],
            }),
          ] as const,
      ),
    ),
  );

  const ws = tierStatus(ent.wsTier, activeWorkspaceUsers(members));
  const editors = limitStatus(activeEditors(members), ent.maxEditors);

  const upgradeLink = (
    <Link href="/admin/csomag" className="font-semibold text-primary underline">
      {t("tier.upgrade")}
    </Link>
  );

  return (
    <AdminPage
      title={title}
      lead={t("lead")}
      section="users"
      breadcrumbs={[{ label: title }]}
      testId="admin-users"
      actions={<ButtonLink href="/admin/felhasznalok/uj">{t("newButton")}</ButtonLink>}
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      {ws.level === "warning" || ws.level === "full" ? (
        <Alert
          tone={ws.level === "full" ? "danger" : "warning"}
          title={t(`tier.${ws.level}.title`)}
          action={upgradeLink}
          data-testid={`tier-${ws.level}`}
        >
          <p>{t(`tier.${ws.level}.body`, { used: ws.used, cap: ws.cap })}</p>
        </Alert>
      ) : null}
      {editors.level === "warning" || editors.level === "full" ? (
        <Alert
          tone={editors.level === "full" ? "danger" : "warning"}
          title={t(`editors.${editors.level}.title`)}
          action={upgradeLink}
          data-testid={`editors-${editors.level}`}
        >
          <p>{t(`editors.${editors.level}.body`, { used: editors.used, cap: editors.cap ?? 0 })}</p>
        </Alert>
      ) : null}
      <DataTable<Member>
        caption={t("table.caption")}
        testId="users-table"
        rows={members}
        rowKey={(m) => m.userId}
        empty={t("empty")}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            rowHeader: true,
            cell: (m) => (
              <span className="flex flex-col">
                <span className="font-semibold">{m.user.name}</span>
                <span className="text-fs-2 text-muted">{m.user.email}</span>
              </span>
            ),
          },
          {
            key: "role",
            header: t("table.role"),
            cell: (m) =>
              m.role === null ? (
                <span className="text-muted">–</span>
              ) : (
                <Badge>{t(`roles.${m.role}`)}</Badge>
              ),
          },
          {
            key: "ws",
            header: t("table.workspace"),
            cell: (m) =>
              m.wsRoles.length === 0 ? (
                <span className="text-muted">–</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {m.wsRoles.map((r) => (
                    <Badge key={r} tone="info">
                      {t(`wsRoles.${r}`)}
                    </Badge>
                  ))}
                </span>
              ),
          },
          {
            key: "state",
            header: t("table.state"),
            cell: (m) => {
              const state = memberState(m);
              return (
                <Badge tone={STATE_TONE[state]} data-testid="member-state" data-state={state}>
                  {t(`states.${state}`)}
                </Badge>
              );
            },
          },
          {
            key: "actions",
            header: t("table.actions"),
            align: "end",
            cell: (m) => {
              if (editable.get(m.userId) !== true) {
                return <span className="text-fs-2 text-muted">{t("notYours")}</span>;
              }
              const last = isLastActiveOwner(members, m.userId);
              return (
                <span
                  className="flex flex-wrap items-center justify-end gap-2"
                  data-testid="member-row-actions"
                >
                  <ButtonLink
                    href={`/admin/felhasznalok/${m.userId}`}
                    variant="secondary"
                    size="sm"
                    aria-label={t("editAria", { name: m.user.name })}
                  >
                    {t("edit")}
                  </ButtonLink>
                  <MemberActiveButton
                    name={m.user.name}
                    activate={!m.active}
                    onChange={setMemberActiveAction.bind(null, m.userId, !m.active)}
                    lockedReason={last && m.active ? t("lastOwner") : undefined}
                  />
                </span>
              );
            },
          },
        ]}
      />
      <p className="text-fs-2 text-muted">{t("mockNote")}</p>
    </AdminPage>
  );
}
