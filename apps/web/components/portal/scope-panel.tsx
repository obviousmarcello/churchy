import { Alert } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { reachableParishes, scopeOf, type OrgHrEnv } from "@/server/org-hr";

/**
 * *Az Ön hatóköre*: per linked parish exactly the HR categories this actor may see — the
 * delegated ones, narrowed by the actor's own scopes. Computed with `can()`, so what it lists is
 * what the lists and the ticket pages show. Confidential categories are never listed.
 */
export async function ScopePanel({ env }: { env: OrgHrEnv }) {
  const t = await getT("portal.scope");
  const parishes = reachableParishes(env);
  return (
    <section aria-labelledby="portal-scope" className="flex flex-col gap-3" data-testid="scope">
      <h2 id="portal-scope" className="font-heading text-fs-5 font-bold text-primary">
        {t("title")}
      </h2>
      <p className="max-w-prose text-muted">{t("lead")}</p>
      {parishes.length === 0 ? (
        <Alert tone="info" title={t("noneTitle")}>
          <p>{t("noneBody")}</p>
        </Alert>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {parishes.map((p) => (
            <li
              key={p.tenantId}
              className="rounded-md border border-border bg-surface-raised p-4"
              data-testid="scope-parish"
              data-parish={p.tenantId}
            >
              <p className="font-bold">{p.name}</p>
              <p className="text-muted">{t("categories")}</p>
              <ul className="list-inside list-disc">
                {scopeOf(env, p.tenantId).map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
