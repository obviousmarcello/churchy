"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckIcon, ExternalLinkIcon, ScaleIcon, XIcon } from "lucide-react";

import { FormFooter } from "@/components/music/form-parts";
import { LocalDateTime } from "@/components/music/local-date-time";
import { Button } from "@/components/music/ui/button";
import { Card } from "@/components/music/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { NativeSelect } from "@/components/music/ui/native-select";
import { Textarea } from "@/components/music/ui/textarea";
import { useI18n } from "@/i18n/music/client";
import { SONG_COPYRIGHT_MAX_LENGTH } from "@/lib/music/song-copyright";
import {
  SONG_AUTHORS_MAX_LENGTH,
  SONG_ORIGINAL_TITLE_MAX_LENGTH,
  SONG_RIGHTS_STATUSES,
  SONG_TRANSLATOR_MAX_LENGTH,
} from "@/lib/music/song-rights";
import type {
  ProposalField,
  ProposalTextField,
  ResearchFieldValue,
} from "@/lib/music/song-rights-research";
import { SONG_SONGBOOK_MAX_LENGTH } from "@/lib/music/song-songbook";
import { cn } from "@/lib/music/utils";
import type { RightsProposalDTO } from "@/server/music/models/song-rights-research";
import { usePolicyAction } from "@/lib/music/policy-form";
import { reviewProposalAction, type ReviewFormState } from "./actions";

const initialState: ReviewFormState = { status: "idle", message: null, fieldErrors: {} };

const TEXT_FIELDS: { key: ProposalTextField; max: number }[] = [
  { key: "authors", max: SONG_AUTHORS_MAX_LENGTH },
  { key: "originalTitle", max: SONG_ORIGINAL_TITLE_MAX_LENGTH },
  { key: "translator", max: SONG_TRANSLATOR_MAX_LENGTH },
  { key: "songbook", max: SONG_SONGBOOK_MAX_LENGTH },
  { key: "copyright", max: SONG_COPYRIGHT_MAX_LENGTH },
];

type Choice = { keep: boolean; value: string };

/** The first proposals that wait for a review, each with its own form. `total`: all that wait. */
export function ProposalList({
  proposals,
  total,
}: {
  proposals: RightsProposalDTO[];
  total: number;
}) {
  const { m, format } = useI18n();
  const t = m.songRights.proposals;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.description}</p>
      {total > proposals.length && (
        <p className="text-sm text-muted">
          {format(t.firstOfTotal, { shown: proposals.length, total })}
        </p>
      )}
      {proposals.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScaleIcon />
            </EmptyMedia>
            <EmptyTitle>{t.emptyTitle}</EmptyTitle>
            <EmptyDescription>{t.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The first choice of each field: keep a found value that differs from the
 * song. Never keep the status `unknown` over a known one.
 */
function initialChoices({ result, song }: RightsProposalDTO): Record<ProposalField, Choice> {
  const choices = {} as Record<ProposalField, Choice>;
  for (const { key } of TEXT_FIELDS) {
    const proposed = result[key];
    const value = proposed.value ?? "";
    choices[key] = {
      keep: value !== "" && proposed.level !== "not found" && value !== (song[key] ?? ""),
      value,
    };
  }
  const status = result.rightsStatus.value;
  choices.rightsStatus = {
    keep: status !== song.rightsStatus && status !== "unknown",
    value: status,
  };
  return choices;
}

function ProposalCard({ proposal }: { proposal: RightsProposalDTO }) {
  const { m, format } = useI18n();
  const t = m.songRights.proposals;
  const { result, song } = proposal;
  const [choices, setChoices] = useState(() => initialChoices(proposal));
  const [state, formAction, pending] = useActionState(
    usePolicyAction(reviewProposalAction),
    initialState,
  );
  const [decision, setDecision] = useState<"accept" | "reject">("accept");
  const sourceUrl = (number: number) =>
    result.sources.find((source) => source.number === number)?.url;
  const firstLine = song.lyrics.split("\n")[0] || song.title;
  const tooLong = TEXT_FIELDS.some(
    ({ key, max }) => choices[key].keep && choices[key].value.trim().length > max,
  );

  function choose(key: ProposalField, change: Partial<Choice>) {
    setChoices((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  return (
    <Card className="gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-heading text-fs-5 font-bold break-words">
            <Link href={`/munkater/enektar?song=${song.id}`} className="hover:underline">
              {song.title}
            </Link>
          </h3>
          {song.artist && <span className="text-sm text-muted">{song.artist}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border px-2 py-0.5">{t.songTypes[result.songType]}</span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5",
              result.confidence === "high" && "border-primary text-primary",
              result.confidence === "low" && "border-danger text-danger",
            )}
          >
            {t.confidence[result.confidence]}
          </span>
          <span className="text-muted">
            {format(t.by, { model: proposal.model })} ·{" "}
            <LocalDateTime date={proposal.createdAt} options={{ dateStyle: "medium" }} />
          </span>
        </div>
      </div>

      <details open className="rounded-card border bg-surface-sunken/40 p-3 text-sm">
        <summary className="cursor-pointer font-medium">{t.lyrics}</summary>
        <p className="mt-2 max-h-72 overflow-auto whitespace-pre-line">
          {song.lyrics || t.noLyrics}
        </p>
      </details>

      <form
        action={formAction}
        onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          setDecision(submitter?.value === "reject" ? "reject" : "accept");
        }}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="id" value={proposal.id} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="w-12 py-1 pr-2 font-medium">{t.keep}</th>
                <th className="w-32 py-1 pr-2 font-medium">{t.field}</th>
                <th className="w-1/4 py-1 pr-2 font-medium">{t.current}</th>
                <th className="py-1 pr-2 font-medium">{t.proposed}</th>
                <th className="w-32 py-1 font-medium">{t.level}</th>
              </tr>
            </thead>
            <tbody>
              {TEXT_FIELDS.map(({ key, max }) => (
                <FieldRow
                  key={key}
                  field={key}
                  current={song[key]}
                  proposed={result[key]}
                  choice={choices[key]}
                  sourceUrl={sourceUrl}
                  onChange={(change) => choose(key, change)}
                >
                  <Textarea
                    name={key}
                    rows={Math.min(3, Math.max(1, choices[key].value.split("\n").length))}
                    value={choices[key].value}
                    onChange={(event) => choose(key, { value: event.target.value, keep: true })}
                    aria-label={t.fields[key]}
                    aria-invalid={
                      (choices[key].keep && choices[key].value.trim().length > max) || undefined
                    }
                    className="min-h-8"
                  />
                  {choices[key].keep && choices[key].value.trim().length > max && (
                    <p className="mt-1 text-xs text-danger">
                      {format(t.tooLong, { length: choices[key].value.trim().length, max })}
                    </p>
                  )}
                </FieldRow>
              ))}
              <FieldRow
                field="rightsStatus"
                current={m.songs.rightsStatuses[song.rightsStatus]}
                proposed={null}
                choice={choices.rightsStatus}
                sourceUrl={sourceUrl}
                onChange={(change) => choose("rightsStatus", change)}
              >
                <NativeSelect
                  name="rightsStatus"
                  value={choices.rightsStatus.value}
                  onChange={(event) =>
                    choose("rightsStatus", { value: event.target.value, keep: true })
                  }
                  aria-label={t.fields.rightsStatus}
                >
                  {SONG_RIGHTS_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {m.songs.rightsStatuses[status]}
                    </option>
                  ))}
                </NativeSelect>
                <p className="mt-1 text-xs text-muted">{result.rightsStatus.reason}</p>
              </FieldRow>
            </tbody>
          </table>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t.details}</summary>
          <div className="mt-2 flex flex-col gap-3">
            {result.rightsHolders && <Note title={t.rightsHolders} text={result.rightsHolders} />}
            {result.openQuestions && <Note title={t.openQuestions} text={result.openQuestions} />}
            <div className="flex flex-col gap-1">
              <h4 className="font-medium">{t.sources}</h4>
              {result.sources.length === 0 ? (
                <p className="text-muted">{t.levels["not found"]}</p>
              ) : (
                <ol className="list-decimal pl-5">
                  {/* The numbers and the queries come from the model: they can repeat. */}
                  {result.sources.map((source, index) => (
                    <li key={index} value={source.number} className="break-all">
                      <ExternalLink href={source.url}>{source.title || source.url}</ExternalLink>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="font-medium">{t.queries}</h4>
              <ul className="list-disc pl-5">
                {result.queries.map((query, index) => (
                  <li key={index}>
                    <ExternalLink href={googleUrl(query)}>{query}</ExternalLink>
                  </li>
                ))}
                <li>
                  <ExternalLink href={googleUrl(`"${firstLine}"`)}>
                    {t.googleFirstLine}
                  </ExternalLink>
                </li>
              </ul>
            </div>
            <p className="text-xs text-muted">{t.disclaimer}</p>
          </div>
        </details>

        <FormFooter state={state}>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="decision" value="accept" disabled={pending || tooLong}>
              <CheckIcon />
              {pending && decision === "accept" ? t.accepting : t.accept}
            </Button>
            <Button
              type="submit"
              name="decision"
              value="reject"
              variant="outline"
              disabled={pending}
            >
              <XIcon />
              {pending && decision === "reject" ? t.rejecting : t.reject}
            </Button>
          </div>
        </FormFooter>
      </form>
    </Card>
  );
}

function FieldRow({
  field,
  current,
  proposed,
  choice,
  sourceUrl,
  onChange,
  children,
}: {
  field: ProposalField;
  current: string | null;
  /** Null for the status: its reason shows under the select. */
  proposed: ResearchFieldValue | null;
  choice: Choice;
  sourceUrl: (number: number) => string | undefined;
  onChange: (change: Partial<Choice>) => void;
  children: React.ReactNode;
}) {
  const { m, format } = useI18n();
  const t = m.songRights.proposals;

  return (
    <tr className={cn("border-t align-top", !choice.keep && "text-muted")}>
      <td className="py-2 pr-2">
        <input
          type="checkbox"
          name={`keep-${field}`}
          checked={choice.keep}
          onChange={(event) => onChange({ keep: event.target.checked })}
          aria-label={format(t.keepField, { field: t.fields[field] })}
          className="mt-2 size-4 accent-primary"
        />
      </td>
      <td className="py-2 pr-2 pt-3 font-medium">{t.fields[field]}</td>
      <td className="py-2 pr-2 pt-3 break-words whitespace-pre-line">
        {current || <em>{t.empty}</em>}
      </td>
      <td className={cn("py-2 pr-2", !choice.keep && "opacity-60")}>{children}</td>
      <td className="py-2 pt-3 text-xs">
        {proposed && (
          <>
            <span
              className={cn(
                proposed.level === "verified" && "text-primary",
                proposed.level === "not found" && "text-muted",
              )}
            >
              {t.levels[proposed.level]}
            </span>{" "}
            {proposed.sources.map((number) => {
              const url = sourceUrl(number);
              return url ? (
                <ExternalLink key={number} href={url}>
                  {`[${number}]`}
                </ExternalLink>
              ) : (
                <span key={number}>{`[${number}] `}</span>
              );
            })}
          </>
        )}
      </td>
    </tr>
  );
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="font-medium">{title}</h4>
      <p className="whitespace-pre-line text-muted">{text}</p>
    </div>
  );
}

/** A link to another site. Only http and https: the agent writes the URLs. */
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-baseline gap-1 underline underline-offset-4"
    >
      {children}
      <ExternalLinkIcon className="size-3 shrink-0 self-center" aria-hidden />
    </a>
  );
}

function googleUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
