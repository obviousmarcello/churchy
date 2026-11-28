import "server-only";

import { z } from "zod";

import { canManageGroup, GROUPS_MAX } from "@/lib/music/groups";
import {
  AREA_MEMBERS_MAX,
  TEMPLATE_NAME_MAX_LENGTH,
  VOLUNTEER_TEMPLATES_MAX,
  type ServiceAreaDTO,
  type VolunteerTemplateDTO,
} from "@/lib/music/volunteer-templates";
import { requireEventAdmin, requireGroupManager } from "@/server/music/auth";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { zodMessage } from "@/server/music/zod-i18n";
import { groupRightsOf, listServiceAreas } from "./groups";
import { databaseError, idList, idSchema, isId, parseInput, requiredText } from "./shared";

// Volunteer templates: the groups (service areas) of a kind of event, e.g.
// "Sunday service" with Music, Band and Broadcast (see the migrations
// `volunteer_templates` and `groups`). The members of the groups are the
// usual people. The event admins and the superadmins create, rename and
// delete the templates and change all their groups. A leader of a group adds
// it to a template or removes it.

const DUPLICATE_USER = zodMessage(({ m }) => m.server.volunteerTemplates.duplicateUser);
const DUPLICATE_AREA = zodMessage(({ m }) => m.server.volunteerTemplates.duplicateArea);

/** The users of each group, each group once: the teams of an event (`event-teams.ts`). */
export const areaMembersSchema = z
  .array(z.strictObject({ areaId: idSchema, userIds: idList(AREA_MEMBERS_MAX, DUPLICATE_USER) }))
  .max(GROUPS_MAX)
  .refine((areas) => new Set(areas.map((area) => area.areaId)).size === areas.length, {
    message: DUPLICATE_AREA,
  });

const templateInputSchema = z.strictObject({
  name: requiredText(TEMPLATE_NAME_MAX_LENGTH),
  areaIds: idList(GROUPS_MAX, DUPLICATE_AREA),
});

export type TemplateInput = z.input<typeof templateInputSchema>;

const TEMPLATE_NAME_TAKEN = () =>
  new ValidationError([
    { path: "name", message: ({ m }) => m.server.volunteerTemplates.templateNameTaken },
  ]);
// A group was deleted after the page loaded.
const MEMBER_MISSING = () =>
  new ConflictError(({ m }) => m.server.volunteerTemplates.memberMissing);
// The database checks the limit (see the migration `volunteer_template_limits`).
const TOO_MANY_TEMPLATES = () =>
  new ConflictError(({ m, format }) =>
    format(m.server.volunteerTemplates.tooManyTemplates, { max: VOLUNTEER_TEMPLATES_MAX }),
  );

/** All templates by name with their groups, and all groups in the order of the tree. For the event admins and the leaders. */
export async function listVolunteerTemplates(): Promise<{
  templates: VolunteerTemplateDTO[];
  areas: ServiceAreaDTO[];
}> {
  await requireGroupManager();
  const supabase = await getMusicSupabase();
  const [templates, templateAreas, areas] = await Promise.all([
    supabase.from("volunteer_templates").select("id, name").order("name"),
    supabase.from("volunteer_template_areas").select("template_id, area_id"),
    listServiceAreas(),
  ]);
  if (templates.error) throw databaseError("list volunteer templates", templates.error);
  if (templateAreas.error)
    throw databaseError("list volunteer template groups", templateAreas.error);

  const byTemplate = new Map<string, Set<string>>();
  for (const row of z
    .array(z.object({ template_id: z.uuid(), area_id: z.uuid() }))
    .parse(templateAreas.data)) {
    const ids = byTemplate.get(row.template_id) ?? new Set();
    ids.add(row.area_id);
    byTemplate.set(row.template_id, ids);
  }

  return {
    templates: z
      .array(z.object({ id: z.uuid(), name: z.string() }))
      .parse(templates.data)
      .map((template) => ({
        id: template.id,
        name: template.name,
        areaIds: areas
          .filter((area) => byTemplate.get(template.id)?.has(area.id))
          .map((area) => area.id),
      })),
    areas,
  };
}

/** Creates a template with its groups. Returns its id. */
export async function createVolunteerTemplate(input: unknown): Promise<string> {
  await requireEventAdmin();
  const template = parseInput(templateInputSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("create_volunteer_template", {
    p_name: template.name,
    p_area_ids: template.areaIds,
  });
  if (error) {
    throw databaseError("create volunteer template", error, {
      "23505": TEMPLATE_NAME_TAKEN,
      "23503": MEMBER_MISSING,
      "P0001:too_many_volunteer_templates": TOO_MANY_TEMPLATES,
    });
  }
  return z.uuid().parse(data);
}

/** Renames a template. Returns false if there is no such template. */
export async function renameVolunteerTemplate(id: string, name: unknown): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id)) return false;
  const templateName = parseInput(templateInputSchema.pick({ name: true }), { name }).name;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("volunteer_templates")
    .update({ name: templateName })
    .eq("id", id)
    .select("id");
  if (error)
    throw databaseError("rename volunteer template", error, { "23505": TEMPLATE_NAME_TAKEN });
  return data.length > 0;
}

/**
 * Adds a group to a template (`on`), or removes it: for a leader of the
 * group, and for the event admins. Returns false if there is no such template.
 */
export async function setVolunteerTemplateArea(
  templateId: string,
  areaId: string,
  on: unknown,
): Promise<boolean> {
  if (!isId(templateId)) return false;
  const area = parseInput(idSchema, areaId);
  const value = parseInput(z.boolean(), on);
  const user = await requireGroupManager();
  if (!canManageGroup(await groupRightsOf(user), area)) throw new ForbiddenError();

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_volunteer_template_area", {
    p_template_id: templateId,
    p_area_id: area,
    p_on: value,
  });
  if (error)
    throw databaseError("set volunteer template group", error, { "23503": MEMBER_MISSING });
  return z.boolean().parse(data);
}

/** Returns false if there is no such template. */
export async function deleteVolunteerTemplate(id: string): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id)) return false;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("volunteer_templates")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("delete volunteer template", error);
  return data.length > 0;
}

/** The form of `p_teams` in `set_event_teams()`. */
export function toMembersParam(members: z.output<typeof areaMembersSchema>) {
  return members.map((area) => ({ area_id: area.areaId, user_ids: area.userIds }));
}
