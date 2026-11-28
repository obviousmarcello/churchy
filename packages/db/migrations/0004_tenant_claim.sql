-- Custom SQL migration file, put your code below! --
-- Music merge, phase 1 (docs/music-merge/PLAN.md §4.2, §11 "Tenant context"; SDD ADR-20).
-- The music module keeps its supabase-js models, which reach Postgres through PostgREST. PostgREST
-- does not run `set_config('app.tenant_id', …)`; it exposes the verified JWT of the request as the
-- transaction-local setting `request.jwt.claims`. The server mints that JWT per request with a
-- `tenant_id` claim (apps/web/server/music/tenant-token.ts). `app.current_tenant_id()` therefore
-- also accepts the claim, so the canonical `tenant_isolation` policies apply unchanged.
-- Rules: `app.tenant_id` (Drizzle path) wins; the claim is read only from tokens with
-- `iss = 'churchy'` (Supabase Auth's own tokens carry another `iss`, and their user-editable
-- `user_metadata` is never read); a tenant from either source together with `app.org_id`, or a
-- claim that differs from `app.tenant_id`, raises instead of being resolved.
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = ''
  AS $$
DECLARE
  tenant text := nullif(pg_catalog.current_setting('app.tenant_id', true), '');
  org text := nullif(pg_catalog.current_setting('app.org_id', true), '');
  claims jsonb := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
  claim text;
BEGIN
  IF claims ->> 'iss' = 'churchy' THEN
    claim := nullif(claims ->> 'tenant_id', '');
  END IF;
  IF org IS NOT NULL AND (tenant IS NOT NULL OR claim IS NOT NULL) THEN
    RAISE EXCEPTION 'app.tenant_id and app.org_id must never be set together'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF tenant IS NOT NULL AND claim IS NOT NULL AND tenant::uuid <> claim::uuid THEN
    RAISE EXCEPTION 'app.tenant_id and the tenant_id claim differ'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce(tenant, claim)::uuid;
END
$$;
