import { ensureSchema, getSql, json, methodNotAllowed } from "../server/neon";

export default async function handler(request: Request) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  await ensureSchema();
  const sql = getSql();
  const leaderboard = await sql`
    SELECT p.username AS name, p.device_id AS "deviceId", s.score, s.updated_at AS date
    FROM scores s JOIN profiles p ON p.device_id = s.device_id
    WHERE s.score > 0
    ORDER BY s.score DESC, s.updated_at ASC`;
  return json({ leaderboard }, { headers: { "Cache-Control": "public, max-age=15" } });
}

export const config = { runtime: "edge" };
