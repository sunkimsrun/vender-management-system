// Integration tests. They run against a live server and the real database.
//
//   npm run build
//   TRUST_PROXY=true npm start -- -p 3001      (separate terminal)
//   npm test
//
// TRUST_PROXY=true lets each test use its own X-Forwarded-For address, so the
// per-IP rate limits of one test never affect another.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import { SignJWT } from "jose";
import mysql from "mysql2/promise";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3001";
const ORIGIN = "http://localhost:3000";
const PASSWORD = "correct horse battery";
const RUN = Date.now().toString(36);

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

const env = loadEnv();
const dbConfig = {
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
};
let db;
let ipCounter = 0;
const createdEmails = [];

const probeConnection = await mysql.createConnection(dbConfig);
const [noteTables] = await probeConnection.execute("SHOW TABLES LIKE 'notes'");
await probeConnection.end();
const hasNotes = noteTables.length > 0;

// Derived from the run id so repeated runs against one server never share rate-limit buckets.
const runSeed = parseInt(RUN, 36);
const nextIp = () => `10.${runSeed % 250}.${Math.floor(++ipCounter / 250) + (Math.floor(runSeed / 250) % 250)}.${(ipCounter % 250) + 1}`;
const emailFor = (label) => {
  const email = `t-${label}-${RUN}@example.com`;
  createdEmails.push(email);
  return email;
};

async function call(path, { method = "GET", body, token, cookie, origin = ORIGIN, ip, raw } = {}) {
  const headers = { "X-Forwarded-For": ip ?? nextIp() };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined || raw !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body.
  }
  const refresh = response.headers.getSetCookie().find((c) => c.startsWith("refresh_token="));
  return { status: response.status, json, text, headers: response.headers, refresh };
}

const cookieValue = (res) => res.refresh?.split(";")[0];

async function registerAndLogin(label, ip = nextIp()) {
  const email = emailFor(label);
  const reg = await call("/api/auth/register", { method: "POST", body: { email, password: PASSWORD }, ip });
  assert.equal(reg.status, 201);
  const login = await call("/api/auth/login", { method: "POST", body: { email, password: PASSWORD }, ip });
  assert.equal(login.status, 200);
  return { email, ip, id: reg.json.user.id, token: login.json.accessToken, cookie: cookieValue(login), login };
}

before(async () => {
  db = await mysql.createConnection(dbConfig);
  const probe = await fetch(BASE + "/api/health/db").catch(() => null);
  assert.ok(probe?.ok, `Server not reachable or DB unhealthy at ${BASE}`);
});

after(async () => {
  if (db) {
    for (const email of createdEmails) await db.execute("DELETE FROM users WHERE email = ?", [email]);
    await db.end();
  }
});

describe("registration", () => {
  it("registers a user and never returns a hash", async () => {
    const res = await call("/api/auth/register", { method: "POST", body: { email: emailFor("reg"), password: PASSWORD } });
    assert.equal(res.status, 201);
    assert.equal(res.json.user.role, "USER");
    assert.ok(!/hash|\$2[aby]\$/i.test(res.text));
  });

  it("ignores a submitted role", async () => {
    const res = await call("/api/auth/register", {
      method: "POST",
      body: { email: emailFor("role"), password: PASSWORD, role: "ADMIN" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.user.role, "USER");
  });

  it("rejects a duplicate email with a generic error", async () => {
    const email = emailFor("dup");
    const ip = nextIp();
    await call("/api/auth/register", { method: "POST", body: { email, password: PASSWORD }, ip });
    const res = await call("/api/auth/register", { method: "POST", body: { email, password: PASSWORD }, ip });
    assert.equal(res.status, 409);
    assert.equal(res.json.error.message, "Unable to register with these details");
  });

  it("rejects invalid input", async () => {
    const ip = nextIp();
    const cases = [
      { email: "not-an-email", password: PASSWORD },
      { email: emailFor("short"), password: "12345678" },
      { email: emailFor("long"), password: "a".repeat(73) },
      { email: emailFor("nopw") },
      {},
    ];
    for (const body of cases) {
      const res = await call("/api/auth/register", { method: "POST", body, ip: nextIp() });
      assert.equal(res.status, 400, JSON.stringify(Object.keys(body)));
      assert.equal(res.json.error.code, "VALIDATION_ERROR");
    }
    assert.equal((await call("/api/auth/register", { method: "POST", raw: "{bad", ip })).status, 400);
  });

  it("accepts a 9-character password", async () => {
    const res = await call("/api/auth/register", { method: "POST", body: { email: emailFor("nine"), password: "ninechars" } });
    assert.equal(res.status, 201);
  });
});

describe("login", () => {
  it("logs in and sets an HttpOnly, SameSite=Strict, path-scoped cookie", async () => {
    const user = await registerAndLogin("login");
    assert.equal(user.login.json.tokenType, "Bearer");
    assert.ok(user.login.json.expiresIn > 0);
    assert.match(user.login.refresh, /HttpOnly/);
    assert.match(user.login.refresh, /SameSite=Strict/);
    assert.match(user.login.refresh, /Path=\/api\/auth/);
  });

  it("gives the same response for a wrong password and an unknown email", async () => {
    const user = await registerAndLogin("wrongpw");
    const ip = nextIp();
    const wrong = await call("/api/auth/login", { method: "POST", body: { email: user.email, password: "wrong password!" }, ip });
    const unknown = await call("/api/auth/login", { method: "POST", body: { email: emailFor("ghost"), password: "wrong password!" }, ip });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.json, unknown.json);
  });
});

describe("access tokens and /api/me", () => {
  it("returns the profile for a valid token", async () => {
    const user = await registerAndLogin("me");
    const res = await call("/api/me", { token: user.token });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.email, user.email);
    assert.ok(!/password|\$2[aby]\$/i.test(res.text));
  });

  it("rejects missing, malformed, expired, tampered and wrong-secret tokens", async () => {
    const user = await registerAndLogin("badtok");
    const key = new TextEncoder().encode(env.JWT_SECRET);
    const issuer = env.JWT_ISSUER ?? "auth-system";
    const audience = env.JWT_AUDIENCE ?? "auth-system-api";
    const build = (aud) =>
      new SignJWT({ role: "USER" }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id)
        .setIssuer(issuer).setAudience(aud).setIssuedAt();

    const expired = await build(audience).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(key);
    const wrongSecret = await build(audience).setExpirationTime("5m").sign(new TextEncoder().encode("x".repeat(40)));
    const wrongAudience = await build("someone-else").setExpirationTime("5m").sign(key);
    const noneAlg = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ sub: user.id, role: "ADMIN" }),
    ).toString("base64url")}.`;
    const tampered = user.token.slice(0, -4) + (user.token.endsWith("AAAA") ? "BBBB" : "AAAA");

    for (const token of [expired, wrongSecret, wrongAudience, noneAlg, tampered, "garbage", "a.b.c"]) {
      const res = await call("/api/me", { token });
      assert.equal(res.status, 401, token.slice(0, 20));
    }
    assert.equal((await call("/api/me")).status, 401);
    const noBearer = await fetch(BASE + "/api/me", { headers: { Authorization: user.token } });
    assert.equal(noBearer.status, 401);
  });

  it("rejects a token for a deleted user", async () => {
    const user = await registerAndLogin("deleted");
    await db.execute("DELETE FROM users WHERE id = ?", [user.id]);
    assert.equal((await call("/api/me", { token: user.token })).status, 401);
  });
});

describe("refresh tokens", () => {
  it("rotates the token and issues a new access token", async () => {
    const user = await registerAndLogin("rotate");
    const res = await call("/api/auth/refresh", { method: "POST", cookie: user.cookie });
    assert.equal(res.status, 200);
    assert.ok(res.json.accessToken);
    assert.ok(res.refresh);
    assert.notEqual(cookieValue(res), user.cookie);
    assert.equal((await call("/api/me", { token: res.json.accessToken })).status, 200);
  });

  it("stores only a hash of the refresh token", async () => {
    const user = await registerAndLogin("hashed");
    const raw = user.cookie.split("=")[1];
    const [rows] = await db.execute("SELECT token_hash FROM refresh_tokens WHERE user_id = ?", [user.id]);
    assert.ok(rows.length >= 1);
    for (const row of rows) {
      assert.notEqual(row.token_hash, raw);
      assert.match(row.token_hash, /^[0-9a-f]{64}$/);
    }
  });

  it("treats reuse of a rotated token as theft and revokes the whole family", async () => {
    const user = await registerAndLogin("reuse");
    const first = await call("/api/auth/refresh", { method: "POST", cookie: user.cookie });
    assert.equal(first.status, 200);
    const newCookie = cookieValue(first);

    assert.equal((await call("/api/auth/refresh", { method: "POST", cookie: user.cookie })).status, 401);
    assert.equal((await call("/api/auth/refresh", { method: "POST", cookie: newCookie })).status, 401);
  });

  it("rejects expired, revoked, missing and unknown tokens identically", async () => {
    const expired = await registerAndLogin("expired");
    await db.execute("UPDATE refresh_tokens SET expires_at = NOW(3) - INTERVAL 1 MINUTE WHERE user_id = ?", [expired.id]);
    const revoked = await registerAndLogin("revoked");
    await db.execute("UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE user_id = ?", [revoked.id]);

    const results = [
      await call("/api/auth/refresh", { method: "POST", cookie: expired.cookie }),
      await call("/api/auth/refresh", { method: "POST", cookie: revoked.cookie }),
      await call("/api/auth/refresh", { method: "POST" }),
      await call("/api/auth/refresh", { method: "POST", cookie: "refresh_token=" + "a".repeat(43) }),
    ];
    for (const res of results) {
      assert.equal(res.status, 401);
      assert.deepEqual(res.json, results[0].json);
    }
  });

  it("lets at most one of two concurrent refreshes with the same token succeed", async () => {
    const user = await registerAndLogin("race");
    const ip = nextIp();
    const [a, b] = await Promise.all([
      call("/api/auth/refresh", { method: "POST", cookie: user.cookie, ip }),
      call("/api/auth/refresh", { method: "POST", cookie: user.cookie, ip }),
    ]);
    assert.ok([a, b].filter((r) => r.status === 200).length <= 1, "both concurrent refreshes succeeded");
    const [rows] = await db.execute(
      "SELECT COUNT(*) AS active FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL AND replaced_by_token_id IS NULL",
      [user.id],
    );
    assert.ok(Number(rows[0].active) <= 1);
  });
});

describe("logout", () => {
  it("revokes the session, clears the cookie, and is safe to repeat", async () => {
    const user = await registerAndLogin("logout");
    const out = await call("/api/auth/logout", { method: "POST", cookie: user.cookie });
    assert.equal(out.status, 200);
    assert.match(out.refresh, /Max-Age=0/);

    assert.equal((await call("/api/auth/refresh", { method: "POST", cookie: user.cookie })).status, 401);
    assert.equal((await call("/api/auth/logout", { method: "POST", cookie: user.cookie })).status, 200);
    assert.equal((await call("/api/auth/logout", { method: "POST" })).status, 200);
  });

  it("only ends the current session", async () => {
    const user = await registerAndLogin("twodev");
    const second = await call("/api/auth/login", { method: "POST", body: { email: user.email, password: PASSWORD }, ip: user.ip });
    await call("/api/auth/logout", { method: "POST", cookie: user.cookie });
    assert.equal((await call("/api/auth/refresh", { method: "POST", cookie: cookieValue(second) })).status, 200);
  });
});

describe("authorization", () => {
  it("denies a USER on admin routes and allows an ADMIN", async () => {
    const user = await registerAndLogin("rbac");
    assert.equal((await call("/api/admin/users")).status, 401);
    assert.equal((await call("/api/admin/users", { token: user.token })).status, 403);

    await db.execute("UPDATE users SET role = 'ADMIN' WHERE id = ?", [user.id]);
    const adminLogin = await call("/api/auth/login", { method: "POST", body: { email: user.email, password: PASSWORD }, ip: user.ip });
    const res = await call("/api/admin/users", { token: adminLogin.json.accessToken });
    assert.equal(res.status, 200);
    assert.ok(!/password|\$2[aby]\$/i.test(res.text));
  });

  it("applies a demotion immediately, before the token expires", async () => {
    const user = await registerAndLogin("demote");
    await db.execute("UPDATE users SET role = 'ADMIN' WHERE id = ?", [user.id]);
    const adminLogin = await call("/api/auth/login", { method: "POST", body: { email: user.email, password: PASSWORD }, ip: user.ip });
    await db.execute("UPDATE users SET role = 'USER' WHERE id = ?", [user.id]);
    assert.equal((await call("/api/admin/users", { token: adminLogin.json.accessToken })).status, 403);
  });

  it("rejects admin registration with a wrong code", async () => {
    const res = await call("/api/admin/register", {
      method: "POST",
      body: { email: emailFor("fakeadmin"), password: PASSWORD, inviteCode: "wrong-invite-code" },
    });
    assert.equal(res.status, 403);
  });
});

describe("admin user management", () => {
  async function adminSession(label) {
    const admin = await registerAndLogin(label);
    await db.execute("UPDATE users SET role = 'ADMIN' WHERE id = ?", [admin.id]);
    const login = await call("/api/auth/login", { method: "POST", body: { email: admin.email, password: PASSWORD }, ip: admin.ip });
    return { ...admin, token: login.json.accessToken };
  }

  it("lets an admin create, update, and delete a USER, and blocks normal users", async () => {
    const admin = await adminSession("crud-admin");
    const plain = await registerAndLogin("crud-plain");
    const email = emailFor("managed");

    assert.equal((await call("/api/admin/users", { method: "POST", token: plain.token, body: { email, password: PASSWORD } })).status, 403);
    assert.equal((await call("/api/admin/users", { method: "POST", body: { email, password: PASSWORD } })).status, 401);

    const created = await call("/api/admin/users", { method: "POST", token: admin.token, body: { email, password: PASSWORD, role: "ADMIN" } });
    assert.equal(created.status, 201);
    assert.equal(created.json.user.role, "USER");
    const id = created.json.user.id;
    assert.equal((await call("/api/admin/users", { method: "POST", token: admin.token, body: { email, password: PASSWORD } })).status, 409);

    const newEmail = emailFor("managed2");
    const updated = await call(`/api/admin/users/${id}`, { method: "PATCH", token: admin.token, body: { email: newEmail, password: "brand new pass", role: "ADMIN" } });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.user.email, newEmail);
    assert.equal(updated.json.user.role, "USER");
    assert.equal((await call("/api/auth/login", { method: "POST", body: { email: newEmail, password: "brand new pass" } })).status, 200);
    assert.equal((await call(`/api/admin/users/${id}`, { method: "PATCH", token: admin.token, body: {} })).status, 400);
    assert.equal((await call(`/api/admin/users/${id}`, { method: "PATCH", token: plain.token, body: { email: newEmail } })).status, 403);

    assert.equal((await call(`/api/admin/users/${id}`, { method: "DELETE", token: plain.token })).status, 403);
    assert.equal((await call(`/api/admin/users/${id}`, { method: "DELETE", token: admin.token })).status, 200);
    assert.equal((await call(`/api/admin/users/${id}`, { method: "DELETE", token: admin.token })).status, 404);
  });

  it("does not let an admin edit or delete another admin, and a password change ends sessions", async () => {
    const admin = await adminSession("crud-a1");
    const other = await adminSession("crud-a2");
    assert.equal((await call(`/api/admin/users/${other.id}`, { method: "DELETE", token: admin.token })).status, 404);
    assert.equal((await call(`/api/admin/users/${other.id}`, { method: "PATCH", token: admin.token, body: { password: "hijacked pass" } })).status, 404);
    assert.equal((await call("/api/admin/users/not-a-uuid", { method: "DELETE", token: admin.token })).status, 404);

    const victim = await registerAndLogin("crud-victim");
    const patch = await call(`/api/admin/users/${victim.id}`, { method: "PATCH", token: admin.token, body: { password: "reset by admin" } });
    assert.equal(patch.status, 200);
    assert.equal((await call("/api/auth/refresh", { method: "POST", cookie: victim.cookie })).status, 401);
  });
});

describe("resource ownership (notes)", () => {
  it("hides other users' notes behind 404 for read, edit and delete", { skip: !hasNotes && "notes table missing: run db/002_notes.sql" }, async () => {
    const alice = await registerAndLogin("alice");
    const bob = await registerAndLogin("bob");

    const created = await call("/api/notes", { method: "POST", token: alice.token, body: { title: "secret", content: "alice only" } });
    assert.equal(created.status, 201);
    const id = created.json.note.id;

    assert.equal((await call(`/api/notes/${id}`, { token: alice.token })).status, 200);
    assert.equal((await call(`/api/notes/${id}`, { token: bob.token })).status, 404);
    assert.equal((await call(`/api/notes/${id}`, { method: "PATCH", token: bob.token, body: { title: "hacked" } })).status, 404);
    assert.equal((await call(`/api/notes/${id}`, { method: "DELETE", token: bob.token })).status, 404);

    assert.ok(!(await call("/api/notes", { token: bob.token })).text.includes(id));
    assert.equal((await call(`/api/notes/${id}`, { token: alice.token })).json.note.title, "secret");
    assert.equal((await call(`/api/notes/${id}`, { method: "DELETE", token: alice.token })).status, 200);
  });
});

describe("CSRF / origin checks", () => {
  it("rejects cookie endpoints with a missing or foreign origin", async () => {
    const user = await registerAndLogin("csrf");
    for (const origin of [null, "https://evil.example", "http://localhost:3000.evil.example"]) {
      for (const path of ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"]) {
        const res = await call(path, {
          method: "POST", origin, cookie: user.cookie, body: { email: user.email, password: PASSWORD },
        });
        assert.equal(res.status, 403, `${path} origin=${origin}`);
      }
    }
    // The rejected attempts must not have consumed the refresh token.
    assert.equal((await call("/api/auth/refresh", { method: "POST", cookie: user.cookie })).status, 200);
  });

  it("sends no CORS headers", async () => {
    const res = await fetch(BASE + "/api/auth/login", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });
    for (const name of res.headers.keys()) assert.ok(!name.startsWith("access-control-"), name);
  });
});

describe("rate limiting", () => {
  it("limits login attempts per email with Retry-After", async () => {
    const email = emailFor("ratelimit");
    let last;
    let limitedAt = 0;
    for (let i = 1; i <= 12; i++) {
      last = await call("/api/auth/login", { method: "POST", body: { email, password: "wrong password!" } });
      if (last.status === 429) {
        limitedAt = i;
        break;
      }
      assert.equal(last.status, 401);
    }
    assert.ok(limitedAt > 0 && limitedAt <= 11, "never rate limited");
    assert.ok(Number(last.headers.get("retry-after")) > 0);
  });

  it("limits registrations per IP", async () => {
    const ip = nextIp();
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const res = await call("/api/auth/register", { method: "POST", body: { email: emailFor(`rl${i}`), password: PASSWORD }, ip });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429, 429]);
  });
});

describe("response safety", () => {
  it("never leaks stack traces or SQL in error responses", async () => {
    const user = await registerAndLogin("leak");
    const responses = [
      await call("/api/auth/login", { method: "POST", raw: "{" }),
      await call("/api/me", { token: "x" }),
      await call("/api/notes/not-a-uuid", { token: user.token }),
    ];
    for (const res of responses) {
      assert.ok(!/at .*\(.*:\d+:\d+\)|ER_|mysql|SELECT |INSERT /i.test(res.text), res.text.slice(0, 80));
    }
  });

  it("sends security headers", async () => {
    const res = await fetch(BASE + "/login");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.ok(res.headers.get("content-security-policy"));
    assert.equal(res.headers.get("x-powered-by"), null);
  });
});
