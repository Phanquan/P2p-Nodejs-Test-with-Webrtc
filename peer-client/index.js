const wrtc = require("wrtc");
const fetch = require("node-fetch");
const fs = require("fs");

// Function to connect to the seeding server and receive the file
async function connectToSeedingServer() {
  // Create RTCPeerConnection with ICE servers
  const pc = new wrtc.RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "turn:localhost:3478", username: "user", credential: "pass" },
    ],
  });

  // Listen for an incoming data channel from the seeding server
  pc.ondatachannel = (event) => {
    const dataChannel = event.channel;
    console.log("Received data channel from seeding server.");

    let fileBuffers = [];
    let fileMetadata = null;

    dataChannel.onmessage = (msgEvent) => {
      if (Buffer.isBuffer(msgEvent.data)) {
        console.log(`Received binary chunk of size ${msgEvent.data.length}`);
        fileBuffers.push(msgEvent.data);
      } else {
        try {
          const text = msgEvent.data.toString();
          const json = JSON.parse(text);
          if (json.type === "start") {
            console.log(
              `Receiving file: ${json.fileName} (${json.fileSize} bytes)`
            );
            fileMetadata = json;
          } else if (json.type === "end") {
            console.log("File transfer complete.");
            const fileBuffer = Buffer.concat(fileBuffers);
            fs.writeFileSync(fileMetadata.fileName, fileBuffer);
            console.log(`File saved as ${fileMetadata.fileName}`);
          }
        } catch (err) {
          console.error("Error parsing message as JSON:", err);
        }
      }
    };

    dataChannel.onerror = (err) => {
      console.error("Data channel error:", err);
    };

    dataChannel.onopen = () => {
      console.log("Data channel is open (remote peer).");
    };
  };

  // Log ICE candidates (in production, these should be exchanged via signaling)
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("New ICE candidate (peer):", event.candidate.candidate);
      // You would forward these candidates to the seeding server via your signaling channel.
    } else {
      console.log("All ICE candidates have been gathered (peer).");
    }
  };

  // --- Signaling Process using HTTP endpoints ---

  // 1. Fetch the SDP offer from the seeding server
  console.log("Fetching SDP offer from seeding server...");
  const offerResponse = await fetch("http://localhost:3001/offer");
  const offerData = await offerResponse.json();
  console.log("Received SDP offer:\n", offerData.sdp);

  // 2. Set remote description with the received offer
  await pc.setRemoteDescription(new wrtc.RTCSessionDescription(offerData));
  console.log("Remote description set.");

  // 3. Create an SDP answer
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  console.log("Created SDP answer:\n", answer.sdp);

  // 4. Send the SDP answer back to the seeding server
  const answerResponse = await fetch("http://localhost:3001/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer),
  });
  if (answerResponse.ok) {
    console.log("SDP answer sent successfully.");
  } else {
    console.error("Failed to send SDP answer.");
  }
}

connectToSeedingServer().catch((err) => {
  console.error("Error in peer connection:", err);
});
