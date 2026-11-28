import { defineTemplate, type TemplateSpec } from "../define";
import { whenOf } from "../params";

/**
 * Music workspace notifications (merged Music Sheet DB, phase 8b): a volunteer was added to an
 * event, the event is near, the setlist is ready. The message carries only the start time of the
 * event and a link; no event title, no names and no setlist content (the link opens them in the
 * workspace, behind the sign-in).
 */
const spec: TemplateSpec = {
  values: (params) => ({ when: whenOf(params) ?? "" }),
  facts: (params, t) => {
    const when = whenOf(params);
    return when ? [{ label: t("labels.when"), value: when }] : [];
  },
};

/** The person was added to an event as a volunteer. */
export const MusicEventAdded = defineTemplate("music.eventAdded", spec);

/** The event the person volunteers for is near. */
export const MusicEventReminder = defineTemplate("music.eventReminder", spec);

/** The setlist of the event is ready, shortly before it starts. */
export const MusicSetlist = defineTemplate("music.setlist", spec);
