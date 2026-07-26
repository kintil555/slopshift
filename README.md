# SLOP SHIFT

A frantic local co-op factory-hauling game for two players, with optional
online play over a WebSocket relay hosted on Cloudflare Workers + Durable
Objects.

## Structure

```
public/index.html   # game client (Three.js, single-file bundle)
src/index.js         # Worker entry: HTTP routes + static asset serving
src/room.js           # GameRoom Durable Object: relays state between host/guest
wrangler.toml         # Cloudflare Workers config
```

## How online play works

- One player creates a room (`POST /create`) and gets a 5-letter room code.
- Both players connect via `GET /ws/:code`, which upgrades to a WebSocket
  routed to a `GameRoom` Durable Object (one instance per room, max 2
  players).
- Slot 0 (host) runs the real simulation and streams state; slot 1 (guest)
  sends input and renders the host's state.

## Deploy to Cloudflare

1. Install Wrangler and log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. Deploy:
   ```bash
   wrangler deploy
   ```
3. Wrangler prints your Worker URL, e.g.
   `https://slop-shift-relay.<your-subdomain>.workers.dev`.
4. Open `public/index.html`, find the line near the bottom:
   ```html
   <script>window.SLOP_SHIFT_RELAY_URL = "wss://slop-shift-relay.YOUR_SUBDOMAIN.workers.dev";</script>
   ```
   Replace `YOUR_SUBDOMAIN` with your actual Workers subdomain, then
   redeploy (`wrangler deploy`) so the served client points at the right
   relay.
5. Visit the Worker URL — it now serves the game itself (static assets)
   *and* the WebSocket relay from the same origin, so no CORS/URL
   mismatch to worry about once step 4 is done.

## Local dev

```bash
wrangler dev
```

## Notes / things to double check before shipping

- `wrangler.toml` uses the Workers **assets** feature (`[assets]` binding)
  to serve `public/` directly from the Worker — no separate Pages project
  needed. Requires a reasonably recent `wrangler` (v3.60+ / assets GA).
- `_roomCodeGuess` in `room.js` re-derives the room code from the URL path
  only for the `welcome` message cosmetics; the actual DO instance is
  already selected by `idFromName(code)` in `index.js` — correct.
- Room codes aren't checked for collisions (`randomRoomCode` in
  `index.js`); acceptable at this scale (32^5 space) but worth knowing.
- CORS is wide open (`Access-Control-Allow-Origin: *`) — fine for a
  same-origin relay+client setup, tighten if you split hosting.
