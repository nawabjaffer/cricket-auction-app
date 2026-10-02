import type { OBSReplayButton, OBSReplayConfig } from '../types/scoring';

export function resolveReplayButton(button: OBSReplayButton, config: OBSReplayConfig): OBSReplayButton {
  const isDRS = button.dockView ? button.dockView === 'drs' : button.id.startsWith('cricket-preset-drs-');
  if (button.action === 'drs_review') return {
    ...button, inputName: config.drsMediaInputName || button.inputName,
    sceneName: config.drsSceneName || button.sceneName,
    drsDurationSeconds: config.drsDurationSeconds || 40,
  };
  if (!isDRS) return button;
  if (button.id === 'cricket-preset-drs-live') return { ...button, sceneName: config.liveSceneName || button.sceneName };
  const direction = button.id.endsWith('-back-frame') ? -1 : button.id.endsWith('-forward-frame') ? 1 : 0;
  const frames = Math.max(1, Math.min(120, Math.round(config.drsFrameStep || Math.abs(button.mediaFrameOffset || 1))));
  return {
    ...button, inputName: config.drsMediaInputName || button.inputName,
    ...(direction ? {
      label: `${direction < 0 ? 'Reverse' : 'Forward'} ${frames} frame${frames === 1 ? '' : 's'}`,
      mediaFrameOffset: direction * frames,
      mediaFramesPerSecond: config.drsFramesPerSecond || button.mediaFramesPerSecond || 30,
    } : {}),
  };
}

export function getDockReplayButtons(config: OBSReplayConfig, view: 'main' | 'drs'): OBSReplayButton[] {
  return (config.buttons || [])
    .filter(button => button.enabled && button.showInDock !== false
      && ((button.dockView ? button.dockView === 'drs' : button.id.startsWith('cricket-preset-drs-')) === (view === 'drs')))
    .map(button => resolveReplayButton(button, config))
    .sort((left, right) => left.order - right.order);
}