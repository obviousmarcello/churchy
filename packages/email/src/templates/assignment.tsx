import { defineTemplate, type TemplateSpec } from "../define";
import { whenOf } from "../params";

/** Service assignments (SDD §18): the date comes from `startsAt`, formatted by `@churchy/hu`. */
const spec: TemplateSpec = {
  values: (params) => ({ when: whenOf(params) ?? "" }),
  facts: (params, t) => {
    const when = whenOf(params);
    return when ? [{ label: t("labels.when"), value: when }] : [];
  },
};

/** The person was assigned to a service. */
export const AssignmentRequested = defineTemplate("assignment.requested", spec);

/** A colleague asks the person to take over their assignment. */
export const AssignmentSwapRequested = defineTemplate("assignment.swapRequested", spec);

/** The swap was accepted. */
export const AssignmentSwapAccepted = defineTemplate("assignment.swapAccepted", spec);
