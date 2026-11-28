import { redirect } from "next/navigation";
import {
  RoomInputSchema,
  ServiceRoomBlockInputSchema,
  huCollator,
  isContractError,
  type Room,
  type ServiceRoomBlock,
} from "@churchy/contracts";
import { localParts, localToInstant } from "@churchy/booking";
import { addDays, formatPersonName } from "@churchy/hu";
import { getT } from "@/i18n/server";
import {
  formValues,
  repositoryErrors,
  validate,
  type ErrorMessages,
  type FieldDef,
  type FormState,
  type FormValues,
} from "@/lib/admin/content-form";
import type { AuthorizedScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Room catalog and service block admin (D-60/D-61): field descriptors, values and saving. Called
 * from the policy-wrapped actions in `room-admin-actions.ts` (`location.manage`) only.
 */

export const ROOM_FIELDS = [
  "name",
  "locationId",
  "kind",
  "capacity",
  "features",
  "wheelchair",
  "accessibleToilet",
  "hearingLoop",
  "parking",
  "manager1",
  "manager2",
  "whoCanRequest",
  "autoApprove",
  "holdHours",
  "minNoticeHours",
  "maxDurationMin",
  "horizonDays",
  "day1",
  "day2",
  "day3",
  "day4",
  "day5",
  "day6",
  "day7",
  "hoursFrom",
  "hoursTo",
  "blackoutName",
  "blackoutFrom",
  "blackoutTo",
  "active",
] as const;

export const BLOCK_FIELDS = [
  "locationId",
  "serviceType",
  "roomIds",
  "bufferBeforeMin",
  "bufferAfterMin",
] as const;

const on = (b: boolean): string => (b ? "on" : "");
const flag = (s: string | undefined): boolean => s === "on";
const num = (s: string | undefined): number | undefined =>
  s === undefined || s.trim() === "" ? undefined : Number(s);
const AUTO_ROLES = {
  leader: ["leader"],
  staff: ["leader", "employee"],
  everyone: ["leader", "employee", "volunteer", "teamLeader", "musicLeader", "roomManager"],
} as const;
type AutoKey = keyof typeof AUTO_ROLES;

function autoKeyOf(room?: Room): AutoKey {
  const roles = room?.approvalPolicy.autoApprove.roles ?? ["leader"];
  return roles.includes("volunteer" as never)
    ? "everyone"
    : roles.includes("employee" as never)
      ? "staff"
      : "leader";
}

/** Single bookable window per weekday set; richer stored hours are kept when untouched. */
function flattenHours(room?: Room) {
  const hours = room?.rules.bookableHours ?? [];
  return {
    days: new Set(hours.map((h) => h.weekday)),
    from: hours.length ? hours.map((h) => h.from).sort()[0]! : "",
    to: hours.length
      ? hours
          .map((h) => h.to)
          .sort()
          .at(-1)!
      : "",
  };
}

export async function roomFields(): Promise<FieldDef[]> {
  const t = await getT("admin.content.rooms.fields");
  const kinds = await getT("admin.content.rooms.kinds");
  const repos = await getRequestRepositories();
  const { getAdminCtx } = await import("@/server/admin");
  const ctx = await getAdminCtx();
  const [locations, people] = await Promise.all([
    repos.locations.list(ctx),
    repos.people.list(ctx),
  ]);
  const person = people
    .map((p) => ({
      value: p.id,
      label: formatPersonName({ familyName: p.familyName, givenName: p.givenName }),
    }))
    .sort((a, b) => huCollator.compare(a.label, b.label));
  const wd = await getT("admin.content.rooms.weekdays");
  return [
    { kind: "text", name: "name", label: t("name"), required: true },
    {
      kind: "select",
      name: "locationId",
      label: t("locationId"),
      required: true,
      options: locations.map((l) => ({ value: l.id, label: l.name })),
    },
    {
      kind: "select",
      name: "kind",
      label: t("kind"),
      required: true,
      options: (["room", "resource"] as const).map((k) => ({ value: k, label: kinds(k) })),
    },
    { kind: "number", name: "capacity", label: t("capacity") },
    { kind: "text", name: "features", label: t("features"), help: t("featuresHelp") },
    { kind: "heading", name: "_access", label: t("accessibility") },
    { kind: "checkbox", name: "wheelchair", label: t("wheelchair") },
    { kind: "checkbox", name: "accessibleToilet", label: t("accessibleToilet") },
    { kind: "checkbox", name: "hearingLoop", label: t("hearingLoop") },
    { kind: "checkbox", name: "parking", label: t("parking") },
    { kind: "heading", name: "_policy", label: t("policy") },
    {
      kind: "select",
      name: "manager1",
      label: t("manager1"),
      placeholder: t("none"),
      options: person,
    },
    {
      kind: "select",
      name: "manager2",
      label: t("manager2"),
      placeholder: t("none"),
      options: person,
    },
    {
      kind: "select",
      name: "whoCanRequest",
      label: t("whoCanRequest"),
      required: true,
      options: [
        { value: "all_workspace", label: t("whoAll") },
        { value: "all_staff", label: t("whoStaff") },
      ],
    },
    {
      kind: "select",
      name: "autoApprove",
      label: t("autoApprove"),
      help: t("autoApproveHelp"),
      required: true,
      options: (["leader", "staff", "everyone"] as const).map((k) => ({
        value: k,
        label: t(`auto.${k}`),
      })),
    },
    {
      kind: "number",
      name: "holdHours",
      label: t("holdHours"),
      help: t("holdHoursHelp"),
      required: true,
    },
    { kind: "heading", name: "_rules", label: t("rules") },
    { kind: "number", name: "minNoticeHours", label: t("minNoticeHours") },
    { kind: "number", name: "maxDurationMin", label: t("maxDurationMin") },
    { kind: "number", name: "horizonDays", label: t("horizonDays") },
    ...([1, 2, 3, 4, 5, 6, 7] as const).map((d): FieldDef => ({
      kind: "checkbox",
      name: `day${d}`,
      label: wd(String(d) as "1"),
    })),
    { kind: "text", name: "hoursFrom", label: t("hoursFrom"), help: t("hoursHelp") },
    { kind: "text", name: "hoursTo", label: t("hoursTo") },
    { kind: "text", name: "blackoutName", label: t("blackoutName") },
    { kind: "date", name: "blackoutFrom", label: t("blackoutFrom") },
    { kind: "date", name: "blackoutTo", label: t("blackoutTo") },
    { kind: "checkbox", name: "active", label: t("active") },
  ];
}

export function roomValues(room?: Room, defaultLocationId = ""): FormValues {
  const hours = flattenHours(room);
  const b = room?.rules.blackout?.[0];
  return {
    name: room?.name ?? "",
    locationId: room?.locationId ?? defaultLocationId,
    kind: room?.kind ?? "room",
    capacity: room?.capacity ? String(room.capacity) : "",
    features: room?.features.join(", ") ?? "",
    wheelchair: on(room?.accessibility.wheelchair ?? true),
    accessibleToilet: on(room?.accessibility.accessibleToilet ?? false),
    hearingLoop: on(room?.accessibility.hearingLoop ?? false),
    parking: on(room?.accessibility.parking ?? false),
    manager1: room?.managerPersonIds[0] ?? "",
    manager2: room?.managerPersonIds[1] ?? "",
    whoCanRequest: room?.rules.whoCanRequest === "all_staff" ? "all_staff" : "all_workspace",
    autoApprove: autoKeyOf(room),
    holdHours: String(room?.approvalPolicy.holdHours ?? 48),
    minNoticeHours:
      room?.rules.minNoticeHours !== undefined ? String(room.rules.minNoticeHours) : "",
    maxDurationMin:
      room?.rules.maxDurationMin !== undefined ? String(room.rules.maxDurationMin) : "",
    horizonDays: room?.rules.horizonDays !== undefined ? String(room.rules.horizonDays) : "",
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [`day${d}`, on(hours.days.has(d))])),
    hoursFrom: hours.from,
    hoursTo: hours.to,
    blackoutName: b?.name ?? "",
    blackoutFrom: b ? localParts(b.from).date : "",
    blackoutTo: b ? localParts(Date.parse(b.to) - 1).date : "",
    active: on(room?.active ?? true),
  };
}

async function messages(): Promise<ErrorMessages> {
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

const invalid = (errors: Record<string, string>, values: FormValues): FormState => ({
  status: "invalid",
  errors,
  values,
});
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveRoom(
  scope: AuthorizedScope<"location.manage">,
  id: string | null,
  form: FormData,
) {
  const v = formValues(form, ROOM_FIELDS);
  const m = await messages();
  const repos = await getRequestRepositories();
  const { ctx } = scope;
  const existing = id === null ? undefined : ((await repos.rooms.get(ctx, id)) ?? undefined);
  if (id !== null && existing === undefined) return invalid({ _form: m.notFound }, v);

  const errors: Record<string, string> = {};
  for (const n of ["name", "locationId", "holdHours"] as const) {
    if ((v[n] ?? "").trim() === "") errors[n] = m.required;
  }
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => flag(v[`day${d}`]));
  const from = (v["hoursFrom"] ?? "").trim();
  const to = (v["hoursTo"] ?? "").trim();
  if (days.length > 0 && (!HM.test(from) || !HM.test(to) || from >= to)) {
    errors["hoursFrom"] = m.endBeforeStart;
  }
  const bFrom = (v["blackoutFrom"] ?? "").trim();
  const bTo = (v["blackoutTo"] ?? "").trim();
  if ((v["blackoutName"] ?? "").trim() !== "" && (bFrom === "" || bTo === ""))
    errors["blackoutFrom"] = m.required;
  if (bFrom !== "" && bTo !== "" && bTo < bFrom) errors["blackoutTo"] = m.endBeforeStart;
  if (Object.keys(errors).length > 0) return invalid(errors, v);

  // Hours that were not touched keep the stored per-day windows.
  const flat = flattenHours(existing);
  const untouched =
    existing !== undefined &&
    days.length === flat.days.size &&
    days.every((d) => flat.days.has(d)) &&
    from === flat.from &&
    to === flat.to;
  const bookableHours =
    days.length === 0
      ? undefined
      : untouched
        ? existing.rules.bookableHours
        : days.map((weekday) => ({ weekday, from, to }));
  const blackout = [
    ...((v["blackoutName"] ?? "").trim() !== ""
      ? [
          {
            name: (v["blackoutName"] ?? "").trim(),
            from: localToInstant(bFrom, "00:00"),
            to: localToInstant(addDays(bTo, 1), "00:00"),
          },
        ]
      : []),
    ...(existing?.rules.blackout ?? []).slice(1),
  ];
  const features = (v["features"] ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f !== "");
  const auto =
    AUTO_ROLES[
      (v["autoApprove"] as AutoKey) in AUTO_ROLES ? (v["autoApprove"] as AutoKey) : "leader"
    ];
  const managers = [v["manager1"], v["manager2"]].filter(
    (x, i, all): x is string => !!x && all.indexOf(x) === i,
  );
  const parsed = validate(
    RoomInputSchema,
    {
      id: id ?? undefined,
      locationId: v["locationId"],
      name: v["name"],
      kind: v["kind"],
      capacity: num(v["capacity"]) ?? null,
      features,
      photoMediaIds: existing?.photoMediaIds ?? [],
      accessibility: {
        wheelchair: flag(v["wheelchair"]),
        accessibleToilet: flag(v["accessibleToilet"]),
        hearingLoop: flag(v["hearingLoop"]),
        parking: flag(v["parking"]),
        note: existing?.accessibility.note ?? null,
      },
      managerPersonIds: managers,
      approvalPolicy: {
        autoApprove: {
          roles: [...auto],
          teamIds: existing?.approvalPolicy.autoApprove.teamIds ?? [],
        },
        approvers: existing?.approvalPolicy.approvers ?? "room_managers",
        holdHours: num(v["holdHours"]),
      },
      rules: {
        ...(bookableHours ? { bookableHours } : {}),
        ...(num(v["minNoticeHours"]) !== undefined
          ? { minNoticeHours: num(v["minNoticeHours"]) }
          : {}),
        ...(num(v["maxDurationMin"]) !== undefined
          ? { maxDurationMin: num(v["maxDurationMin"]) }
          : {}),
        ...(num(v["horizonDays"]) !== undefined ? { horizonDays: num(v["horizonDays"]) } : {}),
        ...(blackout.length > 0 ? { blackout } : {}),
        whoCanRequest: v["whoCanRequest"] === "all_staff" ? "all_staff" : "all_workspace",
      },
      active: flag(v["active"]),
    },
    ROOM_FIELDS,
    m,
  );
  if (!parsed.ok) return invalid(parsed.errors, v);
  let saved: Room;
  try {
    saved = await repos.rooms.upsert(ctx, parsed.data);
  } catch (error) {
    return invalid(repositoryErrors(error, ROOM_FIELDS, m), v);
  }
  redirect(`/admin/termek/${saved.id}?mentve=1`);
}

export async function deleteRoom(
  scope: AuthorizedScope<"location.manage">,
  id: string,
): Promise<"ok" | "invalid" | "notFound"> {
  try {
    await (await getRequestRepositories()).rooms.delete(scope.ctx, id);
    return "ok";
  } catch (error) {
    if (isContractError(error, "NOT_FOUND")) return "notFound";
    if (isContractError(error, "CONFLICT")) return "invalid";
    throw error;
  }
}

// --- service blocks ----------------------------------------------------------------------------

export async function blockFields(): Promise<FieldDef[]> {
  const t = await getT("admin.content.rooms.blocks.fields");
  const repos = await getRequestRepositories();
  const { getAdminCtx } = await import("@/server/admin");
  const ctx = await getAdminCtx();
  const [locations, rooms] = await Promise.all([repos.locations.list(ctx), repos.rooms.list(ctx)]);
  return [
    {
      kind: "select",
      name: "locationId",
      label: t("locationId"),
      required: true,
      options: locations.map((l) => ({ value: l.id, label: l.name })),
    },
    {
      kind: "text",
      name: "serviceType",
      label: t("serviceType"),
      help: t("serviceTypeHelp"),
      required: true,
    },
    {
      kind: "select",
      name: "roomIds",
      label: t("room"),
      required: true,
      options: rooms.map((r) => ({ value: r.id, label: r.name })),
    },
    { kind: "number", name: "bufferBeforeMin", label: t("before") },
    { kind: "number", name: "bufferAfterMin", label: t("after") },
  ];
}

export function blockValues(b?: ServiceRoomBlock): FormValues {
  return {
    locationId: b?.locationId ?? "",
    serviceType: b?.serviceType ?? "",
    roomIds: b?.roomIds[0] ?? "",
    bufferBeforeMin: String(b?.bufferBeforeMin ?? 0),
    bufferAfterMin: String(b?.bufferAfterMin ?? 0),
  };
}

export async function saveBlock(
  scope: AuthorizedScope<"location.manage">,
  id: string | null,
  form: FormData,
) {
  const v = formValues(form, BLOCK_FIELDS);
  const m = await messages();
  const repos = await getRequestRepositories();
  const errors: Record<string, string> = {};
  for (const n of ["locationId", "serviceType", "roomIds"] as const) {
    if ((v[n] ?? "").trim() === "") errors[n] = m.required;
  }
  if (Object.keys(errors).length > 0) return invalid(errors, v);
  const existing =
    id === null ? null : (await repos.rooms.listServiceBlocks(scope.ctx)).find((b) => b.id === id);
  if (id !== null && !existing) return invalid({ _form: m.notFound }, v);
  const parsed = validate(
    ServiceRoomBlockInputSchema,
    {
      id: id ?? undefined,
      locationId: v["locationId"],
      serviceType: (v["serviceType"] ?? "").trim(),
      // The form maps one room; the extra rooms of a stored mapping stay.
      roomIds: [...new Set([v["roomIds"], ...(existing?.roomIds.slice(1) ?? [])])],
      bufferBeforeMin: num(v["bufferBeforeMin"]) ?? 0,
      bufferAfterMin: num(v["bufferAfterMin"]) ?? 0,
    },
    BLOCK_FIELDS,
    m,
  );
  if (!parsed.ok) return invalid(parsed.errors, v);
  try {
    await repos.rooms.upsertServiceBlock(scope.ctx, parsed.data);
  } catch (error) {
    return invalid(repositoryErrors(error, BLOCK_FIELDS, m), v);
  }
  redirect("/admin/termek?mentve=1");
}
