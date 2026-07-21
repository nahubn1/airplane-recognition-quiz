import { neon } from "@neondatabase/serverless";

declare const process: { env: Record<string, string | undefined> };

let schemaReady: Promise<void> | null = null;

export function getSql() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  return neon(connectionString);
}

export async function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS profiles (
        device_id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(24) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
      await sql`CREATE TABLE IF NOT EXISTS scores (
        device_id VARCHAR(100) PRIMARY KEY REFERENCES profiles(device_id) ON DELETE CASCADE,
        score INTEGER NOT NULL CHECK(score >= 0 AND score <= 2900),
        best_streak INTEGER NOT NULL CHECK(best_streak >= 0 AND best_streak <= 10),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
      await sql`CREATE INDEX IF NOT EXISTS scores_ranking_idx ON scores(score DESC, updated_at ASC)`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function methodNotAllowed(allowed: string) {
  return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: allowed } });
}
