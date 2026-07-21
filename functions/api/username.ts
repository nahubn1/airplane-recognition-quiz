interface Env {
  DB: D1Database;
}

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ available: false, error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body?.name || "").trim();
  const deviceId = String(body?.deviceId || "").trim();
  if (!USERNAME_PATTERN.test(name)) {
    return Response.json({ available: false, error: "Use 3–24 letters, numbers, underscores, or hyphens." }, { status: 400 });
  }
  if (!deviceId || deviceId.length > 100) {
    return Response.json({ available: false, error: "Invalid anonymous device ID" }, { status: 400 });
  }
  const owner = await env.DB.prepare(
    "SELECT device_id FROM profiles WHERE username = ?1"
  ).bind(name).first<{ device_id: string }>();
  return Response.json({ available: !owner || owner.device_id === deviceId }, { headers: { "Cache-Control": "no-store" } });
};
