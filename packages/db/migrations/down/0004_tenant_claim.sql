-- Down of 0004_tenant_claim: restores `app.current_tenant_id()` of 0003_rls (no JWT claim).
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = ''
  AS $$
DECLARE
  tenant text := nullif(pg_catalog.current_setting('app.tenant_id', true), '');
  org text := nullif(pg_catalog.current_setting('app.org_id', true), '');
BEGIN
  IF tenant IS NOT NULL AND org IS NOT NULL THEN
    RAISE EXCEPTION 'app.tenant_id and app.org_id must never be set together'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN tenant::uuid;
END
$$;
