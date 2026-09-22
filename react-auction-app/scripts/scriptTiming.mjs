const startedAt = new Date();

function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(2)}s`;
}

export function startScriptTimer(label) {
  const start = Date.now();
  console.log(`[${label}] startedAt=${startedAt.toISOString()}`);

  process.once('exit', (code) => {
    const endedAt = new Date();
    console.log(`[${label}] endedAt=${endedAt.toISOString()} duration=${formatDuration(Date.now() - start)} exitCode=${code}`);
  });
}
