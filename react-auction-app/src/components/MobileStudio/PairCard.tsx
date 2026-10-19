// ============================================================================
// PAIR CARD — QR + deep link that opens NJS Live Studio on a phone straight
// into this tournament / game (and optionally a pinned match).
// ============================================================================

import { useState } from 'react';
import { IoCheckmarkCircle, IoCopyOutline, IoOpenOutline } from 'react-icons/io5';
import { QRCode } from '../QRCode';
import {
  buildPairingLink, buildPairingPageUrl, resolveWidgetUrl, DEFAULT_OVERLAY_URL_TEMPLATE,
  type StudioGameType, type StudioMatchSummary,
} from '../../types/mobileStudio';

interface Props {
  origin: string;
  tenantId: string;
  slug: string;
  game: StudioGameType;
  matches: StudioMatchSummary[];
  matchId: string;
  onMatchChange: (matchId: string) => void;
}

const isAndroidBrowser = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

export default function PairCard({ origin, tenantId, slug, game, matches, matchId, onMatchChange }: Readonly<Props>) {
  const [copied, setCopied] = useState<'link' | 'overlay' | null>(null);
  const pairing = { origin, tenantId, slug, game, matchId: matchId || undefined };
  const pageUrl = buildPairingPageUrl(pairing);
  const deepLink = buildPairingLink(pairing);
  const overlayUrl = resolveWidgetUrl(DEFAULT_OVERLAY_URL_TEMPLATE, { origin, tenantId, slug, game, matchId: matchId || undefined }) ?? '';

  const copy = async (kind: 'link' | 'overlay', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard blocked */ }
  };

  return (
    <section className="mstudio__card" aria-labelledby="mstudio-pair">
      <header className="mstudio__card-head">
        <div>
          <h2 id="mstudio-pair">Pair a phone with this tournament</h2>
          <p>The app loads this tournament&apos;s overlay, widgets and quality settings. Stream keys stay on the phone.</p>
        </div>
      </header>

      <label className="mstudio__field">
        <span>Match</span>
        <select value={matchId} onChange={event => onMatchChange(event.target.value)}>
          <option value="">Follow the on-air match automatically</option>
          {matches.map(match => (
            <option key={match.id} value={match.id}>
              {match.status === 'live' ? '● ' : ''}{match.title}{match.stage ? ` — ${match.stage}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="mstudio__pair">
        <figure className="mstudio__qr">
          <QRCode value={pageUrl} size={168} />
          <figcaption>Scan in NJS Live Studio</figcaption>
        </figure>
        <div className="mstudio__pair-actions">
          {isAndroidBrowser && (
            <a className="mstudio__btn mstudio__btn--primary" href={deepLink}>
              <IoOpenOutline size={17} aria-hidden="true" /> Open in NJS Live Studio
            </a>
          )}
          <button type="button" className="mstudio__btn" onClick={() => void copy('link', pageUrl)}>
            {copied === 'link' ? <IoCheckmarkCircle size={17} aria-hidden="true" /> : <IoCopyOutline size={17} aria-hidden="true" />} Copy pairing link
          </button>
          <div className="mstudio__url">
            <span>Overlay URL on the phone</span>
            <code>{overlayUrl}</code>
            <button type="button" className="mstudio__icon-btn" onClick={() => void copy('overlay', overlayUrl)} aria-label="Copy overlay URL">
              {copied === 'overlay' ? <IoCheckmarkCircle size={16} aria-hidden="true" /> : <IoCopyOutline size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
