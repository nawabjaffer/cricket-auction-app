# Broadcast and OBS Guide

Use the OBS tools from **Admin → Streaming** or the scoring links for the active sport. Configure and test the broadcast before going live.

## Connect OBS Studio

1. Install and start OBS Studio on the broadcast computer.
2. In the app's Streaming settings, enter the OBS WebSocket address and password configured in OBS. Keep the password private.
3. Connect and confirm the connection status is healthy.
4. Select or create the intended scene and verify that the correct overlay source is visible.
5. Check browser-source dimensions, transparency, and audio/video routing before the broadcast.

## Go live and score

Open the control dock for the active match. Confirm the selected match and scene, then use the dock's live/replay actions. Keep the scoring page and overlay on the same match. Monitor connection state and return to the live scene after any replay action.

## Replay, highlights, and Super Movements

Replay and highlight capture are optional. Enable them only after confirming the OBS replay buffer and recording path work on the host computer. Use a short test capture before the event.

The Super Movements helper is an OBS-host script. [Download the helper](/assets/obs-super-movements.py), then in OBS open **Tools → Scripts → Python Settings** and select a Python version compatible with the installed OBS release. Add the downloaded script under **Tools → Scripts**. The app can control OBS sources, but cannot install scripts or access OBS-local files remotely. Verify the `Super Movements` folder and playlist behavior locally.

## Troubleshooting

- **OBS disconnected:** Check OBS is open, the WebSocket server is enabled, and host, port, and password match.
- **Overlay is blank:** Confirm the overlay URL uses the correct tenant and match, then refresh the browser source.
- **Replay does not return to live:** Use the control dock's return-to-live action and confirm the live scene is selected.
- **Capture file is missing:** Check the OBS replay buffer, recording directory, and host script status. The web app cannot repair a local OBS path.
- Never paste OBS passwords into a public document or share them with viewers.