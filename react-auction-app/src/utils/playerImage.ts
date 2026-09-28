export function preferMigratedPlayerImageUrl(...urls: Array<string | undefined | null>): string | undefined {
  const candidates = urls.map(url => url?.trim()).filter((url): url is string => Boolean(url));
  return candidates.find(url => /(?:firebasestorage\.googleapis\.com|firebasestorage\.app|storage\.googleapis\.com)/i.test(url))
    || candidates[0];
}

export function resolvePlayerImageUrl(
  playerId: string,
  lineupImageUrl?: string,
  savedPlayerImages?: Record<string, string>,
): string | undefined {
  return preferMigratedPlayerImageUrl(savedPlayerImages?.[playerId], lineupImageUrl);
}