# Setting up the StackIOT ERP database on a Linux server

This reproduces the local database configuration on a fresh Linux box. It creates
the `stackiot_erp` database, the two roles by design (`postgres` owner + least-privileged
`stack` runtime), applies the schema via Prisma migrations, grants the runtime role,
and seeds the bootstrap tenant + admin.

> Run everything from the project root on the server. Commands assume Debian/Ubuntu
> (`apt`); for RHEL/Fedora swap in `dnf` and the `postgresql-server` package names.

## 0. Prerequisites

- **Node.js 20+** and npm (the app is Next.js 16 / Prisma 7).
- **PostgreSQL 14+** (needs the `pgcrypto` and `btree_gist` extensions, both shipped
  in the standard `contrib` package).

```bash
# PostgreSQL (skip if already installed)
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# Confirm it's up
sudo -u postgres psql -c "SELECT version();"
```

Get the project onto the server (git clone or scp), then install deps:

```bash
cd /path/to/mockup2-erp
npm ci        # runs `prisma generate` via postinstall
```

## 1. Create the database and runtime role

Pick a strong password for `stack` and also make sure the `postgres` superuser has
a password you know (used only for migrations).

```bash
# Set a password on the postgres superuser if it doesn't have one yet:
sudo -u postgres psql -c "ALTER ROLE postgres WITH PASSWORD 'YOUR_POSTGRES_PASSWORD';"

# Create DB + stack role (pass the runtime password in as a quoted literal):
sudo -u postgres psql -d postgres \
  -v stack_password="'YOUR_STACK_PASSWORD'" \
  -f scripts/sql/01-create-db-and-role.sql
```

## 2. Configure `.env`

Copy the template and fill in the two connection strings + the auth secret. `.env` is
gitignored — never commit it.

```bash
cp env.example .env
```

```dotenv
# Runtime — least-privileged role, RLS enforced. The app uses this.
DATABASE_URL="postgresql://stack:YOUR_STACK_PASSWORD@localhost:5432/stackiot_erp"

# Prisma CLI only — owner/superuser, bypasses RLS for migrations + the seed.
DIRECT_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/stackiot_erp"

# JWT session signing key. Generate one:  openssl rand -base64 32
AUTH_SECRET="paste-a-random-32+-byte-secret-here"
```

URL-encode any special characters (`@ : / ?` → `%40 %3A %2F %3F`) in passwords.

## 3. Apply the schema (runs as the owner via DIRECT_URL)

This creates every table/type/trigger/RLS policy **and** seeds tenant #1
(`STACKIOT`) with the `admin@stackiot.local` superadmin user and an Admin role
granted the full permission matrix.

```bash
npx prisma migrate deploy
```

## 4. Grant runtime privileges to stack

Must run **after** step 3, because it grants on tables that migrations just created.

```bash
sudo -u postgres psql -d stackiot_erp \
  -f scripts/sql/02-grant-runtime-privileges.sql
```

## 5. Set the admin password

The seed creates the admin user but no password. Set one:

```bash
ADMIN_PASSWORD='YOUR_ADMIN_LOGIN_PASSWORD' npx tsx scripts/seed-admin.ts
```

Login: `admin@stackiot.local` / the password you just set.

## 6. Verify

```bash
# RLS + client sanity check: 0 rows with no tenant context, STACKIOT visible with it.
npx tsx scripts/db-smoke.ts
# Expect: "✅ PASS — RLS + Prisma client working."
```

## 7. (Optional) Load demo data

```bash
npx tsx scripts/seed-sample.ts      # brands, suppliers, components, PCBs, products
npx tsx scripts/seed-inventory.ts   # stock ledger + balances
npx tsx scripts/seed-purchases.ts   # purchase requests/orders
```

## 8. Run the app

```bash
npm run build
npm run start        # serves on :3000 (put nginx/caddy + TLS in front for prod)
```

---

## Notes / gotchas

- **Why two roles?** The app must run as a role that is *not* the table owner and
  *not* `BYPASSRLS`, or Row-Level Security is silent and tenants leak. `stack` is
  created `NOSUPERUSER NOBYPASSRLS` for exactly this. `DIRECT_URL` (superuser) is only
  ever touched by the Prisma CLI — see `prisma.config.ts` and `src/lib/prisma.ts`.
- **The seed needs a superuser.** The bootstrap `INSERT`s in the initial migration run
  under `FORCE ROW LEVEL SECURITY`; only a superuser (`postgres`) bypasses that. Keep
  `DIRECT_URL` pointed at `postgres`.
- **Remote DB (app and Postgres on different hosts):** open `postgresql.conf`
  (`listen_addresses = '*'`) and add a `pg_hba.conf` line for the app host using
  `scram-sha-256`, then `sudo systemctl restart postgresql`. Point `DATABASE_URL`'s
  host at the DB server. Prefer `sslmode=require` in the connection string.
- **After future migrations:** just re-run `npx prisma migrate deploy`. The
  `ALTER DEFAULT PRIVILEGES` from step 4 means new tables are auto-granted to
  `stack`; no need to re-run step 4 unless you change the grant policy.
