-- Phase 3 security: RLS, cross-tenant guards and integrity rules for attendance, leave, assessment, timetable.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_batches', 'attendance_records', 'teacher_attendance', 'leave_types', 'leave_requests',
                           'assessments', 'marks', 'remarks', 'timetable_slots', 'timetable_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO edusaas_app USING (tenant_id = (SELECT app_current_tenant())) WITH CHECK (tenant_id = (SELECT app_current_tenant()))', t);
  END LOOP;
END $$;

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON attendance_batches
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('section_id', 'sections', 'subject_id', 'subjects', 'submitted_by', 'users');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('batch_id', 'attendance_batches', 'student_id', 'students');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON teacher_attendance
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('teacher_id', 'teachers');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('applicant_id', 'users', 'student_id', 'students', 'type_id', 'leave_types');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON assessments
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('academic_year_id', 'academic_years', 'section_id', 'sections', 'subject_id', 'subjects', 'grading_scheme_id', 'grading_schemes');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON marks
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('assessment_id', 'assessments', 'student_id', 'students');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON remarks
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('student_id', 'students', 'author_id', 'users');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON timetable_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('section_id', 'sections', 'slot_id', 'timetable_slots', 'subject_id', 'subjects', 'teacher_id', 'teachers');

-- A teacher can't be in two sections in the same period (spec §8.6): clashes are impossible, not just checked.
CREATE UNIQUE INDEX timetable_entries_teacher_slot ON timetable_entries (teacher_id, slot_id) WHERE teacher_id IS NOT NULL;

ALTER TABLE attendance_batches ADD CONSTRAINT attendance_batches_period CHECK (period BETWEEN 1 AND 12);
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_dates CHECK (to_date >= from_date);
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_reason CHECK (char_length(reason) BETWEEN 3 AND 1000);
ALTER TABLE assessments ADD CONSTRAINT assessments_max_marks CHECK (max_marks > 0 AND max_marks <= 1000);
ALTER TABLE marks ADD CONSTRAINT marks_score_range CHECK (score IS NULL OR score >= 0);
ALTER TABLE marks ADD CONSTRAINT marks_absent_no_score CHECK (NOT (absent AND score IS NOT NULL));
ALTER TABLE remarks ADD CONSTRAINT remarks_text CHECK (char_length(text) BETWEEN 2 AND 1000);
ALTER TABLE timetable_slots ADD CONSTRAINT timetable_slots_day CHECK (day_of_week BETWEEN 1 AND 7);
ALTER TABLE timetable_slots ADD CONSTRAINT timetable_slots_period CHECK (period_no BETWEEN 1 AND 14);
ALTER TABLE timetable_slots ADD CONSTRAINT timetable_slots_times CHECK (starts_at ~ '^[0-2][0-9]:[0-5][0-9]$' AND ends_at ~ '^[0-2][0-9]:[0-5][0-9]$' AND ends_at > starts_at);
