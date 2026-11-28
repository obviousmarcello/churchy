"use client";

import { useState, useTransition } from "react";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { Field } from "@/components/music/form-field";
import { Button } from "@/components/music/ui/button";
import { Card } from "@/components/music/ui/card";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { useBrowserValue } from "@/lib/music/browser";
import { desktopX32, isPrivateIpv4, type X32Desk } from "@/lib/music/mixer/desktop-bridge";
import {
  MIXER_KINDS,
  isNetworkKind,
  isSqKind,
  type MixerKind,
  type MixerSettings,
  type MixerSlot,
} from "@/lib/music/mixer/settings";
import { SQ_SOFT_KEYS } from "@/lib/music/mixer/sq";
import {
  SUBDIVISION_KEYS,
  X32_DELAY_EFFECTS,
  X32_DELAY_EFFECT_KEYS,
  X32_FX_SLOTS,
  delayMs,
  type Subdivision,
  type X32DelayEffect,
} from "@/lib/music/mixer/x32";
import { toastError, toastSuccess } from "@/lib/music/toast";
import { saveMixerSettingsAction } from "./actions-client";
import { deskName } from "./mixer-sync";

const SLOT_NUMBERS = Array.from({ length: X32_FX_SLOTS }, (_, index) => index + 1);
const SOFT_KEYS = Array.from({ length: SQ_SOFT_KEYS }, (_, index) => index + 1);
const MIDI_CHANNELS = Array.from({ length: 16 }, (_, index) => index + 1);

/** The mixer setup of the church: the desk, its address and the effects with a delay. */
export function MixerSetupForm({ settings }: { settings: MixerSettings }) {
  const { m, format } = useI18n();
  const t = m.mixer.form;
  const [kind, setKind] = useState<MixerKind>(settings.kind);
  const [host, setHost] = useState(settings.host);
  const [slots, setSlots] = useState<MixerSlot[]>(settings.slots);
  const [midiChannel, setMidiChannel] = useState(settings.midiChannel);
  const [tapKeys, setTapKeys] = useState<number[]>(settings.tapKeys);
  const [saving, startSaving] = useTransition();
  const hostInvalid = host !== "" && !isPrivateIpv4(host);
  // The X32 can find itself on the network; the SQ needs its address.
  const hostMissing = kind === "sq-tcp" && host === "";
  const sq = isSqKind(kind);

  function addSlot() {
    const used = new Set(slots.map((slot) => slot.slot));
    const free = SLOT_NUMBERS.find((slot) => !used.has(slot));
    if (free !== undefined)
      setSlots([...slots, { slot: free, effect: "stereoDelay", subdivision: "quarter" }]);
  }

  function changeSlot(index: number, changes: Partial<MixerSlot>) {
    setSlots(slots.map((slot, at) => (at === index ? { ...slot, ...changes } : slot)));
  }

  function toggleTapKey(key: number, on: boolean) {
    setTapKeys(
      on ? [...tapKeys, key].sort((a, b) => a - b) : tapKeys.filter((other) => other !== key),
    );
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    startSaving(async () => {
      try {
        // A MIDI desk has no address: an invalid one in the hidden field does not block the save.
        const savedHost = isNetworkKind(kind) || isPrivateIpv4(host) ? host : "";
        const result = await saveMixerSettingsAction({
          kind,
          host: savedHost,
          slots,
          midiChannel,
          tapKeys,
        });
        if (result.status === "success") toastSuccess(t.saved);
        else toastError(result.message);
      } catch {
        // For example, the device is offline.
        toastError(m.mixer.saveFailed);
      }
    });
  }

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field name="mixer-kind" label={t.kind}>
          <NativeSelect
            id="mixer-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as MixerKind)}
          >
            {MIXER_KINDS.map((option) => (
              <option key={option} value={option}>
                {t.kinds[option]}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {isNetworkKind(kind) && (
          <Field
            name="mixer-host"
            label={t.host}
            hint={`${sq ? t.sqHostHint : t.hostHint} ${t.networkHint}`}
            errors={hostInvalid ? [t.hostInvalid] : undefined}
          >
            <Input
              id="mixer-host"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              required={sq}
              placeholder={sq ? "192.168.1.70" : t.hostAutomatic}
              maxLength={15}
              value={host}
              onChange={(event) => setHost(event.target.value.trim())}
              aria-describedby="mixer-host-description"
              aria-invalid={hostInvalid || undefined}
              className="w-44"
            />
          </Field>
        )}
        {kind === "x32-osc" && <FindDesk onChoose={setHost} />}
        {kind === "x32-midi" && <p className="text-sm text-muted">{t.midiHint}</p>}
        {kind === "sq-midi" && <p className="text-sm text-muted">{t.sqMidiHint}</p>}

        {sq && (
          <>
            <Field name="mixer-midi-channel" label={t.midiChannel} hint={t.midiChannelHint}>
              <NativeSelect
                id="mixer-midi-channel"
                value={midiChannel}
                className="w-24"
                aria-describedby="mixer-midi-channel-description"
                onChange={(event) => setMidiChannel(Number(event.target.value))}
              >
                {MIDI_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t.tapKeys}</legend>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {SOFT_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={tapKeys.includes(key)}
                      onChange={(event) => toggleTapKey(key, event.target.checked)}
                    />
                    {format(t.softKey, { key })}
                  </label>
                ))}
              </div>
              <p className="text-sm text-muted">
                {tapKeys.length === 0 ? t.noTapKeys : t.tapKeysHint}
              </p>
            </fieldset>
          </>
        )}

        {kind !== "off" && !sq && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">{t.slots}</legend>
            {slots.length === 0 ? (
              <p className="text-sm text-muted">{t.noSlots}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {slots.map((slot, index) => (
                  <SlotRow
                    key={slot.slot}
                    slot={slot}
                    usedSlots={slots.map((other) => other.slot)}
                    showEffect={kind === "x32-midi"}
                    onChange={(changes) => changeSlot(index, changes)}
                    onRemove={() => setSlots(slots.filter((_, at) => at !== index))}
                  />
                ))}
              </ul>
            )}
            {kind === "x32-midi" && slots.length > 0 && (
              <p className="text-sm text-muted">{t.effectHint}</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={slots.length >= X32_FX_SLOTS}
              onClick={addSlot}
            >
              <PlusIcon />
              {t.addSlot}
            </Button>
          </fieldset>
        )}

        <Button
          type="submit"
          className="self-start"
          disabled={saving || (isNetworkKind(kind) && hostInvalid) || hostMissing}
        >
          {saving ? t.saving : t.save}
        </Button>
      </form>
    </Card>
  );
}

/** Finds the desks on the network of this computer: only in the desktop app. */
function FindDesk({ onChoose }: { onChoose: (host: string) => void }) {
  const { m, format } = useI18n();
  const t = m.mixer.form;
  const bridge = useBrowserValue(desktopX32, null);
  const [desks, setDesks] = useState<X32Desk[] | "failed" | null>(null);
  const [searching, startSearching] = useTransition();

  if (!bridge?.discover)
    return <p className="text-sm text-muted">{bridge ? t.findUpdate : t.findDesktopOnly}</p>;
  const discover = bridge.discover;

  function find() {
    startSearching(async () => {
      try {
        setDesks(await discover());
      } catch {
        setDesks("failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" size="sm" disabled={searching} onClick={find}>
        <SearchIcon />
        {searching ? t.finding : t.find}
      </Button>
      {!searching && desks !== null && (
        <div aria-live="polite" className="flex flex-col items-start gap-1">
          {desks === "failed" || desks.length === 0 ? (
            <p className="text-sm text-muted">{t.findNone}</p>
          ) : (
            desks.map((desk) => (
              <Button
                key={desk.host}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChoose(desk.host)}
              >
                {format(t.useDesk, { name: deskName(desk), host: desk.host })}
              </Button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  usedSlots,
  showEffect,
  onChange,
  onRemove,
}: {
  slot: MixerSlot;
  usedSlots: number[];
  /** Over the network, the app asks the desk for the effect. */
  showEffect: boolean;
  onChange: (changes: Partial<MixerSlot>) => void;
  onRemove: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.mixer.form;
  const removeLabel = format(t.removeSlot, { slot: slot.slot });

  return (
    <li className="flex flex-col gap-1.5 rounded-control border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label={t.slotLabel}
          value={slot.slot}
          className="w-24"
          onChange={(event) => onChange({ slot: Number(event.target.value) })}
        >
          {SLOT_NUMBERS.map((number) => (
            <option
              key={number}
              value={number}
              disabled={number !== slot.slot && usedSlots.includes(number)}
            >
              {format(t.slot, { slot: number })}
            </option>
          ))}
        </NativeSelect>
        {showEffect && (
          <NativeSelect
            aria-label={t.effect}
            value={slot.effect}
            className="min-w-0 flex-1"
            onChange={(event) => onChange({ effect: event.target.value as X32DelayEffect })}
          >
            {X32_DELAY_EFFECT_KEYS.map((key) => (
              <option key={key} value={key}>
                {X32_DELAY_EFFECTS[key].name}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect
          aria-label={t.noteValue}
          value={slot.subdivision}
          className="w-36"
          onChange={(event) => onChange({ subdivision: event.target.value as Subdivision })}
        >
          {SUBDIVISION_KEYS.map((key) => (
            <option key={key} value={key}>
              {m.mixer.subdivisions[key]}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      </div>
      <p className="text-xs text-muted">
        {format(t.example, { ms: delayMs(120, 1, slot.subdivision) })}
      </p>
    </li>
  );
}
