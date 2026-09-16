// ============================================================================
// SCORER PAGE REGISTRY — single source of truth mapping each supported game
// type to its dedicated scorer/admin/overlay pages. Routes and routers must
// look pages up here instead of hardcoding a sport's component.
// ============================================================================

import type { ReactNode } from 'react';
import { ALL_SPORTS, type SportKey } from '../services/tenantService';

import ScoringAdminPage from './ScoringAdminPage';
import ScoreUpdatePage from './ScoreUpdatePage';
import ScoreOBSOverlayPage from './ScoreOBSOverlayPage';
import ScoreCameraPage from './ScoreCameraPage';
import ScoreCameraAdminPage from './ScoreCameraAdminPage';
import ScoreCameraHostPage from './ScoreCameraHostPage';
import ScoreOBSControlDock from './ScoreOBSControlDock';
import LiveQuestionPage from './LiveQuestionPage';

import FootballAdminPage from './FootballAdminPage';
import FootballUpdatePage from './FootballUpdatePage';
import FootballOBSOverlayPage from './FootballOBSOverlayPage';
import FootballOBSDockPage from './FootballOBSDockPage';

import KabaddiAdminPage from './KabaddiAdminPage';
import KabaddiUpdatePage from './KabaddiUpdatePage';
import KabaddiOBSOverlayPage from './KabaddiOBSOverlayPage';
import KabaddiOBSDockPage from './KabaddiOBSDockPage';

export type ScorerRouteKey =
  | 'admin' | 'update' | 'overlay' | 'obs-dock'
  | 'camera' | 'camera-admin' | 'camera-host' | 'live-question';

/** Sports that currently have an implemented scorer workspace. */
export type SupportedGameType = Extract<SportKey, 'cricket' | 'football' | 'kabaddi'>;

export const SUPPORTED_GAME_TYPES: SupportedGameType[] = ['cricket', 'football', 'kabaddi'];

export function isSupportedGameType(value: string | null | undefined): value is SupportedGameType {
  return SUPPORTED_GAME_TYPES.includes(value as SupportedGameType);
}

export function gameTypeLabel(gameType: SupportedGameType): string {
  return ALL_SPORTS.find(s => s.key === gameType)?.label ?? gameType;
}

const GAME_TYPE_ICON: Record<SupportedGameType, string> = { cricket: '🏏', football: '⚽', kabaddi: '🤼' };

export function gameTypeIcon(gameType: SupportedGameType): string {
  return GAME_TYPE_ICON[gameType] ?? '🏆';
}

/** Builds a fresh element map on every call — cheap, safe to call per render. */
export function buildScorerPages(): Record<SupportedGameType, Partial<Record<ScorerRouteKey, ReactNode>>> {
  return {
    cricket: {
      admin: <ScoringAdminPage />,
      update: <ScoreUpdatePage />,
      overlay: <ScoreOBSOverlayPage />,
      camera: <ScoreCameraPage />,
      'camera-admin': <ScoreCameraAdminPage />,
      'camera-host': <ScoreCameraHostPage />,
      'obs-dock': <ScoreOBSControlDock />,
      'live-question': <LiveQuestionPage />,
    },
    football: {
      admin: <FootballAdminPage />,
      update: <FootballUpdatePage />,
      overlay: <FootballOBSOverlayPage />,
      camera: <ScoreCameraPage key="football-camera" gameType="football" />,
      'camera-host': <ScoreCameraHostPage key="football-camera-host" gameType="football" />,
      'obs-dock': <FootballOBSDockPage />,
    },
    kabaddi: {
      admin: <KabaddiAdminPage />,
      update: <KabaddiUpdatePage />,
      overlay: <KabaddiOBSOverlayPage />,
      camera: <ScoreCameraPage key="kabaddi-camera" gameType="kabaddi" />,
      'camera-host': <ScoreCameraHostPage key="kabaddi-camera-host" gameType="kabaddi" />,
      'obs-dock': <KabaddiOBSDockPage />,
    },
  };
}
