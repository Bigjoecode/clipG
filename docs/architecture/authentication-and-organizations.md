# Authentication and Organizations

## Scope

Task 003 adds Supabase email/password authentication, server-rendered web sessions, application-user synchronization, and organization tenancy. Invitations, OAuth providers, MFA, project records, billing, and social features remain deferred.

## Trust boundaries

The Next.js application uses `@supabase/ssr` for PKCE sessions stored in cookies. Next.js Proxy refreshes sessions and applies private/no-store response headers when auth cookies change. Server Components use verified claims to protect pages and use the raw session only to forward the access token to the API.

The NestJS API is the authorization boundary. It accepts `Authorization: Bearer <token>`, verifies Supabase claims through an `AuthenticationProvider`, validates issuer, audience, role, expiry, subject, and email, then synchronizes the application user. The API uses only the publishable key; a Supabase service-role or secret key is neither required nor accepted by the configuration.

Organization data is accessed only through NestJS and Prisma. The browser does not write application tables through Supabase's Data API.

The Task 003 migration enables PostgreSQL row-level security on `users`, `organizations`, and `organization_memberships` without adding client policies. Supabase `anon` and `authenticated` traffic therefore cannot access those tables through the Data API. The trusted Prisma migration/runtime role must retain `BYPASSRLS` privileges; never use the publishable key as the API database credential.

## Identity mapping

The verified Supabase `sub` UUID is the application `User.id`. This avoids unsafe email-based linking and a redundant identifier column. Email remains unique and is synchronized from verified claims. A token whose subject conflicts with an existing email fails closed instead of linking accounts implicitly.

If ClipGenius adopts multiple identity providers later, introduce an explicit external-identity table and migrate this mapping deliberately.

## Organization authorization

- Every organization request requires membership.
- Owners and administrators may rename an organization or change its slug.
- Only owners may delete an organization or change member roles.
- Administrators may remove ordinary members but not owners or administrators.
- A member may leave voluntarily unless they are the last owner.
- Owner demotion and removal run in serializable transactions and cannot remove the last owner.
- Organization creation and its initial owner membership are atomic.

Organization-not-found responses intentionally do not reveal whether an inaccessible organization exists.

## API surface

```text
GET    /auth/me
GET    /organizations
POST   /organizations
GET    /organizations/:slug
PATCH  /organizations/:slug
DELETE /organizations/:slug
GET    /organizations/:slug/members
PATCH  /organizations/:slug/members/:userId
DELETE /organizations/:slug/members/:userId
```

No endpoint adds a member in Task 003. Membership creation requires an invitation lifecycle, which is intentionally deferred rather than approximated with insecure email lookup.

## Supabase configuration

Set these variables in the API environment:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
WEB_ORIGIN
```

Set these variables in the web environment:

```text
API_URL
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

In Supabase Auth URL configuration, set the site URL to the web application URL and allow `/auth/confirm` as a redirect. For SSR email confirmation, change the confirmation template link to:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

The default Supabase mailer is suitable only for evaluation. Configure production SMTP before a production launch.
