// ============================================================================
// RELEASE CARD — shows the published Android APK (version, size, checksum),
// a direct download button and a QR a phone can scan to fetch it.
// Reads /downloads/android/latest.json, written by `npm run mobile:publish`.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { IoCheckmarkCircle, IoCopyOutline, IoDownloadOutline, IoLogoAndroid } from 'react-icons/io5';
import { QRCode } from '../QRCode';
import {
  androidVersionLabel, formatBytes, parseReleaseManifest, releaseApkUrl, releaseManifestUrl,
  type StudioReleaseManifest,
} from '../../types/mobileStudio';

type ReleaseState =
  | { status: 'loading' }
  | { status: 'ready'; manifest: StudioReleaseManifest }
  | { status: 'missing' };

interface Props {
  origin: string;
  /** Start the download as soon as the manifest loads (Quick link → `?download=1`). */
  autoDownload?: boolean;
}

export default function ReleaseCard({ origin, autoDownload = false }: Readonly<Props>) {
  const [state, setState] = useState<ReleaseState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const downloadStarted = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(releaseManifestUrl(origin), { cache: 'no-store', signal: controller.signal });
        // Hosting rewrites unknown paths to index.html, so a 200 is not proof the file exists.
        const manifest = response.ok ? parseReleaseManifest(await response.json()) : null;
        setState(manifest && manifest.channel === 'stable' && manifest.signing !== 'development'
          ? { status: 'ready', manifest } : { status: 'missing' });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'missing' });
      }
    })();
    return () => controller.abort();
  }, [origin]);

  const manifest = state.status === 'ready' ? state.manifest : null;
  const apkUrl = manifest ? releaseApkUrl(origin, manifest) : '';

  useEffect(() => {
    if (!autoDownload || !manifest || downloadStarted.current) return;
    downloadStarted.current = true;
    const link = document.createElement('a');
    link.href = apkUrl;
    link.download = manifest.file;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [autoDownload, manifest, apkUrl]);

  const copyChecksum = async () => {
    if (!manifest) return;
    try {
      await navigator.clipboard.writeText(manifest.sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  return (
    <section className="mstudio__card mstudio__release" aria-labelledby="mstudio-install">
      <header className="mstudio__card-head">
        <IoLogoAndroid size={22} aria-hidden="true" />
        <div>
          <h2 id="mstudio-install">NJS Live Studio</h2>
          <p>Android application</p>
        </div>
      </header>

      {state.status === 'loading' && <p className="mstudio__muted">Checking the latest release…</p>}

      {state.status === 'missing' && (
        <div className="mstudio__notice" role="status">
          <strong>The Android app has not been published to this site yet.</strong>
          <span>A signed Android release will appear here after publication.</span>
        </div>
      )}

      {manifest && (
        <div className="mstudio__release-body">
          <div className="mstudio__release-main">
            <dl className="mstudio__facts">
              <div><dt>Version</dt><dd>{manifest.versionName} <small>(build {manifest.versionCode})</small></dd></div>
              <div><dt>Size</dt><dd>{formatBytes(manifest.size)}</dd></div>
              <div><dt>Requires</dt><dd>{androidVersionLabel(manifest.minSdk)}</dd></div>
              {manifest.builtAt && <div><dt>Built</dt><dd>{new Date(manifest.builtAt).toLocaleDateString()}</dd></div>}
            </dl>
            <a className="mstudio__btn mstudio__btn--primary" href={apkUrl} download={manifest.file}>
              <IoDownloadOutline size={18} aria-hidden="true" /> Download APK
            </a>
            <button type="button" className="mstudio__checksum" onClick={() => void copyChecksum()} title="Copy the SHA-256 checksum">
              {copied ? <IoCheckmarkCircle size={15} aria-hidden="true" /> : <IoCopyOutline size={15} aria-hidden="true" />}
              <span>SHA-256 {manifest.sha256.slice(0, 12)}…{manifest.sha256.slice(-6)}</span>
            </button>
            {manifest.notes && manifest.notes.length > 0 && (
              <ul className="mstudio__notes">{manifest.notes.map(note => <li key={note}>{note}</li>)}</ul>
            )}
          </div>
          <figure className="mstudio__qr">
            <QRCode value={apkUrl} size={168} />
            <figcaption>Android APK</figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
