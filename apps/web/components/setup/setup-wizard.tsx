"use client";

import { useEffect, useRef, useState } from "react";
import { parseImportUrl, type ImportResult } from "@churchy/contracts";
import { Alert, Button, Input, cn } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { draftFromResult, type SetupDraft } from "@/lib/setup/draft";
import { pruneInvites, type Invite, type SetupSettings } from "@/lib/setup/invites";
import {
  DEFAULT_SETUP_PLAN,
  defaultSelection,
  setupEntitlements,
  type ModuleSelection,
} from "@/lib/setup/modules";
import {
  INITIAL_PROGRESS,
  reduceProgress,
  streamImport,
  type ImportProgress as Progress,
} from "@/lib/setup/progress";
import { Builder } from "./builder";
import { DoneStep } from "./done-step";
import { ImportProgress } from "./import-progress";
import { InviteStep } from "./invite-step";
import { ModulesStep } from "./modules-step";
import { ReviewStep } from "./review-step";

const STEPS = ["site", "review", "modules", "invites", "done"] as const;
type Step = (typeof STEPS)[number];

/** Route that streams the import job (`GET ?url=`); the seam towards the server's `ImportJob`. */
const IMPORT_ENDPOINT = "/uj-egyhaz/import";

type Phase =
  | { kind: "idle" }
  | { kind: "running"; progress: Progress }
  | { kind: "ready"; progress: Progress; result: ImportResult }
  | { kind: "failed"; reason: "invalid_url" | "unreachable" };

/**
 * First-setup wizard (D-34): paste the old website's address, watch the import, review the draft
 * site, choose workspace modules, invite people, finish with a checklist. Everything the owner
 * edits lives in this component's state until a later phase stores it; the import itself is the
 * server's `ImportJob` (mock today) streamed over `IMPORT_ENDPOINT`.
 */
export function SetupWizard() {
  const t = useT("admin.setup");
  const [step, setStep] = useState<Step>("site");
  const [address, setAddress] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const plan = DEFAULT_SETUP_PLAN;
  const [modules, setModules] = useState<ModuleSelection>(() =>
    defaultSelection(setupEntitlements(plan)),
  );
  const [invites, setInvites] = useState<Invite[]>([]);
  const [settings, setSettings] = useState<SetupSettings>({
    notifyEmail: "",
    comingSoon: true,
    weeklyReminder: true,
  });
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const readyBox = useRef<HTMLParagraphElement>(null);

  useEffect(() => () => abort.current?.abort(), []);
  // Move focus to the new step's heading so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (step !== "site") heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (phase.kind === "ready") readyBox.current?.querySelector("button")?.focus();
  }, [phase.kind]);

  async function start() {
    const url = parseImportUrl(address);
    if (url === null) {
      setPhase({ kind: "failed", reason: "invalid_url" });
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let progress = INITIAL_PROGRESS;
    setPhase({ kind: "running", progress });
    for await (const event of streamImport(url, {
      endpoint: IMPORT_ENDPOINT,
      signal: controller.signal,
    })) {
      if (controller.signal.aborted) return;
      if (event.type === "failed") {
        setPhase({ kind: "failed", reason: event.code });
        return;
      }
      progress = reduceProgress(progress, event);
      if (event.type === "result") {
        setPhase({ kind: "ready", progress, result: event.result });
        return;
      }
      setPhase({ kind: "running", progress });
    }
    if (!controller.signal.aborted) setPhase({ kind: "failed", reason: "unreachable" });
  }

  function openReview(result: ImportResult) {
    const next = draftFromResult(result);
    setDraft(next);
    setSettings((s) => ({ ...s, notifyEmail: s.notifyEmail || next.email }));
    setStep("review");
  }

  const index = STEPS.indexOf(step);
  const progress = phase.kind === "running" || phase.kind === "ready" ? phase.progress : null;

  return (
    <div className="grid gap-8" data-testid="setup-wizard" data-step={step}>
      <nav aria-label={t("steps.label")}>
        <ol className="flex flex-wrap gap-x-2 gap-y-2">
          {STEPS.map((id, i) => (
            <li
              key={id}
              data-step-id={id}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full border-2 px-3 py-1 text-fs-2 font-semibold",
                i === index
                  ? "border-primary bg-primary text-primary-contrast"
                  : i < index
                    ? "border-success bg-success-soft text-success"
                    : "border-border-strong text-muted",
              )}
            >
              <span aria-hidden="true">{i + 1}.</span>
              <span>{t(`steps.${id}`)}</span>
              <span className="sr-only">
                {i < index ? t("steps.srDone") : i === index ? t("steps.srCurrent") : ""}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      {step !== "site" ? (
        <h2
          ref={heading}
          tabIndex={-1}
          className="font-heading text-fs-6 font-bold text-primary focus:outline-none"
        >
          {t(`headings.${step}`)}
        </h2>
      ) : null}

      {step === "site" ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center">
          <form
            className="grid gap-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (phase.kind !== "running") void start();
            }}
          >
            <h2 className="font-heading text-fs-6 font-bold text-primary">{t("site.heading")}</h2>
            <p className="max-w-prose text-fs-4 text-muted">{t("site.lead")}</p>
            <Input
              label={t("site.address")}
              help={t("site.addressHelp")}
              placeholder={t("site.addressPlaceholder")}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={address}
              disabled={phase.kind === "running"}
              error={phase.kind === "failed" ? t(`site.errors.${phase.reason}`) : undefined}
              onChange={(e) => {
                setAddress(e.target.value);
                if (phase.kind === "failed") setPhase({ kind: "idle" });
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" disabled={phase.kind === "running"}>
                {t("site.start")}
              </Button>
            </div>
            <p className="text-fs-2 text-muted">{t("site.privacy")}</p>
            {phase.kind === "ready" ? (
              <Alert tone="success" title={t("site.readyTitle")} role="status">
                <p>{t("site.readyBody")}</p>
                <p className="mt-3" ref={readyBox}>
                  <Button
                    size="lg"
                    onClick={() => openReview(phase.result)}
                    data-testid="open-review"
                  >
                    {t("site.openReview")}
                  </Button>
                </p>
              </Alert>
            ) : null}
          </form>

          <div className="grid gap-5" data-testid="setup-stage">
            <Builder
              completed={progress?.completed ?? []}
              running={phase.kind === "running"}
              className="rounded-lg border border-border"
            />
            {progress ? (
              <ImportProgress progress={progress} />
            ) : (
              <p className="text-muted">{t("site.idleHint")}</p>
            )}
          </div>
        </div>
      ) : null}

      {step === "review" && draft ? (
        <ReviewStep
          draft={draft}
          onChange={setDraft}
          onBack={() => setStep("site")}
          onNext={() => setStep("modules")}
        />
      ) : null}

      {step === "modules" ? (
        <ModulesStep
          plan={plan}
          selection={modules}
          onChange={(next) => {
            setModules(next);
            setInvites((list) => pruneInvites(list, next));
          }}
          onBack={() => setStep("review")}
          onNext={() => setStep("invites")}
        />
      ) : null}

      {step === "invites" ? (
        <InviteStep
          selection={modules}
          invites={invites}
          settings={settings}
          onInvites={setInvites}
          onSettings={setSettings}
          onBack={() => setStep("modules")}
          onNext={() => setStep("done")}
        />
      ) : null}

      {step === "done" && draft ? (
        <DoneStep outcome={{ draft, modules, invites, settings }} />
      ) : null}
    </div>
  );
}
