-- Task 003 keeps application data behind the NestJS API. Enabling RLS without
-- client policies prevents Supabase Data API roles from reading or mutating
-- identity and tenancy tables directly.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;
