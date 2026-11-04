-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('EVERYONE', 'STAFF', 'STUDENTS', 'SECTION');

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "section_id" UUID,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_on" DATE,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_tenant_id_created_at_idx" ON "announcements"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS + cross-tenant guards.
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON announcements TO edusaas_app
  USING (tenant_id = (SELECT app_current_tenant())) WITH CHECK (tenant_id = (SELECT app_current_tenant()));
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('section_id', 'sections', 'created_by', 'users');
ALTER TABLE announcements ADD CONSTRAINT announcements_title CHECK (char_length(title) BETWEEN 3 AND 120);
ALTER TABLE announcements ADD CONSTRAINT announcements_body CHECK (char_length(body) BETWEEN 1 AND 4000);
ALTER TABLE announcements ADD CONSTRAINT announcements_section CHECK ((audience = 'SECTION') = (section_id IS NOT NULL));
-- Announcements are soft-deleted (kept for the audit trail).
REVOKE DELETE, TRUNCATE ON TABLE announcements FROM edusaas_app;

-- Fuzzy search (spec §8.9): trigram indexes for names, usernames and admission numbers.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX users_display_name_trgm ON users USING gin (display_name gin_trgm_ops);
CREATE INDEX users_username_trgm ON users USING gin (username_normalized gin_trgm_ops);
CREATE INDEX students_admission_no_trgm ON students USING gin (admission_no gin_trgm_ops);
