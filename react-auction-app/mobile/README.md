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

The publisher verifies the APK signature and package, then writes the APK and checksum/version
manifest into `public/downloads/android`. It rejects the Android debug signer by default.
Deploy Firebase Hosting through the normal release process only after the device checks below pass.
The admin Quick link opens `/{tenantSlug}/{gameType}/scorer/mobile-app?download=1`.
An unpublished release remains unavailable; a working public download requires an actual deployment.

For local smoke testing only, build with `-PallowDebugSigning=true`. This is a release-mode APK
signed with the public development key, not a production release. Do not publish it as production.

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
