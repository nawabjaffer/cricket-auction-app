// ============================================================================
// PROFILE EDITOR — the studio profile the phones sync before going live:
// video quality, overlay widgets and destination platforms.
// Stream keys are intentionally NOT editable here (they never leave the phone).
// ============================================================================

import { IoAdd, IoSave, IoShieldCheckmarkOutline, IoTrash } from 'react-icons/io5';
import {
  MAX_STUDIO_DESTINATIONS, MAX_STUDIO_WIDGETS, STUDIO_PLATFORMS, STUDIO_PLATFORM_PRESETS, STUDIO_VIDEO_PRESETS,
  STUDIO_WIDGET_ANCHORS, DEFAULT_OVERLAY_URL_TEMPLATE, resolveWidgetUrl, resolveStudioTitle, sanitizeWidgetUrl,
  studioProfileHasErrors,
  type StudioContext, type StudioDestination, type StudioPlatform, type StudioProfile, type StudioWidget,
} from '../../types/mobileStudio';

interface Props {
  profile: StudioProfile;
  context: StudioContext;
  dirty: boolean;
  saving: boolean;
  onChange: (next: StudioProfile) => void;
  onSave: () => void;
  onReset: () => void;
}

const ANCHOR_LABELS: Record<StudioWidget['anchor'], string> = {
  full: 'Full frame', 'top-left': 'Top left', 'top-center': 'Top center', 'top-right': 'Top right', center: 'Center',
  'bottom-left': 'Bottom left', 'bottom-center': 'Bottom center', 'bottom-right': 'Bottom right',
};

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export default function ProfileEditor({ profile, context, dirty, saving, onChange, onSave, onReset }: Readonly<Props>) {
  const patch = (next: Partial<StudioProfile>) => onChange({ ...profile, ...next });
  const patchVideo = (next: Partial<StudioProfile['video']>) => patch({ video: { ...profile.video, ...next } });
  const patchAudio = (next: Partial<StudioProfile['audio']>) => patch({ audio: { ...profile.audio, ...next } });
  const patchWidget = (id: string, next: Partial<StudioWidget>) =>
    patch({ widgets: profile.widgets.map(widget => (widget.id === id ? { ...widget, ...next } : widget)) });
  const patchDestination = (id: string, next: Partial<StudioDestination>) =>
    patch({ destinations: profile.destinations.map(destination => (destination.id === id ? { ...destination, ...next } : destination)) });

  const addWidget = (kind: StudioWidget['kind']) => {
    const widget: StudioWidget = kind === 'image'
      ? { id: newId('logo'), label: 'Sponsor logo', kind, url: 'https://', enabled: true, anchor: 'top-right', widthPct: 14, opacity: 1, pageWidth: 600, pageHeight: 338 }
      : { id: newId('web'), label: 'Web overlay', kind, url: DEFAULT_OVERLAY_URL_TEMPLATE, enabled: true, anchor: 'full', widthPct: 100, opacity: 1, pageWidth: 1920, pageHeight: 1080 };
    patch({ widgets: [...profile.widgets, widget] });
  };

  const addDestination = () => {
    const used = new Set(profile.destinations.map(destination => destination.platform));
    const platform: StudioPlatform = STUDIO_PLATFORMS.find(candidate => !used.has(candidate)) ?? 'rtmp';
    patch({
      destinations: [...profile.destinations, { id: newId(platform), platform, label: STUDIO_PLATFORM_PRESETS[platform].label, enabled: true }],
    });
  };

  const titlePreview = resolveStudioTitle(profile.titleTemplate, {
    teamA: 'Team A', teamB: 'Team B', tournament: 'Tournament', stage: 'Final', game: context.game,
  });

  return (
    <section className="mstudio__card" aria-labelledby="mstudio-profile">
      <header className="mstudio__card-head">
        <div>
          <h2 id="mstudio-profile">Studio profile</h2>
          <p>Synced to every paired phone before it goes live. Phones can still adjust quality locally.</p>
        </div>
        <div className="mstudio__head-actions">
          <button type="button" className="mstudio__btn" onClick={onReset} disabled={saving}>Reset to defaults</button>
          <button type="button" className="mstudio__btn mstudio__btn--primary" onClick={onSave} disabled={!dirty || saving || studioProfileHasErrors(profile)}>
            <IoSave size={16} aria-hidden="true" /> {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </header>

      <div className="mstudio__grid">
        <label className="mstudio__field">
          <span>Profile name</span>
          <input value={profile.name} maxLength={60} onChange={event => patch({ name: event.target.value })} />
        </label>
        <label className="mstudio__field">
          <span>Broadcast title</span>
          <input value={profile.titleTemplate} maxLength={120} onChange={event => patch({ titleTemplate: event.target.value })} />
          <small>Tokens: {'{teamA} {teamB} {tournament} {stage} {game} {date}'} → “{titlePreview}”</small>
        </label>
      </div>

      <h3 className="mstudio__subhead">Video &amp; audio</h3>
      <div className="mstudio__grid">
        <label className="mstudio__field">
          <span>Quality</span>
          <select value={profile.video.presetId} onChange={event => patchVideo({ presetId: event.target.value })}>
            {STUDIO_VIDEO_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>{preset.label} · {(preset.bitrateKbps / 1000).toFixed(preset.bitrateKbps % 1000 ? 1 : 0)} Mbps</option>
            ))}
          </select>
          <small>4K needs a phone whose camera and hardware encoder support it, plus a strong uplink.</small>
        </label>
        <label className="mstudio__field">
          <span>Video codec</span>
          <select value={profile.video.codec} onChange={event => patchVideo({ codec: event.target.value === 'h265' ? 'h265' : 'h264' })}>
            <option value="h264">H.264 — works everywhere (YouTube, Facebook, Twitch)</option>
            <option value="h265">H.265 / HEVC — custom RTMP, SRT only</option>
          </select>
        </label>
        <label className="mstudio__field">
          <span>Orientation</span>
          <select value={profile.video.orientation} onChange={event => patchVideo({ orientation: event.target.value === 'portrait' ? 'portrait' : 'landscape' })}>
            <option value="landscape">Landscape (16:9)</option>
            <option value="portrait">Portrait (9:16)</option>
          </select>
        </label>
        <label className="mstudio__field">
          <span>Audio bitrate</span>
          <select value={profile.audio.bitrateKbps} onChange={event => patchAudio({ bitrateKbps: Number(event.target.value) })}>
            {[96, 128, 192, 256].map(value => <option key={value} value={value}>{value} kbps AAC</option>)}
          </select>
        </label>
      </div>
      <div className="mstudio__checks">
        <label><input type="checkbox" checked={profile.video.adaptiveBitrate} onChange={event => patchVideo({ adaptiveBitrate: event.target.checked })} /> Adaptive bitrate on weak networks</label>
        <label><input type="checkbox" checked={profile.video.stabilization} onChange={event => patchVideo({ stabilization: event.target.checked })} /> Video stabilization</label>
        <label><input type="checkbox" checked={profile.video.recordLocal} onChange={event => patchVideo({ recordLocal: event.target.checked })} /> Save a local MP4 copy on the phone</label>
        <label><input type="checkbox" checked={profile.audio.stereo} onChange={event => patchAudio({ stereo: event.target.checked })} /> Stereo audio</label>
        <label><input type="checkbox" checked={profile.audio.noiseSuppressor} onChange={event => patchAudio({ noiseSuppressor: event.target.checked })} /> Noise suppression</label>
        <label><input type="checkbox" checked={profile.audio.echoCanceler} onChange={event => patchAudio({ echoCanceler: event.target.checked })} /> Echo cancellation</label>
      </div>

      <h3 className="mstudio__subhead">Overlay widgets <small>{profile.widgets.length}/{MAX_STUDIO_WIDGETS}</small></h3>
      {profile.widgets.length === 0 && <p className="mstudio__muted">No overlays — the phone streams plain camera video.</p>}
      <ul className="mstudio__rows">
        {profile.widgets.map(widget => {
          const valid = sanitizeWidgetUrl(widget.url) !== null;
          const resolved = valid ? resolveWidgetUrl(widget.url, context) : null;
          return (
            <li key={widget.id} className="mstudio__row">
              <div className="mstudio__row-main">
                <label className="mstudio__toggle">
                  <input type="checkbox" checked={widget.enabled} onChange={event => patchWidget(widget.id, { enabled: event.target.checked })} aria-label={`Enable ${widget.label}`} />
                </label>
                <input className="mstudio__grow" value={widget.label} maxLength={40} onChange={event => patchWidget(widget.id, { label: event.target.value })} aria-label="Widget name" />
                <select value={widget.kind} onChange={event => patchWidget(widget.id, { kind: event.target.value === 'image' ? 'image' : 'web' })} aria-label="Widget type">
                  <option value="web">Web page</option>
                  <option value="image">Image</option>
                </select>
                <button type="button" className="mstudio__icon-btn" onClick={() => patch({ widgets: profile.widgets.filter(item => item.id !== widget.id) })} aria-label={`Remove ${widget.label}`}>
                  <IoTrash size={16} aria-hidden="true" />
                </button>
              </div>
              <input
                className={`mstudio__url-input ${valid ? '' : 'is-invalid'}`}
                value={widget.url}
                onChange={event => patchWidget(widget.id, { url: event.target.value })}
                placeholder="https://… or {origin}/{slug}/{game}/scorer/obs-overlay{matchQuery}"
                aria-label="Widget URL"
                spellCheck={false}
              />
              {!valid && <small className="mstudio__error">Use an http(s) URL, or start with {'{origin}'} for this site.</small>}
              {resolved && resolved !== widget.url && <small className="mstudio__muted">Loads: {resolved}</small>}
              <div className="mstudio__row-opts">
                <label>Position
                  <select value={widget.anchor} onChange={event => patchWidget(widget.id, { anchor: event.target.value as StudioWidget['anchor'], widthPct: event.target.value === 'full' ? 100 : Math.min(widget.widthPct, 60) })}>
                    {STUDIO_WIDGET_ANCHORS.map(anchor => <option key={anchor} value={anchor}>{ANCHOR_LABELS[anchor]}</option>)}
                  </select>
                </label>
                <label>Width {widget.anchor === 'full' ? '100' : widget.widthPct}%
                  <input type="range" min={5} max={100} step={1} value={widget.widthPct} disabled={widget.anchor === 'full'} onChange={event => patchWidget(widget.id, { widthPct: Number(event.target.value) })} />
                </label>
                <label>Opacity {Math.round(widget.opacity * 100)}%
                  <input type="range" min={0.1} max={1} step={0.05} value={widget.opacity} onChange={event => patchWidget(widget.id, { opacity: Number(event.target.value) })} />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mstudio__add">
        <button type="button" className="mstudio__btn" onClick={() => addWidget('web')} disabled={profile.widgets.length >= MAX_STUDIO_WIDGETS}><IoAdd size={16} aria-hidden="true" /> Web overlay</button>
        <button type="button" className="mstudio__btn" onClick={() => addWidget('image')} disabled={profile.widgets.length >= MAX_STUDIO_WIDGETS}><IoAdd size={16} aria-hidden="true" /> Logo / image</button>
      </div>

      <h3 className="mstudio__subhead">Destinations <small>{profile.destinations.length}/{MAX_STUDIO_DESTINATIONS}</small></h3>
      <p className="mstudio__lock"><IoShieldCheckmarkOutline size={16} aria-hidden="true" /> Stream keys, server URLs and account links are entered on the phone and stored in its encrypted storage — they are never saved online.</p>
      <ul className="mstudio__rows">
        {profile.destinations.map(destination => (
          <li key={destination.id} className="mstudio__row mstudio__row--inline">
            <label className="mstudio__toggle">
              <input type="checkbox" checked={destination.enabled} onChange={event => patchDestination(destination.id, { enabled: event.target.checked })} aria-label={`Enable ${destination.label}`} />
            </label>
            <select
              value={destination.platform}
              onChange={event => {
                const platform = event.target.value as StudioPlatform;
                patchDestination(destination.id, { platform, label: STUDIO_PLATFORM_PRESETS[platform].label });
              }}
              aria-label="Platform"
            >
              {STUDIO_PLATFORMS.map(platform => <option key={platform} value={platform}>{STUDIO_PLATFORM_PRESETS[platform].label}</option>)}
            </select>
            <input className="mstudio__grow" value={destination.label} maxLength={40} onChange={event => patchDestination(destination.id, { label: event.target.value })} aria-label="Destination name" />
            <button type="button" className="mstudio__icon-btn" onClick={() => patch({ destinations: profile.destinations.filter(item => item.id !== destination.id) })} aria-label={`Remove ${destination.label}`}>
              <IoTrash size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mstudio__add">
        <button type="button" className="mstudio__btn" onClick={addDestination} disabled={profile.destinations.length >= MAX_STUDIO_DESTINATIONS}><IoAdd size={16} aria-hidden="true" /> Destination</button>
      </div>
    </section>
  );
}
