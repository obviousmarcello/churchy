import { notFound } from "next/navigation";
import type { FormField } from "@churchy/contracts";
import { Alert, FormattedDate, FormattedTime } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { CopyTemplate } from "@/components/admin/requests/copy-template";
import { RequestStatusBadge } from "@/components/admin/requests/request-parts";
import { RequestWorkflow } from "@/components/admin/requests/request-workflow";
import { getT } from "@/i18n/server";
import { nextStatuses } from "@/lib/requests/admin";
import { displayValue } from "@/lib/requests/form";
import { adminData, mayOpen } from "@/server/content-admin";
import { addRequestNote, assignRequest, setRequestStatus } from "@/server/request-actions";
import { memberMayHandleRequests } from "@/server/session";

type Params = Promise<{ id: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.requests.detail"), getT("common")]);
  return {
    title: `${t("metaTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** One request (D-29): its data, status workflow, assignee, internal notes and reply template. */
export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const [nav, t, forms] = await Promise.all([
    getT("common.nav"),
    getT("admin.requests.detail"),
    getT("admin.requests"),
  ]);
  const section = nav("sections.requests");
  if (!(await mayOpen("requests"))) return <AdminPage title={section} section="requests" />;

  const { ctx, repos } = await adminData();
  const request = await repos.requests.get(ctx, id);
  if (request === null) notFound();
  const [form, members] = await Promise.all([
    repos.requests.getForm(ctx, request.formKey),
    repos.members.list(ctx),
  ]);
  const nameOf = new Map(members.map((m) => [m.userId, m.user.name]));
  const handlers = members
    .filter(memberMayHandleRequests)
    .map((m) => ({ id: m.userId, name: m.user.name }));
  const labels = { yes: forms("yes"), no: forms("no"), none: forms("none") };
  const fields: FormField[] = form?.fields ?? [];
  const known = new Set(fields.map((f) => f.key));
  const transitions = nextStatuses(request.status).map((status) => ({
    status,
    label:
      status === "lezart"
        ? t("toClosed")
        : request.status === "lezart"
          ? t("reopen")
          : t("toProgress"),
  }));
  const reply = form?.confirmationText ?? "";

  return (
    <AdminPage
      title={t("title", { reference: request.reference })}
      lead={form?.title}
      section="requests"
      breadcrumbs={[{ label: section, href: "/admin/kerelmek" }, { label: request.reference }]}
      testId="admin-request"
    >
      <Alert tone="info">{t("privacy")}</Alert>

      <dl className="flex flex-wrap gap-x-10 gap-y-3 text-fs-3" data-testid="request-meta">
        <div>
          <dt className="font-semibold">{t("received")}</dt>
          <dd>
            <FormattedDate value={request.createdAt} /> <FormattedTime value={request.createdAt} />
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{t("currentStatus")}</dt>
          <dd>
            <RequestStatusBadge status={request.status} />
          </dd>
        </div>
        {request.closedAt !== null ? (
          <div>
            <dt className="font-semibold">{t("closedAt")}</dt>
            <dd>
              <FormattedDate value={request.closedAt} format="short" />
              {request.purgeAfter !== null ? (
                <>
                  {" · "}
                  {t("purgeAfter")} <FormattedDate value={request.purgeAfter} format="short" />
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="request-data-heading" className="grid content-start gap-4">
          <h2 id="request-data-heading" className="font-heading text-fs-5 font-bold text-primary">
            {t("dataHeading")}
          </h2>
          <dl className="grid gap-3 text-fs-3" data-testid="request-data">
            {fields.map((field) => (
              <div key={field.key} className="grid gap-0.5">
                <dt className="font-semibold">{field.label}</dt>
                <dd className="break-words whitespace-pre-line">
                  {displayValue(field, request.data[field.key], labels)}
                </dd>
              </div>
            ))}
            {Object.entries(request.data)
              .filter(([key]) => !known.has(key))
              .map(([key, value]) => (
                <div key={key} className="grid gap-0.5">
                  <dt className="font-semibold">{key}</dt>
                  <dd className="break-words">{String(value)}</dd>
                </div>
              ))}
          </dl>
          <p className="text-fs-2 text-muted">
            {t("consent")}: <FormattedDate value={request.consentAt} format="short" />
          </p>
        </section>

        <div className="grid content-start gap-10">
          <RequestWorkflow
            transitions={transitions}
            assigneeUserId={request.assigneeUserId}
            handlers={handlers}
            setStatus={setRequestStatus.bind(null, id)}
            assign={assignRequest.bind(null, id)}
            addNote={addRequestNote.bind(null, id)}
          />

          <section aria-labelledby="request-notes-heading" className="grid gap-3">
            <h2
              id="request-notes-heading"
              className="font-heading text-fs-5 font-bold text-primary"
            >
              {t("notesHeading")}
            </h2>
            {request.notes.length === 0 ? (
              <p className="text-fs-3 text-muted">{t("notesNone")}</p>
            ) : (
              <ul className="grid gap-3" data-testid="request-notes">
                {request.notes.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-md border-2 border-border bg-surface-raised p-4"
                    data-testid="request-note"
                  >
                    <p className="text-fs-2 font-semibold text-muted">
                      {note.authorUserId === null
                        ? t("noteSystem")
                        : (nameOf.get(note.authorUserId) ?? t("noteSystem"))}
                      {", "}
                      <FormattedDate value={note.createdAt} format="short" />{" "}
                      <FormattedTime value={note.createdAt} />
                    </p>
                    <p className="mt-1 text-fs-3 whitespace-pre-line">{note.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="request-reply-heading" className="grid gap-3">
            <h2
              id="request-reply-heading"
              className="font-heading text-fs-5 font-bold text-primary"
            >
              {t("replyHeading")}
            </h2>
            <p className="text-fs-2 text-muted">{t("replyHelp")}</p>
            {reply === "" ? (
              <p className="text-fs-3">{t("replyEmpty")}</p>
            ) : (
              <>
                <blockquote
                  className="rounded-md border-2 border-border bg-surface-sunken p-4 text-fs-3 whitespace-pre-line"
                  data-testid="reply-template"
                >
                  {reply}
                </blockquote>
                <CopyTemplate value={reply} />
              </>
            )}
          </section>
        </div>
      </div>
    </AdminPage>
  );
}
