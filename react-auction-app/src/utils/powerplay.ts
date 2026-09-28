export function isPowerplayOver(
  overs: number,
  enabled: boolean | undefined,
  selectedOvers: string | undefined,
  legacyOvers: number,
): boolean {
  if (enabled === false) return false;

  const roundedOvers = Math.round(overs * 10) / 10;
  const currentOver = Math.floor(roundedOvers) + 1;
  if (selectedOvers?.trim()) {
    return selectedOvers.split(',').some((part) => {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) return false;
      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);
      return start > 0 && end >= start && currentOver >= start && currentOver <= end;
    });
  }

  return currentOver <= legacyOvers;
}