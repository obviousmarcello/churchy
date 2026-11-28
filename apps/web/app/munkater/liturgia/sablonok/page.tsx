import { Badge, ButtonLink, Stagger } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.worship"), getT("common")]);
  return {
    title: `${t("templates")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** The plan templates: presets of the denomination and the church's own (D-66 AC1). */
export default async function TemplatesPage() {
  await requireWorkspaceModule("ws.worship");
  const [env, t] = await Promise.all([getMemberEnv(), getT("munkater.worship")]);
  const templates = await env.repos.servicePlans.listTemplates(env.ctx);
  return (
    <div className="flex max-w-3xl flex-col gap-5" data-testid="templates-page">
      <ButtonLink href="/munkater/liturgia" variant="secondary" size="sm" className="self-start">
        {t("back")}
      </ButtonLink>
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
        {t("templates")}
      </h1>
      <Stagger as="ul" className="flex flex-col gap-3">
        {templates.map((tpl) => (
          <li
            key={tpl.id}
            className="rounded-card border border-hairline bg-surface-raised shadow-xs p-3"
            data-testid="template"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-fs-5 font-bold">{tpl.name}</h2>
              <Badge>{tpl.tenantId === null ? t("preset") : t("own")}</Badge>
            </div>
            <ol className="mt-2 list-decimal pl-6">
              {tpl.items.map((item, i) => (
                <li key={i}>
                  {item.title}{" "}
                  <span className="text-muted">({t(`editor.types.${item.type}`)})</span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </Stagger>
    </div>
  );
}
