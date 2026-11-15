-- Platform Owner: permanently delete a suspended school and everything it owns. Runs as the function owner so it can
-- remove money rows the app roles may never delete; the audit log (no FK) keeps the history of what happened.

-- The ledger stays append-only, except while this function purges that tenant inside its own transaction.
CREATE OR REPLACE FUNCTION ledger_entries_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.purging_tenant', true) = OLD.tenant_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ledger_entries is append-only' USING ERRCODE = 'restrict_violation';
END $$;

CREATE OR REPLACE FUNCTION purge_tenant(p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st "TenantStatus";
BEGIN
  SELECT status INTO st FROM tenants WHERE id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant % not found', p_tenant USING ERRCODE = 'no_data_found'; END IF;
  IF st <> 'SUSPENDED' THEN RAISE EXCEPTION 'suspend the school before deleting it' USING ERRCODE = 'check_violation'; END IF;
  PERFORM set_config('app.purging_tenant', p_tenant::text, true);

  -- Money first, children before parents (these foreign keys are RESTRICT on purpose).
  DELETE FROM ledger_entries WHERE tenant_id = p_tenant;
  DELETE FROM payment_claims WHERE tenant_id = p_tenant;
  DELETE FROM payments WHERE tenant_id = p_tenant AND reverses_payment_id IS NOT NULL;
  DELETE FROM payments WHERE tenant_id = p_tenant;
  DELETE FROM invoice_lines WHERE tenant_id = p_tenant;
  DELETE FROM invoices WHERE tenant_id = p_tenant;
  DELETE FROM expenses WHERE tenant_id = p_tenant AND reverses_expense_id IS NOT NULL;
  DELETE FROM expenses WHERE tenant_id = p_tenant;
  DELETE FROM fee_structures WHERE tenant_id = p_tenant;
  DELETE FROM student_fee_overrides WHERE tenant_id = p_tenant;
  DELETE FROM fee_discounts WHERE tenant_id = p_tenant;
  -- Teaching records, then structure.
  DELETE FROM timetable_entries WHERE tenant_id = p_tenant;
  DELETE FROM assessments WHERE tenant_id = p_tenant;
  DELETE FROM teacher_assignments WHERE tenant_id = p_tenant;
  DELETE FROM class_subjects WHERE tenant_id = p_tenant;
  DELETE FROM leave_requests WHERE tenant_id = p_tenant;
  DELETE FROM announcements WHERE tenant_id = p_tenant;
  DELETE FROM support_tickets WHERE tenant_id = p_tenant;
  UPDATE students SET section_id = NULL WHERE tenant_id = p_tenant;
  DELETE FROM sections WHERE tenant_id = p_tenant;
  DELETE FROM classes WHERE tenant_id = p_tenant;
  -- People, then the school itself (everything else cascades from here).
  DELETE FROM users WHERE tenant_id = p_tenant;
  DELETE FROM tenants WHERE id = p_tenant;
END $$;

REVOKE ALL ON FUNCTION purge_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_tenant(uuid) TO edusaas_system;
