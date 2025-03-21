const Turn = require("node-turn");

// Include this in peer:
/* 
const iceServers = [
  { urls: "stun:your-server-domain:3478" },
  {
    urls: "turn:your-server-domain:3478",
    username: "user",
    credential: "pass",
  },
]; 
*/

const server = new Turn({
  // default for TURN/STUN
  listeningPort: 3478,

  // Use long-term authentication mechanism
  authMech: "long-term",

  // Define valid credentials (username: "user", password: "pass")
  // TODO change in the feature
  credentials: {
    user: "pass",
  },

  // Optional: set a realm (used in authentication messages)
  // realm: "dsd.vnditech.com",

  // Optional: If your server is behind a NAT, specify the public IP address
  // externalIps: ['YOUR_PUBLIC_IP'],

  // Optional: Increase debug level for more verbose logging (e.g., 'ALL')
  debugLevel: "ALL",
});

server.start();
