const WebSocket = require("ws");
const {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} = require("wrtc");
const fs = require("fs");
const path = require("path");

const config = {
  downloadFolder: "./downloads",
  signalingServer: "ws://localhost:8080",
  room: "file-share-room",
  iceServers: [
    {
      urls: [
        "stun:192.168.31.118:3478",
        "turn:192.168.31.118:3478?transport=udp",
        "turn:192.168.31.118:3478?transport=tcp",
      ],
      username: "username",
      credential: "password",
    },
  ],
};

function log(message) {
  console.log(`[${new Date().toISOString()}] [Client] ${message}`);
}

class FileClient {
  constructor() {
    this.ws = new WebSocket(config.signalingServer);
    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers,
      iceTransportPolicy: "all", // Start with 'all', switch to 'relay' if needed
    });

    this.currentFile = null;
    this.setup();
  }

  setup() {
    this.pc.ondatachannel = ({ channel }) => {
      log(`Data channel received: ${channel.label}`);
      this.setupDataChannel(channel);
    };

    this.pc.onicecandidate = ({ candidate }) => {
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

    this.pc.oniceconnectionstatechange = () => {
      log(`ICE connection state: ${this.pc.iceConnectionState}`);
    };

    this.pc.onconnectionstatechange = () => {
      log(`Peer connection state: ${this.pc.connectionState}`);
      if (this.pc.connectionState === "connected") {
        log("Successfully connected to seeder!");
      }
    };

    this.pc.onicecandidateerror = (error) => {
      log(`ICE candidate error: ${error.errorCode} ${error.errorText}`);
    };

    this.ws.on("open", () => {
      log("Connected to signaling server");
      this.ws.send(
        JSON.stringify({
          type: "join",
          room: config.room,
        })
      );
    });

    this.ws.on("open", () => {
      log("Connected to signaling server");
      this.ws.send(
        JSON.stringify({
          type: "join",
          room: config.room,
        })
      );

      // Add offer creation
      this.createOffer();
    });
  }

  async createOffer() {
    const pc = this.pc;
    const dc = pc.createDataChannel("fileTransfer");
    this.setupDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.ws.send(
      JSON.stringify({
        type: "offer",
        offer: offer,
        recipient: "seeder",
      })
    );
  }

  async handleOffer(message) {
    log(`Received offer from ${message.sender}`);
    await this.pc.setRemoteDescription(
      new RTCSessionDescription(message.offer)
    );

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.ws.send(
      JSON.stringify({
        type: "answer",
        answer: answer,
        recipient: message.sender,
      })
    );
  }

  async handleCandidate(message) {
    log(`Adding ICE candidate from ${message.sender}`);
    await this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
  }

  setupDataChannel(channel) {
    channel.onopen = () => {
      log("Data channel opened");
      channel.send(JSON.stringify({ type: "request-list" }));
    };

    channel.onmessage = ({ data }) => {
      if (typeof data === "string") {
        const message = JSON.parse(data);

        if (message.type === "file-list") {
          log(
            `Available files: ${message.files.map((f) => f.name).join(", ")}`
          );
          if (message.files.length > 0) {
            channel.send(
              JSON.stringify({
                type: "request-file",
                fileName: message.files[0].name,
              })
            );
          }
        } else if (message.type === "file-start") {
          this.currentFile = {
            name: message.name,
            size: message.size,
            data: [],
            received: 0,
          };
          log(`Starting download: ${message.name} (${message.size} bytes)`);
        } else if (message.type === "file-end") {
          this.saveFile();
        }
      } else {
        this.currentFile.data.push(data);
        this.currentFile.received += data.byteLength;
        const progress = (
          (this.currentFile.received / this.currentFile.size) *
          100
        ).toFixed(1);
        log(`Progress: ${progress}%`);
      }
    };
  }

  saveFile() {
    const filePath = path.join(config.downloadFolder, this.currentFile.name);
    const fileData = Buffer.concat(this.currentFile.data);

    fs.writeFileSync(filePath, fileData);
    log(`File saved: ${filePath}`);
    this.currentFile = null;
  }
}

// Ensure download folder exists
if (!fs.existsSync(config.downloadFolder)) {
  fs.mkdirSync(config.downloadFolder);
}

// Start client
new FileClient();
