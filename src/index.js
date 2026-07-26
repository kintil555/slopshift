export { GameRoom } from "./room.js";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // POST /create -> allocate a new room code, return it
    if (url.pathname === "/create" && request.method === "POST") {
      let code = randomRoomCode();
      // Best-effort avoid collision (not strictly necessary; DO id derives from code)
      return new Response(JSON.stringify({ room: code }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // GET /ws/:code -> upgrade to websocket, forward to the room's Durable Object
    const match = url.pathname.match(/^\/ws\/([A-Za-z0-9]{3,12})$/);
    if (match) {
      const code = match[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/health") {
      return new Response("SLOP SHIFT relay OK", { headers: corsHeaders() });
    }

    // Everything else (/, /index.html, etc.) -> serve the static game client
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};
