"use server";

import type { FormState } from "@/lib/admin/content-form";
import { USER_FIELDS, parseUserForm, targetRolesOf } from "@/lib/admin/users";
import { formValues } from "@/lib/admin/content-form";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";
import { inviteMember, setMemberActive, updateMember } from "@/server/user-admin";

/**
 * Mutations of the user management screen (D-26). The resource handed to `can()` names the
 * website roles the change touches (the member's current and the new one), so an *Adminisztrátor*
 * can manage editors but never owners (SDD §11.3).
 */

async function tenantId(): Promise<string | null> {
  return (await getRequestContext()).tenantId ?? null;
}

export const inviteMemberAction = withPolicy(
  "site.users.manage",
  async (_scope: PolicyScope, _previous: FormState, form: FormData) => {
    const id = await tenantId();
    const parsed = parseUserForm(formValues(form, USER_FIELDS));
    return id === null || parsed === undefined
      ? null
      : { tenantId: id, targetRoles: targetRolesOf(null, parsed.role) };
  },
  (scope, _previous: FormState, form: FormData) => inviteMember(scope, form),
);

export const updateMemberAction = withPolicy(
  "site.users.manage",
  async (scope: PolicyScope, userId: string, _previous: FormState, form: FormData) => {
    const id = await tenantId();
    const parsed = parseUserForm(formValues(form, USER_FIELDS));
    const current = await (await getRequestRepositories()).members.get(scope.ctx, userId);
    return id === null || parsed === undefined || current === null
      ? null
      : { tenantId: id, targetRoles: targetRolesOf(current.role, parsed.role) };
  },
  (scope, userId: string, _previous: FormState, form: FormData) =>
    updateMember(scope, userId, form),
);

export const setMemberActiveAction = withPolicy(
  "site.users.manage",
  async (scope: PolicyScope, userId: string, _active: boolean) => {
    const id = await tenantId();
    const current = await (await getRequestRepositories()).members.get(scope.ctx, userId);
    return id === null || current === null
      ? null
      : { tenantId: id, targetRoles: targetRolesOf(current.role, null) };
  },
  (scope, userId: string, active: boolean) => setMemberActive(scope, userId, active),
);
