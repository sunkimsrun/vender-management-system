# Auth System

Secure authentication with separate user and admin dashboards. Built with Next.js, TypeScript, Tailwind CSS and MySQL.

![Auth System home page](public/screenshots/home.png)

## Features

- User and admin registration and login
- bcrypt password hashing, short-lived JWT access tokens, rotating HttpOnly refresh cookies
- `/dashboard` for users; `/admin` for admins to create, edit and delete users
- Server-side role checks, CSRF origin checks, rate limiting, security headers

## Quick start

```bash
git clone https://github.com/<sunkimsrun>/auth-system.git
cd auth-system
npm install
```

1. In MySQL Workbench, set a strong password in `db/schema.sql` (replace `CHANGE_ME_BEFORE_RUNNING`), then run it and `db/002_notes.sql` with an admin connection.
2. Copy `.env.example` to `.env.local` and fill it in (`DB_PASSWORD` must match step 1; `JWT_SECRET` needs 32+ random characters).
3. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Purpose |
|---|---|
| `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | MySQL connection |
| `JWT_SECRET` | 32+ random characters |
| `APP_ORIGIN` | Public site origin, used for CSRF checks |
| `ADMIN_INVITE_CODE` | 20+ characters enables `/admin/register`; empty disables it |
| `TRUST_PROXY` | `true` only behind a trusted proxy |

See `.env.example` for the rest.

## Pages

| Route | Access |
|---|---|
| `/register`, `/login` | Public |
| `/dashboard` | User |
| `/admin/register` | Invite code |
| `/admin/login` | Public |
| `/admin` | Admin |

## API

Send `Authorization: Bearer <accessToken>` on protected routes. Login also needs an `Origin: http://localhost:3000` header when called from tools like Postman.

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/refresh` | Refresh cookie |
| POST | `/api/auth/logout` | Refresh cookie |
| GET | `/api/me` | User |
| GET, POST | `/api/admin/users` | Admin |
| PATCH, DELETE | `/api/admin/users/:id` | Admin |
| POST | `/api/admin/register` | Invite code |
| GET, POST | `/api/notes` | User |
| GET, PATCH, DELETE | `/api/notes/:id` | Owner |

## Admin account

Register at `/admin/register` with the invite code, or promote a user in Workbench:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
```

## Tests

```bash
npm run build
TRUST_PROXY=true npm start -- -p 3001   # PowerShell: $env:TRUST_PROXY="true"; npm start -- -p 3001
npm test                                  # second terminal
```

## Production notes

- Use HTTPS and set `APP_ORIGIN` to the `https://` URL.
- Keep secrets in the host's secret store, and the app on the least-privilege `auth_app` database account.
- The rate limiter is in memory; use Redis if you run more than one instance.
