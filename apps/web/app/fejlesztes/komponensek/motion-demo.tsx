"use client";

import { useState } from "react";
import {
  AnimatedNumber,
  Button,
  Card,
  CalendarIcon,
  MusicIcon,
  Progress,
  RefreshIcon,
  SaveIcon,
  SendIcon,
  Stagger,
  UsersIcon,
} from "@churchy/ui";

export interface MotionDemoLabels {
  staggerHeading: string;
  staggerLead: string;
  replay: string;
  card1Title: string;
  card1Body: string;
  card2Title: string;
  card2Body: string;
  card3Title: string;
  card3Body: string;
  numberHeading: string;
  counterLabel: string;
  add: string;
  remove: string;
  progressLabel: string;
  loadingHeading: string;
  loadingLead: string;
  save: string;
  send: string;
}

const CAPACITY = 40;

/** Interactive part of the showcase's motion section (dev-only route). */
export function MotionDemo({ labels }: { labels: MotionDemoLabels }) {
  const [run, setRun] = useState(0);
  const [count, setCount] = useState(24);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const pulse = (set: (v: boolean) => void) => {
    set(true);
    setTimeout(() => set(false), 1600);
  };

  return (
    <div className="grid gap-10">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-body text-fs-4 font-semibold text-text">{labels.staggerHeading}</h3>
            <p className="text-fs-2 text-muted">{labels.staggerLead}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            iconStart={<RefreshIcon />}
            onClick={() => setRun((n) => n + 1)}
            data-testid="motion-replay"
          >
            {labels.replay}
          </Button>
        </div>
        {/* The key restarts the CSS animation; nothing here needs an observer. */}
        <Stagger
          key={run}
          as="ul"
          className="grid gap-4 md:grid-cols-3"
          data-testid="motion-stagger"
          // The demo plays on request only, so the page's axe checks never meet half-faded text.
          {...(run === 0 ? { "data-stagger": undefined } : {})}
        >
          <li>
            <Card title={labels.card1Title} headingLevel={4} icon={<CalendarIcon />} href="#motion">
              <p>{labels.card1Body}</p>
            </Card>
          </li>
          <li>
            <Card title={labels.card2Title} headingLevel={4} icon={<UsersIcon />} href="#motion">
              <p>{labels.card2Body}</p>
            </Card>
          </li>
          <li>
            <Card title={labels.card3Title} headingLevel={4} icon={<MusicIcon />} href="#motion">
              <p>{labels.card3Body}</p>
            </Card>
          </li>
        </Stagger>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="grid content-start gap-4">
          <h3 className="font-body text-fs-4 font-semibold text-text">{labels.numberHeading}</h3>
          <div className="flex items-center gap-4 rounded-card bg-surface-tint p-5">
            <div className="min-w-0 flex-1">
              <p className="text-fs-2 text-muted">{labels.counterLabel}</p>
              <p className="font-heading text-fs-7 leading-none font-semibold text-text">
                <AnimatedNumber value={count} />
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCount((n) => Math.max(0, n - 5))}>
              <span className="sr-only">{labels.remove}</span>
              −5
            </Button>
            <Button
              size="sm"
              onClick={() => setCount((n) => Math.min(CAPACITY, n + 5))}
              data-testid="motion-add"
            >
              <span className="sr-only">{labels.add}</span>
              +5
            </Button>
          </div>
          <Progress
            label={labels.progressLabel}
            value={count}
            max={CAPACITY}
            valueText={`${count} / ${CAPACITY}`}
          />
        </div>
        <div className="grid content-start gap-4">
          <div>
            <h3 className="font-body text-fs-4 font-semibold text-text">{labels.loadingHeading}</h3>
            <p className="text-fs-2 text-muted">{labels.loadingLead}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button loading={saving} onClick={() => pulse(setSaving)} data-testid="motion-save">
              {labels.save}
            </Button>
            <Button
              variant="secondary"
              loading={sending}
              iconStart={<SendIcon />}
              onClick={() => pulse(setSending)}
            >
              {labels.send}
            </Button>
            <Button variant="outline" loading={false} iconStart={<SaveIcon />}>
              {labels.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
