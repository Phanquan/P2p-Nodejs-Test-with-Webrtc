// seeding-server.js
const WebSocket = require("ws");
const {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} = require("wrtc");
const fs = require("fs");
const path = require("path");

const config = {
  sharedFolder: "./shared_files",
  signalingServer: "ws://127.0.0.1:8080",
  room: "file-share-room",
  iceServers: [
    { urls: "stun:dsd.vnditech.com:3478" },
    {
      urls: "turn:dsd.vnditech.com:3478?transport=udp",
      username: "username",
      credential: "password",
    },
    {
      urls: "turn:dsd.vnditech.com:3478?transport=tcp",
      username: "username",
      credential: "password",
    },
  ],
};

function log(message) {
  console.log(`[${new Date().toISOString()}] [Seeder] ${message}`);
}

class SeedingServer {
  constructor() {
    this.ws = new WebSocket(config.signalingServer);
    this.peers = new Map();
    this.setup();
  }

  setup() {
    this.ws.on("open", () => {
      log("Connected to signaling server");
      this.ws.send(
        JSON.stringify({
          type: "join",
          room: config.room,
        })
      );
    });

    this.ws.on("message", async (data) => {
      const message = JSON.parse(data);

      // Add this block
      if (message.type === "offer") {
        const pc = await this.createPeerConnection(message.sender);
        this.peers.set(message.sender, pc);
        await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.ws.send(
          JSON.stringify({
            type: "answer",
            answer: answer,
            recipient: message.sender,
          })
        );
      } else if (message.type === "answer") {
        await this.handleAnswer(message);
      } else if (message.type === "candidate") {
        await this.handleCandidate(message);
      }
    });
  }

  async createPeerConnection(senderId) {
    log(`Creating peer connection for ${senderId}`);
    const pc = new RTCPeerConnection({
      iceServers: config.iceServers,
      iceTransportPolicy: "relay", // Start with 'all', fallback to 'relay'
    });

    const dc = pc.createDataChannel("fileTransfer");
    this.setupDataChannel(dc, senderId);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.ws.send(
          JSON.stringify({
            type: "candidate",
            candidate: candidate.candidate, // Send only the candidate string
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            recipient: "seeder",
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      log(`Connection state for ${senderId}: ${pc.connectionState}`);
    };

    pc.onicegatheringstatechange = () => {
      log(`ICE gathering state: ${pc.iceGatheringState}`);
    };

    pc.oniceconnectionstatechange = () => {
      log(`ICE connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "disconnected") {
        this.peers.delete(senderId);
      }
    };

    return pc;
  }

  setupDataChannel(dc, senderId) {
    dc.onopen = () => {
      log(`Data channel opened with ${senderId}`);
      // Add retry mechanism
      const sendFileList = () => {
        if (dc.readyState === "open") {
          dc.send(
            JSON.stringify({
              type: "file-list",
              files: this.getAvailableFiles(),
            })
          );
        } else {
          setTimeout(sendFileList, 1000);
        }
      };
      sendFileList();
    };

    dc.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "request-file") {
        await this.sendFile(message.fileName, dc);
      }
    };
  }

  getAvailableFiles() {
    return fs
      .readdirSync(config.sharedFolder)
      .filter((file) =>
        fs.statSync(path.join(config.sharedFolder, file)).isFile()
      )
      .map((file) => ({
        name: file,
        size: fs.statSync(path.join(config.sharedFolder, file)).size,
      }));
  }

  async sendFile(fileName, dc) {
    const filePath = path.join(config.sharedFolder, fileName);
    if (!fs.existsSync(filePath)) {
      dc.send(JSON.stringify({ type: "error", message: "File not found" }));
      return;
    }

    log(`Starting file transfer: ${fileName}`);
    const fileData = fs.readFileSync(filePath);

    dc.send(
      JSON.stringify({
        type: "file-start",
        name: fileName,
        size: fileData.length,
      })
    );

    const chunkSize = 16384;
    let offset = 0;

    while (offset < fileData.length) {
      const chunk = fileData.subarray(offset, offset + chunkSize);
      dc.send(chunk);
      offset += chunkSize;
      log(`Sent chunk ${offset}/${fileData.length}`);
    }

    dc.send(JSON.stringify({ type: "file-end" }));
    log(`File transfer completed: ${fileName}`);
  }

  async handleAnswer(message) {
    const pc = this.peers.get(message.sender);
    if (!pc) return;

    log(`Received answer from ${message.sender}`);
    await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
  }

  // Modify handleCandidate method in SeedingServer
  async handleCandidate(message) {
    const pc = this.peers.get(message.sender);
    if (!pc) return;

    try {
      await pc.addIceCandidate(
        new RTCIceCandidate({
          candidate: message.candidate,
          sdpMid: message.sdpMid,
          sdpMLineIndex: message.sdpMLineIndex,
        })
      );
    } catch (error) {
      log(`ICE candidate error: ${error.message}`);
    }
  }
}

// Start server
new SeedingServer();
