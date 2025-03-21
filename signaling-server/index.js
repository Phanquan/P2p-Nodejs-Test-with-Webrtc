// signaling-server.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8081 }, () => {
  console.log("Signaling server running on ws://localhost:8081");
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

wss.on("connection", (ws) => {
  ws.id = generateId();
  console.log(`Client connected: ${ws.id}`);

  ws.send(JSON.stringify({ type: "welcome", id: ws.id }));

  ws.on("message", (message) => {
    console.log(`Received from ${ws.id}: ${message}`);
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.error("Error parsing JSON:", err);
      return;
    }

    // If a "to" field exists, send only to that client; else broadcast.
    if (data.to) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.id === data.to) {
          client.send(JSON.stringify({ from: ws.id, ...data }));
        }
      });
    } else {
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ from: ws.id, ...data }));
        }
      });
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${ws.id}`);
  });
});
