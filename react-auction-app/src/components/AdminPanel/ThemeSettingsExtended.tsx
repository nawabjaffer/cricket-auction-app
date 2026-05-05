// ============================================================================
// THEME & SETTINGS EXTENDED - Advanced Configuration Panel
// Handles: Player Stats Fields, Special Categories, Budget Rules, 
//          Auction Breaks, Loading Screen, Team Owners, Iconic Players
// ============================================================================

import { useState, useEffect } from 'react';
import { IoAdd, IoTrash, IoPlay, IoStop, IoCloudUpload } from 'react-icons/io5';
import { type AdminSettings, type SpecialCategory, type AuctionBreak, type BudgetRulesConfig, type LoadingScreenConfig, type TeamOwner } from '../../services/auctionPersistence';
import { uploadFileToStorage } from '../../services';
import type { Team } from '../../types';
import { ALL_PLAYER_STAT_FIELDS } from '../../config/playerStatFields';

const DEFAULT_BUDGET_RULES: BudgetRulesConfig = {
  totalBudgetPerTeam: 100,
  maxBidPerPlayer: 50,
  minBidIncrement: 0.5,
  maxBidIncrement: 10,
  safeFundBufferPercent: 10,
  minPlayersRequired: 7,
  maxPlayersAllowed: 15,
  reservedFundPerRemainingPlayer: 1,
};

interface ThemeSettingsExtendedProps {
  readonly settings: AdminSettings | null;
  /** Called whenever any extended field changes so the parent can merge on save */
  readonly onChange: (partial: Partial<AdminSettings>) => void;
  readonly teams: Team[];
}

export function ThemeSettingsExtended({ settings, onChange, teams }: ThemeSettingsExtendedProps) {
  // Player Stats Fields
  const [playerStatsFields, setPlayerStatsFields] = useState<string[]>(
    settings?.playerStatsFields ?? ['age', 'matches', 'runs', 'wickets', 'battingBestFigures', 'bowlingBestFigures']
  );

  // Special Categories
  const [specialCategories, setSpecialCategories] = useState<SpecialCategory[]>(
    settings?.specialCategories ?? [{ id: 'under-19', label: 'Under 19', ageMax: 19, color: '#f59e0b' }]
  );

  // Budget Rules
  const [budgetRules, setBudgetRules] = useState<BudgetRulesConfig>(
    settings?.budgetRules ?? DEFAULT_BUDGET_RULES
  );

  // Auction Breaks
  const [auctionBreaks, setAuctionBreaks] = useState<AuctionBreak[]>(
    settings?.auctionBreaks ?? []
  );
  const [currentBreakId, setCurrentBreakId] = useState<string>(settings?.currentBreakId ?? '');

  // Loading Screen
  const [loadingScreen, setLoadingScreen] = useState<LoadingScreenConfig>(
    settings?.loadingScreen ?? { mode: 'logo' }
  );

  // Team Owners
  const [teamOwners, setTeamOwners] = useState<Record<string, TeamOwner[]>>(
    settings?.teamOwners ?? {}
  );

  // Iconic Players
  const [maxIconicPlayers, setMaxIconicPlayers] = useState<number>(
    settings?.maxIconicPlayers ?? 1
  );

  // Default country code for WhatsApp
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>(
    settings?.defaultCountryCode ?? '91'
  );

  // Player placeholder image
  const [playerPlaceholderImage, setPlayerPlaceholderImage] = useState<string>(
    settings?.playerPlaceholderImage ?? '/placeholder_player.png'
  );

  // Mirror preload persist
  const [mirrorPreloadPersist, setMirrorPreloadPersist] = useState<boolean>(
    settings?.mirrorPreloadPersist ?? false
  );

  // Sync when settings change externally
  useEffect(() => {
    if (!settings) return;
    if (settings.playerStatsFields) setPlayerStatsFields(settings.playerStatsFields);
    if (settings.specialCategories) setSpecialCategories(settings.specialCategories);
    if (settings.budgetRules) setBudgetRules(settings.budgetRules);
    if (settings.auctionBreaks) setAuctionBreaks(settings.auctionBreaks);
    if (settings.currentBreakId != null) setCurrentBreakId(settings.currentBreakId);
    if (settings.loadingScreen) setLoadingScreen(settings.loadingScreen);
    if (settings.teamOwners) setTeamOwners(settings.teamOwners);
    if (settings.maxIconicPlayers != null) setMaxIconicPlayers(settings.maxIconicPlayers);
    if (settings.defaultCountryCode != null) setDefaultCountryCode(settings.defaultCountryCode);
    if (settings.playerPlaceholderImage != null) setPlayerPlaceholderImage(settings.playerPlaceholderImage);
    if (settings.mirrorPreloadPersist != null) setMirrorPreloadPersist(settings.mirrorPreloadPersist);
  }, [settings]);

  // Notify parent of every change so it can merge on the single "Save Settings" click
  useEffect(() => {
    onChange({
      playerStatsFields,
      specialCategories,
      budgetRules,
      auctionBreaks,
      currentBreakId: currentBreakId || undefined,
      loadingScreen,
      teamOwners,
      maxIconicPlayers,
      defaultCountryCode,
      playerPlaceholderImage: playerPlaceholderImage || undefined,
      mirrorPreloadPersist,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerStatsFields, specialCategories, budgetRules, auctionBreaks, currentBreakId, loadingScreen, teamOwners, maxIconicPlayers, defaultCountryCode, playerPlaceholderImage, mirrorPreloadPersist]);

  // ─── Player Stats Fields ─────────────────────────────────────────────────
  const toggleStatField = (key: string) => {
    setPlayerStatsFields(prev =>
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
  };

  // ─── Special Categories ───────────────────────────────────────────────────
  const addCategory = () => {
    const id = `cat-${Date.now()}`;
    setSpecialCategories(prev => [...prev, { id, label: 'New Category', color: '#6366f1' }]);
  };
  const removeCategory = (id: string) => {
    setSpecialCategories(prev => prev.filter(c => c.id !== id));
  };
  const updateCategory = (id: string, patch: Partial<SpecialCategory>) => {
    setSpecialCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  // ─── Auction Breaks ───────────────────────────────────────────────────────
  const addBreak = () => {
    const id = `break-${Date.now()}`;
    setAuctionBreaks(prev => [...prev, { id, title: 'Break', durationSeconds: 120, order: prev.length + 1 }]);
  };
  const removeBreak = (id: string) => {
    setAuctionBreaks(prev => prev.filter(b => b.id !== id));
    if (currentBreakId === id) setCurrentBreakId('');
  };
  const updateBreak = (id: string, patch: Partial<AuctionBreak>) => {
    setAuctionBreaks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  };

  // ─── Team Owners ──────────────────────────────────────────────────────────
  const addOwner = (teamId: string) => {
    const id = `owner-${Date.now()}`;
    setTeamOwners(prev => ({
      ...prev,
      [teamId]: [...(prev[teamId] || []), { id, name: '', designation: 'Owner' }],
    }));
  };
  const removeOwner = (teamId: string, ownerId: string) => {
    setTeamOwners(prev => ({
      ...prev,
      [teamId]: (prev[teamId] || []).filter(o => o.id !== ownerId),
    }));
  };
  const updateOwner = (teamId: string, ownerId: string, patch: Partial<TeamOwner>) => {
    setTeamOwners(prev => ({
      ...prev,
      [teamId]: (prev[teamId] || []).map(o => o.id === ownerId ? { ...o, ...patch } : o),
    }));
  };

  return (
    <div className="admin-extended-settings">
      {/* ─── Section 1: Player Stats Display Fields ─────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">📊 Player Stats Display</h3>
        <p className="admin-section-desc">Select which stats fields appear on the main auction listing page for each player.</p>
        <div className="admin-checkbox-grid">
          {ALL_PLAYER_STAT_FIELDS.map(field => (
            <label key={field.key} className="admin-checkbox-item">
              <input
                type="checkbox"
                checked={playerStatsFields.includes(field.key)}
                onChange={() => toggleStatField(field.key)}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ─── Section 2: Special Categories ──────────────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">🏷️ Special Player Categories & Age Spotlight</h3>
        <p className="admin-section-desc">Add custom categories like Under-19, Under-17, Over-40. Players matching a category will get a spotlight badge during the auction and in team views.</p>
        <div className="admin-items-list">
          {specialCategories.map(cat => (
            <div key={cat.id} className="admin-item-row">
              <input
                type="text"
                value={cat.label}
                onChange={e => updateCategory(cat.id, { label: e.target.value })}
                placeholder="Category name"
                className="admin-input"
              />
              <input
                type="number"
                value={cat.ageMin ?? ''}
                onChange={e => updateCategory(cat.id, { ageMin: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Min age"
                className="admin-input admin-input-sm"
              />
              <input
                type="number"
                value={cat.ageMax ?? ''}
                onChange={e => updateCategory(cat.id, { ageMax: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Max age"
                className="admin-input admin-input-sm"
              />
              <input
                type="color"
                value={cat.color || '#6366f1'}
                onChange={e => updateCategory(cat.id, { color: e.target.value })}
                className="admin-color-input"
              />
              <button onClick={() => removeCategory(cat.id)} className="admin-delete-btn" title="Remove">
                <IoTrash />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addCategory} className="admin-add-btn">
          <IoAdd /> Add Category
        </button>
      </div>

      {/* ─── Section 3: Budget Rules ────────────────────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">💰 Budget Rules & Constraints</h3>
        <p className="admin-section-desc">Configure budget allocation and bidding rules for all teams.</p>
        <div className="admin-form-grid">
          <div className="admin-form-field">
            <label>Total Budget Per Team (Lakhs)</label>
            <input type="number" step="0.5" value={budgetRules.totalBudgetPerTeam}
              onChange={e => setBudgetRules(prev => ({ ...prev, totalBudgetPerTeam: Number(e.target.value) }))}
              className="admin-input" />
          </div>
          <div className="admin-form-field">
            <label>Max Bid Per Player (Lakhs)</label>
            <input type="number" step="0.5" value={budgetRules.maxBidPerPlayer}
              onChange={e => setBudgetRules(prev => ({ ...prev, maxBidPerPlayer: Number(e.target.value) }))}
              className="admin-input" />
          </div>
          <div className="admin-form-field">
            <label>Min Bid Increment (Lakhs)</label>
            <input type="number" step="0.1" value={budgetRules.minBidIncrement}
              onChange={e => setBudgetRules(prev => ({ ...prev, minBidIncrement: Number(e.target.value) }))}
              className="admin-input" />
          </div>
          <div className="admin-form-field">
            <label>Max Bid Increment (Lakhs)</label>
            <input type="number" step="0.5" value={budgetRules.maxBidIncrement}
              onChange={e => setBudgetRules(prev => ({ ...prev, maxBidIncrement: Number(e.target.value) }))}
              className="admin-input" />
          </div>
          <div className="admin-form-field">
            <label>Safe Fund Buffer (%)</label>
            <input type="number" step="1" value={budgetRules.safeFundBufferPercent}
              onChange={e => setBudgetRules(prev => ({ ...prev, safeFundBufferPercent: Number(e.target.value) }))}
              className="admin-input" />
          </div>
          <div className="admin-form-field">
            <label>Min Players Required</label>
            <input type="number" value={budgetRules.minPlayersRequired}
              onChange={e => setBudgetRules(prev => ({ ...prev, minPlayersRequired: Number(e.target.value) }))}
              className="admin-input" />
          </div>
          <div className="admin-form-field">
            <label>Max Players Allowed</label>
            <input type="number" value={budgetRules.maxPlayersAllowed}
              onChange={e => setBudgetRules(prev => ({ ...prev, maxPlayersAllowed: Number(e.target.value) }))}
              className="admin-input" />
          </div>
          <div className="admin-form-field">
            <label>Reserved Per Remaining Player (Lakhs)</label>
            <input type="number" step="0.5" value={budgetRules.reservedFundPerRemainingPlayer}
              onChange={e => setBudgetRules(prev => ({ ...prev, reservedFundPerRemainingPlayer: Number(e.target.value) }))}
              className="admin-input" />
          </div>
        </div>
      </div>

      {/* ─── Section 4: Auction Breaks ──────────────────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">⏸️ Auction Breaks</h3>
        <p className="admin-section-desc">Configure breaks with custom titles, durations, and sponsor videos. Select active break for live controls.</p>
        <div className="admin-items-list">
          {auctionBreaks.map(brk => (
            <div key={brk.id} className="admin-item-row admin-item-row--break">
              <label className="admin-radio-label">
                <input
                  type="radio"
                  name="currentBreak"
                  checked={currentBreakId === brk.id}
                  onChange={() => setCurrentBreakId(brk.id)}
                />
                {currentBreakId === brk.id ? <IoPlay className="admin-break-active" /> : <IoStop className="admin-break-inactive" />}
              </label>
              <input
                type="text"
                value={brk.title}
                onChange={e => updateBreak(brk.id, { title: e.target.value })}
                placeholder="Break title (e.g. Tea Break)"
                className="admin-input"
              />
              <input
                type="number"
                value={brk.durationSeconds}
                onChange={e => updateBreak(brk.id, { durationSeconds: Number(e.target.value) })}
                placeholder="Duration (s)"
                className="admin-input admin-input-sm"
                min={10}
              />
              <input
                type="text"
                value={brk.sponsorVideoUrl || ''}
                onChange={e => updateBreak(brk.id, { sponsorVideoUrl: e.target.value })}
                placeholder="Sponsor video URL"
                className="admin-input"
              />
              <button onClick={() => removeBreak(brk.id)} className="admin-delete-btn" title="Remove">
                <IoTrash />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addBreak} className="admin-add-btn">
          <IoAdd /> Add Break
        </button>
      </div>

      {/* ─── Section 5: Loading Screen ──────────────────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">🎬 Loading Screen</h3>
        <p className="admin-section-desc">Configure the initial loading animation. Choose between franchise logo or a custom video.</p>
        <div className="admin-radio-group">
          <label className="admin-radio-option">
            <input
              type="radio"
              name="loadingMode"
              checked={loadingScreen.mode === 'logo'}
              onChange={() => setLoadingScreen(prev => ({ ...prev, mode: 'logo' }))}
            />
            <span>Logo Mode (uses franchise logo from settings)</span>
          </label>
          <label className="admin-radio-option">
            <input
              type="radio"
              name="loadingMode"
              checked={loadingScreen.mode === 'video'}
              onChange={() => setLoadingScreen(prev => ({ ...prev, mode: 'video' }))}
            />
            <span>Custom Video Mode</span>
          </label>
        </div>
        {loadingScreen.mode === 'logo' && (
          <div className="admin-form-field">
            <label>Custom Logo URL (leave empty to use organizer logo)</label>
            <input
              type="text"
              value={loadingScreen.logoUrl || ''}
              onChange={e => setLoadingScreen(prev => ({ ...prev, logoUrl: e.target.value }))}
              placeholder="https://..."
              className="admin-input"
            />
          </div>
        )}
        {loadingScreen.mode === 'video' && (
          <>
            <div className="admin-form-field">
              <label>Video URL</label>
              <input
                type="text"
                value={loadingScreen.videoUrl || ''}
                onChange={e => setLoadingScreen(prev => ({ ...prev, videoUrl: e.target.value }))}
                placeholder="https://... (.mp4, .webm)"
                className="admin-input"
              />
            </div>
            <div className="admin-form-field">
              <label>Text Overlay</label>
              <input
                type="text"
                value={loadingScreen.textOverlay || ''}
                onChange={e => setLoadingScreen(prev => ({ ...prev, textOverlay: e.target.value }))}
                placeholder="Loading auction..."
                className="admin-input"
              />
            </div>
          </>
        )}
      </div>

      {/* ─── Section 6: Team Owners ─────────────────────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">👥 Team Owners</h3>
        <p className="admin-section-desc">Configure team owners with images and brand logos for live telecast.</p>
        {teams.map(team => (
          <div key={team.id} className="admin-team-owners-block">
            <div className="admin-team-owners-header">
              <span className="admin-team-name">{team.name}</span>
              <button onClick={() => addOwner(team.id)} className="admin-add-btn admin-add-btn-sm">
                <IoAdd /> Add Owner
              </button>
            </div>
            <div className="admin-items-list">
              {(teamOwners[team.id] || []).map(owner => (
                <div key={owner.id} className="admin-item-row" style={{ flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={owner.name}
                      onChange={e => updateOwner(team.id, owner.id, { name: e.target.value })}
                      placeholder="Owner name"
                      className="admin-input"
                    />
                    <input
                      type="text"
                      value={owner.designation || ''}
                      onChange={e => updateOwner(team.id, owner.id, { designation: e.target.value })}
                      placeholder="Designation"
                      className="admin-input admin-input-sm"
                    />
                    <button onClick={() => removeOwner(team.id, owner.id)} className="admin-delete-btn" title="Remove">
                      <IoTrash />
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={owner.imageUrl || ''}
                      onChange={e => updateOwner(team.id, owner.id, { imageUrl: e.target.value })}
                      placeholder="Owner image URL"
                      className="admin-input"
                      style={{ flex: 1 }}
                    />
                    <label className="admin-upload-btn" title="Upload owner image">
                      <IoCloudUpload />
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) { alert('Image too large. Max 5MB.'); return; }
                          try {
                            const url = await uploadFileToStorage(file, `media/owners/${team.id}/${owner.id}-photo-${Date.now()}`);
                            updateOwner(team.id, owner.id, { imageUrl: url });
                          } catch { alert('Upload failed'); }
                        }}
                      />
                    </label>
                    {owner.imageUrl && (
                      <img src={owner.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={owner.brandImageUrl || ''}
                      onChange={e => updateOwner(team.id, owner.id, { brandImageUrl: e.target.value })}
                      placeholder="Brand image URL"
                      className="admin-input"
                      style={{ flex: 1 }}
                    />
                    <label className="admin-upload-btn" title="Upload brand image">
                      <IoCloudUpload />
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) { alert('Image too large. Max 5MB.'); return; }
                          try {
                            const url = await uploadFileToStorage(file, `media/owners/${team.id}/${owner.id}-brand-${Date.now()}`);
                            updateOwner(team.id, owner.id, { brandImageUrl: url });
                          } catch { alert('Upload failed'); }
                        }}
                      />
                    </label>
                    {owner.brandImageUrl && (
                      <img src={owner.brandImageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
                    )}
                  </div>
                </div>
              ))}
              {(!teamOwners[team.id] || teamOwners[team.id].length === 0) && (
                <div className="admin-empty-note">No owners configured</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Section 7: Iconic Players Config ──────────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">⭐ Iconic Players</h3>
        <p className="admin-section-desc">Configure maximum number of iconic players per team for auction display.</p>
        <div className="admin-form-field">
          <label>Max Iconic Players Per Team</label>
          <input
            type="number"
            min={1}
            max={5}
            value={maxIconicPlayers}
            onChange={e => setMaxIconicPlayers(Math.max(1, Math.min(5, Number(e.target.value))))}
            className="admin-input admin-input-sm"
          />
        </div>
      </div>

      {/* ─── Section 8: Player Placeholder Image ──────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">🖼️ Player Placeholder Image</h3>
        <p className="admin-section-desc">URL for the default player image shown when a player has no photo. Place the file in <code>/public/</code> folder or use a full URL.</p>
        <div className="admin-form-field">
          <label>Placeholder Image URL</label>
          <input
            type="text"
            value={playerPlaceholderImage}
            onChange={e => setPlayerPlaceholderImage(e.target.value.trim())}
            placeholder="/placeholder_player.png"
            className="admin-input"
          />
        </div>
        {playerPlaceholderImage && (
          <div style={{ marginTop: '0.5rem' }}>
            <img
              src={playerPlaceholderImage}
              alt="Placeholder preview"
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      {/* ─── Section 9: WhatsApp Country Code ──────────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">📱 WhatsApp Settings</h3>
        <p className="admin-section-desc">Default country code prepended to player phone numbers for WhatsApp links. Use without + (e.g. 91 for India, 1 for US).</p>
        <div className="admin-form-field">
          <label>Default Country Code</label>
          <input
            type="text"
            value={defaultCountryCode}
            onChange={e => setDefaultCountryCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="91"
            className="admin-input admin-input-sm"
          />
        </div>
      </div>

      {/* ─── Section 10: Mirror Screen Preload ─────────────────────────────── */}
      <div className="admin-section-card">
        <h3 className="admin-section-title">🖥️ Mirror Screen Preload</h3>
        <p className="admin-section-desc">
          When enabled, the mirror screen caches all player images, team logos, and sponsor media persistently across browser sessions. Open the mirror screen once before the auction to warm the cache — subsequent loads will be instant.
        </p>
        <div className="admin-form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={mirrorPreloadPersist}
              onChange={e => setMirrorPreloadPersist(e.target.checked)}
            />
            Persist preloaded media across sessions
          </label>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => {
            try {
              sessionStorage.removeItem('bootPreloadDone_v1');
              localStorage.removeItem('bootPreloadDone_persist_v1');
              alert('Preload cache cleared. Next mirror load will re-download all media.');
            } catch { /* ignore */ }
          }}
        >
          Clear Preload Cache
        </button>
      </div>
    </div>
  );
}
