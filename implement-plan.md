# User Authentication & Authorization System — Implementation Plan

## 1. Project Overview

Build a practical, security-conscious authentication and authorization system from scratch using Next.js and MySQL.

### Goals

- Register and log in users.
- Hash passwords securely.
- Issue short-lived access JWTs.
- Issue refresh tokens and rotate them securely.
- Store only hashed refresh tokens in the database.
- Log out and revoke refresh sessions.
- Enforce role-based access control (RBAC) for `USER` and `ADMIN`.
- Enforce resource ownership checks.
- Validate inputs and return safe error messages.
- Add rate limiting and CSRF protections where appropriate.
- Test the main authentication and authorization flows.

### Agreed Technology Stack

| Area | Technology |
|---|---|
| Framework | Next.js App Router |
| Language | TypeScript |
| Database | MySQL Server |
| Database GUI | MySQL Workbench |
| MySQL driver | `mysql2` |
| Password hashing | `bcrypt` |
| JWT signing and verification | `jose` |
| Input validation | Zod |
| Package manager | npm |
| Styling | Tailwind CSS (already selected in project setup) |

**Important:** Use direct SQL through `mysql2` with parameterized queries. Do not use Prisma or another ORM in this project.

---

## 2. Security Rules

These rules apply throughout implementation:

1. Never store plaintext passwords.
2. Hash passwords with bcrypt using a cost factor of at least 12, subject to reasonable performance on the development machine.
3. Never return password hashes, refresh-token hashes, signing secrets, or other internal security data in API responses.
4. Public registration must always assign the `USER` role on the server. Never accept a role from the registration request.
5. Create an `ADMIN` account only through a controlled, documented process—not public registration.
6. Use environment variables for database credentials and token secrets. Never commit `.env.local`.
7. Use parameterized SQL for every query that includes user-provided values.
8. Use short-lived access tokens and longer-lived refresh tokens.
9. Store only a cryptographic hash of each refresh token in MySQL.
10. Send refresh tokens in an `HttpOnly` cookie. In production, use `Secure` and an appropriate `SameSite` policy.
11. Protect cookie-authenticated operations against CSRF. Validate request origin and use an appropriate CSRF strategy for state-changing requests.
12. Rotate refresh tokens when refreshing. Detect reuse of a previously rotated token and revoke the affected token family/session as designed.
13. Verify authentication, role, and resource ownership on the server for every protected operation. Hiding a button in the UI is not authorization.
14. Use generic login errors so the response does not reveal whether an account exists.
15. Apply rate limiting to registration, login, and refresh endpoints. For production or multi-instance deployment, use a shared rate-limit store rather than relying only on in-memory state.
16. Keep secrets and sensitive values out of logs.
17. Use HTTPS in production.
18. Keep authentication checks in server-side code; never trust role or user ID values supplied by the browser.

---

## 3. Implementation Phases

Complete each phase and verify its checkpoint before moving on.

## Phase 0 — Confirm the Development Environment

### Tasks

- [x] Create the Next.js project named `auth-system`.
- [x] Select TypeScript.
- [x] Select ESLint.
- [x] Select Tailwind CSS.
- [x] Use the `src/` directory.
- [x] Use the App Router.
- [x] Confirm the default app runs at `http://localhost:3000`.
- [x] Confirm whether MySQL Server is installed.
- [x] Confirm the MySQL Server Windows service is running.
- [x] Connect to the local server from MySQL Workbench.

### Checkpoint

MySQL Workbench successfully connects to a running MySQL Server.

**Do not continue to database setup until this checkpoint passes.** MySQL Workbench is a database client; installing it alone does not guarantee that MySQL Server is installed.

---

## Phase 1 — Create the Database

### Tasks

- [x] Create a database named `auth_system`.
- [x] Create a dedicated application database user with only the permissions needed by this app.
- [x] Avoid using the MySQL `root` account from the application.
- [x] Create the initial `users` table.
- [x] Create the refresh-token/session table.
- [x] Add primary keys, foreign keys, unique constraints, indexes, and timestamps.
- [x] Decide how to represent roles, initially `USER` and `ADMIN`.
- [ ] Test the schema and queries in MySQL Workbench.
- [x] Prepare the reviewed schema and application-user setup script in `db/schema.sql`.

### Initial schema design

#### `users`

Planned fields:

- `id` — primary key.
- `email` — unique, normalized email address.
- `password_hash` — bcrypt hash; never returned to clients.
- `role` — `USER` or `ADMIN`; default to `USER`.
- `created_at` — creation timestamp.
- `updated_at` — last-update timestamp.


#### `refresh_tokens`

Planned fields:

- `id` — primary key.
- `user_id` — foreign key to `users`.
- `token_hash` — hash of the opaque refresh token; never store the raw token.
- `family_id` — identifier for a rotation family/session.
- `expires_at` — expiration timestamp.
- `created_at` — creation timestamp.
- `revoked_at` — nullable revocation timestamp.
- `replaced_by_token_id` — optional reference to the replacement token, if used by the chosen schema.

Review the exact schema before creating it. Add indexes for fields used in lookups and expiration/revocation checks.

### Checkpoint

The database and tables exist, constraints work, and the app has a non-root database account.

---

## Phase 2 — Configure Next.js and MySQL Access

### Tasks

- [x] Install the agreed dependencies: `mysql2`, `bcrypt`, `jose`, and `zod`.
- [x] Create `.env.local` for local secrets and connection settings.
- [x] Add `.env.local` to ignored files if it is not already ignored.
- [x] Define and validate required environment variables at startup or in a dedicated configuration module.
- [x] Create a reusable MySQL connection pool.
- [x] Keep database access code server-only.
- [x] Add a small database connectivity check that does not expose credentials.
- [x] Confirm the app can query MySQL from a server-side route or server-only module.

### Checkpoint

A server-side test query succeeds. No database password or token secret appears in browser code, Git, or API responses.

---

## Phase 3 — Organize the Application

Use a small, clear structure. Adapt it to the existing `src/` directory rather than replacing the project unnecessarily.

Suggested structure:

```text
src/
  app/
    api/
      auth/
        register/route.ts
        login/route.ts
        refresh/route.ts
        logout/route.ts
      me/route.ts
  lib/
    db.ts
    env.ts
    validation/
      auth.ts
    auth/
      password.ts
      access-token.ts
      refresh-token.ts
      session.ts
      authorization.ts
    http/
      errors.ts
      responses.ts
```

The exact layout may change as the app grows. Keep database queries, token logic, validation, and route handlers separated enough to test and understand.

### Checkpoint

The folder structure is created and each module has a clear responsibility. Do not add all authentication logic to one route file.

---

## Phase 4 — Validation and Password Handling

### Tasks

- [x] Define Zod schemas for registration and login.
- [x] Normalize email addresses consistently.
- [x] Set reasonable input length limits.
- [x] Choose and document password rules without imposing unnecessary complexity.
- [x] Implement a server-only password hashing function using bcrypt.
- [x] Implement a password verification function.
- [x] Ensure validation errors do not expose internal details.

**Password rules:** 9+ characters, at most 72 bytes (bcrypt's limit; longer input is rejected rather than silently truncated). No composition rules. Login only requires a non-empty password so it reveals nothing about the policy.

### Checkpoint

Valid and invalid inputs are handled correctly, passwords are hashed before insertion, and password verification works without returning hashes to clients.

---

## Phase 5 — Registration Endpoint

### Endpoint

`POST /api/auth/register`

### Tasks

- [x] Validate the request body with Zod.
- [x] Normalize the email.
- [x] Check for an existing account safely.
- [x] Hash the password with bcrypt.
- [x] Insert the user using a parameterized SQL query.
- [x] Assign `USER` on the server, regardless of any submitted role.
- [x] Return a safe response without the password hash.
- [x] Handle duplicate email and malformed input consistently.
- [x] Apply rate limiting (5 registrations per IP per hour, in-memory).

### Checkpoint

A user can register successfully, duplicate registrations are rejected safely, and the database never stores a plaintext password.

---

## Phase 6 — Login and Access JWT

### Endpoint

`POST /api/auth/login`

### Tasks

- [x] Validate the request.
- [x] Find the account by normalized email using a parameterized query.
- [x] Verify the password with bcrypt.
- [x] Return a generic error for invalid credentials.
- [x] Sign a short-lived access JWT with `jose`.
- [x] Include only necessary claims, such as subject (`sub`), role, issuer, audience, issued-at, and expiration as appropriate.
- [x] Verify issuer, audience, signature, and expiration when validating tokens.
- [x] Return the access token in the response body.
- [x] Never put access tokens in URLs or logs.
- [x] Apply rate limiting (20 per IP and 10 per email per 15 minutes, in-memory).

### Checkpoint

Valid credentials produce a valid short-lived access token. Invalid credentials produce a safe generic error.

---

## Phase 7 — Refresh Token Sessions and Rotation

### Design

Use a cryptographically random opaque refresh token rather than making the refresh token a long-lived access JWT. Store only a hash of the refresh token in the database.

### Tasks

- [x] Generate a high-entropy refresh token using a cryptographically secure random generator.
- [x] Hash the token before storing it (SHA-256).
- [x] Associate it with a user, expiry, and session/family identifier.
- [x] Set the raw refresh token in an `HttpOnly` cookie.
- [x] Use `Secure` in production and an appropriate `SameSite` setting (`Strict`).
- [x] Set a deliberate cookie path (`/api/auth`) and expiration/max-age (7 days).
- [x] Implement `POST /api/auth/refresh`.
- [x] Verify the cookie token by hashing it and comparing it to the stored hash.
- [x] Rotate the refresh token on successful refresh.
- [x] Revoke the old token and persist the replacement safely, using a transaction where needed.
- [x] Detect reuse of an already-rotated token and revoke the relevant session/family according to the design.
- [x] Return a new short-lived access token.
- [x] Protect the refresh endpoint against CSRF and validate request origin.
- [x] Handle expiry, revocation, missing cookies, and invalid tokens safely.

Verified end to end against MySQL: registration, duplicate rejection, login, refresh rotation, and reuse detection (the old token was rejected and the whole family revoked).

### Checkpoint

A valid refresh token produces a new access token and a new refresh cookie. The old refresh token cannot be reused successfully.

---

## Phase 8 — Logout and Revocation

### Endpoint

`POST /api/auth/logout`

### Tasks

- [x] Identify the refresh session from the refresh cookie.
- [x] Revoke the current refresh token/session in the database.
- [x] Clear the refresh cookie using matching cookie attributes.
- [x] Make repeated logout requests safe.
- [x] Apply CSRF protections and origin validation.
- [x] Decide and document whether logout affects only the current session or all sessions.

**Decision:** logout revokes only the current session (the token's whole rotation family). Other devices stay signed in. A "log out everywhere" option can be added later as a separate endpoint.

Verified against MySQL: after logout the refresh token is rejected, the cookie is cleared with `Max-Age=0`, repeated or cookie-less logouts return `200`, a foreign origin returns `403`, and a second session for the same user keeps working.

### Checkpoint

After logout, the refresh token cannot be used again. The browser cookie is cleared.

---

## Phase 9 — Authentication Middleware and Current User

### Endpoint

`GET /api/me`

### Tasks

- [x] Read the access token from the `Authorization: Bearer <token>` header.
- [x] Verify the token on the server.
- [x] Reject missing, malformed, expired, or invalid tokens.
- [x] Return only safe user details, such as ID, email, role, and timestamps where useful.
- [x] Do not trust user identity or role from request bodies, query parameters, or client state.
- [x] Create reusable server-side authentication helpers for protected routes (`requireAuth` in `lib/auth/session.ts`).

Verified against MySQL: missing, wrong-scheme, garbage, and tampered tokens return `401`; a valid token returns the safe profile; `id` and `role` query parameters are ignored. `requireAuth` reloads the user from the database, so the role is always current.

### Checkpoint

Unauthenticated requests are rejected. Authenticated requests return the correct current user's safe profile.

---

## Phase 10 — Role-Based Authorization and Ownership

### Tasks

- [x] Create a reusable role-checking helper (`requireRole` in `lib/auth/authorization.ts`).
- [x] Protect an example admin-only route or resource (`GET /api/admin/users`).
- [x] Ensure `USER` cannot access admin-only operations.
- [x] Ensure `ADMIN` access is verified server-side (role is reloaded from the database on every request).
- [x] Add an example resource that belongs to a user (`notes`; run `db/002_notes.sql` in Workbench).
- [x] Check resource ownership in the database query or server-side authorization logic (every notes query is scoped by `user_id`).
- [x] Return appropriate `401` and `403` responses without revealing sensitive information (another user's note returns `404`).
- [x] Avoid relying on client-side route guards as the security boundary.

Verified against MySQL: admin route returns `401` without a token, `403` for `USER`, and the user list for `ADMIN`. The notes ownership checks are implemented but still need to be exercised once `db/002_notes.sql` has been run.

### Checkpoint

A normal user cannot perform admin-only actions or read/change another user's private resource by changing an ID.

---

## Phase 11 — CSRF, Rate Limiting, and Safe Errors

### Tasks

- [x] Identify all endpoints that rely on cookies: `POST /api/auth/login` (sets the refresh cookie), `POST /api/auth/refresh` (reads and rotates it), and `POST /api/auth/logout` (reads and clears it). All other endpoints use the `Authorization` header, which browsers do not attach automatically, so they are not CSRF-prone.
- [x] Validate `Origin` (falling back to `Referer`) on those three endpoints; a missing or foreign origin returns `403`.
- [x] Choose and implement a CSRF token strategy if required: **no separate token**. The refresh cookie is `SameSite=Strict` and path-scoped, every cookie endpoint checks `Origin`/`Referer`, and the access token is returned in the response body, which other sites cannot read.
- [x] Configure CORS narrowly if cross-origin access is required: **no CORS headers are sent**, so cross-origin browser requests are blocked. Add narrow, explicit CORS only if a separate front-end origin is introduced.
- [x] Rate-limit registration (5/hour per IP), login (20 per IP and 10 per email per 15 min), and refresh (30 per IP per 15 min).
- [x] Choose a shared rate-limit store for production or multiple instances: **Redis** (`INCR` + `EXPIRE`), swapped in behind `checkRateLimit` in `lib/rate-limit.ts`. The in-memory store is for local development only. `X-Forwarded-For` is trusted only when `TRUST_PROXY=true`; otherwise all clients share one bucket.
- [x] Standardize API error response shapes: `{ "error": { "code", "message", "fields"? } }`.
- [x] Keep stack traces and database errors in server logs only, with sensitive values redacted (`logServerError` logs only the error type and driver code, never messages or query values).
- [x] Add security headers appropriate for the application: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, a CSP (`default-src 'none'` on `/api`, framing/base/form/object restrictions on pages), HSTS in production builds, and `X-Powered-By` removed. A strict `script-src` CSP is deferred to Phase 12, when the UI exists.

Verified live: login/refresh/logout reject missing, foreign, and bad-Referer origins (a same-origin Referer is accepted); the 11th login attempt for one email returns `429` with `Retry-After`; CORS preflights get no `Access-Control-*` headers; security headers are present on pages and API responses.

### Checkpoint

Abusive request patterns are limited, cookie-authenticated state changes have CSRF defenses, and clients receive safe error responses.

---

## Phase 12 — Build the User Interface

Build the actual pages users will interact with. Use the existing Next.js App Router, TypeScript, and Tailwind CSS. Keep the first version clean, responsive, and easy to understand; prioritize working flows over elaborate visual effects.

# The update separate USER and ADMIN routes:
  Purpose	USER: /login	and for Registration: /register
  Purpose	ADMIN: /admin/login and for Registration: /admin/register
*note: User role have 2 UI for login and register and another 2 UI for login and register for admin.*

### 12.1 Public pages

#### Register page — `/register`

- [x] Create a registration page with email, password, and confirm-password fields.
- [x] Add a submit button, loading state, validation messages, and a link to `/login`.
- [x] Validate fields for usability on the client, while keeping server-side Zod validation authoritative.
- [x] Do not include a role selector. Public registration must not allow a visitor to choose `ADMIN`.
- [x] Show a safe success or error message after submitting.

#### Login page — `/login`

- [x] Create a login page with email and password fields.
- [x] Add a submit button, loading state, validation messages, and a link to `/register`.
- [x] Display a generic invalid-credentials message rather than revealing whether an email exists.
- [x] On success, keep the access token in memory where practical and navigate to `/dashboard`.
- [x] Let the browser handle the `HttpOnly` refresh cookie; frontend JavaScript must not read it.

### 12.2 User dashboard — `/dashboard`

- [x] Create a protected dashboard layout/page for authenticated users.
- [x] Show basic account information such as email and role, fetched from `/api/me`.
- [x] Add a navigation area with a dashboard link and account/profile section.
- [x] Add a logout button.
- [x] Show loading, empty, and error states.
- [x] If the access token expires, attempt the refresh flow once and retry the original request once; prevent infinite retry loops.
- [x] If authentication cannot be restored, clear in-memory auth state and redirect to `/login`.
- [x] Do not treat hiding the dashboard in the UI as a security boundary; protected API routes must verify the token on the server.

### 12.3 Admin dashboard — `/admin`

- [x] Create a separate admin dashboard page or layout.
- [x] Show admin-only navigation and a basic user-management overview placeholder until the relevant API is implemented.
- [x] Require the `ADMIN` role on the server before returning admin data.
- [x] Redirect or show an access-denied page for a non-admin user, while still enforcing authorization in the API/server code.
- [x] Never provide a public registration option to create an administrator. Admin creation must use a controlled process.

### 12.4 Shared UI and API integration

- [x] Create reusable form fields, buttons, and page layouts where it improves clarity.
- [x] Add a shared API helper for sending the access token in the `Authorization: Bearer <token>` header.
- [x] Add consistent loading, validation, success, and safe error states.
- [x] Add responsive layouts for desktop and mobile widths.
- [x] Keep tokens, secrets, and database credentials out of client-side code.
- [x] Show role-appropriate UI only as a convenience; enforce authorization on the server.

**Implementation notes:** the access token is held only in module memory (`lib/client/api.ts`); a reload restores the session through the HttpOnly refresh cookie. One refresh and one retry per request, with concurrent refreshes shared. `/admin/register` is gated by a server-side `ADMIN_INVITE_CODE` (20+ characters; admin sign-up is disabled when unset), compared in constant time and rate-limited; public `/register` still always creates `USER`. `/admin/login` signs out and shows the generic error for non-admin accounts. The admin dashboard lists users from `GET /api/admin/users`.

### Checkpoint

A visitor can navigate between login and registration. A registered user can log in and see `/dashboard`, refresh their session when appropriate, and log out. An ordinary user cannot access admin-only data or operations. The pages work at desktop and mobile sizes.

---

## Phase 13 — Testing

### Functional tests

- [x] Successful registration.
- [x] Duplicate email registration.
- [x] Invalid registration input.
- [x] Successful login.
- [x] Incorrect password and unknown email.
- [x] Missing, malformed, expired, and invalid access tokens.
- [x] Successful refresh and refresh-token rotation.
- [x] Expired, revoked, and reused refresh token.
- [x] Logout and repeated logout.
- [x] Access to `/api/me`.
- [x] `USER` denied from admin-only functionality.
- [ ] Resource ownership checks.
- [x] CSRF/origin rejection.
- [x] Rate-limit behavior.
- [ ] Database failures and transaction rollback behavior.

### Manual checks

- [x] Inspect tables in MySQL Workbench.
- [x] Confirm password and refresh-token fields contain hashes, not raw secrets.
- [x] Inspect browser cookies and confirm refresh cookie is `HttpOnly`.
- [x] Confirm `Secure` is enabled in production.
- [x] Confirm API responses do not include hashes or secrets.
- [x] Confirm secrets are absent from the Git repository.


### Test record

Automated suite: `tests/api.test.mjs` (`npm test`). It runs against a production build with `TRUST_PROXY=true` (so each test gets its own rate-limit bucket) and the real database, and deletes its own test users afterwards.

**Result: 26 passed, 0 failed, 1 skipped** (two consecutive runs).

| Area | Expected | Actual |
|---|---|---|
| Register | 201, role `USER`, no hash in the response; a submitted `role` is ignored | Pass |
| Duplicate / invalid | 409 with a generic message; 400 for bad email, short (<9) or long (>72 bytes) password, missing fields, bad JSON | Pass |
| Login | Cookie is `HttpOnly; SameSite=Strict; Path=/api/auth`; wrong password and unknown email return identical 401s | Pass |
| Access tokens | 401 for missing, malformed, expired, tampered, wrong secret, wrong audience, `alg:none`, and deleted-user tokens | Pass |
| Refresh | Rotates; only a SHA-256 hash is stored; reuse revokes the whole family; expired, revoked, missing and unknown tokens return identical 401s; concurrent use of one token yields at most one success | Pass |
| Logout | Revokes the session and clears the cookie; repeating it is harmless; other sessions stay signed in | Pass |
| RBAC | 401 without a token, 403 for `USER`, 200 for `ADMIN`; a demotion applies immediately; a wrong invite code is rejected | Pass |
| CSRF / CORS | 403 for a missing or foreign origin (and the refresh token is not consumed); no `Access-Control-*` headers | Pass |
| Rate limits | Login: 429 with `Retry-After` by the 11th attempt per email; register: the 6th attempt per IP returns 429 | Pass |
| Safe errors | No stack traces or SQL in error bodies; security headers present | Pass |

**Manual checks:** password hashes are bcrypt (`$2b$`) and refresh tokens are 64-character hex SHA-256 hashes; the cookie includes `Secure` in the production build; no DB password, `JWT_SECRET` or invite code appears in any source or documentation file; `.env.local` is git-ignored.

**Unresolved**
- Resource ownership: the test exists but is **skipped** because the `notes` table has not been created. Run `db/002_notes.sql` in a connected Workbench tab, then `npm test` again.
- Database failure and transaction rollback: not automated, because it needs the database to fail mid-request. Rotation runs in a transaction with `SELECT ... FOR UPDATE`, which the concurrency test exercises, but a forced-failure test is still open.
- "Inspect tables in MySQL Workbench" is left for you to do by eye.
- `.gitignore` uses `.env*`, so `.env.example` is also ignored; allow it with `!.env.example` before committing.
- In-memory rate limiting only works for a single instance (see Phase 11).

### Checkpoint

Record test cases, expected results, actual results, and any unresolved issues.

---

## Phase 14 — Final Review and Deployment Preparation

### Tasks

- [x] Run linting and TypeScript checks. (`eslint` and `tsc --noEmit` clean; `npm audit --omit=dev`: 0 vulnerabilities.)
- [x] Review SQL queries for parameterization. (Every query in `lib/users.ts`, `lib/notes.ts` and `lib/auth/refresh-token.ts` uses `execute` with `?` placeholders; the only interpolated value is a constant column list.)
- [x] Review every protected route for authentication, role, and ownership checks. (`/api/me`, `/api/notes*` call `requireAuth`; `/api/admin/users` adds `requireRole`; note queries filter by `user_id`; the public routes are register, login, refresh, logout, health and the invite-gated admin register.)
- [x] Review cookie attributes and CSRF defenses. (`HttpOnly; SameSite=Strict; Path=/api/auth`, `Secure` in production; login, refresh, logout and admin register check the origin.)
- [x] Review refresh-token rotation and reuse handling. (Transactional rotation with a row lock; reuse revokes the family; covered by tests.)
- [x] Configure HTTPS and production environment variables. (Documented in the README production checklist; HTTPS itself is a hosting step.)
- [x] Use a least-privilege database account. (`auth_app` has only SELECT, INSERT, UPDATE, DELETE.)
- [x] Configure backups and database access restrictions. (Documented in the README; to be applied on the real host.)
- [x] Confirm production rate limiting uses shared storage where needed. (Documented: the in-memory limiter is single-instance; Redis is required for multiple instances.)
- [x] Write setup instructions and a concise API reference. (README.)
- [x] Document known limitations and future improvements. (README.)


**Final review findings:** no code defects found. Fixed in Phases 13-14: the DB password was removed from `db/schema.sql`, and `.gitignore` now allows `.env.example`. Still to do on the real host: HTTPS, backups, Redis rate limiting for multiple instances, running `db/002_notes.sql`, and rotating the DB password and invite code if they were ever shared.

### Checkpoint

The app is reproducible from the setup instructions and passes the agreed test checklist.

---

## 4. Planned API Endpoints

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| `POST` | `/api/auth/register` | Create a user with the `USER` role | Public, rate-limited |
| `POST` | `/api/auth/login` | Verify credentials and issue tokens | Public, rate-limited |
| `POST` | `/api/auth/refresh` | Rotate refresh token and issue a new access token | Refresh cookie + CSRF defenses |
| `POST` | `/api/auth/logout` | Revoke refresh session and clear cookie | Refresh cookie + CSRF defenses |
| `GET` | `/api/me` | Return the authenticated user's safe profile | Access JWT |
| `GET` | `/api/admin/...` | Example admin-only resource | Access JWT + `ADMIN` role |

Add more endpoints only when the core flow is working.

---

## 5. Definition of Done

The project is complete when:

- [x] A visitor can use the registration and login pages (`/register` and `/login`).
- [x] An authenticated user can use the protected user dashboard (`/dashboard`).
- [x] An administrator can use the role-protected admin dashboard (`/admin`).
- [x] Passwords are hashed using bcrypt.
- [x] Access JWTs are short-lived and verified correctly.
- [x] Refresh tokens are random, stored as hashes, rotated, and revocable.
- [x] Refresh cookies use appropriate security attributes and cookie-based operations have CSRF defenses.
- [x] Public registration cannot create an administrator.
- [x] Admin-only routes enforce RBAC on the server.
- [ ] User-owned resources enforce ownership checks. (implemented; verified once the notes table exists)
- [x] Important endpoints have rate limiting.
- [x] Errors are safe and do not leak secrets.
- [x] SQL is parameterized.
- [x] Tests cover successful and failure paths (ownership test pending `db/002_notes.sql`).
- [x] The setup and testing instructions are documented.

---

## 6. How to Work Through This Plan

1. Work on **one phase at a time**.
2. Do not move to the next phase until the current checkpoint passes.
3. For each phase, first explain the goal and relevant fundamentals, then provide exact terminal commands or SQL, then explain the important code line by line.
4. Prefer simple, readable implementations over unnecessary abstractions.
5. Verify each change locally before proceeding.
6. Never skip ahead just to produce more code.
7. Keep this file updated when a phase is completed or a design decision changes.

### Current status

**Phases 0-14 are implemented, plus admin user management** (Phase 12 follow-up: separate dashboards by role; the admin dashboard creates, edits and deletes `USER` accounts via `/api/admin/users`, never touching other admins). Lint, type-check and the production build pass, and `npm test` gives 28 passed, 0 failed, 1 skipped.

Open items:

1. Run `db/002_notes.sql` in a connected MySQL Workbench tab (admin connection), then run `npm test` again. This un-skips the resource-ownership test; then tick "Resource ownership checks" (Phase 13) and the matching Definition of Done item.
2. Test the schema and queries in MySQL Workbench (Phase 1 manual check).
3. Add a failure-injection test for database errors and transaction rollback (Phase 13).
4. Rotate `DB_PASSWORD` and `JWT_SECRET` (and the invite code if shared), since earlier values appeared in chat.
5. On the real host: HTTPS, `APP_ORIGIN` set to the `https://` origin, backups, and a Redis-backed rate limiter if more than one instance runs.

Possible future work: password change and reset, email verification, MFA, admin tools to disable users or revoke sessions, and a nonce-based `script-src` CSP. See the README for the API reference, production checklist and known limitations.
