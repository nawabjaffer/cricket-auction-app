import { useEffect, useState } from 'react';
import { mobileStudioService } from '../../services/mobileStudioService';
import { DEFAULT_MOBILE_SCORING_OPTIONS, MOBILE_SCORING_FEATURES, DEFAULT_MOBILE_HIGHLIGHTS, normalizeMobileHighlights, type MobileHighlight, type StudioGameType, type StudioMatchSummary } from '../../types/mobileStudio';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export default function ScoringOptionsCard({ gameType }: Readonly<{ gameType: StudioGameType }>) {
  const { isAuthenticated } = useAdminAuth();
  const [options, setOptions] = useState({ ...DEFAULT_MOBILE_SCORING_OPTIONS });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [highlights, setHighlights] = useState({ ...DEFAULT_MOBILE_HIGHLIGHTS });
  const [highlightMessage, setHighlightMessage] = useState('');
  const [highlightBusy, setHighlightBusy] = useState(false);
  const [matches, setMatches] = useState<StudioMatchSummary[]>([]);
  const [matchId, setMatchId] = useState('');
  const [clips, setClips] = useState<MobileHighlight[]>([]);
  useEffect(() => {
    if (!isAuthenticated || gameType !== 'cricket') return;
    try { return mobileStudioService.subscribeHighlightOptions(setHighlights, () => setHighlightMessage('Could not load highlight settings.')); }
    catch { setHighlightMessage('Highlight settings are unavailable.'); }
  }, [gameType, isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated || !matchId || gameType !== 'cricket') return;
    return mobileStudioService.subscribeHighlights(matchId, setClips, () => setHighlightMessage('Could not load highlights.'));
  }, [gameType, isAuthenticated, matchId]);
  useEffect(() => {
    if (!isAuthenticated) return;
    return mobileStudioService.subscribeScoringOptions(gameType, setOptions, () => setMessage('Could not load mobile scoring settings.'));
  }, [gameType, isAuthenticated]);
  const save = async () => {
    if (!isAuthenticated) return;
    setSaving(true);
    setMessage('');
    try { await mobileStudioService.saveScoringOptions(gameType, options); setMessage('Mobile scoring options saved.'); }
    catch { setMessage('Could not save mobile scoring options.'); }
    finally { setSaving(false); }
  };
  if (!isAuthenticated) return null;
  return <section className="mstudio__card">
    <header className="mstudio__card-head"><div><h2>Mobile scoring options</h2><p>Matches and scoring are always available.</p></div></header>
    <div style={{ display: 'grid', gap: 12 }}>
      {MOBILE_SCORING_FEATURES.map(feature => <label key={feature.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" checked={options[feature.id]} onChange={event => setOptions(current => ({ ...current, [feature.id]: event.target.checked }))} />
        <span>{feature.label}</span>
      </label>)}
      <button type="button" className="mstudio__btn mstudio__btn--primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save mobile options'}</button>
      {message && <p role="status">{message}</p>}
      {gameType === 'cricket' && <>
        <h3>Camera boundary highlights</h3>
        <label><input type="checkbox" checked={highlights.enabled} onChange={event => setHighlights(current => ({ ...current, enabled: event.target.checked }))} /> Save boundary highlights</label>
        <label>Seconds before boundary <input type="number" min={5} max={60} value={highlights.seconds} onChange={event => setHighlights(current => normalizeMobileHighlights({ ...current, seconds: Number(event.target.value) }))} /></label>
        <label>Maximum clips per match <input type="number" min={1} max={100} value={highlights.maxClipsPerMatch} onChange={event => setHighlights(current => normalizeMobileHighlights({ ...current, maxClipsPerMatch: Number(event.target.value) }))} /></label>
        <label><input type="checkbox" checked={highlights.upload} onChange={event => setHighlights(current => ({ ...current, upload: event.target.checked }))} /> Upload clips to Firebase Storage</label>
        <button type="button" className="mstudio__btn mstudio__btn--primary" disabled={highlightBusy} onClick={() => {
          setHighlightBusy(true);
          void mobileStudioService.saveHighlightOptions(highlights).then(() => setHighlightMessage('Highlight settings saved.'))
            .catch(() => setHighlightMessage('Could not save highlight settings.')).finally(() => setHighlightBusy(false));
        }}>Save highlight settings</button>
        <button type="button" className="mstudio__btn" disabled={highlightBusy} onClick={() => {
          setHighlightBusy(true);
          void mobileStudioService.listMatches('cricket').then(setMatches).catch(() => setHighlightMessage('Could not load matches.')).finally(() => setHighlightBusy(false));
        }}>Browse recorded highlights</button>
        {matches.length > 0 && <label>Highlight match <select value={matchId} onChange={event => { setClips([]); setMatchId(event.target.value); }}><option value="">Select match</option>{matches.map(match => <option key={match.id} value={match.id}>{match.title}</option>)}</select></label>}
        {matchId && clips.length === 0 && <p>No uploaded clips for this match.</p>}
        {clips.map(clip => <article key={clip.id} style={{ borderTop: '1px solid var(--border-color, #555)', paddingTop: 12 }}>
          <p>{clip.boundary === 6 ? 'Six' : 'Four'} · {(clip.durationMs / 1000).toFixed(1)} sec · {new Date(clip.createdAt).toLocaleString()}</p>
          {clip.url ? <video controls preload="none" src={clip.url} style={{ width: '100%', maxWidth: 480, maxHeight: 270 }} /> : <p>Upload pending on the recording phone.</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>{clip.url && <a className="mstudio__btn" href={clip.url} target="_blank" rel="noopener noreferrer">Download clip</a>}
            <button type="button" className="mstudio__btn" disabled={highlightBusy} onClick={() => {
              if (!window.confirm('Permanently delete this highlight from cloud storage?')) return;
              setHighlightBusy(true);
              void mobileStudioService.deleteHighlight(clip).catch(() => setHighlightMessage('Could not delete highlight.')).finally(() => setHighlightBusy(false));
            }}>Delete clip</button></div>
        </article>)}
        {highlightMessage && <p role="status">{highlightMessage}</p>}
      </>}
    </div>
  </section>;
}