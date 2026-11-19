"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Alert,
  Button,
  DateInput,
  FormattedTime,
  Input,
  Select,
  Textarea,
  TimeInput,
} from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { EditInput, EditOutcome } from "@/lib/rooms/types";
import type { PolicyResult } from "@/server/policy";

type Scope = "this" | "following" | "all";

export interface EditBookingProps {
  id: string;
  initial: Omit<EditInput, "scope">;
  inSeries: boolean;
  update: (id: string, input: EditInput) => Promise<PolicyResult<EditOutcome>>;
  cancel: (id: string, scope: Scope) => Promise<PolicyResult<"ok" | "notAllowed">>;
}

/** Edit / cancel a booking with the *csak ezt / ezt és a következőket / az összeset* choice. */
export function EditBooking({ id, initial, inSeries, update, cancel }: EditBookingProps) {
  const t = useT("munkater.rooms.edit");
  const r = useT("munkater.rooms");
  const router = useRouter();
  const [input, setInput] = useState<EditInput>({ ...initial, scope: "this" });
  const [message, setMessage] = useState<EditOutcome | "denied" | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EditInput>(k: K, v: EditInput[K]) =>
    setInput((p) => ({ ...p, [k]: v }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const answer = await update(id, input);
    setBusy(false);
    if (!answer.ok) return setMessage("denied");
    if (answer.value.result === "saved") router.push("/munkater/foglalas/enyim?mentve=modositva");
    else setMessage(answer.value);
  }
  async function remove() {
    setBusy(true);
    const answer = await cancel(id, input.scope);
    setBusy(false);
    if (answer.ok && answer.value === "ok") router.push("/munkater/foglalas/enyim?mentve=lemondva");
    else setMessage("denied");
  }

  return (
    <form
      onSubmit={save}
      noValidate
      className="flex max-w-2xl flex-col gap-4"
      data-testid="edit-booking"
    >
      {message === "denied" || (message && message.result === "notAllowed") ? (
        <Alert tone="danger" title={t("denied")} />
      ) : null}
      {message && message !== "denied" && message.result === "missing" ? (
        <Alert tone="danger" title={t("missing")} />
      ) : null}
      {message && message !== "denied" && message.result === "refused" ? (
        <Alert tone="danger" title={t("refused")} data-testid="edit-refused">
          {message.violations.map((v) => (
            <p key={v.rule}>{r(`rules.${v.rule}`, { detail: String(v.detail ?? "") })}</p>
          ))}
          {message.clash ? (
            <p>
              {r(message.clash.source === "service" ? "clash.service" : "clash.booking", {
                title: message.clash.title,
              })}{" "}
              <FormattedTime value={message.clash.startsAt} />–
              <FormattedTime value={message.clash.endsAt} />
            </p>
          ) : null}
        </Alert>
      ) : null}
      <Input
        name="title"
        label={t("title")}
        value={input.title}
        onChange={(e) => set("title", e.target.value)}
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
      <Textarea
        name="purpose"
        label={t("purpose")}
        value={input.purpose}
        onChange={(e) => set("purpose", e.target.value)}
        rows={2}
        optionalLabel={t("optional")}
      />
      <Input
        name="attendees"
        type="number"
        min={1}
        label={t("attendees")}
        value={input.attendees}
        onChange={(e) => set("attendees", e.target.value)}
        optionalLabel={t("optional")}
      />
      <Textarea
        name="setupNotes"
        label={t("setup")}
        value={input.setupNotes}
        onChange={(e) => set("setupNotes", e.target.value)}
        rows={2}
        optionalLabel={t("optional")}
      />
      {inSeries ? (
        <Select
          name="scope"
          label={t("scope")}
          help={t("scopeHelp")}
          value={input.scope}
          onChange={(e) => set("scope", e.target.value as Scope)}
          options={[
            { value: "this", label: t("scopeThis") },
            { value: "following", label: t("scopeFollowing") },
            { value: "all", label: t("scopeAll") },
          ]}
        />
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} data-testid="edit-save">
          {t("save")}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={remove}
          data-testid="booking-cancel"
        >
          {t("cancelBooking")}
        </Button>
      </div>
    </form>
  );
}
