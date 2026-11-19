import type { ErrorMessages } from "@/lib/admin/content-form";
import { getT } from "@/i18n/server";

/** Validation messages of the workspace forms (`munkater.errors`); unused ones stay empty. */
export async function workspaceErrorMessages(): Promise<ErrorMessages> {
  const t = await getT("munkater.errors");
  return {
    required: t("required"),
    slugTaken: t("slugTaken"),
    slugFormat: t("slugFormat"),
    sunday: "",
    weekTaken: "",
    announcementEmpty: "",
    endBeforeStart: t("endBeforeStart"),
    phone: "",
    postalCode: "",
    address: "",
    notFound: t("notFound"),
    general: t("general"),
  };
}
