"use server";

import { errorState, text, type FormState } from "@/server/music/form-state";
import { createGroup, deleteGroup, setGroupMembers } from "@/server/music/models/groups";
import { musicEvents } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";

// Groups (the music area tree): `music.group.manage` (leader, music leader); the models check the
// leader rights of the group again (`requireRights`).

export const createGroupAction = withPolicy(
  "music.group.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<FormState> => {
    try {
      await createGroup(text(formData, "parentId"), text(formData, "name"));
      return { status: "success", message: null, fieldErrors: {} };
    } catch (error) {
      return errorState(error, ({ m }) => m.groups.failed);
    }
  },
);

export const deleteGroupAction = withPolicy(
  "music.group.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<FormState> => {
    try {
      await deleteGroup(text(formData, "id"));
      return { status: "success", message: null, fieldErrors: {} };
    } catch (error) {
      return errorState(error, ({ m }) => m.groups.failed);
    }
  },
);

/** Members come as `userId` fields; the checked `leader-<userId>` fields mark the leaders. */
export const setGroupMembersAction = withPolicy(
  "music.group.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<FormState> => {
    try {
      await setGroupMembers(
        text(formData, "id"),
        formData.getAll("userId").map((userId) => ({
          userId: String(userId),
          isLeader: formData.get(`leader-${String(userId)}`) === "on",
        })),
      );
      return { status: "success", message: null, fieldErrors: {} };
    } catch (error) {
      return errorState(error, ({ m }) => m.groups.failed);
    }
  },
);
