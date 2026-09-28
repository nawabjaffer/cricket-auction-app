export function normalizePlayerName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s.'’\-])(\p{L})/gu, (_match, separator: string, letter: string) => (
      `${separator}${letter.toUpperCase()}`
    ));
}