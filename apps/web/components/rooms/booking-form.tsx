"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  DateInput,
  FormattedDate,
  FormattedTime,
  Input,
  Select,
  Textarea,
  TimeInput,
} from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { BookingCheck, BookingFormInput, CreateOutcome } from "@/lib/rooms/types";
import type { PolicyResult } from "@/server/policy";

export interface BookingFormProps {
  rooms: readonly { id: string; name: string; capacity: number | null }[];
  teams: readonly { id: string; name: string }[];
  initial: BookingFormInput;
  /** Last day a series may reach (12 months ahead). */
  horizon: string;
  check: (input: BookingFormInput) => Promise<PolicyResult<BookingCheck>>;
  submit: (input: BookingFormInput) => Promise<PolicyResult<CreateOutcome>>;
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** *Új foglalás* (D-60/D-61): a live check against rules, bookings and service blocks as you type. */
export function BookingForm({ rooms, teams, initial, horizon, check, submit }: BookingFormProps) {
  const t = useT("munkater.rooms.form");
  const r = useT("munkater.rooms");
  const router = useRouter();
  const [input, setInput] = useState<BookingFormInput>(initial);
  const [result, setResult] = useState<BookingCheck | null>(null);
  const [errors, setErrors] = useState<{ title?: boolean; time?: boolean; general?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const set = <K extends keyof BookingFormInput>(key: K, value: BookingFormInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const answer = await check(input);
      if (mine === seq.current && answer.ok) setResult(answer.value);
    }, 250);
    return () => clearTimeout(timer);
  }, [input, check]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const answer = await submit(input);
    setBusy(false);
    if (!answer.ok) return setErrors({ general: true });
    const out = answer.value;
    if (out.result === "created") {
      router.push(
        `/munkater/foglalas/enyim?mentve=${out.status === "approved" ? "jovahagyva" : "kerelem"}&db=${out.created}&ki=${out.skipped}`,
      );
    } else if (out.result === "missing") {
      setErrors({ title: out.fields.includes("title"), time: out.fields.includes("time") });
    } else {
      setResult(out.check);
    }
  }

  const blocked = result?.series?.blocked ?? [];
  const total = result?.series?.total ?? 0;
  const broken = (result?.violations.length ?? 0) > 0 || result?.clash != null;
  const seriesAllBlocked = result?.series !== null && result !== null && blocked.length === total;
  const canSubmit =
    result?.ready === true &&
    !broken &&
    !seriesAllBlocked &&
    (blocked.length === 0 || input.skipConflicts);

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex max-w-2xl flex-col gap-4"
      data-testid="booking-form"
    >
      {errors.general ? <Alert tone="danger" title={t("denied")} /> : null}
      <Select
        name="roomId"
        label={t("room")}
        value={input.roomId}
        onChange={(e) => set("roomId", e.target.value)}
        options={rooms.map((room) => ({
          value: room.id,
          label: room.capacity
            ? `${room.name} (${r("capacity", { count: room.capacity })})`
            : room.name,
        }))}
        required
      />
      <DateInput
        name="date"
        label={t("date")}
        value={input.date}
        onChange={(e) => set("date", e.target.value)}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <TimeInput
          name="startTime"
          label={t("from")}
          value={input.startTime}
          onChange={(e) => set("startTime", e.target.value)}
          error={errors.time ? t("timeError") : undefined}
          required
        />
        <TimeInput
          name="endTime"
          label={t("to")}
          value={input.endTime}
          onChange={(e) => set("endTime", e.target.value)}
          required
        />
      </div>
      <Input
        name="title"
        label={t("title")}
        value={input.title}
        onChange={(e) => set("title", e.target.value)}
        error={errors.title ? t("titleError") : undefined}
        required
      />

      <div aria-live="polite" data-testid="booking-check" className="flex flex-col gap-3">
        {result?.problem === "time" ? <Alert tone="warning" title={t("timeError")} /> : null}
        {result?.violations.map((v) => (
          <Alert
            key={v.rule}
            tone="danger"
            title={r(`rules.${v.rule}`, { detail: String(v.detail ?? "") })}
          />
        ))}
        {result?.clash ? (
          <Alert
            tone="danger"
            title={r(result.clash.source === "service" ? "clash.service" : "clash.booking", {
              title: result.clash.title,
            })}
            data-testid="booking-clash"
          >
            <p>
              <FormattedTime value={result.clash.startsAt} />–
              <FormattedTime value={result.clash.endsAt} />
            </p>
          </Alert>
        ) : null}
        {result && (result.alternativeRooms.length > 0 || result.alternativeSlots.length > 0) ? (
          <div className="rounded-md border border-border p-3" data-testid="booking-alternatives">
            <p className="font-semibold">{t("alternatives")}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {result.alternativeRooms.map((room) => (
                <li key={room.id}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => set("roomId", room.id)}
                  >
                    {t("otherRoom", { name: room.name })}
                  </Button>
                </li>
              ))}
              {result.alternativeSlots.map((slot) => (
                <li key={slot.startsAt}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const d = new Date(slot.startsAt);
                      const fmt = (o: Intl.DateTimeFormatOptions) =>
                        new Intl.DateTimeFormat("sv-SE", {
                          timeZone: "Europe/Budapest",
                          ...o,
                        }).format(d);
                      setInput((prev) => ({
                        ...prev,
                        date: fmt({ dateStyle: "short" }),
                        startTime: fmt({ timeStyle: "short" }),
                        endTime: new Intl.DateTimeFormat("sv-SE", {
                          timeZone: "Europe/Budapest",
                          timeStyle: "short",
                        }).format(new Date(slot.endsAt)),
                      }));
                    }}
                  >
                    <FormattedDate value={slot.startsAt} format="short" />{" "}
                    <FormattedTime value={slot.startsAt} />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {result?.ready && !broken && result.series === null ? (
          <Alert tone="success" title={t("free")} data-testid="booking-free">
            <p>
              {result.status === "approved"
                ? t("willApprove")
                : t("willHold", { hours: result.holdHours ?? 0 })}
            </p>
          </Alert>
        ) : null}
        {result?.series ? (
          <Alert
            tone={blocked.length > 0 ? "warning" : "success"}
            title={
              blocked.length > 0
                ? t("seriesConflicts", { total, count: blocked.length })
                : t("seriesFree", { total })
            }
            data-testid="series-summary"
          >
            {blocked.length > 0 ? (
              <ul className="list-disc pl-5">
                {blocked.slice(0, 8).map((b) => (
                  <li key={b.startsAt}>
                    <FormattedDate value={b.startsAt} format="short" />{" "}
                    <FormattedTime value={b.startsAt} />
                    {" – "}
                    {b.rule ? r(`rules.${b.rule}`, { detail: String(b.detail ?? "") }) : b.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {result.status === "approved"
                  ? t("willApprove")
                  : t("willHold", { hours: result.holdHours ?? 0 })}
              </p>
            )}
          </Alert>
        ) : null}
      </div>

      <Textarea
        name="purpose"
        label={t("purpose")}
        value={input.purpose}
        onChange={(e) => set("purpose", e.target.value)}
        rows={2}
        optionalLabel={t("optional")}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          name="attendees"
          type="number"
          min={1}
          label={t("attendees")}
          value={input.attendees}
          onChange={(e) => set("attendees", e.target.value)}
          optionalLabel={t("optional")}
        />
        {teams.length > 0 ? (
          <Select
            name="teamId"
            label={t("team")}
            value={input.teamId}
            onChange={(e) => set("teamId", e.target.value)}
            placeholder={t("noTeam")}
            options={teams.map((x) => ({ value: x.id, label: x.name }))}
            optionalLabel={t("optional")}
          />
        ) : null}
      </div>
      <Textarea
        name="setupNotes"
        label={t("setup")}
        value={input.setupNotes}
        onChange={(e) => set("setupNotes", e.target.value)}
        rows={2}
        optionalLabel={t("optional")}
      />

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
        <legend className="px-1 font-semibold">{t("repeatLegend")}</legend>
        <Select
          name="repeat"
          label={t("repeat")}
          value={input.repeat}
          onChange={(e) => set("repeat", e.target.value as "none" | "weekly")}
          options={[
            { value: "none", label: t("repeatNone") },
            { value: "weekly", label: t("repeatWeekly") },
          ]}
        />
        {input.repeat === "weekly" ? (
          <>
            <div role="group" aria-label={t("weekdays")} className="flex flex-wrap gap-x-4">
              {WEEKDAYS.map((d) => (
                <Checkbox
                  key={d}
                  label={t(`weekday.${d}`)}
                  checked={input.weekdays.includes(d)}
                  onChange={(e) =>
                    set(
                      "weekdays",
                      e.target.checked
                        ? [...input.weekdays, d]
                        : input.weekdays.filter((x) => x !== d),
                    )
                  }
                />
              ))}
            </div>
            <DateInput
              name="until"
              label={t("until")}
              help={t("untilHelp")}
              value={input.until}
              max={horizon}
              onChange={(e) => set("until", e.target.value)}
            />
            {blocked.length > 0 ? (
              <Checkbox
                label={t("skipConflicts")}
                checked={input.skipConflicts}
                onChange={(e) => set("skipConflicts", e.target.checked)}
                data-testid="skip-conflicts"
              />
            ) : null}
          </>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || !canSubmit} data-testid="booking-submit">
          {result?.status === "pending" ? t("submitRequest") : t("submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/munkater/foglalas")}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
