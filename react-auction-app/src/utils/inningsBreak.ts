export function isInningsBreak(status: {
  firstInningsComplete: boolean;
  currentInnings?: number;
  secondInningsStarted: boolean;
}): boolean {
  return status.firstInningsComplete && status.currentInnings === 1 && !status.secondInningsStarted;
}