import { redirect } from "next/navigation";
import {
  InviteMemberInputSchema,
  isContractError,
  type Member,
  type Repositories,
  type TenantRole,
} from "@churchy/contracts";
import { getT } from "@/i18n/server";
import { canServer } from "@/lib/permissions/server";
import { getRequestContext } from "@/server/session";
import {
  formValues,
  validate,
  type ErrorMessages,
  type FieldDef,
  type FormState,
  type FormValues,
} from "@/lib/admin/content-form";
import { limitStatus } from "@/lib/plans/entitlements";
import {
  USER_FIELDS,
  USER_ROLES,
  USER_WS_ROLES,
  activeEditors,
  activeWorkspaceUsers,
  parseUserForm,
  wsField,
  type UserFormInput,
} from "@/lib/admin/users";
import { tierStatus } from "@/lib/workspace/plan-tier";
import { entitlementsFor } from "@/server/plans";
import type { AuthorizedScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * User management saves (D-26). Called from the policy-wrapped actions in `user-actions.ts`
 * (`site.users.manage`) only. Plan limits come from `entitlements()`; the last active owner can
 * neither be demoted nor deactivated (the repository refuses it, FR-308).
 */

type UserScope = AuthorizedScope<"site.users.manage">;

export type ActiveOutcome = "ok" | "lastOwner" | "limit" | "notFound";

const invalid = (errors: Record<string, string>, values: FormValues): FormState => ({
  status: "invalid",
  errors,
  values,
});

async function errorMessages(): Promise<ErrorMessages> {
  const t = await getT("admin.content.errors");
  return {
    required: t("required"),
    slugTaken: t("slugTaken"),
    slugFormat: t("slugFormat"),
    sunday: t("sunday"),
    weekTaken: t("weekTaken"),
    announcementEmpty: t("announcementEmpty"),
    endBeforeStart: t("endBeforeStart"),
    phone: t("phone"),
    postalCode: t("postalCode"),
    address: t("address"),
    notFound: t("notFound"),
    general: t("general"),
  };
}

/** Role changes are audit-logged (to the application log until the audit log exists, D-40). */
function logRoleChange(
  kind: "invited" | "changed" | "activated" | "deactivated",
  scope: UserScope,
) {
  console.info(
    JSON.stringify({ type: `audit.member.${kind}`, tenantId: scope.context.tenantId ?? null }),
  );
}

/** Whether another workspace user / editor fits the plan (D-87 AC2: block at 100 %). */
async function limitProblem(
  scope: UserScope,
  repos: Repositories,
  adding: { ws: boolean; editor: boolean },
): Promise<"wsFull" | "wsDisabled" | "editorsFull" | null> {
  const [ent, members] = await Promise.all([
    entitlementsFor(scope.ctx),
    repos.members.list(scope.ctx),
  ]);
  if (adding.ws) {
    const status = tierStatus(ent.wsTier, activeWorkspaceUsers(members));
    if (status.level === "disabled") return "wsDisabled";
    if (!status.canInvite) return "wsFull";
  }
  if (adding.editor && !limitStatus(activeEditors(members), ent.maxEditors).allowsMore) {
    return "editorsFull";
  }
  return null;
}

export async function inviteMember(scope: UserScope, form: FormData): Promise<FormState> {
  const values = formValues(form, USER_FIELDS);
  const [m, t, repos] = await Promise.all([
    errorMessages(),
    getT("admin.users.errors"),
    getRequestRepositories(),
  ]);
  const parsed = parseUserForm(values);
  if (parsed === undefined) return invalid({ role: t("unknownRole") }, values);
  if (parsed.role === null && parsed.wsRoles.length === 0) {
    return invalid({ role: t("needRole") }, values);
  }
  const checked = validate(
    InviteMemberInputSchema,
    { email: values["email"]?.trim(), name: values["name"]?.trim(), ...parsed },
    USER_FIELDS,
    m,
  );
  if (!checked.ok) return invalid(checked.errors, values);

  const problem = await limitProblem(scope, repos, {
    ws: parsed.wsRoles.length > 0,
    editor: parsed.role !== null,
  });
  if (problem !== null) return invalid({ _form: t(problem) }, values);

  try {
    await repos.members.invite(scope.ctx, checked.data);
  } catch (error) {
    if (isContractError(error, "CONFLICT")) return invalid({ email: t("alreadyMember") }, values);
    throw error;
  }
  logRoleChange("invited", scope);
  redirect("/admin/felhasznalok?mentve=1");
}

/** Whether `next` adds this member to a limited group they are not in already. */
function newlyCounted(before: Member, next: UserFormInput) {
  return {
    ws: before.wsRoles.length === 0 && next.wsRoles.length > 0,
    editor: before.role === null && next.role !== null,
  };
}

export async function updateMember(
  scope: UserScope,
  userId: string,
  form: FormData,
): Promise<FormState> {
  const values = formValues(form, USER_FIELDS);
  const [t, repos] = await Promise.all([getT("admin.users.errors"), getRequestRepositories()]);
  const before = await repos.members.get(scope.ctx, userId);
  if (before === null) return invalid({ _form: t("notFound") }, values);
  const parsed = parseUserForm(values);
  if (parsed === undefined) return invalid({ role: t("unknownRole") }, values);
  if (parsed.role === null && parsed.wsRoles.length === 0) {
    return invalid({ role: t("needRole") }, values);
  }
  if (before.active) {
    const problem = await limitProblem(scope, repos, newlyCounted(before, parsed));
    if (problem !== null) return invalid({ _form: t(problem) }, values);
  }
  try {
    await repos.members.update(scope.ctx, userId, parsed);
  } catch (error) {
    if (isContractError(error, "CONFLICT")) return invalid({ role: t("lastOwner") }, values);
    throw error;
  }
  logRoleChange("changed", scope);
  redirect("/admin/felhasznalok?mentve=1");
}

export async function setMemberActive(
  scope: UserScope,
  userId: string,
  active: boolean,
): Promise<ActiveOutcome> {
  const repos = await getRequestRepositories();
  const before = await repos.members.get(scope.ctx, userId);
  if (before === null) return "notFound";
  if (active && !before.active) {
    const problem = await limitProblem(scope, repos, {
      ws: before.wsRoles.length > 0,
      editor: before.role !== null,
    });
    if (problem !== null) return "limit";
  }
  try {
    await repos.members.update(scope.ctx, userId, { active });
  } catch (error) {
    if (isContractError(error, "CONFLICT")) return "lastOwner";
    throw error;
  }
  logRoleChange(active ? "activated" : "deactivated", scope);
  return "ok";
}

/** The website roles the acting user may hand out, decided by `can()` per role (admins: no owners). */
export async function assignableRoles(): Promise<TenantRole[]> {
  const tenantId = (await getRequestContext()).tenantId ?? "";
  const allowed = await Promise.all(
    USER_ROLES.map((r) => canServer("site.users.manage", { tenantId, targetRoles: [r] })),
  );
  return USER_ROLES.filter((_, i) => allowed[i]);
}

/** Field descriptors of the invite / edit form (translated). */
export async function userFields(options: {
  identity: boolean;
  roles: readonly TenantRole[];
}): Promise<FieldDef[]> {
  const t = await getT("admin.users");
  const roles = options.roles;
  return [
    ...(options.identity
      ? ([
          { name: "name", label: t("fields.name"), kind: "text", required: true },
          { name: "email", label: t("fields.email"), kind: "email", required: true },
        ] satisfies FieldDef[])
      : []),
    {
      name: "role",
      label: t("fields.role"),
      help: t("fields.roleHelp"),
      kind: "select",
      placeholder: t("fields.roleNone"),
      options: roles.map((r) => ({ value: r, label: t(`roles.${r}`) })),
    },
    { name: "groups", label: t("fields.groups"), help: t("fields.groupsHelp"), kind: "text" },
    { name: "wsHeading", label: t("fields.wsHeading"), kind: "heading" },
    ...USER_WS_ROLES.map((r): FieldDef => ({
      name: wsField(r),
      label: t(`wsRoles.${r}`),
      kind: "checkbox",
    })),
  ];
}
