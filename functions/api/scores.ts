interface Env {
  DB: D1Database;
}

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;
const MAX_SCORE = 2900;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body?.name || "").trim();
  const deviceId = String(body?.deviceId || "").trim();
  const score = Number(body?.score);
  const bestStreak = Number(body?.bestStreak);

  if (!USERNAME_PATTERN.test(name)) {
    return Response.json({ error: "Username must be 3–24 letters, numbers, _ or -" }, { status: 400 });
  }
  if (!deviceId || deviceId.length > 100) {
    return Response.json({ error: "Invalid anonymous device ID" }, { status: 400 });
  }
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return Response.json({ error: "Invalid score" }, { status: 400 });
  }
  if (!Number.isInteger(bestStreak) || bestStreak < 0 || bestStreak > 10) {
    return Response.json({ error: "Invalid streak" }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    "SELECT score, best_streak FROM scores WHERE device_id = ?1"
  ).bind(deviceId).first<{ score: number; best_streak: number }>();
  const previousBest = existing?.score ?? null;

  const usernameOwner = await env.DB.prepare(
    "SELECT device_id FROM profiles WHERE username = ?1"
  ).bind(name).first<{ device_id: string }>();

  if (usernameOwner && usernameOwner.device_id !== deviceId) {
    return Response.json({ error: "Username already in use" }, { status: 409 });
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO profiles (device_id, username)
       VALUES (?1, ?2)
       ON CONFLICT(device_id) DO UPDATE SET username = excluded.username`
    ).bind(deviceId, name),
    env.DB.prepare(
      `INSERT INTO scores (device_id, score, best_streak)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(device_id) DO UPDATE SET
         score = CASE WHEN excluded.score > scores.score THEN excluded.score ELSE scores.score END,
         best_streak = CASE WHEN excluded.best_streak > scores.best_streak THEN excluded.best_streak ELSE scores.best_streak END,
         updated_at = CASE WHEN excluded.score > scores.score THEN CURRENT_TIMESTAMP ELSE scores.updated_at END`
    ).bind(deviceId, score, bestStreak),
  ]);

  const finalScore = await env.DB.prepare(
    "SELECT score, best_streak, updated_at FROM scores WHERE device_id = ?1"
  ).bind(deviceId).first<{ score: number; best_streak: number; updated_at: string }>();
  const rankRow = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) + 1 FROM scores WHERE score > ?1) AS rank,
       (SELECT COUNT(*) FROM scores WHERE score > 0) AS total_players`
  ).bind(finalScore?.score ?? 0).first<{ rank: number; total_players: number }>();
  const rank = Number(rankRow?.rank || 1);
  const totalPlayers = Number(rankRow?.total_players || 0);
  const topPercent = totalPlayers > 0 ? Math.max(1, Math.ceil((rank / totalPlayers) * 100)) : null;

  return Response.json({
    ok: true,
    // A player's first meaningful score establishes their personal best.
    personalRecord: previousBest === null ? score > 0 : score > previousBest,
    previousBest,
    personalBest: Number(finalScore?.score ?? score),
    bestStreak: Number(finalScore?.best_streak ?? bestStreak),
    rank: totalPlayers > 0 ? rank : null,
    totalPlayers,
    topPercent,
  }, { headers: { "Cache-Control": "no-store" } });
};
