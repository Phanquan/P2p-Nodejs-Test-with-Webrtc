const WebSocket = require("ws");
const uuid = require("uuid");

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });
const config = {
  room: "file-share-room",
};

function log(message) {
  console.log(`[${new Date().toISOString()}] [Signaling] ${message}`);
}

wss.on("listening", () => {
  log(`Server started on port ${PORT}`);
});

wss.on("connection", (ws) => {
  const peerId = uuid.v4().substr(0, 8);
  log(`Peer ${peerId} connected`);

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      log(`Received ${message.type} from ${peerId}`);

      // Handle room joining
      if (message.type === "join") {
        ws.room = message.room || config.room;
        return;
      }

      // Route messages properly
      if (message.recipient === "seeder") {
        const seeder = Array.from(wss.clients).find(
          (client) => client.room === config.room && client !== ws
        );
        seeder?.send(JSON.stringify({ ...message, sender: peerId }));
      } else {
        wss.clients.forEach((client) => {
          if (
            client !== ws &&
            client.room === ws.room &&
            client.readyState === WebSocket.OPEN
          ) {
            client.send(JSON.stringify({ ...message, sender: peerId }));
          }
        });
      }
    } catch (error) {
      log(`Error handling message: ${error}`);
    }
  });

  ws.on("close", () => {
    log(`Peer ${peerId} disconnected`);
  });
});

log("Starting signaling server...");
