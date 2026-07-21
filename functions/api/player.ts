interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ player: null }, { status: 400 });
  }
  const deviceId = String(body?.deviceId || "").trim();
  if (!deviceId || deviceId.length > 100) return Response.json({ player: null }, { status: 400 });
  const row = await env.DB.prepare(
    `SELECT p.username AS name, s.score, s.best_streak AS bestStreak, s.updated_at AS date
     FROM scores s JOIN profiles p ON p.device_id = s.device_id WHERE s.device_id = ?1`
  ).bind(deviceId).first<any>();
  if (!row) return Response.json({ player: null }, { headers: { "Cache-Control": "no-store" } });
  const rankRow = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) + 1 FROM scores WHERE score > ?1) AS rank,
            (SELECT COUNT(*) FROM scores WHERE score > 0) AS total_players`
  ).bind(row.score).first<{ rank: number; total_players: number }>();
  const rank = Number(rankRow?.rank || 1);
  const totalPlayers = Number(rankRow?.total_players || 0);
  return Response.json({
    player: {
      ...row,
      rank: totalPlayers ? rank : null,
      totalPlayers,
      topPercent: totalPlayers ? Math.max(1, Math.ceil((rank / totalPlayers) * 100)) : null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
};
