# Carrom

Run carrom singles or doubles fixtures under ICF / AICF laws. The scorer applies the rules and sends the live score to the OBS overlay.

## 1. Enable carrom for a tournament

1. Open **Platform Admin**.
2. Create a tournament and choose **Carrom** as the primary sport, or click the **Carrom** chip on an existing tournament.
3. Click **Carrom Rules** to confirm the format and limits. The defaults follow the ICF laws:
   - Singles or doubles.
   - A game ends at 25 points or after 8 boards. If the scores are level after the last board, an extra board is played.
   - Matches are best of 3 games.
   - The Queen is worth 3 points. It only counts while the board winner's score is 21 or less.
   - A board is worth at most 12 points.
   - Each stroke has a 15-second limit, and the breaker gets 3 attempts to break.
4. Click **Save Rules**. The rules are copied to the tournament, and the scorer and overlay pick them up straight away.

## 2. Add players and fixtures

Open **Carrom Scorer** from Platform Admin, or go to `/<tournament>/carrom/scorer/admin`.

- **Players / Pairs**: add one name for singles or two names for doubles. You can also set a short code, a colour and a logo or photo URL.
- **Fixtures**: pick side A and side B, then set the stage, the board number, the venue and an optional start time.
- **On air**: sets which fixture the OBS overlay follows.

## 3. Score a match

Click **Score** on a fixture.

1. **Toss**: choose who breaks first. The breaker plays white. Breaks then alternate:
   - Each new board is broken by the other side.
   - Game 2 is broken first by the other side.
   - Game 3 is broken first by the original breaker again.
2. Record each stroke for the player shown under **On strike**.

| Button | Meaning |
| --- | --- |
| +1 own carromman | The player pocketed one of their own carrommen and plays again. |
| No pocket · pass turn | Nothing was pocketed, so the turn passes to the opponent. |
| Queen pocketed | The Queen went in. It must be covered with an own carromman on this stroke or the next one, or it goes back to the centre. |
| Due (striker pocketed) | One own carromman comes back to the board. If none have been pocketed yet, the due is held until one is. |
| Foul | One penalty carromman comes back and the turn passes. |
| Technical foul | One penalty carromman comes back and the player keeps the turn. |
| Break attempt missed | Counts a missed break attempt. After the limit, the opponent takes the break. |

For strokes where several things happen at once, use **Detailed stroke**. Set the number of own and opponent carrommen pocketed, then tick Queen, Striker pocketed or Foul as needed.

The app works out every board result automatically:

- **Board won**: the player who clears their own carrommen scores 1 point for each opponent carromman left on the board. The Queen adds 3 points if that player covered it and their score is 21 or less.
- **Board lost by mistake**: pocketing your last carromman before the Queen is covered loses the board. So does pocketing your opponent's last carromman.
- **End of game**: the game finishes when a player reaches the target score, or after the last board. Then click **Start game N**. At this point the players change sides.
- **End of match**: when the match finishes, the fixture is marked completed and the result is saved.

To fix mistakes, use **Undo / Redo** in the header. Under **Umpire corrections** you can also switch who is on strike, or award a board directly.

## 4. Broadcast

- Add `/<tournament>/carrom/scorer/obs-overlay` to OBS as a **1920×1080 browser source**.
- By default the overlay shows the built-in **Walnut & Gold** scoreboard. It includes:
  - A wooden frame with a red felt score plate.
  - Live counts of the white and black carrommen left.
  - A Queen indicator and the current stroke clock.
  - A strip of board results for the current game.
  - Pop-up celebrations when the Queen is covered or a board, game or match is won.
- The colours, position and visible elements are set in **Carrom Admin › Broadcast**.
- To design your own layout, open **Scorecard Designer**. The carrom canvas starts from the Walnut & Gold template, and every element is a carrom widget you can move or restyle. Click **Set Active** to use your layout in the overlay.

## 5. Camera, host and OBS dock

All URLs below use your active tournament's slug in place of `<tournament>`.

- **Camera Recorder**: `/<tournament>/carrom/scorer/camera` opens the browser camera workflow with the carrom score ticker. Grant camera and microphone access and check the selected match before recording. Browser camera capture requires HTTPS or localhost.
- **Camera Host**: `/<tournament>/carrom/scorer/camera-host` shows available camera sources and the program selection. Browser sources use WebRTC. An Android LAN camera is shown with its RTSP address, not a browser video preview; copy that URL into OBS, VLC or the Android studio host.
- **OBS Control Dock**: add `/<tournament>/carrom/scorer/obs-dock` as an OBS custom browser dock. Select the correct match and use the dock for broadcast presentation and supported events; use the scorer to record actual strokes and results.
- **OBS Overlay**: keep `/<tournament>/carrom/scorer/obs-overlay` as the browser source in the scene. A control dock is not a replacement for the overlay source.

The ticker includes games, boards, points and the stroke clock. Check it against the scorer before taking the camera to air. Undo or correct scoring mistakes in the scorer rather than trying to repair the displayed score in OBS.

## 6. Android Live Studio

Open **Android Live Studio** in the admin Quick links, or visit `/<tournament>/carrom/scorer/mobile-app`. A download is only available after an APK has been published.

1. Install the app and scan the page's pairing QR from **Tournament** on the phone.
2. Choose the carrom fixture, or follow the on-air match. Confirm the final scoreboard in the Studio preview.
3. Start with a supported 1080p/30 fps H.264 preset and a local test recording before using a private test stream.
4. For additional angles, put the other phones on the same trusted Wi-Fi, start their **LAN camera**, then scan their camera QR from the studio phone and select **Take to air**.
5. Monitor phone state, resolution, bitrate and battery under **Connected phones** on the web Mobile Studio page. Detailed app events remain in **Tournament > Diagnostics > Show log** on the phone.

The full Android installation, monitoring, networking and release checklist is in the **Android Live Studio** section of the in-app guide center at `/<tournament>/help?section=mobile`. Bluetooth controls do not provide frame-accurate camera synchronization, and advertised quality depends on device and encoder support.
