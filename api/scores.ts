import { ensureSchema, getSql, json, methodNotAllowed } from "../server/neon";

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;
const MAX_SCORE = 2900;

export default async function handler(request: Request) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
  const name = String(body?.name || "").trim();
  const deviceId = String(body?.deviceId || "").trim();
  const score = Number(body?.score);
  const bestStreak = Number(body?.bestStreak);
  if (!USERNAME_PATTERN.test(name)) return json({ error: "Username must be 3–24 letters, numbers, _ or -" }, { status: 400 });
  if (!deviceId || deviceId.length > 100) return json({ error: "Invalid anonymous device ID" }, { status: 400 });
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return json({ error: "Invalid score" }, { status: 400 });
  if (!Number.isInteger(bestStreak) || bestStreak < 0 || bestStreak > 10) return json({ error: "Invalid streak" }, { status: 400 });

  await ensureSchema();
  const sql = getSql();
  const [existing] = await sql`SELECT score, best_streak FROM scores WHERE device_id = ${deviceId}`;
  const previousBest = existing ? Number(existing.score) : null;
  const [owner] = await sql`SELECT device_id FROM profiles WHERE username = ${name}`;
  if (owner && owner.device_id !== deviceId) return json({ error: "Username already in use" }, { status: 409 });

  try {
    await sql.transaction((tx) => [
      tx`INSERT INTO profiles (device_id, username) VALUES (${deviceId}, ${name})
         ON CONFLICT (device_id) DO UPDATE SET username = EXCLUDED.username`,
      tx`INSERT INTO scores (device_id, score, best_streak) VALUES (${deviceId}, ${score}, ${bestStreak})
         ON CONFLICT (device_id) DO UPDATE SET
           score = GREATEST(scores.score, EXCLUDED.score),
           best_streak = GREATEST(scores.best_streak, EXCLUDED.best_streak),
           updated_at = CASE WHEN EXCLUDED.score > scores.score THEN CURRENT_TIMESTAMP ELSE scores.updated_at END`,
    ]);
  } catch (error: any) {
    if (error?.code === "23505" || String(error?.message || "").includes("unique")) return json({ error: "Username already in use" }, { status: 409 });
    throw error;
  }

  const [finalScore] = await sql`SELECT score, best_streak FROM scores WHERE device_id = ${deviceId}`;
  const [standing] = await sql`
    SELECT
      (SELECT COUNT(*)::int + 1 FROM scores WHERE score > ${finalScore.score}) AS rank,
      (SELECT COUNT(*)::int FROM scores WHERE score > 0) AS "totalPlayers"`;
  const rank = Number(standing.rank);
  const totalPlayers = Number(standing.totalPlayers);
  return json({
    ok: true,
    personalRecord: previousBest === null ? score > 0 : score > previousBest,
    previousBest,
    personalBest: Number(finalScore.score),
    bestStreak: Number(finalScore.best_streak),
    rank: totalPlayers ? rank : null,
    totalPlayers,
    topPercent: totalPlayers ? Math.max(1, Math.ceil((rank / totalPlayers) * 100)) : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const config = { runtime: "edge" };
