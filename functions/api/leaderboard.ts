interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT p.username AS name, p.device_id AS deviceId, s.score, s.updated_at AS date
     FROM scores s
     JOIN profiles p ON p.device_id = s.device_id
     ORDER BY s.score DESC, s.updated_at ASC
     LIMIT 10`
  ).all();

  return Response.json(
    { leaderboard: results },
    { headers: { "Cache-Control": "public, max-age=15" } }
  );
};
