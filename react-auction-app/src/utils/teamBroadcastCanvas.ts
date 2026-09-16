import { getImg, type TickerPosition } from './broadcastCanvas';
import { teamScoreboard, type TeamBroadcastState } from './teamScoreboard';

export function drawTeamScoreTicker(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  state: TeamBroadcastState, position: TickerPosition,
) {
  const board = teamScoreboard(state);
  if (!board) return;
  const config = state.config;
  const scale = Math.min(width / 1000, height / 560);
  const panelWidth = Math.min(900 * scale, width * 0.94);
  const panelHeight = 120 * scale;
  const left = (width - panelWidth) / 2;
  const top = position === 'top' ? 24 * scale : height - panelHeight - 24 * scale;
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(scale, scale);
  const logicalWidth = panelWidth / scale;
  ctx.fillStyle = config.primaryColor;
  ctx.fillRect(0, 0, logicalWidth, 120);
  ctx.fillStyle = config.secondaryColor;
  ctx.fillRect(0, 0, logicalWidth, 5);
  ctx.fillStyle = config.textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(`${board.homeScore} : ${board.awayScore}`, logicalWidth / 2, 48, 140);
  const teamWidth = (logicalWidth - 180) / 2;
  for (const [index, team] of [board.home, board.away].entries()) {
    const start = index === 0 ? 12 : logicalWidth - teamWidth;
    const image = team.logoUrl ? getImg(team.logoUrl) : null;
    if (image?.complete && image.naturalWidth) {
      const ratio = Math.min(44 / image.naturalWidth, 44 / image.naturalHeight);
      ctx.drawImage(image, start, 25, image.naturalWidth * ratio, image.naturalHeight * ratio);
    }
    ctx.font = 'bold 25px sans-serif';
    ctx.fillText(team.shortName || team.name, start + teamWidth / 2 + 16, 48, teamWidth - 80);
  }
  ctx.fillStyle = config.accentColor;
  ctx.font = 'bold 16px sans-serif';
  const status = [config.showLiveBadge && board.isLive ? 'LIVE' : '', board.phase, config.showTimer ? board.clock : ''].filter(Boolean);
  ctx.fillText(status.join(' | '), logicalWidth / 2, 84, logicalWidth - 32);
  ctx.fillStyle = config.textColor;
  ctx.font = '14px sans-serif';
  ctx.fillText(board.details || config.tournamentName || state.match?.competition || '', logicalWidth / 2, 106, logicalWidth - 32);
  ctx.restore();
}