import { Application, Router } from "oak";

interface SignalMessage {
  type: "offer" | "answer" | "candidate" | "join";
  data?: any;  // SDP or ICE candidate
  from?: string;
  to?: string;
}

const app = new Application();
const router = new Router();

// In-memory store for connections per room (BroadcastChannel syncs across instances)
const rooms = new Map<string, Set<WebSocket>>();

// BroadcastChannel for multi-instance sync on Deno Deploy
const bc = new BroadcastChannel("webrtc-signaling");

bc.onmessage = (e) => {
  // Handle cross-instance broadcasts if needed (guide expands on this for scale)
};

router.get("/:room", (ctx) => {
  if (ctx.isUpgradable) {
    const roomId = ctx.params.room;
    const { socket, response } = ctx.upgrade();

    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    const peers = rooms.get(roomId)!;
    peers.add(socket);

    socket.onopen = () => {
      console.log(`Peer joined room ${roomId}`);
      // Optional: notify others a peer joined
    };

    socket.onmessage = (event) => {
      try {
        const msg: SignalMessage = JSON.parse(event.data);
        // Broadcast to all in room (or route to specific 'to' if you add peer IDs)
        for (const peer of peers) {
          if (peer !== socket && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify(msg));
          }
        }
        // Optional: broadcast via channel for other instances
        bc.postMessage({ roomId, msg });
      } catch (err) {
        console.error("Invalid message:", err);
      }
    };

    socket.onclose = () => {
      peers.delete(socket);
      if (peers.size === 0) rooms.delete(roomId);
      console.log(`Peer left room ${roomId}`);
    };

    socket.onerror = (err) => console.error("Socket error:", err);

    ctx.respond = false;  // Don't send a response; upgrade handles it
  } else {
    ctx.response.status = 426;  // Upgrade required
    ctx.response.body = "Upgrade to WebSocket required";
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Signaling server starting...");
await app.listen({ port: 8000 });  // Deno Deploy ignores port; uses its own
