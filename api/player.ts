import { ensureSchema, getSql, json, methodNotAllowed } from "../server/neon";

export default async function handler(request: Request) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  let body: any;
  try { body = await request.json(); } catch { return json({ player: null }, { status: 400 }); }
  const deviceId = String(body?.deviceId || "").trim();
  if (!deviceId || deviceId.length > 100) return json({ player: null }, { status: 400 });
  await ensureSchema();
  const sql = getSql();
  const [player] = await sql`
    SELECT p.username AS name, s.score, s.best_streak AS "bestStreak", s.updated_at AS date
    FROM scores s JOIN profiles p ON p.device_id = s.device_id
    WHERE s.device_id = ${deviceId}`;
  if (!player) return json({ player: null }, { headers: { "Cache-Control": "no-store" } });
  const [standing] = await sql`
    SELECT
      (SELECT COUNT(*)::int + 1 FROM scores WHERE score > ${player.score}) AS rank,
      (SELECT COUNT(*)::int FROM scores WHERE score > 0) AS "totalPlayers"`;
  const rank = Number(standing.rank);
  const totalPlayers = Number(standing.totalPlayers);
  return json({ player: { ...player, rank: totalPlayers ? rank : null, totalPlayers, topPercent: totalPlayers ? Math.max(1, Math.ceil((rank / totalPlayers) * 100)) : null } }, { headers: { "Cache-Control": "no-store" } });
}

export const config = { runtime: "edge" };
