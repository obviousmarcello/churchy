CREATE TABLE "notification_deliveries" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY("tenant_id","event_id","user_id","kind"),
	CONSTRAINT "notification_deliveries_kind_check" CHECK ((kind = ANY (ARRAY['event_added'::text, 'event_reminder'::text, 'setlist'::text])))
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_volunteer_fkey" FOREIGN KEY ("tenant_id","event_id","user_id") REFERENCES "public"."event_volunteers"("tenant_id","event_id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "notification_deliveries" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notification_deliveries" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE INDEX "notification_deliveries_tenant_id_idx" ON "notification_deliveries" USING btree ("tenant_id");
--> statement-breakpoint
-- Music merge phase 8b (notifications). As in Music Sheet DB (final form: `push_consent`), SECURITY INVOKER, the
-- tenant by RLS. The reminders that are due now and did not go out yet: for each user who opted in, the events
-- they volunteer for that start within their time window. A channel is needed: the emails (the outbox) or a
-- device with the user's push consent. At most `p_limit` rows, soonest event first.
create or replace function public.list_due_notifications(p_limit integer)
returns table (kind text, event_id uuid, user_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select due.kind, due.event_id, due.user_id
  from (
    select 'event_reminder'::text as kind, v.event_id, v.user_id, e.starts_at
    from public.events e
    join public.event_volunteers v on v.event_id = e.id
    left join public.notification_preferences p on p.user_id = v.user_id
    where e.starts_at > now()
      and e.starts_at <= now() + interval '30 days'
      and v.reply is distinct from 'no'
      and coalesce(p.event_reminder, true)
      and e.starts_at <= now() + make_interval(days => coalesce(p.reminder_days, 5))
    union all
    select 'setlist'::text, v.event_id, v.user_id, e.starts_at
    from public.events e
    join public.event_volunteers v on v.event_id = e.id
    left join public.notification_preferences p on p.user_id = v.user_id
    where e.starts_at > now()
      and e.starts_at <= now() + interval '12 hours'
      and v.reply is distinct from 'no'
      and coalesce(p.setlist, true)
      and e.starts_at <= now() + make_interval(hours => coalesce(p.setlist_hours, 2))
  ) as due
  left join public.notification_preferences p on p.user_id = due.user_id
  where not exists (
      select 1
      from public.notification_deliveries d
      where d.event_id = due.event_id and d.user_id = due.user_id and d.kind = due.kind
    )
    and (
      coalesce(p.email, true)
      or exists (select 1 from public.push_subscriptions s where s.user_id = due.user_id and s.consented_at is not null)
    )
  order by due.starts_at, due.kind
  limit greatest(p_limit, 0);
$$;
--> statement-breakpoint
-- A new start time: the reminders of the event go out again with the new time.
create or replace function public.reset_notification_deliveries()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.notification_deliveries where event_id = new.id;
  return null;
end;
$$;
--> statement-breakpoint
CREATE TRIGGER events_reset_notification_deliveries AFTER UPDATE OF starts_at ON public.events
FOR EACH ROW WHEN (new.starts_at IS DISTINCT FROM old.starts_at)
EXECUTE FUNCTION public.reset_notification_deliveries();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_due_notifications(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_due_notifications(integer) TO churchy_app, churchy_music;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reset_notification_deliveries() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reset_notification_deliveries() TO churchy_app, churchy_music;
