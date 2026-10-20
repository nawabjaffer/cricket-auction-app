import { useEffect, useState } from 'react';
import { mobileStudioService } from '../../services/mobileStudioService';
import { DEFAULT_MOBILE_SCORING_OPTIONS, MOBILE_SCORING_FEATURES, type StudioGameType } from '../../types/mobileStudio';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export default function ScoringOptionsCard({ gameType }: Readonly<{ gameType: StudioGameType }>) {
  const { isAuthenticated } = useAdminAuth();
  const [options, setOptions] = useState({ ...DEFAULT_MOBILE_SCORING_OPTIONS });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
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
    </div>
  </section>;
}