export function resolvePlayerImageUrl(
  playerId: string,
  lineupImageUrl?: string,
  savedPlayerImages?: Record<string, string>,
): string | undefined {
  return savedPlayerImages?.[playerId] || lineupImageUrl;
}