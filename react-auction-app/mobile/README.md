# NJS Live Studio for Android

React Native Android streaming studio for cricket, football, kabaddi and carrom.
Application ID: `com.njsstore.livestudio`. Android 7.0 (API 24) or newer is required.

## Capabilities

- Native camera and microphone capture, H.264/H.265 encoding, RTMP/RTMPS and SRT destinations.
- YouTube account authorization and broadcast creation, or manual platform stream keys.
- Capability-based quality selection from 720p through 4K, adaptive bitrate and local MP4 recording.
- Web/image overlay composition, tenant profile updates, active-match following and phone presence.
- Camera flip, zoom, torch, focus, exposure, stabilization and audio-input selection where supported.
- Bluetooth/HID remote actions and Android-supported Bluetooth microphone routing.
- LAN RTSP camera sharing, mDNS discovery, QR/manual pairing and program-source switching.

This is not a claim of full PRISM feature parity. Bluetooth remote control and tournament state
updates do not provide frame-accurate camera synchronization. Output quality and frame rate depend
on the camera, encoder, network and thermal limits. Hardware-dependent features require device tests.

## Operator Quick Start

### Camera recording

Home has **Camera**, **Streaming** and **Scoring**. Camera is a separate recording workspace,
not a streaming destination. It has the composited preview, record/stop, true pause/resume in one
MP4, elapsed recording time excluding pauses, torch, microphone, zoom, grid and Gallery access.
Stop Host/Connector sessions before opening Camera. Video settings cannot change while recording,
paused or saving, and Back/deep links cannot silently abandon the recording.

- Open Camera settings for quality, H.264/HEVC, orientation, stabilization and overlays. Unsupported
	video combinations fall back to a supported preset with a notice. Settings do not modify Host
	presets, stream keys, destinations, scenes or the Scoring tournament.
- Camera orientation defaults to **Auto**. The preview and encoded overlay frame follow portrait or
	landscape device rotation before recording; orientation is held steady for the duration of a clip.
	Choose Portrait or Landscape in Camera settings to lock a preferred format.
- Open **Camera settings > Adjust overlay framing in preview** to see and tune the composited result
	before recording. The default overlay scale is 60%. Adjust size, rotation (Auto/0/90/180/270) and
	position; the preview shows the selected video resolution and orientation. Overlay geometry is
	calculated from the supported camera/encoder preset and rotated frame dimensions.
- Zoom and Video/RAW selection are inside the **Camera controls** panel, keeping the default preview
	clear. Zoom follows the drag continuously with coalesced native updates; it is not applied only
	after releasing the slider.
- Select **Use scoring tournament** or enter the tournament/sport and choose **Follow on-air match**.
	The Camera selection is saved independently. Its scoreboard and existing sport animations follow
	the active/on-air match automatically; starting a recording never starts or resets a match.
- Setup downloads the web overlay asset package once. The download button resyncs changed assets;
	verified files already on the phone are reused. Static scripts/styles/images/fonts and packaged
	animation media are served from persistent app storage, not downloaded for each recording/frame.
	Live scores, match selection, tenant checks and animation events still require network access.
	Arbitrary third-party web pages and remote media are not automatically made fully offline.
- Custom overlays use an HTTPS overlay URL and a same-origin asset manifest URL. The JSON format is
	`{version:1,id,revision,entry,files:[{path,sha256,bytes,mime}]}`; `revision` and file `sha256` are
	lowercase SHA-256 hex, `entry`/`path` are absolute URL paths, and all declared files are immutable
	public HTTPS resources on the manifest origin, without redirects or credentials. Include every
	required script, font, image and animation clip. The generated web package is published as
	`/camera-overlay-manifest.json`. Packages activate only after every file verifies; failed sync
	retains the previous package. Limits: 512 files, 64 MB/file, 192 MB/package, four packages.
- Pro controls show only probed camera capabilities: exposure compensation, ISO/shutter manual
	exposure, focus distance and supported white-balance presets. Shutter choices respect video FPS.
- **RAW** is a separate, supported-camera-only DNG still-photo mode, not RAW video or Apple ProRAW.
	It temporarily opens a dedicated sensor capture session and restores video preview afterward.
	DNG contains unprocessed sensor data and does **not** contain burned-in overlays. Use Video for
	recorded scoreboard/animation graphics. RAW is unavailable during video recording/streaming.
- Stop finalizes the MP4 and saves it automatically to Android Gallery under `Movies/NJSLiveStudio`;
	RAW photos go under `Pictures/NJSLiveStudio`. Android 7-9 asks for legacy storage permission.
	Modern Android uses scoped MediaStore storage. A failed save keeps the private original for retry;
	reopening Camera offers interrupted private files again. Unfinalized MP4s cannot be repaired by
	copying them. Explicit discard removes an unsavable private file; success removes the private
	duplicate after Gallery publication. Neither flow silently claims an invalid file was saved.

Unit/render tests, TypeScript and Android release lint do not certify real camera media. Validate
pause/resume playback, Gallery indexing, RAW metadata/quality, preview recovery, overlays, storage
failure, background interruptions, thermal behavior and 4K/frame rate on the target physical phone.

### Version 1.3.0: simple scoring and Host/Connector streaming

- **Scoring > Score** now shows **Live matches** with **Resume scoring**, as well as scheduled
	fixtures. A match started from Matches stays available after its status changes to live. Resume
	opens the existing match without calling the start API or resetting its innings/score.
- Mobile scoring defaults to **Matches**, **Score** and **Results**. Desktop quick links and
	broadcast/provider/advertising/designer/admin tools are hidden by default. Scheduling, squads,
	starting/resuming matches and normal score entry remain available.
- In the desktop scorer admin, open **Android Live Studio > Mobile scoring options** to enable
	optional teams/players, statistics, broadcast, provider, ads, full admin, designer, guides or
	exports per sport. Save the changes; connected apps and mobile web pages update live. Matches
	and Score are always available. These are visibility controls, not a replacement for server
	authorization or account permissions.
- **Streaming** asks **Host** or **Connector** before starting the camera. A running stream or
	connector can be resumed from home. Stop a connector before reusing that phone as a Host.
- **Host** retains scenes, overlays, YouTube and the existing multiple enabled destinations under
	**Setup > Platforms**. It can receive several connector phones, select one as program, switch
	scenes and composite overlays into the outgoing stream. The Host microphone remains program audio.
- **Connector** shows only camera details, Start/Stop, its RTSP URL and a pairing QR. Camera quality,
	port and optional tournament pairing are behind small header controls, not Host streaming tabs.
	Connector feeds remain clean; Host overlays are not burned into their camera feed.
- Put phones on the same private Wi-Fi or hotspot without client isolation. Start each Connector,
	then use **Host > Cameras > Scan connector QR**. A bare RTSP address permits video preview/taking
	to air; scanning the session QR additionally pairs Host **flip, torch and zoom** controls. Open
	the small camera-controls button on a paired connector tile. Alternatively, copy the Connector's
	**pairing link** and paste it into the Host's **Connection URL** field. Discovery can be blocked
	by a router; the displayed URL/QR is the manual alternative. Keep pairing links private.
- Camera commands and responses use HMAC-SHA256 session proofs, timestamps and bounded replay
	protection on private-network UDP. Keep device clocks synchronized. The session key stays in
	the QR and encrypted Host settings, never Firebase/mDNS or command packets. Stop/restart renews
	the key, so scan again afterward. Never expose RTSP/control ports publicly. RTSP video itself
	remains unencrypted; use a trusted venue LAN. This is not frame-accurate multi-camera sync.

Use **App updates** to install the current v1.3.0 testing build over the same-signer version.
Physical-phone camera controls, LAN throughput and multi-destination ingest still need venue/device
validation; emulator graphics are not sufficient to certify received media.

### Version 1.2.0: Streaming and Scoring

The app now starts with two main options, **Streaming** and **Scoring**. Opening the home screen
or Scoring does not start the camera. Streaming retains Studio, Cameras, Scene Setup, Setup and
Tournament; its home icon returns to the two-option screen. An active stream continues when you
open Scoring, and the live Streaming option returns you to it. The scoring page remains mounted
when switching modes, preserving its current form and navigation until the app is closed or the
scoring tournament is changed. Cloud-saved scores and fixtures persist as they do on the website.

Scoring uses the complete existing online scorer/admin application inside a native workspace,
not a separate implementation of the sport rules or an offline scoring database. Select the HTTPS
server, an active tournament slug and an enabled sport. Cricket, football, kabaddi and carrom use
their existing pages. Sign in normally when prompted; the app does not bypass account permissions.

- **Matches** opens the sport admin workspace, including existing fixtures, match scheduling,
	teams/players, competition setup and settings.
- **Score** opens the existing live scorer, including the sport's current controls and match selection.
- **Scoreboard** opens the public cricket scorecard or the selected sport's existing scoreboard.
- **Tournament** opens the existing tournament admin. Its normal registration, player, team,
	auction, reports and other enabled modules remain available through the web navigation.
- Scoring options include the existing scorecard designer, broadcast controls and operator guides.
	Native Back/Forward, reload, browser fallback and page-error recovery remain available.
- File inputs use Android's file chooser. CSV/Blob exports up to 8 MB use Android's document-save
	picker; choose a destination to save the file. Larger exports can be downloaded using the browser
	option. Clipboard writes and printing/save-as-PDF use Android system integration.

The Scoring tournament selection is saved separately from Streaming pairing. Changing scoring
sport or tournament never retargets a live stream's overlay profile. Internet is required, and
existing web sessions live in the scoring WebView's storage rather than the stream-key keystore.
Scoring still follows the existing server's authentication, sport gates and database rules; the
pre-existing database authorization limitations below are not removed by this integration.

Install the current v1.2.0 testing update over the previous same-signer build to keep settings.
Use **App updates** on home or **Streaming > Tournament > App** for subsequent updates.

### Version 1.1.0: scenes and compact studio

- The launcher and app use the public NJS app logo. Studio, Cameras, Setup and Tournament use
	smaller typography and denser controls, with accessible labels and long-press icon names.
- Studio opens with a full-screen camera preview. Its bottom navigation floats over the preview;
	the expand icon hides the HUD and navigation until restored, or until Android Back is pressed.
- Tap **Setup** on the Studio preview to open the left scene rail. It uses 15% of the screen width.
	The separate bottom **Setup** tab
	still contains platforms, quality, global overlays and Bluetooth settings.
- Tap the small left tools icon to reveal camera flip, flashlight, microphone, overlays, recording,
	zoom/exposure and Fit/Fill controls. Fill crops only the preview to the screen; Fit displays the
	complete encoded frame. Neither mode changes the resolution or framing sent to viewers.
- The new bottom **Scene Setup** tab creates up to 12 named scenes. Scenes can be duplicated,
	reordered and deleted; take another scene to air before deleting the active one. Choose rear,
	front or LAN RTSP camera, then **Take to air** or **Apply scene**. Camera support is checked before
	switching; a failed switch restores the previous selection.
- Add scene sources with the plus icon: website overlays, image URLs or app-linked sport animation
	presets. Website/image sources have position, width, opacity, visibility and removal controls.
	Tournament overlays can be enabled separately for each scene. Apply changes before returning live.
- Scene rail thumbnails use captured local frames and live remote RTSP previews for up to three
	scenes. Inactive local cameras show their last captured frame or a camera placeholder rather
	than opening extra camera sessions. The studio phone's microphone remains the program audio.
- Added animation presets appear under **Animate** in Studio. Select side A/B before playing them.
	These controls only trigger the existing paired match overlay; they do not modify scoring.
	Pairing and a selected/on-air match are required. Presets follow the tournament's sport.
- Media Next/Previous and gamepad R1/L1 switch scenes by default. Under **Setup > Bluetooth**,
	tap a key to choose its action, or learn a supported custom Android key. Learning does not fire
	streaming actions, repeated held keys are ignored, and Android system keys remain reserved.

Install the v1.1.0 APK over the previous test APK to retain encrypted settings and credentials;
both builds must use the same signer. Existing installs receive rear/front scenes automatically.
An incompatible-signer error requires the correct signing key, not bypassing Android verification.

### Install and pair

1. On your computer, sign in to an active tournament and open **Android Live Studio** from the
	scorer admin Quick links: `/<tenantSlug>/<gameType>/scorer/mobile-app`.
2. Download the APK only when a release is available. An unavailable download means that no APK
	has been published; it does not mean that you should bypass Android security warnings.
	For internal testing, use the test APK supplied directly by your developer on a trusted network.
3. Install on an ARM Android phone running Android 7.0 or newer. If needed, grant your browser
	permission to install this known APK, then revoke that permission after installation.
	Release-mode APKs run without Metro or a connection to the development computer.
4. Open **NJS Live Studio**, grant camera and microphone permissions, then open **Tournament**.
5. Tap **Scan pairing QR** and scan the pairing code on the computer, not the APK download code.
	Confirm the server, tournament and sport before accepting. Alternatively, enter the HTTPS
	server address, tournament slug and sport under **Pair manually**, then tap **Connect**.
6. Choose a fixture or **Follow the on-air match**. Use an active tournament's actual slug; a
	deactivated tournament cannot be used for pairing. `localhost` on a phone refers to the phone,
	not your computer, so use a server address reachable from the phone.

Pairing and phone presence require internet access to the configured Firebase project. Pairing
is not authorization; use a test tournament until the database access controls are hardened.

### Record and stream

1. In **Setup**, start with H.264 at 1080p/30 fps, or a lower preset supported by the phone.
	Keep the phone powered and monitor its temperature. Do not select 4K solely because the
	preview looks sharp; verify the supported camera and encoder combination and actual output.
2. In **Studio**, record a short clip. Inspect decoded video, audio and timing before going live;
	a working preview does not prove that the encoded output is correct.
3. Under **Setup > Platforms**, configure a manual RTMPS destination using the platform's ingest
	address and stream key. Keep the key on the phone; never put it into the shared profile or QR.
	YouTube account linking requires the OAuth setup below; manual RTMPS is a separate option.
4. Configure the scoreboard and other widgets in the web profile or the phone's overlay settings.
	Check the final Studio preview against the selected fixture before starting the broadcast.
5. Start a private or unlisted broadcast first. Inspect received video and audio on the platform,
	exercise reconnect and camera switching, then stop the broadcast and check the recording.

### LAN cameras

1. Put the studio phone and camera phones on the same trusted Wi-Fi or hotspot, with client
	isolation disabled. Do not expose RTSP ports to the internet.
2. On a camera phone, open **Cameras > LAN camera > Start LAN camera**. Keep that app running.
3. On the studio phone, choose **Cameras > Studio host > Scan camera QR**, or add the camera's
	RTSP URL manually. Discovery may be blocked by a router even when direct RTSP works.
4. Tap **Take to air** and inspect the Studio preview and received broadcast. Use **Back to this
	phone** to return to the host camera. The studio phone's microphone remains the program audio;
	a remote camera does not replace it with its own microphone feed.
5. Stop the LAN camera before changing that phone back to studio use. OBS or VLC can open its
	RTSP URL as a media source; a browser cannot play that RTSP feed directly.

### Monitor from your computer

The web Mobile Studio page's **Connected phones** list reports phone state, resolution, bitrate
and battery, with a heartbeat about every five seconds. It is not a remote video monitor or a
remote copy of the phone's detailed log. Read app events under **Tournament > Diagnostics > Show log**.

For native logs and crashes, connect a phone over USB, enable **Developer options > USB debugging**,
authorize your own computer and open the app. On this macOS development setup:

```sh
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
"$ADB" devices -l
APP_PID=$("$ADB" shell pidof -s com.njsstore.livestudio | tr -d '\r')
if [ -n "$APP_PID" ]; then
	 "$ADB" logcat --pid="$APP_PID" -v threadtime
else
	 printf 'Open NJS Live Studio on the connected phone first.\n'
fi
```

With multiple devices, add `-s <device-serial>` to each ADB command. Rerun the log command after
restarting the app, since its process ID changes. This release-mode build keeps its JavaScript
event log in the app rather than forwarding it to the development console. Keep device logs
private and remove credentials before sharing them. Disable USB debugging when testing is done.

## Development

Install Node.js 22.11 or newer, JDK 17/21 and the Android SDK. Set `ANDROID_HOME` and
`ANDROID_SDK_ROOT`. The Gradle files declare the required SDK, NDK and build-tools versions.

From the web project root:

```sh
npm run mobile:install
npm run mobile:typecheck
npm run mobile:test
npm run lint --prefix mobile
```

For development, run `npm start --prefix mobile` and `npm run android --prefix mobile`
in separate terminals. Release APKs bundle JavaScript and do not require Metro.

## Release Signing

### Easy Release Commands

Run these from the web project root. The public customer help page is `/help`; detailed Android
instructions remain at `/help?section=mobile`.

```sh
npm run mobile:release:plan
npm run mobile:deploy
npm run mobile:deploy:major
npm run mobile:deploy:production
```

- `mobile:release:plan` is read-only: it prints skip, baseline, release or resume, without changing
	versions, building, publishing, committing or pushing.
- `mobile:deploy` targets the explicitly labeled **testing** channel. It fingerprints app source,
	Android resources/build configuration and locked dependencies. Documentation, tests, generated
	output and version-only edits do not create an app release. Identical published inputs mean no
	build, version bump, APK copy, Hosting deploy, commit or push.
- Changed app inputs increment the patch version once, for example `1.3.0` to `1.3.1`. A conventional
	`feat!:`/`fix!:` commit or `BREAKING CHANGE:` since the prior release selects a major bump instead.
	`mobile:deploy:major` explicitly requests that major bump. A major request still skips when inputs
	have not changed. Breaking behavior cannot safely be inferred from the size of a code diff.
- `mobile:deploy:production` uses the **stable** channel and requires real release signing. It does
	not bypass signing or production device/security requirements. Testing builds never enter stable.
- Releases run web/mobile tests, mobile types/lint and Android release lint/build. Gradle and Metro
	reuse build caches; APKs use immutable checksum filenames. Publishing the same artifact/catalog
	does not rewrite either file. Firebase Hosting reuses unchanged file hashes rather than uploading
	the same APK again. The current previous APK is restored for clean CI workspaces before deployment.
- Failed builds restore the version if app inputs stayed unchanged. A failed deploy retains the
	verified local catalog/APK; rerunning resumes it without allocating another version. A lock prevents
	concurrent releases. If a process was killed, remove `.mobile-release.lock` only after verifying
	no release process is running.

For the first use with an older catalog that lacks a source fingerprint, initialize it once:

```sh
npm run mobile:baseline
```

This builds the existing version and requires its APK checksum to match the already published APK.
It records the verified input fingerprint without changing the version or re-uploading the APK.
If the checksum differs, it stops rather than claiming changed inputs are unchanged. Subsequent
clones/CI runs use the fingerprint in the public catalog; they do not need a machine-local baseline.

Optional source delivery after a changed release:

```sh
npm run mobile:deploy -- --commit --push
npm run release:sync -- --message "feat: describe the verified changes"
```

`release:sync` is for source changes, including web/help-only work that does not need a new Android
version. It validates, commits reviewed project source and pushes the current branch without force.
Review `git diff` first. Generated Hosting caches, download artifacts, dependencies and signing files
are excluded, and staged credentials are checked. A clean worktree performs no commit or push, even
if a remote is configured. No branches, tags or production keys are generated. Do not put secrets in
source files; these guards do not replace credential review.

Use a durable, privately backed-up release keystore. Losing it prevents updates to installed apps.
Create it with Android Studio, or run `keytool` yourself and enter passwords directly in the terminal:

```sh
keytool -genkeypair -v -keystore "$HOME/.android/njs-live-studio-release.jks" \
	-alias njs-live-studio -keyalg RSA -keysize 3072 -validity 10000
```

Configure the ignored `android/keystore.properties` file with `storeFile`, `storePassword`,
`keyAlias` and `keyPassword`. A relative `storeFile` is resolved from `mobile/android`.
Alternatively use `NJS_KEYSTORE_FILE`, `NJS_KEYSTORE_PASSWORD`, `NJS_KEY_ALIAS` and
`NJS_KEY_PASSWORD` through your local shell or CI secret manager. Never commit credentials.

```sh
npm run mobile:build
npm run mobile:publish
```

The publisher verifies the APK signature and package, then writes a checksum-addressed APK and
version manifest into `public/downloads/android`. It verifies the staged copy before replacing
`latest.json` atomically, so a failed publication leaves the previous release usable. Previous
APKs are retained; keep them when preparing subsequent Hosting builds. A clean CI workspace must
restore retained release artifacts before deployment if older download links must remain available.
The publisher rejects the Android debug signer by default and always rejects debuggable APKs,
including when the test-signing override is used. Web and app downloads reject manifests for a
different application ID.
Release APK and app-bundle builds run Android release lint first and fail if it reports errors.
Deploy Firebase Hosting through the normal release process only after the device checks below pass.
The admin Quick link opens `/{tenantSlug}/{gameType}/scorer/mobile-app?download=1`.
An unpublished release remains unavailable; a working public download requires an actual deployment.
This same guide is available in the app at `/{tenantSlug}/help?section=mobile`.

For local smoke testing only, build with `-PallowDebugSigning=true`. This is a release-mode APK
signed with the public development key, not a production release. Do not publish it as production.

## In-App Updates

Starting with v1.1.1, **Tournament > App > Check for updates** selects a feed using the installed
signing certificate. Development-signed test builds use `/downloads/android/testing/latest.json`;
production-signed builds use `/downloads/android/latest.json`. The app displays its update channel.
An update is offered only when its version code is higher, its Android requirement is supported,
and its signing certificate matches the installed app. Downloading opens the Android browser;
installation still requires your approval in Android.

Versions up to v1.1.0 only know the production feed. Install v1.1.1 manually once, over the existing
test app with the same development signer, to enable the corrected testing-feed checker. A server
URL without a published JSON manifest cannot supply updates; the SPA HTML fallback is not a feed.
Network failures, invalid feeds and timeouts now show an actionable message instead of claiming
that no release exists. Checks bypass stale manifest caches and time out after 15 seconds.

To prepare an explicitly labeled testing release, without publishing it as production:

```sh
npm run mobile:publish -- --channel testing --allow-debug
```

This writes only the testing subdirectory and includes `channel: testing` and
`signing: development` in its manifest. Build and deploy Hosting after publication to make the
feed reachable from the phone. The production web download card does not offer testing builds.
The test-signing override is rejected on the production channel; all channels reject debuggable
APKs. Production signing and the physical-device release checklist remain required for a real release.

## YouTube Setup

Enable YouTube Data API v3 and configure the Google OAuth consent screen and an Android OAuth
client for the application ID above and the production signing certificate's SHA-1. The publisher
prints that public fingerprint. Configure the requested YouTube scope, any required consent review,
and enable live streaming on the channel. Some channels require an activation waiting period.
Manual RTMPS stream keys are available when account linking is not configured.

## Security and Networking

Settings, credential-bearing ingest URLs and stream keys are encrypted on-device with Android
Keystore AES-GCM. Existing plain settings migrate on read. Stream keys and Google tokens are not
stored in Firebase. RTMPS destinations enable certificate hostname verification.

Pairing selects a tenant; it does not add server-side authorization to the existing Firebase rules.
The repository's publicly writable RTDB rules remain a production blocker for authenticated tenant
isolation. An authentication/rules migration is required before treating remote control as trusted.

LAN cameras use unencrypted, unauthenticated RTSP. Use a trusted, isolated venue network, disable
client isolation where camera connectivity is required, and never expose the camera port publicly.
Browsers cannot directly play RTSP; the web host exposes its URL for Android, OBS or VLC.

## Device Release Checks

Before production publication, verify on representative physical Android devices:

- Camera permissions, final preview, overlay transparency/position and landscape/portrait controls.
- Decoded recording and actual RTMP/RTMPS/SRT ingest, including audio/video timing and frame content.
- Disconnect/reconnect, network changes, adaptive bitrate and destination failure behavior.
- Sustained 1080p and supported 4K modes under real network and thermal load; verify received frames.
- Background/foreground transitions, notification/service behavior, screen lock and interrupted capture.
- YouTube authorization, broadcast lifecycle and manual credentials with the production certificate.
- Two-phone RTSP sharing, discovery, source switching and fallback when a camera disconnects.
- Bluetooth microphone routing and remote keys on the accessories you intend to support.
- APK signer, checksum, supported ABIs, installation/update and the deployed admin download link.

Emulator preview and codec metadata alone are insufficient: host GLES readback can produce corrupt
encoded frames even when the preview looks correct. Do not approve a release without inspecting
decoded recording and received stream frames on physical hardware.
