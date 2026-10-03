# Kruze After Dark — OBS Remote Producer Bridge

This small bridge runs on the same computer as OBS. It keeps OBS private on the local machine and connects **outbound** to the existing Kruze After Dark Worker. The private host dashboard can then switch scenes and start/stop the stream from another laptop, iPad, or phone.

## One-time room-computer setup

1. In OBS, open **Tools → WebSocket Server Settings**.
2. Enable the WebSocket server. Keep the default port **4455** and set a password.
3. Install Node.js 20 or newer on the room computer.
4. Open Terminal in this `obs-bridge` folder and run:
   `npm install`
5. Copy `.env.example` to `.env`.
6. Put the private host token from the existing host-control URL into `HOST_TOKEN`.
7. Put the OBS WebSocket password into `OBS_PASSWORD`.
8. Run:
   `npm start`

When the bridge is connected, the host dashboard changes from **OBS OFFLINE** to **OBS ONLINE**.

## Scene names expected by the dashboard

- STARTING SOON
- KRUZE AFTER DARK
- BE RIGHT BACK
- THANKS FOR WATCHING

The Show Rundown automatically switches OBS when it reaches one of its scene items. Manual scene buttons remain available at all times.

## Security

Do not expose OBS port 4455 to the internet. The bridge connects outbound to Cloudflare, so the room computer does not need an inbound public port. Keep the private host token and `.env` file private.
