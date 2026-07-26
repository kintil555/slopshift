// GameRoom: a Durable Object instance = one game room (max 2 players).
// Slot 0 = host (runs the real simulation), Slot 1 = guest (sends input, renders host's state).
// Message protocol (JSON over WebSocket):
//   client -> server: {t:"input", input:{...}}                 (guest input each frame)
//   client -> server: {t:"state", state:{...}, seq}             (host state broadcast)
//   client -> server: {t:"event", events:[...]}                 (host one-off events: spill, checkpoint, etc)
//   client -> server: {t:"ping", time}
//   server -> client: {t:"welcome", slot:0|1, roomCode}
//   server -> client: {t:"peer-joined"} / {t:"peer-left"}
//   server -> client: {t:"input", input:{...}}       (relayed to host)
//   server -> client: {t:"state", state:{...}, seq}  (relayed to guest)
//   server -> client: {t:"event", events:[...]}      (relayed to guest)
//   server -> client: {t:"pong", time}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // sockets[0] = host, sockets[1] = guest
    this.sockets = [null, null];
    this.lastState = null; // cache last host state so a reconnecting guest gets something immediately
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const slot = this.sockets[0] === null ? 0 : this.sockets[1] === null ? 1 : -1;
    if (slot === -1) {
      return new Response("Room full", { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.sockets[slot] = server;

    server.send(JSON.stringify({ t: "welcome", slot, roomCode: this._roomCodeGuess(request) }));

    const other = this.sockets[1 - slot];
    if (other) {
      other.send(JSON.stringify({ t: "peer-joined" }));
      server.send(JSON.stringify({ t: "peer-joined" }));
      // Give the freshly joined guest whatever state we last saw, so they don't
      // sit on a black screen until the next host tick.
      if (slot === 1 && this.lastState) {
        server.send(JSON.stringify({ t: "state", state: this.lastState, seq: -1 }));
      }
    }

    server.addEventListener("message", (evt) => this._onMessage(slot, evt));
    server.addEventListener("close", () => this._onClose(slot));
    server.addEventListener("error", () => this._onClose(slot));

    return new Response(null, { status: 101, webSocket: client });
  }

  _roomCodeGuess(request) {
    const m = new URL(request.url).pathname.match(/\/ws\/([A-Za-z0-9]+)/);
    return m ? m[1].toUpperCase() : "";
  }

  _onMessage(slot, evt) {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return; // ignore malformed frames
    }

    const other = this.sockets[1 - slot];

    switch (msg.t) {
      case "ping": {
        const sock = this.sockets[slot];
        sock?.send(JSON.stringify({ t: "pong", time: msg.time }));
        return;
      }
      case "input": {
        // guest (slot 1) -> host (slot 0)
        if (slot === 1 && other) other.send(JSON.stringify({ t: "input", input: msg.input }));
        return;
      }
      case "state": {
        // host (slot 0) -> guest (slot 1)
        if (slot === 0) {
          this.lastState = msg.state;
          if (other) other.send(JSON.stringify({ t: "state", state: msg.state, seq: msg.seq }));
        }
        return;
      }
      case "event": {
        if (slot === 0 && other) other.send(JSON.stringify({ t: "event", events: msg.events }));
        return;
      }
      default:
        return;
    }
  }

  _onClose(slot) {
    this.sockets[slot] = null;
    const other = this.sockets[1 - slot];
    if (other) {
      other.send(JSON.stringify({ t: "peer-left" }));
    } else {
      this.lastState = null; // room is empty, drop cached state
    }
  }
}
