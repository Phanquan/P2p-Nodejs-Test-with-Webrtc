// seeding-server.js
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const wrtc = require("wrtc");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3001;

// Create an RTCPeerConnection with ICE servers (using public STUN and our TURN)
const pc = new wrtc.RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:localhost:3478", username: "user", credential: "pass" },
  ],
});

// Create a data channel for file transfer
const dataChannel = pc.createDataChannel("fileTransfer");

// When the data channel is open, automatically send the file
dataChannel.onopen = () => {
  console.log("Data channel is open. Starting file transfer automatically...");
  sendFile(); // Auto-trigger file transfer when a peer connects.
};

dataChannel.onerror = (err) => {
  console.error("Data channel error:", err);
};

// ICE candidate handling (in production, exchange these via your signaling mechanism)
pc.onicecandidate = (event) => {
  if (event.candidate) {
    console.log("New ICE candidate:", event.candidate);
    // In a full system, forward these candidates via your signaling server.
  }
};

// Express endpoint to create an SDP offer (for signaling)
app.get("/offer", async (req, res) => {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("Created SDP offer.");
    res.json({ sdp: pc.localDescription.sdp, type: pc.localDescription.type });
  } catch (err) {
    console.error("Error creating offer:", err);
    res.status(500).send(err.toString());
  }
});

// Endpoint to receive an SDP answer from a remote peer
app.post("/answer", async (req, res) => {
  try {
    const answer = req.body;
    await pc.setRemoteDescription(new wrtc.RTCSessionDescription(answer));
    console.log("Remote SDP answer set.");
    res.sendStatus(200);
  } catch (err) {
    console.error("Error setting remote description:", err);
    res.status(500).send(err.toString());
  }
});

// Function to send a file from a separate folder over the data channel
function sendFile() {
  const filePath = "../files/20250217-141858-schedule.zip"; // UPDATE with your actual file path
  fs.stat(filePath, (err, stats) => {
    if (err) {
      console.error("File not accessible:", err);
      return;
    }
    console.log(`File found: ${filePath} (${stats.size} bytes)`);
    const fileSize = stats.size;
    const fileName = filePath.split("/").pop();
    const chunkSize = 16 * 1024; // 16 KB chunks

    // Send metadata first
    const metadata = JSON.stringify({ type: "start", fileName, fileSize });
    dataChannel.send(Buffer.from(metadata, "utf-8"));
    console.log("Metadata sent:", metadata);

    // Stream the file and send in chunks
    const readStream = fs.createReadStream(filePath, {
      highWaterMark: chunkSize,
    });
    readStream.on("data", (chunk) => {
      dataChannel.send(chunk);
      console.log(`Sent chunk of size ${chunk.length}`);
    });
    readStream.on("end", () => {
      const endMessage = JSON.stringify({ type: "end" });
      dataChannel.send(Buffer.from(endMessage, "utf-8"));
      console.log("File transfer complete.");
    });
    readStream.on("error", (error) => {
      console.error("Error reading file:", error);
    });
  });
}

app.listen(PORT, () => {
  console.log(`Seeding server (WebRTC peer) running on port ${PORT}`);
});
