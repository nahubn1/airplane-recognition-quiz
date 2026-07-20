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
         score = excluded.score,
         best_streak = excluded.best_streak,
         updated_at = CURRENT_TIMESTAMP
       WHERE excluded.score > scores.score`
    ).bind(deviceId, score, bestStreak),
  ]);

  return Response.json({ ok: true });
};
