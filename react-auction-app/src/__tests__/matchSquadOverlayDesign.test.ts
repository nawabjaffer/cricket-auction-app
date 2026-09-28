import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN } from '../types/matchSquadOverlay';
import { normalizeMatchSquadOverlayDesign } from '../utils/matchSquadOverlayDesign';

describe('normalizeMatchSquadOverlayDesign', () => {
  it('clamps numeric values and falls back from invalid colors and image fit', () => {
    expect(normalizeMatchSquadOverlayDesign({
      panelOpacity: 140,
      portraitHeight: 40,
      accentColor: 'blue',
      imageFit: 'stretch',
    })).toMatchObject({
      panelOpacity: 100,
      portraitHeight: 120,
      accentColor: DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN.accentColor,
      imageFit: 'contain',
    });
  });

  it('preserves phase visibility and clamps phase durations and reveal interval', () => {
    expect(normalizeMatchSquadOverlayDesign({
      showImpactPlayers: false,
      squadDisplayDurationMs: 200,
      playerRevealIntervalMs: 9000,
      squadRevealHoldDurationMs: 90000,
    })).toMatchObject({
      showImpactPlayers: false,
      squadDisplayDurationMs: 500,
      playerRevealIntervalMs: 2000,
      squadRevealHoldDurationMs: 60000,
    });
  });
});