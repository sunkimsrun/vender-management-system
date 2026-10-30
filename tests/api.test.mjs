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

async function call(path, { method = "GET", body, token, cookie, origin = ORIGIN, ip, raw, form } = {}) {
  const headers = { "X-Forwarded-For": ip ?? nextIp() };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (form === undefined && (body !== undefined || raw !== undefined)) headers["Content-Type"] = "application/json";
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: form ?? raw ?? (body === undefined ? undefined : JSON.stringify(body)),
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

// ---------------------------------------------------------------------------
// Inventory tests (sections 4.2-4.6 and 11 of implement-plan.md).
// Everything created here is named with the run id and removed again in the `after` hooks.
// ---------------------------------------------------------------------------
const NAME = `T-${RUN}`;
const hasInventory = await (async () => {
  const c = await mysql.createConnection(dbConfig);
  try {
    const [cols] = await c.query("SHOW COLUMNS FROM stock_movements LIKE 'reference'");
    const [orders] = await c.query("SHOW TABLES LIKE 'order_items'");
    return cols.length > 0 && orders.length > 0;
  } catch {
    return false;
  } finally {
    await c.end();
  }
})();
const needsInventory = !hasInventory && "inventory tables missing: run db/007 and db/008 as MySQL root";

async function sessionWithRole(label, role) {
  const user = await registerAndLogin(label);
  await db.execute("UPDATE users SET role = ? WHERE id = ?", [role, user.id]);
  const login = await call("/api/auth/login", { method: "POST", body: { email: user.email, password: PASSWORD }, ip: user.ip });
  return { ...user, token: login.json.accessToken };
}

function productForm(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  return form;
}

async function addProduct(admin, fields = {}) {
  const res = await call("/api/admin/products", {
    method: "POST",
    token: admin.token,
    form: productForm({ name: `${NAME} item`, price: "9.99", reorderThreshold: 2, initialQuantity: 10, ...fields }),
  });
  return res;
}

async function cleanupInventoryRows() {
  await db.execute("DELETE FROM products WHERE name LIKE ?", [`${NAME}%`]);
  await db.execute("DELETE FROM categories WHERE name LIKE ?", [`${NAME}%`]);
  await db.execute("DELETE FROM suppliers WHERE name LIKE ?", [`${NAME}%`]);
}

describe("inventory CRUD (admin)", { skip: needsInventory }, () => {
  let admin;
  before(async () => {
    admin = await sessionWithRole("inv-admin", "ADMIN");
  });
  after(cleanupInventoryRows);

  it("creates, reads, updates and lists a product, and never changes quantity through PATCH", async () => {
    const created = await addProduct(admin, { name: `${NAME} widget`, sku: `${NAME}-W1`, costPrice: "4.50" });
    assert.equal(created.status, 201);
    const product = created.json.product;
    assert.equal(product.quantity, 10);
    assert.equal(product.price, 9.99);

    const detail = await call(`/api/admin/products/${product.id}`, { token: admin.token });
    assert.equal(detail.status, 200);
    assert.equal(detail.json.product.sku, `${NAME}-W1`);

    const patched = await call(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      token: admin.token,
      form: productForm({ name: `${NAME} widget v2`, price: "12.50", reorderThreshold: 3, quantity: 999, initialQuantity: 999 }),
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.product.name, `${NAME} widget v2`);
    assert.equal(patched.json.product.price, 12.5);
    assert.equal(patched.json.product.quantity, 10, "quantity must only change through stock movements");
  });

  it("rejects a duplicate SKU, invalid prices and invalid quantities", async () => {
    assert.equal((await addProduct(admin, { name: `${NAME} a`, sku: `${NAME}-DUP` })).status, 201);
    assert.equal((await addProduct(admin, { name: `${NAME} b`, sku: `${NAME}-DUP` })).status, 409);
    assert.equal((await addProduct(admin, { price: "-1" })).status, 400);
    assert.equal((await addProduct(admin, { price: "abc" })).status, 400);
    assert.equal((await addProduct(admin, { initialQuantity: "-5" })).status, 400);
    assert.equal((await addProduct(admin, { initialQuantity: "2.5" })).status, 400);
    assert.equal((await addProduct(admin, { name: "" })).status, 400);
    assert.equal((await addProduct(admin, { sku: "bad sku!" })).status, 400);
  });

  it("ignores unexpected fields and handles malformed bodies safely", async () => {
    const res = await addProduct(admin, { name: `${NAME} extra`, role: "ADMIN", createdBy: "x", id: "00000000-0000-4000-8000-000000000000" });
    assert.equal(res.status, 201);
    assert.notEqual(res.json.product.id, "00000000-0000-4000-8000-000000000000");
    const bad = await call("/api/admin/categories", { method: "POST", token: admin.token, raw: "{" });
    assert.equal(bad.status, 400);
    assert.ok(!/ER_|SELECT |stack/i.test(bad.text));
  });

  it("supports category and supplier CRUD with unique names and deletion constraints", async () => {
    const cat = await call("/api/admin/categories", { method: "POST", token: admin.token, body: { name: `${NAME} cat`, description: "d" } });
    assert.equal(cat.status, 201);
    const categoryId = cat.json.category.id;
    assert.equal((await call("/api/admin/categories", { method: "POST", token: admin.token, body: { name: `${NAME} cat` } })).status, 409);
    assert.equal((await call("/api/admin/categories", { method: "POST", token: admin.token, body: { name: "" } })).status, 400);

    const renamed = await call(`/api/admin/categories/${categoryId}`, { method: "PATCH", token: admin.token, body: { name: `${NAME} cat2` } });
    assert.equal(renamed.json.category.name, `${NAME} cat2`);

    const sup = await call("/api/admin/suppliers", {
      method: "POST",
      token: admin.token,
      body: { name: `${NAME} sup`, email: "sup@example.com", phone: "+855 12 345 678" },
    });
    assert.equal(sup.status, 201);
    const supplierId = sup.json.supplier.id;
    assert.equal((await call("/api/admin/suppliers", { method: "POST", token: admin.token, body: { name: `${NAME} sup2`, email: "nope" } })).status, 400);

    const linked = await addProduct(admin, { name: `${NAME} linked`, categoryId, supplierId });
    assert.equal(linked.status, 201);
    assert.equal(linked.json.product.categoryName, `${NAME} cat2`);
    assert.equal((await addProduct(admin, { name: `${NAME} orphan`, categoryId: "00000000-0000-4000-8000-000000000000" })).status, 400);

    // A category used by a product cannot be deleted; a supplier used by a product is deactivated instead.
    assert.equal((await call(`/api/admin/categories/${categoryId}`, { method: "DELETE", token: admin.token })).status, 409);
    const removed = await call(`/api/admin/suppliers/${supplierId}`, { method: "DELETE", token: admin.token });
    assert.equal(removed.status, 200);
    assert.equal(removed.json.result, "deactivated");

    // Once the product no longer uses the category it can be deleted.
    await db.execute("UPDATE products SET category_id = NULL WHERE id = ?", [linked.json.product.id]);
    assert.equal((await call(`/api/admin/categories/${categoryId}`, { method: "DELETE", token: admin.token })).status, 200);
  });

  it("searches, filters, sorts and paginates on the server", async () => {
    const cat = (await call("/api/admin/categories", { method: "POST", token: admin.token, body: { name: `${NAME} listcat` } })).json.category;
    for (const [name, price, qty] of [["alpha", "30", 0], ["beta", "10", 2], ["gamma", "20", 50]]) {
      assert.equal((await addProduct(admin, { name: `${NAME} list ${name}`, price, initialQuantity: qty, categoryId: cat.id })).status, 201);
    }
    const q = `/api/admin/products?categoryId=${cat.id}`;

    const byName = await call(`${q}&q=${encodeURIComponent("list beta")}`, { token: admin.token });
    assert.equal(byName.json.total, 1);

    const cheapFirst = await call(`${q}&sort=price&order=asc`, { token: admin.token });
    assert.deepEqual(cheapFirst.json.products.map((p) => p.price), [10, 20, 30]);

    assert.equal((await call(`${q}&stock=out`, { token: admin.token })).json.total, 1);
    assert.equal((await call(`${q}&stock=low`, { token: admin.token })).json.total, 1);
    assert.equal((await call(`${q}&stock=in`, { token: admin.token })).json.total, 1);

    const page2 = await call(`${q}&sort=price&order=asc&pageSize=2&page=2`, { token: admin.token });
    assert.equal(page2.json.products.length, 1);
    assert.equal(page2.json.totalPages, 2);

    // Oversized page sizes and junk sort values fall back to safe defaults instead of erroring or scanning everything.
    const clamped = await call(`${q}&pageSize=100000&sort=${encodeURIComponent("price; DROP TABLE products")}`, { token: admin.token });
    assert.equal(clamped.status, 200);
    assert.ok(clamped.json.pageSize <= 100);
  });
});

describe("stock movements", { skip: needsInventory }, () => {
  let admin;
  before(async () => {
    admin = await sessionWithRole("stock-admin", "ADMIN");
  });
  after(cleanupInventoryRows);

  const move = (body) => call("/api/admin/stock", { method: "POST", token: admin.token, body });
  const quantityOf = async (id) => (await call(`/api/admin/products/${id}`, { token: admin.token })).json.product.quantity;

  it("applies stock-in, stock-out and adjustments and records the acting user and resulting quantity", async () => {
    const product = (await addProduct(admin, { name: `${NAME} stock a`, initialQuantity: 5 })).json.product;

    const inRes = await move({ productId: product.id, type: "STOCK_IN", quantity: 7, reason: "delivery" });
    assert.equal(inRes.status, 201);
    assert.equal(inRes.json.movement.resultingQuantity, 12);
    assert.equal((await move({ productId: product.id, type: "STOCK_OUT", quantity: 4 })).json.movement.resultingQuantity, 8);
    const adjust = await move({ productId: product.id, type: "ADJUSTMENT", quantity: 6, reason: "recount" });
    assert.equal(adjust.json.movement.quantityChange, -2);
    assert.equal(await quantityOf(product.id), 6);

    const history = await call(`/api/admin/stock?productId=${product.id}`, { token: admin.token });
    assert.equal(history.status, 200);
    const [latest] = history.json.items;
    assert.equal(latest.type, "ADJUSTMENT");
    assert.equal(latest.resultingQuantity, 6);
    assert.equal(latest.previousQuantity, 8);
    assert.equal(latest.userEmail, admin.email);
    assert.equal(history.json.items.length, 4, "initial stock + three movements");
  });

  it("rejects negative stock and invalid input, and leaves no partial update behind", async () => {
    const product = (await addProduct(admin, { name: `${NAME} stock b`, initialQuantity: 3 })).json.product;
    const [[before]] = await db.query("SELECT COUNT(*) AS n FROM stock_movements WHERE product_id = ?", [product.id]);

    assert.equal((await move({ productId: product.id, type: "STOCK_OUT", quantity: 4 })).status, 409);
    assert.equal((await move({ productId: product.id, type: "STOCK_OUT", quantity: 0 })).status, 400);
    assert.equal((await move({ productId: product.id, type: "STOCK_IN", quantity: -1 })).status, 400);
    assert.equal((await move({ productId: product.id, type: "STOCK_IN", quantity: 1.5 })).status, 400);
    assert.equal((await move({ productId: product.id, type: "ADJUSTMENT", quantity: 1 })).status, 400, "adjustments need a reason");
    assert.equal((await move({ productId: product.id, type: "BOGUS", quantity: 1 })).status, 400);
    assert.equal((await move({ productId: "00000000-0000-4000-8000-000000000000", type: "STOCK_IN", quantity: 1 })).status, 404);

    const [[after]] = await db.query("SELECT COUNT(*) AS n FROM stock_movements WHERE product_id = ?", [product.id]);
    assert.equal(after.n, before.n);
    assert.equal(await quantityOf(product.id), 3);
  });

  it("keeps balances correct under concurrent stock-outs", async () => {
    const product = (await addProduct(admin, { name: `${NAME} stock c`, initialQuantity: 5 })).json.product;
    const results = await Promise.all(Array.from({ length: 12 }, () => move({ productId: product.id, type: "STOCK_OUT", quantity: 1 })));
    assert.equal(results.filter((r) => r.status === 201).length, 5);
    assert.equal(results.filter((r) => r.status === 409).length, 7);
    assert.equal(await quantityOf(product.id), 0);

    const [[row]] = await db.query("SELECT COALESCE(SUM(quantity_change), 0) AS total FROM stock_movements WHERE product_id = ?", [product.id]);
    assert.equal(Number(row.total), 0, "the movement history must add up to the current quantity");
  });

  it("filters history by type and keeps it append-only", async () => {
    const product = (await addProduct(admin, { name: `${NAME} stock d`, initialQuantity: 2 })).json.product;
    await move({ productId: product.id, type: "STOCK_IN", quantity: 1 });
    const filtered = await call(`/api/admin/stock?productId=${product.id}&type=STOCK_IN`, { token: admin.token });
    assert.ok(filtered.json.items.every((m) => m.type === "STOCK_IN"));
    await assert.rejects(db.execute("UPDATE stock_movements SET quantity_change = 99 WHERE product_id = ?", [product.id]));
    await assert.rejects(db.execute("DELETE FROM stock_movements WHERE product_id = ?", [product.id]));
  });

  it("deactivates (instead of deleting) a product that has movement history", async () => {
    const product = (await addProduct(admin, { name: `${NAME} stock e`, initialQuantity: 4 })).json.product;
    const res = await call(`/api/admin/products/${product.id}`, { method: "DELETE", token: admin.token });
    assert.equal(res.json.result, "deactivated");
    const storefront = await call("/api/products");
    assert.ok(!JSON.stringify(storefront.json).includes(product.id), "inactive products are hidden from the storefront");
  });
});

describe("roles and access control", { skip: needsInventory }, () => {
  let admin;
  before(async () => {
    admin = await sessionWithRole("rbac-admin", "ADMIN");
  });
  after(cleanupInventoryRows);

  const adminRoutes = [
    ["GET", "/api/admin/overview"],
    ["GET", "/api/admin/products"],
    ["GET", "/api/admin/categories"],
    ["GET", "/api/admin/suppliers"],
    ["GET", "/api/admin/stock"],
    ["GET", "/api/admin/stock/lookups"],
    ["GET", "/api/admin/lookups"],
    ["GET", "/api/admin/users"],
    ["POST", "/api/admin/stock"],
    ["POST", "/api/admin/categories"],
  ];

  it("rejects unauthenticated requests (401) and USER/STAFF accounts (403) on every admin endpoint", async () => {
    const user = await sessionWithRole("rbac-user", "USER");
    const staff = await sessionWithRole("rbac-staff", "STAFF");
    for (const [method, path] of adminRoutes) {
      const body = method === "POST" ? {} : undefined;
      assert.equal((await call(path, { method, body })).status, 401, `${method} ${path} anonymous`);
      assert.equal((await call(path, { method, body, token: user.token })).status, 403, `${method} ${path} user`);
      assert.equal((await call(path, { method, body, token: staff.token })).status, 403, `${method} ${path} staff`);
    }
    assert.equal((await call("/api/admin/overview", { token: admin.token })).status, 200);
  });

  it("lets an admin create and change USER/STAFF roles but never grant ADMIN", async () => {
    const email = emailFor("staff-made");
    const created = await call("/api/admin/users", { method: "POST", token: admin.token, body: { email, password: PASSWORD, role: "STAFF" } });
    assert.equal(created.status, 201);
    assert.equal(created.json.user.role, "STAFF");

    const id = created.json.user.id;
    const toUser = await call(`/api/admin/users/${id}`, { method: "PATCH", token: admin.token, body: { role: "USER" } });
    assert.equal(toUser.json.user.role, "USER");
    const toAdmin = await call(`/api/admin/users/${id}`, { method: "PATCH", token: admin.token, body: { role: "ADMIN" } });
    assert.notEqual(toAdmin.json?.user?.role, "ADMIN");
    const [[row]] = await db.query("SELECT role FROM users WHERE id = ?", [id]);
    assert.notEqual(row.role, "ADMIN");
  });

  it("does not let STAFF or USER accounts assign roles", async () => {
    const staff = await sessionWithRole("rbac-staff2", "STAFF");
    const res = await call("/api/admin/users", { method: "POST", token: staff.token, body: { email: emailFor("nope"), password: PASSWORD, role: "ADMIN" } });
    assert.equal(res.status, 403);
  });

  const staffCode = env.STAFF_INVITE_CODE;
  const adminCode = env.ADMIN_INVITE_CODE;
  it(
    "creates STAFF with STAFF_INVITE_CODE and ADMIN with ADMIN_INVITE_CODE on the same endpoint",
    { skip: !(staffCode?.length >= 20 && adminCode?.length >= 20) && "set ADMIN_INVITE_CODE and STAFF_INVITE_CODE (20+ chars) in .env.local and restart the server" },
    async () => {
      const staff = await call("/api/admin/register", { method: "POST", body: { email: emailFor("code-staff"), password: PASSWORD, inviteCode: staffCode } });
      assert.equal(staff.status, 201);
      assert.equal(staff.json.user.role, "STAFF");
      const adm = await call("/api/admin/register", { method: "POST", body: { email: emailFor("code-admin"), password: PASSWORD, inviteCode: adminCode } });
      assert.equal(adm.status, 201);
      assert.equal(adm.json.user.role, "ADMIN");
    },
  );
});

describe("purchase workflow", { skip: needsInventory }, () => {
  let admin;
  before(async () => {
    admin = await sessionWithRole("buy-admin", "ADMIN");
  });
  after(cleanupInventoryRows);

  const add = (buyer, productId, quantity) => call("/api/cart", { method: "POST", token: buyer.token, body: { productId, quantity } });

  it("lets USER and STAFF buy: price and stock are validated server-side and the cart is cleared", async () => {
    for (const role of ["USER", "STAFF"]) {
      const buyer = await sessionWithRole(`buyer-${role}`, role);
      const product = (await addProduct(admin, { name: `${NAME} buy ${role}`, price: "5.25", initialQuantity: 10 })).json.product;
      assert.equal((await add(buyer, product.id, 3)).status, 201);

      const order = await call("/api/orders", { method: "POST", token: buyer.token });
      assert.equal(order.status, 201);
      assert.equal(order.json.order.total, 15.75);
      assert.equal(order.json.order.items[0].unitPrice, 5.25);

      const cart = await call("/api/cart", { token: buyer.token });
      assert.equal(cart.json.items.length, 0);
      const detail = await call(`/api/admin/products/${product.id}`, { token: admin.token });
      assert.equal(detail.json.product.quantity, 7);

      const history = await call(`/api/admin/stock?productId=${product.id}&type=STOCK_OUT`, { token: admin.token });
      assert.equal(history.json.items[0].quantityChange, -3);
      assert.equal(history.json.items[0].userEmail, buyer.email.toLowerCase());
      assert.match(history.json.items[0].reference, /^ORDER-/);

      const mine = await call("/api/orders", { token: buyer.token });
      assert.equal(mine.json.orders.length, 1);
      assert.equal(mine.json.orders[0].items[0].productName, `${NAME} buy ${role}`);
    }
  });

  it("refuses to oversell, keeps the cart, and never exposes another customer's orders", async () => {
    const buyer = await sessionWithRole("oversell", "USER");
    const other = await sessionWithRole("oversell-other", "USER");
    const product = (await addProduct(admin, { name: `${NAME} scarce`, initialQuantity: 2 })).json.product;
    await add(buyer, product.id, 2);
    await call("/api/admin/stock", { method: "POST", token: admin.token, body: { productId: product.id, type: "STOCK_OUT", quantity: 1 } });

    const order = await call("/api/orders", { method: "POST", token: buyer.token });
    assert.equal(order.status, 409);
    assert.equal((await call(`/api/admin/products/${product.id}`, { token: admin.token })).json.product.quantity, 1);
    assert.equal((await call("/api/cart", { token: buyer.token })).json.items.length, 1);
    assert.equal((await call("/api/orders", { token: other.token })).json.orders.length, 0);
    assert.equal((await call("/api/orders", { method: "POST", token: other.token })).status, 400, "empty cart");
  });

  it("sells the last unit to only one of two concurrent buyers", async () => {
    const product = (await addProduct(admin, { name: `${NAME} lastone`, initialQuantity: 1 })).json.product;
    const buyers = await Promise.all([sessionWithRole("race-a", "USER"), sessionWithRole("race-b", "USER")]);
    for (const b of buyers) await add(b, product.id, 1);
    const results = await Promise.all(buyers.map((b) => call("/api/orders", { method: "POST", token: b.token })));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await call(`/api/admin/products/${product.id}`, { token: admin.token })).json.product.quantity, 0);
  });

  it("does not let customers touch stock APIs or let admins/anonymous users check out", async () => {
    const buyer = await sessionWithRole("nostock", "USER");
    assert.equal((await call("/api/admin/stock", { method: "POST", token: buyer.token, body: {} })).status, 403);
    assert.equal((await call("/api/orders", { method: "POST" })).status, 401);
    assert.equal((await call("/api/orders", { method: "POST", token: admin.token })).status, 403);
  });

  it("rate-limits checkout", async () => {
    const buyer = await sessionWithRole("checkout-limit", "USER");
    let last;
    for (let i = 0; i < 21; i++) last = await call("/api/orders", { method: "POST", token: buyer.token });
    assert.equal(last.status, 429);
  });
});

describe("performance (seeded data)", { skip: needsInventory, timeout: 600_000 }, () => {
  const PRODUCTS = Number(process.env.PERF_PRODUCTS ?? 50_000);
  const MOVEMENTS = Number(process.env.PERF_MOVEMENTS ?? 200_000);
  const PREFIX = `perf-${RUN}`;
  let admin;

  async function timed(label, path, expectedStatus = 200) {
    const started = performance.now();
    const res = await call(path, { token: admin.token });
    const ms = Math.round(performance.now() - started);
    console.log(`    ${label}: ${ms} ms`);
    assert.equal(res.status, expectedStatus, `${label} -> ${res.status}`);
    return { res, ms };
  }

  before(async () => {
    admin = await sessionWithRole("perf-admin", "ADMIN");
    const started = performance.now();
    const batch = 2000;
    for (let i = 0; i < PRODUCTS; i += batch) {
      const rows = [];
      const params = [];
      for (let j = i; j < Math.min(i + batch, PRODUCTS); j++) {
        rows.push("(UUID(), ?, 'seeded', ?, ?, ?, ?)");
        params.push(`${PREFIX}-${j}`, (j % 500) + 1, `${PREFIX}-SKU-${j}`, j % 120, 5);
      }
      await db.query(`INSERT INTO products (id, name, description, price, sku, quantity, reorder_threshold) VALUES ${rows.join(",")}`, params);
    }
    const [ids] = await db.query("SELECT id FROM products WHERE name LIKE ? LIMIT 5000", [`${PREFIX}-%`]);
    for (let i = 0; i < MOVEMENTS; i += batch) {
      const rows = [];
      const params = [];
      for (let j = i; j < Math.min(i + batch, MOVEMENTS); j++) {
        rows.push("(UUID(), ?, 'STOCK_IN', 1, 0, 1, 'seed', NULL, NOW(3) - INTERVAL ? SECOND)");
        params.push(ids[j % ids.length].id, j % 8_000_000);
      }
      await db.query(
        `INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, previous_quantity, resulting_quantity, reason, created_by, created_at) VALUES ${rows.join(",")}`,
        params,
      );
    }
    console.log(`    seeded ${PRODUCTS} products and ${MOVEMENTS} movements in ${Math.round(performance.now() - started)} ms`);
  });

  after(async () => {
    await db.execute("DELETE FROM products WHERE name LIKE ?", [`${PREFIX}-%`]);
    await cleanupInventoryRows();
  });

  it("serves list, search, filter, sort and detail queries quickly", async () => {
    const list = await timed("product list", "/api/admin/products?page=1&pageSize=20");
    assert.equal(list.res.json.products.length, 20);
    assert.ok(list.res.json.total >= PRODUCTS);
    assert.ok(list.ms < 3000);

    const deep = await timed("deep page", "/api/admin/products?page=1000&pageSize=20&sort=name&order=asc");
    assert.ok(deep.ms < 3000);

    const search = await timed("search by name", `/api/admin/products?q=${encodeURIComponent(`${PREFIX}-4999`)}`);
    assert.ok(search.res.json.total >= 1);
    assert.ok(search.ms < 3000);

    assert.ok((await timed("filter low stock", "/api/admin/products?stock=low&pageSize=20")).ms < 3000);
    assert.ok((await timed("sort by price", "/api/admin/products?sort=price&order=desc&pageSize=20")).ms < 3000);

    const detail = await timed("detail", `/api/admin/products/${list.res.json.products[0].id}`);
    assert.ok(detail.ms < 1000);
  });

  it("serves stock history and the dashboard aggregation quickly", async () => {
    const history = await timed("stock history (latest page)", "/api/admin/stock?pageSize=20");
    assert.equal(history.res.json.items.length, 20);
    assert.ok(history.ms < 3000);

    const [[sample]] = await db.query("SELECT product_id FROM stock_movements WHERE reason = 'seed' LIMIT 1");
    assert.ok((await timed("stock history by product", `/api/admin/stock?productId=${sample.product_id}`)).ms < 3000);
    assert.ok((await timed("stock history by type + date", "/api/admin/stock?type=STOCK_IN&from=2020-01-01&to=2030-01-01&pageSize=20")).ms < 5000);

    const overview = await timed("dashboard overview", "/api/admin/overview");
    assert.ok(overview.res.json.totals.products >= PRODUCTS);
    assert.ok(overview.ms < 5000);
  });

  it("uses indexes for the hot query paths (EXPLAIN)", async () => {
    const plan = async (sql, params = []) => (await db.query(`EXPLAIN ${sql}`, params))[0];

    const bySku = await plan("SELECT id FROM products WHERE sku = ?", [`${PREFIX}-SKU-1`]);
    assert.equal(bySku[0].key, "uq_products_sku");
    assert.ok(Number(bySku[0].rows) <= 1);

    const byProduct = await plan("SELECT id FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT 20", ["x"]);
    assert.ok(/idx_stock_movements_product/.test(String(byProduct[0].key)), `history by product plan: ${byProduct[0].key}`);

    const latest = await plan("SELECT id FROM stock_movements ORDER BY created_at DESC LIMIT 20");
    assert.ok(latest[0].key, "latest movements should read an index, not sort the whole table");

    const byName = await plan("SELECT id FROM products WHERE name LIKE ?", [`${PREFIX}-4999%`]);
    assert.ok(byName[0].key, "name prefix search should use idx_products_name");
  });

  it("keeps stock balances correct under concurrent operations on seeded data", async () => {
    const product = (await addProduct(admin, { name: `${NAME} perf conc`, initialQuantity: 20 })).json.product;
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        call("/api/admin/stock", { method: "POST", token: admin.token, body: { productId: product.id, type: i % 2 ? "STOCK_IN" : "STOCK_OUT", quantity: 1 } }),
      ),
    );
    assert.ok(results.every((r) => r.status === 201));
    const [[row]] = await db.query("SELECT quantity FROM products WHERE id = ?", [product.id]);
    assert.equal(row.quantity, 20);
  });
});
