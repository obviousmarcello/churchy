import "server-only";

import type { EventAnnouncementsDTO } from "@/lib/music/announcements/schema";
import type { EventScopeOptions } from "@/lib/music/event-scopes";
import type { EventImageSetsDTO } from "@/lib/music/projection/images";
import {
  resolveLook,
  type ProjectionLook,
  type ProjectionThemeDTO,
} from "@/lib/music/projection/themes";
import type { VolunteerReply } from "@/lib/music/volunteer-replies";
import type { EventTeamsDTO } from "@/lib/music/volunteer-templates";
import { requireUser } from "@/server/music/auth";
import { listEventAnnouncements } from "@/server/music/models/announcements";
import { listEventImageSets } from "@/server/music/models/event-images";
import { getEventConnection, type EventConnectionDTO } from "@/server/music/models/event-sync";
import {
  getEventTeams,
  getTeamEditor,
  type TeamEditorDTO,
} from "@/server/music/models/event-teams";
import {
  getEventDetail,
  listEventVolunteers,
  listGroupLabels,
  loadEventScopeOptions,
  usedGroupLabels,
  type EventDetailDTO,
  type VolunteerDTO,
} from "@/server/music/models/events";
import { getEventLiveSession } from "@/server/music/models/live-sessions";
import { listPeople, type PersonDTO } from "@/server/music/models/profiles";
import { readProjectionThemes } from "@/server/music/models/projection-themes";
import { canProjectEvent } from "@/server/music/models/realtime-access";
import { SETLIST_MAX_ITEMS } from "@/server/music/models/setlists";
import {
  listSongsWithArrangements,
  type SongWithArrangementsDTO,
} from "@/server/music/models/songs";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The data of the event page (the copy of Music Sheet DB's `events/(list)/[id]/data.ts`): Churchy
// renders per request, so the server resolves it and the view gets plain props. There is no browser
// page cache, hence `data` and `transient` come together and are always fresh.

export type EventPageData = {
  event: EventDetailDTO;
  /** With their replies, without emails. */
  volunteers: VolunteerDTO[];
  /** The reply of the user, or null if the user is not a volunteer of the event. */
  myReply: { reply: VolunteerReply | null; userId?: string } | null;
  /** Only shows the edit controls. The actions check the event admin role again. */
  canEditEvents: boolean;
  /** Only shows the projection button. The projection checks it again. */
  canProject: boolean;
  imageSets?: EventImageSetsDTO;
  /** The look of the projection theme of the event, for the previews of the images. */
  look?: ProjectionLook;
  announcements?: EventAnnouncementsDTO;
  teams?: EventTeamsDTO;
  /** The labels of the groups of the event, without the root group. */
  groupLabels?: Record<string, string>;
};

export type EventPageTransient = {
  /** With emails for the superadmins. */
  volunteers: VolunteerDTO[];
  /** The running live session that the user can join. */
  liveSessionId: string | null;
  /** The realtime connection for the changes of the event and its projection. */
  connection: EventConnectionDTO | null;
  /** Only shows the edit buttons of the songs. The save checks the song admin role again. */
  canEditSongs: boolean;
  /** The data of the edit forms, for the event admins. */
  admin: {
    users: PersonDTO[];
    /** True if `users` leaves out the users without a name. */
    unnamedHidden: boolean;
    catalog: SongWithArrangementsDTO[];
    maxItems: number;
    /** The projection themes, the default first, without their look. */
    themes: Pick<ProjectionThemeDTO, "id" | "name" | "isDefault">[];
    /** The groups of the "Groups" field of the edit and copy forms. */
    scope: EventScopeOptions;
  } | null;
  /** The data of the Teams dialog, for the event admins and the leaders of groups. */
  teamEditor?: TeamEditorDTO | null;
  /** The modules that are on, under the ids of the music app (`MusicModulesProvider`). */
  modules: Record<string, boolean>;
};

export type EventPageResult =
  { data: EventPageData; transient: EventPageTransient } | { notFound: "event" };

export async function loadEventPage(id: string): Promise<EventPageResult> {
  const user = await requireUser();
  const found = await getEventDetail(id);
  if (!found) return { notFound: "event" };
  // An event admin, also of this event's areas only (an area role): the models check again.
  const canEdit = await user.canManageIn("event", found.areaIds);
  // The model functions check the event admin role again. One read of the groups for both.
  const groupLabels = listGroupLabels();
  const [themesOn, imagesOn, announcementsOn, liveOn, projectionOn, sheetOn, textSlidesOn] =
    await Promise.all([
      isWorkspaceModuleOn("ws.music.projection.themes"),
      isWorkspaceModuleOn("ws.music.events.images"),
      isWorkspaceModuleOn("ws.music.events.announcements"),
      isWorkspaceModuleOn("ws.music.sheet.live"),
      isWorkspaceModuleOn("ws.music.projection"),
      isWorkspaceModuleOn("ws.music.sheet"),
      isWorkspaceModuleOn("ws.music.projection.text-slides"),
    ]);
  const [
    event,
    volunteers,
    liveSession,
    connection,
    users,
    catalog,
    themes,
    scope,
    imageSets,
    allThemes,
    announcements,
    teams,
    teamEditor,
    groups,
    canProject,
  ] = await Promise.all([
    Promise.resolve(found),
    listEventVolunteers(id),
    liveOn ? getEventLiveSession(id) : null,
    getEventConnection(id),
    canEdit ? listPeople() : null,
    canEdit ? listSongsWithArrangements() : null,
    canEdit ? (themesOn ? readProjectionThemes() : []) : null,
    canEdit ? loadEventScopeOptions(groupLabels, user) : null,
    imagesOn ? listEventImageSets(id) : undefined,
    themesOn ? readProjectionThemes() : [],
    announcementsOn ? listEventAnnouncements(id) : undefined,
    getEventTeams(id),
    getTeamEditor(),
    groupLabels,
    canProjectEvent(id),
  ]);
  if (!event) return { notFound: "event" };
  const me = volunteers.find((person) => person.id === user.id);

  return {
    data: {
      event,
      volunteers: volunteers.map((person) => ({ ...person, email: null })),
      myReply: me ? { reply: me.reply, userId: me.id } : null,
      canEditEvents: canEdit,
      canProject,
      imageSets,
      look: resolveLook(allThemes, null, event.projectionThemeId),
      announcements,
      teams,
      groupLabels: usedGroupLabels(groups, [event]),
    },
    transient: {
      volunteers,
      liveSessionId: liveSession?.id ?? null,
      connection,
      canEditSongs: user.canEditSongs,
      admin:
        users && catalog && themes && scope
          ? {
              users,
              unnamedHidden: !user.isSuperadmin,
              catalog,
              maxItems: SETLIST_MAX_ITEMS,
              themes: themes.map(({ id, name, isDefault }) => ({ id, name, isDefault })),
              scope,
            }
          : null,
      teamEditor,
      modules: {
        projection: projectionOn,
        "projection.themes": themesOn,
        "projection.images": imagesOn,
        "projection.announcements": announcementsOn,
        "projection.text-slides": textSlidesOn,
        sheet: sheetOn,
        "sheet.live": liveOn,
        // Scripture and the quick add of the controller come later (phase 6, slice 5e-2).
        scripture: false,
        "projection.quick-add": false,
      },
    },
  };
}
