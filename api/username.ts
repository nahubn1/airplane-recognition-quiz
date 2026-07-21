import { ensureSchema, getSql, json, methodNotAllowed } from "../server/neon";

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;

export default async function handler(request: Request) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  let body: any;
  try { body = await request.json(); } catch { return json({ available: false, error: "Invalid JSON" }, { status: 400 }); }
  const name = String(body?.name || "").trim();
  const deviceId = String(body?.deviceId || "").trim();
  if (!USERNAME_PATTERN.test(name)) return json({ available: false, error: "Use 3–24 letters, numbers, underscores, or hyphens." }, { status: 400 });
  if (!deviceId || deviceId.length > 100) return json({ available: false, error: "Invalid anonymous device ID" }, { status: 400 });
  await ensureSchema();
  const sql = getSql();
  const [owner] = await sql`SELECT device_id FROM profiles WHERE username = ${name}`;
  return json({ available: !owner || owner.device_id === deviceId }, { headers: { "Cache-Control": "no-store" } });
}

export const config = { runtime: "edge" };
