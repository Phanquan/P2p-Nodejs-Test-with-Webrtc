# P2P

# Config ICE server:

Generate cerps:

```shell
mkdir -p certs
# for prod, local need the folder only
openssl req -x509 -newkey rsa:4096 -keyout certs/privkey.pem \
  -out certs/fullchain.pem -days 365 -nodes \
  -subj "/CN=your-domain.com"
```

Test ICE server (local)

```shell
# Test STUN
docker exec coturn turnutils_stunclient 127.0.0.1

# Test TURN
docker exec coturn turnutils_uclient -v -u username -w password 127.0.0.1
```

Peer Client ICE conf:

```json
// WebRTC client configuration
const iceServers = [
  {
    urls: [
      "stun:192.168.1.100:3478",      // Your local IP
      "turn:192.168.1.100:3478",      // UDP
      "turn:192.168.1.100:3478?transport=tcp"  // TCP
    ],
    username: "username",
    credential: "password"
  }
];
```

for multiple ice servers:

```json
// Different credentials per client (optional)
const iceServers = [
  {
    urls: "stun:192.168.1.100:3478"
  },
  {
    urls: "turn:192.168.1.100:3478",
    username: `client-${Date.now()}`,  // Dynamic username
    credential: "shared-secret"
  }
];
```

**Note: This configuration is not secure for production use. For public-facing servers, always:**

- Enable TLS/DTLS
- Use temporary credentials
- Implement rate limiting
- Use proper certificate authority (CA) signed certificates
