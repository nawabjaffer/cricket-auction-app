import type { CSSProperties } from 'react';
import {
  DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN,
  type MatchSquadOverlayDesign,
} from '../types/matchSquadOverlay';

const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

export function normalizeMatchSquadOverlayDesign(value: unknown): MatchSquadOverlayDesign {
  const input = value && typeof value === 'object' ? value as Partial<MatchSquadOverlayDesign> : {};
  const defaults = DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN;
  return {
    panelColor: isHexColor(input.panelColor) ? input.panelColor : defaults.panelColor,
    panelOpacity: clamp(input.panelOpacity, 30, 100, defaults.panelOpacity),
    cardColor: isHexColor(input.cardColor) ? input.cardColor : defaults.cardColor,
    accentColor: isHexColor(input.accentColor) ? input.accentColor : defaults.accentColor,
    useTeamColors: input.useTeamColors !== false,
    textColor: isHexColor(input.textColor) ? input.textColor : defaults.textColor,
    mutedTextColor: isHexColor(input.mutedTextColor) ? input.mutedTextColor : defaults.mutedTextColor,
    portraitHeight: clamp(input.portraitHeight, 120, 300, defaults.portraitHeight),
    thumbnailSize: clamp(input.thumbnailSize, 32, 80, defaults.thumbnailSize),
    cardRadius: clamp(input.cardRadius, 0, 28, defaults.cardRadius),
    rowGap: clamp(input.rowGap, 2, 20, defaults.rowGap),
    imageFit: input.imageFit === 'cover' ? 'cover' : 'contain',
    showSquadDisplay: input.showSquadDisplay !== false,
    showTossAnimation: input.showTossAnimation !== false,
    showTossResult: input.showTossResult !== false,
    showSquadReveal: input.showSquadReveal !== false,
    showImpactPlayers: input.showImpactPlayers !== false,
    showMatchReady: input.showMatchReady !== false,
    squadDisplayDurationMs: clamp(input.squadDisplayDurationMs, 500, 120000, defaults.squadDisplayDurationMs),
    tossAnimationDurationMs: clamp(input.tossAnimationDurationMs, 500, 120000, defaults.tossAnimationDurationMs),
    tossResultDurationMs: clamp(input.tossResultDurationMs, 500, 120000, defaults.tossResultDurationMs),
    squadRevealDurationMs: clamp(input.squadRevealDurationMs, 500, 120000, defaults.squadRevealDurationMs),
    impactPlayersDurationMs: clamp(input.impactPlayersDurationMs, 500, 120000, defaults.impactPlayersDurationMs),
    matchReadyDurationMs: clamp(input.matchReadyDurationMs, 500, 120000, defaults.matchReadyDurationMs),
    squadRevealHoldDurationMs: clamp(input.squadRevealHoldDurationMs, 0, 60000, defaults.squadRevealHoldDurationMs),
    delayAfterTossMs: clamp(input.delayAfterTossMs, 0, 60000, defaults.delayAfterTossMs),
    playerRevealIntervalMs: clamp(input.playerRevealIntervalMs, 100, 2000, defaults.playerRevealIntervalMs),
  };
}

function rgba(hex: string, opacity: number): string {
  const value = hex.slice(1);
  const channels = [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${opacity / 100})`;
}

export function getMatchSquadOverlayStyle(
  design: MatchSquadOverlayDesign = DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN,
  teamColor?: string,
): CSSProperties {
  return {
    '--squad-panel-color': rgba(design.panelColor, design.panelOpacity),
    '--squad-card-color': design.cardColor,
    '--squad-accent-color': design.useTeamColors && teamColor ? teamColor : design.accentColor,
    '--squad-text-color': design.textColor,
    '--squad-muted-color': design.mutedTextColor,
    '--squad-portrait-height': `${design.portraitHeight}px`,
    '--squad-thumbnail-size': `${design.thumbnailSize}px`,
    '--squad-card-radius': `${design.cardRadius}px`,
    '--squad-row-gap': `${design.rowGap}px`,
    '--squad-image-fit': design.imageFit,
  } as CSSProperties;
}