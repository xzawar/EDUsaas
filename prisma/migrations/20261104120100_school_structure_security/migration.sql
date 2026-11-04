-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 security: RLS on new tables, cross-tenant reference guards, data integrity.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Faster policies: evaluate the tenant once per statement (InitPlan) instead of per row.
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants FOR SELECT TO edusaas_app USING (id = (SELECT app_current_tenant()));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_settings', 'tenant_role_permissions', 'users'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO edusaas_app USING (tenant_id = (SELECT app_current_tenant())) WITH CHECK (tenant_id = (SELECT app_current_tenant()))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS tenant_read ON audit_logs;
DROP POLICY IF EXISTS tenant_insert ON audit_logs;
CREATE POLICY tenant_read ON audit_logs FOR SELECT TO edusaas_app USING (tenant_id = (SELECT app_current_tenant()));
CREATE POLICY tenant_insert ON audit_logs FOR INSERT TO edusaas_app WITH CHECK (tenant_id = (SELECT app_current_tenant()));

-- ── RLS on every Phase 2 table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years', 'classes', 'sections', 'subjects', 'class_subjects', 'teachers',
                           'teacher_assignments', 'students', 'grading_schemes', 'jobs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO edusaas_app USING (tenant_id = (SELECT app_current_tenant())) WITH CHECK (tenant_id = (SELECT app_current_tenant()))', t);
  END LOOP;
END $$;
-- Jobs are history: the app may create and update them, never delete.
REVOKE DELETE, TRUNCATE ON TABLE jobs FROM edusaas_app;

-- ── Cross-tenant reference guard. Foreign-key checks ignore RLS, so without this an app bug could link a
--    row to another school's record. SECURITY DEFINER so it can see the referenced row even when RLS hides it.
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
          USING ERRCODE = '23503';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION enforce_same_tenant() FROM PUBLIC;

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('academic_year_id', 'academic_years');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('class_id', 'classes', 'class_teacher_id', 'teachers');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON class_subjects
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('class_id', 'classes', 'subject_id', 'subjects');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('user_id', 'users');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON teacher_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('teacher_id', 'teachers', 'section_id', 'sections', 'subject_id', 'subjects');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('user_id', 'users', 'section_id', 'sections');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON grading_schemes
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('academic_year_id', 'academic_years');

-- ── Integrity rules.
ALTER TABLE academic_years ADD CONSTRAINT academic_years_dates CHECK (ends_on > starts_on);
CREATE UNIQUE INDEX academic_years_one_current ON academic_years (tenant_id) WHERE status = 'CURRENT';
ALTER TABLE classes ADD CONSTRAINT classes_grade_level CHECK (grade_level BETWEEN -3 AND 14);
ALTER TABLE sections ADD CONSTRAINT sections_capacity CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE sections ADD CONSTRAINT sections_next_roll CHECK (next_roll_number >= 1);
ALTER TABLE students ADD CONSTRAINT students_roll_positive CHECK (roll_number IS NULL OR roll_number > 0);
ALTER TABLE students ADD CONSTRAINT students_placed_has_roll CHECK (section_id IS NULL OR roll_number IS NOT NULL);
ALTER TABLE grading_schemes ADD CONSTRAINT grading_schemes_bands_array CHECK (jsonb_typeof(bands) = 'array');
