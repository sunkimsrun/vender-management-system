# Implementation Plan: Full CRUD & Data Management Dashboard System

Extending the existing authentication system (formerly `auth-system`, now `vender-management-system`).

---

## 1. Project Overview

Extend the existing authentication system (now `vender-management-system`) into a complete, secure, and scalable CRUD and data management dashboard. The application uses the current authentication system as its foundation and adds inventory management, reporting, analytics, and administrative features.

The system is built with Next.js App Router, TypeScript, Tailwind CSS, and the existing database infrastructure. MySQL is used for relational data storage, with MySQL Workbench available for database administration.

Implementation must prioritize maintainability, data integrity, security, and performance when handling large datasets.

### Primary objectives

- Preserve the existing login, registration, logout, refresh-token, session, and authorization functionality.
- Implement complete CRUD operations for products, categories, and suppliers.
- Track stock movements and maintain accurate inventory quantities.
- Provide dashboard statistics, searchable tables, filtering, sorting, and pagination.
- Manage users through the existing admin panel and permission system.
- Preserve the current notes module unless its removal is explicitly required.
- Support approximately 50,000 products and 200,000 stock movement records.
- Reuse existing project utilities instead of duplicating infrastructure.

---

## 2. Existing Project Integration

The current project is the foundation. Do **not** replace it with a newly generated application or introduce a second authentication system.

### Existing modules to preserve

| Path | Purpose |
|------|---------|
| `app/api/auth/` | Authentication endpoints |
| `app/api/me/` | Current-user endpoint |
| `app/api/admin/` | Administrative user operations |
| `app/api/notes/` | Existing notes CRUD endpoints |
| `app/dashboard/` | Main dashboard |
| `app/admin/` | Administrative interface |
| `components/` | Shared UI and dashboard components |
| `lib/auth/` | Token, password, session, and authorization utilities |
| `lib/client/` | Client API and session helpers |
| `lib/http/` | Request validation helpers, CSRF protection, errors, logging, response utilities |
| `lib/validation/` | Existing validation schemas |
| `lib/db.ts`, `lib/env.ts` | Existing database and environment configuration |
| `lib/rate-limit.ts` | Existing rate-limiting infrastructure |
| `tests/api.test.mjs` | Existing API tests |
| `db/schema.sql`, `db/002_notes.sql` | Existing database schema and notes migration |

Inspect the current implementations before modifying them. Reuse their established conventions and preserve backward compatibility where practical.

---

## 3. Technology Stack

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS.
- **Backend:** Next.js Route Handlers and server-side application logic.
- **Database:** MySQL 8+.
- **Database administration:** MySQL Workbench.
- **Database access:** Existing `lib/db.ts` implementation.
- **Validation:** Existing validation utilities, and Zod if already installed.
- **Authentication:** Existing access-token, refresh-token, and session implementation.
- **Authorization:** Existing role and permission checks.
- **Testing:** Existing API tests, expanded to cover new CRUD operations.
- **Version control:** Git.

**Verified against `package.json`:** Next.js 16.4.3 (App Router), React 19.3, TypeScript 5, Tailwind CSS 4, `mysql2` (single pool in `lib/db.ts`), Zod 4, `jose` + `bcrypt` for auth, and Node's built-in test runner (`npm test`). No ORM and no extra dependencies are needed.

Do not introduce Prisma, another ORM, a second database connection pool, or unnecessary dependencies unless the current project requires them.

---

## 4. Functional Requirements

### 4.0 Public Site, Header & Home Page Products

- Visual style (Tailwind CSS only): indigo/violet accent, soft slate page background, sticky blurred headers with a gradient logo badge, hero banner on Home, hover-lift product cards, rounded cards with soft shadows, gradient auth pages. Theme basics live in `app/globals.css`; the accent is applied directly via Tailwind utility classes (`indigo-*`), dark mode follows the OS setting.

- Project renamed from `auth-system` to `vender-management-system` (UI title updated; database renamed from `auth_system` to `vendor_management_system` (MySQL names use underscores, since hyphens require quoting); the `auth_app` DB user and `JWT_*` defaults are unchanged. Existing installs must re-run `db/schema.sql`, `002_notes.sql` and `003_products.sql`, or run `RENAME TABLE` for each table into the new schema, and set `DB_NAME` if overridden).
- `components/site-header.tsx`: horizontal header with links **Home** (`/`), **Contact** (`/contact`), **Login** (`/login`). When a session exists it swaps Login for **Dashboard** (`/admin` for admins, `/dashboard` for users) and **Log out**, so signed-in users can move freely between the public pages and their dashboard without logging out. Dashboard/admin headers link back to Home and Contact.
- `app/contact/page.tsx`: contact page.
- Home page (`app/page.tsx` + `components/home-products.tsx`) shows the product catalog to everyone. Style: dark hero with glow, perk cards, a "Catalog" heading, and a 4-column grid of square-image product cards with a price pill and an outlined "Add to cart" button.
- The home page is read-only for everyone, including admins (no form, no delete buttons). Admins enter products manually from the admin dashboard (`/admin/products`).
- Admin dashboard: `/admin/products` (`components/admin-products.tsx`) lets admins add and delete products; the admin panel has a left sidebar with **Manage users** (`/admin`) and **Add product** (`/admin/products`); the top header keeps Home and Contact links. The sidebar (`components/admin-sidebar.tsx`) appears only inside the admin panel; public Home and Contact look the same for admins and users.
- Cart: each product card has **Add to cart**. Visitors who click it are sent to `/login`; signed-in users get the item added to their cart (repeat adds increase the quantity, max 99). Users view and manage it at `/dashboard/cart` ("My cart": change quantity, remove, total). The user dashboard has a left sidebar with **User account** (`/dashboard`) and **My cart** (`/dashboard/cart`), using the shared `components/admin-sidebar.tsx`. Admins don't see the button (their role manages the catalog).
- Cart API (USER role only, always scoped to the authenticated user): `GET/POST /api/cart`, `PATCH/DELETE /api/cart/[productId]`. Database: `db/005_cart.sql` (`cart_items`, cascades on user/product delete); run as root after `004`.
- API: `GET /api/products` (public), `POST /api/products` and `DELETE /api/products/[id]` (admin only, enforced server-side with `requireRole`).
- Database: `db/003_products.sql` (`products` table: name, description, price, created_by), then `db/004_product_images.sql` (adds `image_type`, `image_data` MEDIUMBLOB). Run after `002_notes.sql`; `004` needs a MySQL account with ALTER rights (e.g. root).
- Product images: optional PNG/JPEG/WebP up to 2 MB, uploaded as multipart form data, type verified from file bytes, stored in the database and served publicly by `GET /api/products/[id]/image`.
- Validation: `lib/validation/products.ts`; data access: `lib/products.ts`.
- Product management (section 4.2): `/admin/products` (`components/admin-products.tsx`) has a paginated table (10/page) with search (name/SKU), category/supplier/stock-status filters, sorting (name, price, quantity, newest), add and edit form, and remove. API (ADMIN only): `GET/POST /api/admin/products`, `GET/PATCH/DELETE /api/admin/products/[id]`, `GET /api/admin/lookups` (category and supplier dropdowns); logic in `lib/inventory-products.ts`, validation in `lib/validation/inventory-products.ts`. Rules: SKU unique (409 on duplicate); prices >= 0; quantities are whole numbers >= 0; quantity is accepted only on create (written as an "Initial stock" movement in the same transaction) and PATCH ignores it, so later changes must use stock movements (step 7); DELETE deletes a product with no movement history and deactivates one that has history (`is_active = 0`, hidden from the public Home page). The sidebar entry is now **Products**.
- Categories, suppliers and stock (sections 4.3-4.5), all ADMIN only, sidebar links **Categories**, **Suppliers**, **Stock**:
  - Categories (`/admin/categories`, `GET/POST /api/admin/categories`, `PATCH/DELETE /api/admin/categories/[id]`): search, pagination, unique names (409), deletion blocked with a clear 409 while products use the category.
  - Suppliers (`/admin/suppliers`, `/api/admin/suppliers[/id]`): fields name, contact person, email (validated), phone, address, status; search, status filter, pagination; removing a supplier that products use deactivates it, otherwise deletes it.
  - Stock (`/admin/stock`, `GET/POST /api/admin/stock`, `GET /api/admin/stock/lookups`; logic in `lib/stock.ts`): types `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`. Adjustment policy: the admin enters the new counted quantity and a reason (required); the stored change is the difference. Each movement stores previous and resulting quantity, reason and acting user. The product row is locked (`SELECT ... FOR UPDATE`), the quantity updated and the movement inserted in one transaction; a stock-out that would go below zero returns 409. There is no edit or delete endpoint, and `db/007` revokes UPDATE/DELETE on `stock_movements` from `vendor_app`, so history is append-only (correct mistakes with an adjustment). History is filterable by product, type, user and date range, with pagination.
  - Migration `db/007_inventory_details.sql` (run as root after `006`): adds category description/updated_at, supplier contact person/address/status/updated_at, and movement type/previous/resulting quantity.
- Analytics and security (sections 8 and 9): `/admin/overview` (`GET /api/admin/overview`, ADMIN only, date range max 1 year) now reports totals, products per category, a low-stock/out-of-stock list (10), movement totals by type, stock in/out per day, the 5 most-moved products, recent movements with the acting user, and inventory value. Valuation basis: quantity on hand x `cost_price`, products without a cost price excluded (stated on the page). All of it is SQL aggregation with date filters and limits. Security: existing mechanisms are preserved; the movement history is the audit trail (append-only, acting user stored); CSRF Origin checks stay on the cookie-based auth routes while bearer-token routes (admin, cart, orders, notes) are not cookie-authenticated; checkout is rate-limited to 20 per 15 minutes per user; role fields can only be set to USER/STAFF by admins and registration cannot choose a role.
- Application structure and API (sections 6 and 7), adapted to this project: the admin area lives under `/admin` (sidebar layout) instead of `/dashboard/*`, which is the customer area. Section 7 endpoints map as: products `/api/admin/products[/id]` (GET list, POST, GET/PATCH/DELETE by id; DELETE deactivates products with history); categories `/api/admin/categories[/id]`; suppliers `/api/admin/suppliers[/id]`; stock movements `/api/admin/stock` (GET history, POST record; no detail, edit or delete route on purpose, history is append-only); analytics `/api/admin/overview`; health `/api/health/db` unchanged. The public storefront keeps `/api/products` (active products only). Every route authenticates, checks the ADMIN role server-side, validates with Zod and uses parameterized SQL via the shared `adminRoute` wrapper (`lib/http/admin-route.ts`). Lists are server-side paginated with `pageSize` capped at 100; offset pagination is used because the tables are small and sorted by a stable key; cursor pagination was not added. Logic files are `lib/inventory-products.ts`, `lib/inventory-catalog.ts` (categories and suppliers), `lib/stock.ts`, `lib/inventory-stats.ts`; migrations are `db/006`, `007`, `008` rather than `003_inventory.sql`.
- Database design and notes (sections 4.7 and 5): the notes module (`lib/notes*`, `app/api/notes/**`, `db/002_notes.sql`) is untouched. Migration `db/007_inventory_details.sql` is repeatable (helper procedures add each column, index and constraint only if missing) and is the one-time inventory migration; there is no migration runner, so it is run manually as MySQL root. Column names differ slightly from the section 5 list: `products.price` = selling_price, `products.quantity` = stock_quantity, `products.reorder_threshold` = reorder_level, `products.is_active` = status, `suppliers.contact_email/contact_phone` = email/phone, `suppliers.is_active` = status, `stock_movements.created_by` = user_id, `quantity_change` = quantity, `resulting_quantity` = new_quantity. Added in 007: `stock_movements.reference` (checkout writes `ORDER-<id>`), indexes on `(product_id, created_at)`, `products.name` and `products.is_active` (plus the existing unique `sku`, category, supplier, movement type and acting-user indexes), and CHECK constraints (`quantity >= 0`, `reorder_threshold >= 0`, `cost_price >= 0`). Deletion rules: category/supplier deletion sets `products` references to NULL at the database level (the API blocks category deletion while in use); deleting a product cascades its movements, which the API avoids by deactivating products that have history.
- Roles and purchasing (section 4.6): new `STAFF` role (dashboard, cart and purchases; no admin panel). Admins create/edit USER and STAFF accounts with a role selector in **Manage users**; the role field accepts only USER/STAFF (ADMIN is ignored, so it can never be granted), and changing a role or password signs the account out. Checkout: `POST /api/orders` (USER/STAFF; no body, built from the server-side cart) runs one transaction that locks the product rows, validates active status and stock (409 otherwise), records `orders` + `order_items` (name/price copied), decrements stock, writes `STOCK_OUT` movements ("Order <id>") and clears the cart. `GET /api/orders` lists only the caller's orders (UI: cart **Checkout** button and `/dashboard/orders`, sidebar **My orders**). Migration `db/008_staff_orders.sql` (run as root after `007`) adds the role and order tables. Sign-up: the existing `/admin/register` page decides the role from the invite code entered - `ADMIN_INVITE_CODE` creates an ADMIN, `STAFF_INVITE_CODE` creates a STAFF (both 20+ chars; unset disables that role's sign-up; wrong codes get the same generic rejection).
- Inventory overview (section 4.1): admin page `/admin/overview` (`components/inventory-overview.tsx`, sidebar link **Overview**) backed by `GET /api/admin/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN only, range max 1 year, default last 30 days) and `lib/inventory-stats.ts`; every metric is aggregated in SQL. Shows totals (products, categories, suppliers, quantity, low stock, out of stock, inventory value when cost data exists), a daily stock in/out bar chart, recent movements and recent product updates. Database: `db/006_inventory.sql` (categories, suppliers, new `products` columns sku/category/supplier/cost_price/quantity/reorder_threshold/is_active/updated_at, `stock_movements`); run as root after `005`. Until it is run the API returns 503 with a migration hint.

### 4.1 Dashboard Overview

Extend `app/dashboard/page.tsx` and `components/dashboard-overview.tsx` to display:

- Total products.
- Total categories and suppliers.
- Total inventory quantity.
- Low-stock product count.
- Out-of-stock product count.
- Recent stock movements.
- Recent product updates.
- Inventory value, when reliable cost data is available.
- Summary charts and date-filtered activity reports.

Metrics must be calculated by the database where appropriate. Do not fetch every product or movement record to compute summary values in application memory.

### 4.2 Product Management

**Product fields**

- Product ID
- Product name
- SKU or unique product code
- Description
- Category ID
- Supplier ID (where applicable)
- Cost price
- Selling price
- Current stock quantity
- Reorder threshold
- Active or inactive status
- Created and updated timestamps

**Required operations**

- List products with server-side pagination.
- Search by product name or SKU.
- Filter by category, supplier, and stock status.
- Sort by supported fields (name, price, quantity, creation date).
- View product details.
- Create a product.
- Update product information.
- Delete or deactivate a product according to its movement history.
- Display validation errors and operation results.
- Prevent duplicate SKUs.
- Enforce valid prices and stock quantities.

> Stock quantity must not be arbitrarily overwritten during ordinary product edits. Initial stock and subsequent quantity changes must follow the stock-movement workflow.

### 4.3 Category Management

**Fields:** Category ID, name, description, created/updated timestamps.

**Requirements**

- List, search, create, update, and delete categories.
- Enforce unique category names where appropriate.
- Prevent deletion when products still reference a category, unless a deliberate reassignment policy is implemented.
- Provide clear validation and foreign-key error messages.

### 4.4 Supplier Management

**Fields:** Supplier ID, name, contact person, email, phone, address, status, created/updated timestamps.

**Requirements**

- List, search, create, update, and delete or deactivate suppliers.
- Validate email addresses and other supplied fields.
- Prevent destructive deletion when historical inventory data depends on the supplier.
- Support filtering and server-side pagination.

### 4.5 Stock Management

**Supported movement types**

- `STOCK_IN` - Increase inventory.
- `STOCK_OUT` - Decrease inventory.
- `ADJUSTMENT` - Correct inventory quantity using a defined adjustment policy.

**Each movement records**

- Movement ID
- Product ID
- Movement type
- Quantity or signed quantity
- Previous quantity and resulting quantity, where appropriate
- Reason or reference
- Acting user ID
- Timestamp

**Requirements**

- Record stock-in and stock-out operations.
- Prevent stock-out operations that would produce a negative quantity.
- Store an auditable movement history.
- Record the user responsible for each movement.
- Update product quantities and insert movement records in **one database transaction**.
- Use row locking (e.g. `SELECT ... FOR UPDATE`) or another appropriate concurrency-control mechanism to prevent lost updates.
- Restrict editing or deletion of historical movements. Corrections are normally recorded as compensating movements.
- Provide filters by product, movement type, user, and date range.

### 4.6 User and Role Management

The system implements role-based access control (RBAC) with three roles: `ADMIN`, `STAFF`, and `USER`.

#### Role permissions

| Feature | ADMIN | STAFF | USER |
|---------|:-----:|:-----:|:----:|
| View dashboard | Yes | Yes | Yes |
| View products | Yes | Yes | Yes |
| Buy products | Yes, if enabled | Yes | Yes |
| Manage products (CRUD) | Yes | No | No |
| Manage categories (CRUD) | Yes | No | No |
| Manage suppliers (CRUD) | Yes | No | No |
| Manage stock and inventory | Yes | No | No |
| View inventory analytics and reports | Yes | No | No |
| Manage users and roles | Yes | No | No |
| Access admin panel | Yes | No | No |
| Manage system settings | Yes | No | No |

**ADMIN** � Full administrative permissions: manage users and roles, create and update products, manage categories and suppliers, control inventory, view analytics and reports, and access all administrative features. Only an existing authorized administrator can assign or change administrative roles. Public registration must never allow users to register themselves as ADMIN.

**STAFF** � Standard operational account. Can access the dashboard, browse products, and purchase products. Cannot access the admin panel, manage users, modify product or category records, manage suppliers, change inventory quantities directly, or access restricted administrative reports.

**USER** � Ordinary customer. Can access the dashboard, browse available products, view product details, and purchase products. Must not be able to manage inventory, edit product information, manage categories or suppliers, access administrative reports, or manage other users. May view their own orders and purchase history if that feature is implemented, but must not see other customers' private information or orders.

#### Security and authorization requirements

- Enforce all permissions on the server using the existing authorization utilities in `lib/auth/authorization.ts`.
- Protect administrative pages and APIs against unauthorized access.
- Hide or disable unavailable actions in the interface, but never rely on UI restrictions alone.
- Validate the authenticated user's role for every protected API request.
- Prevent STAFF and USER accounts from assigning roles, changing permissions, or accessing administrator-only endpoints.
- Assign the default USER role during public registration on the server.
- Restrict role changes to authorized administrators.
- Validate product availability, price, and stock on the server during purchases.
- Process purchases using database transactions to prevent overselling and inconsistent stock quantities.
- Record completed purchases and inventory changes in an auditable manner.

> **Important:** Buying products must use a dedicated purchase/order workflow. It must not grant customers direct access to stock-management APIs or allow them to modify product prices or quantities.

### 4.7 Existing Notes Module

Retain the existing notes CRUD functionality. Use its routes, validation schemas, and service-layer patterns as references when implementing inventory modules. Ensure the new functionality does not break existing notes endpoints or tests.

---

## 5. Database Design

Reuse the existing user table and extend the schema with inventory-related tables.

### Tables

**categories** � `id`, `name`, `description`, `created_at`, `updated_at`

**suppliers** � `id`, `name`, `contact_person`, `email`, `phone`, `address`, `status`, `created_at`, `updated_at`

**products** � `id`, `name`, `sku`, `description`, `category_id`, `supplier_id`, `cost_price`, `selling_price`, `stock_quantity`, `reorder_level`, `status`, `created_at`, `updated_at`

**stock_movements** � `id`, `product_id`, `user_id`, `movement_type`, `quantity`, `previous_quantity`, `new_quantity`, `reason`, `reference`, `created_at`

Use appropriate primary keys, foreign keys, unique constraints, check constraints where supported, and indexes. Define nullability and deletion behavior deliberately.

### Recommended indexes

- Unique index on `products.sku`.
- Indexes on `products.category_id` and `products.supplier_id`.
- Indexes supporting product search, filtering, and sorting.
- Index on `stock_movements.product_id` and movement timestamp.
- Indexes on movement type and acting user where useful.
- Indexes for frequent category, supplier, status, and reporting queries.

Validate the actual query workload before adding excessive indexes, because indexes also increase write and storage costs.

### Migration strategy

Preserve the existing schema and notes migration. Add a new inventory migration (e.g. `db/003_inventory.sql`) after inspecting the current migration conventions.

The migration must be repeatable through the project's documented migration process, or clearly documented as a one-time migration if no migration runner exists. Avoid blindly rerunning non-idempotent schema changes.

---

## 6. Application Structure

Target organization (adapt to the existing application; avoid duplicating helpers or conflicting with current routes):

```
app/
+-- dashboard/
�   +-- layout.tsx
�   +-- page.tsx
�   +-- products/page.tsx
�   +-- categories/page.tsx
�   +-- suppliers/page.tsx
�   +-- stock/page.tsx
�   +-- analytics/page.tsx
+-- api/
�   +-- products/
�   �   +-- route.ts
�   �   +-- [id]/route.ts
�   +-- categories/
�   �   +-- route.ts
�   �   +-- [id]/route.ts
�   +-- suppliers/
�   �   +-- route.ts
�   �   +-- [id]/route.ts
�   +-- stock-movements/
�   �   +-- route.ts
�   �   +-- [id]/route.ts
�   +-- analytics/route.ts
+-- admin/
+-- login/
+-- register/
+-- notes and existing authentication routes

components/
+-- app-shell.tsx
+-- dashboard-overview.tsx
+-- admin-users.tsx
+-- products/
+-- categories/
+-- suppliers/
+-- stock/
+-- shared table, form, dialog, and pagination components

lib/
+-- auth/
+-- client/
+-- http/
+-- validation/
+-- db.ts
+-- users.ts
+-- notes.ts
+-- products.ts
+-- categories.ts
+-- suppliers.ts
+-- stock-movements.ts
+-- analytics.ts

db/
+-- schema.sql
+-- 002_notes.sql
+-- 003_inventory.sql
```

---

## 7. API Design

Use the project's existing response format, error conventions, session handling, CSRF controls, and authorization utilities.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/products` | List, search, filter, and paginate products |
| POST | `/api/products` | Create a product |
| GET | `/api/products/:id` | Retrieve product details |
| PATCH / PUT | `/api/products/:id` | Update product details |
| DELETE | `/api/products/:id` | Delete or deactivate a product |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create a category |
| PATCH / PUT | `/api/categories/:id` | Update a category |
| DELETE | `/api/categories/:id` | Delete a category when permitted |
| GET | `/api/suppliers` | List suppliers |
| POST | `/api/suppliers` | Create a supplier |
| PATCH / PUT | `/api/suppliers/:id` | Update a supplier |
| DELETE | `/api/suppliers/:id` | Delete or deactivate a supplier |
| GET | `/api/stock-movements` | List stock movement history |
| POST | `/api/stock-movements` | Record a stock movement |
| GET | `/api/analytics` | Return dashboard metrics and summaries |
| GET | `/api/health/db` | Preserve the existing database health endpoint |

Add detail endpoints for stock movements only if needed. Every route must validate input, enforce authentication and permissions, use safe parameterized SQL, and return consistent errors.

Use server-side pagination and impose reasonable limits on page size. Prefer cursor-based pagination for large datasets where suitable; implement and test cursor behavior against the selected sort order. Offset pagination can remain appropriate for small lookup tables.

---

## 8. Analytics and Reporting

Implement reports for:

- Total products and categories.
- Product counts by category.
- Low-stock and out-of-stock products.
- Stock movement totals by type and date.
- Most frequently moved products.
- Inventory valuation using an explicitly defined cost basis.
- Recent activity and user actions where appropriate.

Use SQL aggregation, date filtering, and indexed query paths. Avoid returning sensitive user or operational information to unauthorized roles.

For large reports, use appropriate date ranges, pagination, and query limits. Consider summary tables or scheduled aggregation only if measurement shows that live queries are insufficient.

---

## 9. Security Requirements

Preserve and extend the existing security mechanisms:

- Secure password hashing.
- Access-token and refresh-token validation.
- Session invalidation on logout.
- Role-based access control.
- Server-side validation.
- Parameterized database queries.
- CSRF protection for cookie-authenticated state-changing requests.
- Rate limiting for sensitive and abuse-prone endpoints.
- Safe error responses without leaking secrets or database internals.
- Audit history for inventory changes.
- Environment-variable validation.
- Appropriate cookie flags for the deployment environment.
- Safe handling of refresh-token rotation and reuse, consistent with the current implementation.

Review authorization checks for both collection and individual-record endpoints. Ensure users cannot change protected fields, access unauthorized records, or assign themselves privileged roles.

---

## 10. Performance Requirements

Target dataset: ~50,000 product records and ~200,000 stock movement records.

1. Use server-side search, filtering, sorting, and pagination.
2. Select only the columns needed by each page or endpoint.
3. Index frequently filtered and joined columns.
4. Avoid N+1 database queries.
5. Use transactions for multi-step inventory operations.
6. Keep dashboard queries aggregated and bounded.
7. Apply connection pooling through the existing database layer.
8. Test common list, search, detail, and reporting queries with representative data.
9. Use `EXPLAIN` or `EXPLAIN ANALYZE` where appropriate to inspect query plans.
10. Measure response times and database load before introducing caching.

The target dataset size is a design objective, not a guarantee of a particular response time. Actual performance depends on hardware, schema, indexes, query patterns, and concurrency.

---

## 11. Testing and Verification

Extend `tests/api.test.mjs` or the existing test framework.

### Authentication regression tests

- Login and logout.
- Registration behavior.
- Access-token validation.
- Refresh-token rotation and invalidation.
- Session and authorization behavior.
- Administrative access restrictions.

### CRUD tests

- Create, read, update, and delete products.
- Duplicate SKU rejection.
- Invalid price and quantity rejection.
- Category and supplier CRUD.
- Foreign-key and deletion constraints.
- Search, sorting, filtering, and pagination.

### Stock tests

- Stock-in updates quantity correctly.
- Stock-out updates quantity correctly.
- Negative stock is rejected.
- Failed transactions leave no partial updates.
- Concurrent stock operations preserve correct balances.
- Movement history records the acting user and resulting quantity.

### Security tests

- Unauthenticated requests are rejected where required.
- Read-only users cannot modify records.
- Staff cannot access administrator-only actions.
- Invalid CSRF tokens are rejected where required.
- Invalid request bodies and unexpected fields are handled safely.
- Rate limits and sensitive endpoint protections continue to work.

### Performance tests

Seed representative test data and measure:

- Product list and search latency.
- Filtered queries.
- Stock movement history queries.
- Dashboard aggregation.
- Database query plans.
- Concurrent stock operations.

> Do not report a test as passing until it has actually been executed.

### 11.1 Implementation status (measured)

`npm test` (52 tests, run against a production build with `TRUST_PROXY=true next start --port 3001`) covers inventory CRUD, stock movements, roles and access control, the purchase workflow, and performance on seeded data (50,000 products, 200,000 movements; override with `PERF_PRODUCTS` / `PERF_MOVEMENTS`; seeded rows are deleted afterwards).

Measured: product list 640 ms, search 157 ms, deep page 117 ms, stock history 329 ms (6 ms per product), type + date history 995 ms, dashboard overview 1467 ms. `EXPLAIN` checks confirm index use. Concurrent stock operations keep correct balances.

Defects found by these tests:
- Duplicate SKU accepted: `uq_products_sku` had been created non-unique. Fixed in `db/007_inventory_details.sql` and `db/009_security_fixes.sql`.
- `stock_movements` was not append-only: a database-wide GRANT gave UPDATE/DELETE. `schema.sql`, `002`, `003` and `009` now grant per table (movements, orders, order_items: SELECT/INSERT only).
- Unknown `categoryId` returned 500: now 400 (`mapDbError`).
- Stock history API did not return `reference`: fixed.

**Run `db/009_security_fixes.sql` as MySQL root** to apply the SKU and grant fixes to an existing database. Until then the duplicate-SKU and append-only tests fail.

---

## 12. Implementation Order

1. Inspect the existing schema, dependencies, authentication helpers, and API conventions.
2. Document existing behavior and run the current tests.
3. Design and implement the inventory database migration.
4. Add validation schemas and service-layer functions.
5. Implement category and supplier CRUD.
6. Implement product CRUD with server-side pagination and filters.
7. Implement transactional stock movement operations.
8. Add analytics endpoints and dashboard metrics.
9. Build the corresponding dashboard pages and reusable UI components.
10. Extend user permissions and test authorization boundaries.
11. Add regression, integration, and performance tests.
12. Update `README.md` and `implement-plan.md` with migration, seed, environment, and run instructions.
13. Run linting, type checking, tests, and a production build; resolve failures before declaring the implementation complete.

### 12.1 Baseline (steps 1-2 completed)

Existing behavior inspected: JWT access token (memory) plus rotating refresh cookie, USER/ADMIN roles via `requireAuth`/`requireRole`, Origin-based CSRF check, in-memory rate limits, Zod validation, and a MySQL pool in `lib/db.ts`. Modules in place: auth, admin users, notes, products (with images), and the user cart.

Baseline run: `npm run build` succeeded (24 routes). With `TRUST_PROXY=true npx next start --port 3001`, `npm test` passed 29/29 tests in 11 suites (registration, login, tokens, refresh rotation, logout, authorization, admin users, notes, CSRF, rate limits, response safety).

Gaps at baseline: no automated tests for products, images, or cart (since added; see 11.1). `db/004_product_images.sql` and `db/005_cart.sql` must be run as MySQL root before images and cart work.

### 12.2 Status of steps 3-13

Steps 3-11 are implemented (sections 4-11). Step 12 is done: `README.md` documents setup, the migration order (`schema.sql`, 002-005, 007-009), environment variables including both invite codes, roles and how to run tests. Step 13: `tsc`, `eslint`, the production build and `npm test` were run; the result is 50/52 until `db/009_security_fixes.sql` is run as root on the live database (the two failing tests check the unique SKU and append-only history).

---

## 13. Acceptance Criteria

The system is ready when:

- [x] Existing authentication and notes functionality continue to work.
- [x] Product, category, and supplier CRUD operations work end to end.
- [x] Stock changes are transactional and auditable.
- [x] Permissions are enforced on the server.
- [x] Search, filtering, sorting, and pagination work correctly.
- [ ] Dashboard metrics match database records.
- [x] Migrations and setup instructions are documented.
- [ ] Security and regression tests pass.
- [x] Performance is measured against representative data.
- [ ] The project builds successfully and no known critical issues remain unresolved.

---

## Final Principle

Extend the existing vender-management-system incrementally. Reuse working code, preserve security boundaries, and implement each new module using the project's established conventions. Treat the proposed structure and requirements as the target specification; confirm the actual implementation by inspecting the repository and running tests rather than assuming that every feature already exists.
