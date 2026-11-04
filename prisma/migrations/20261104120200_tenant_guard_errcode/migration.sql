-- Raise cross-tenant reference violations with a dedicated SQLSTATE (EDU01) instead of 23503, so the application
-- can tell them apart from ordinary foreign-key errors and answer "not found" without leaking anything.
CREATE OR REPLACE FUNCTION enforce_same_tenant() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i int := 0;
  ref_id uuid;
  ref_tenant uuid;
BEGIN
  WHILE i < TG_NARGS LOOP
    EXECUTE format('SELECT ($1).%I::uuid', TG_ARGV[i]) INTO ref_id USING NEW;
    IF ref_id IS NOT NULL THEN
      EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', TG_ARGV[i + 1]) INTO ref_tenant USING ref_id;
      IF ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'cross-tenant reference rejected: %.% -> %', TG_TABLE_NAME, TG_ARGV[i], TG_ARGV[i + 1]
          USING ERRCODE = 'EDU01';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;
