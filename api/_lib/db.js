// Thin wrapper around the `postgres` client so every function imports from
// one place. Points at Supabase via DATABASE_URL (Project Settings ->
// Database -> Connection string -> "Transaction pooler", NOT the direct
// connection). The pooler matters here specifically because this runs as
// serverless functions: each invocation can open its own connection, and
// Postgres's direct connection limit is exhausted fast under that pattern
// -- the pooler (Supavisor, pgbouncer-compatible) is built for exactly
// this. prepare: false is required alongside it: pgbouncer in transaction
// mode (which the pooler uses) doesn't support prepared statements, and
// silently breaks queries if left on.
const postgres = require('postgres');

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
});

module.exports = { sql };
