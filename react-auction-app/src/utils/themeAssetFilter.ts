export function getThemeAssetFilter(primary: string, secondary: string, manualHueRotate?: number): string {
  const normalizedPrimary = primary.trim().replace('#', '');
  const normalizedSecondary = secondary.trim().replace('#', '');
  const toRgb = (color: string) => {
    if (!/^[\da-f]{6}$/i.test(color)) return null;
    return [0, 2, 4].map(index => Number.parseInt(color.slice(index, index + 2), 16));
  };

  const primaryRgb = toRgb(normalizedPrimary);
  const secondaryRgb = toRgb(normalizedSecondary);
  if (!primaryRgb || !secondaryRgb) {
    return 'grayscale(1) sepia(1) saturate(230%) hue-rotate(356deg) brightness(1.01) contrast(0.93)';
  }

  const average = primaryRgb.map((value, index) => (value + secondaryRgb[index]) / 2);
  const max = Math.max(...average);
  const min = Math.min(...average);
  const lightness = (max + min) / 510;
  const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(2 * lightness - 1) * 255);
  const hue = (() => {
    if (max === min) return 42;
    const [red, green, blue] = average.map(value => value / 255);
    if (max === red) return 60 * (((green - blue) / (max / 255 - min / 255)) % 6);
    if (max === green) return 60 * ((blue - red) / (max / 255 - min / 255) + 2);
    return 60 * ((red - green) / (max / 255 - min / 255) + 4);
  })();
  const hueRotation = typeof manualHueRotate === 'number' && Number.isFinite(manualHueRotate)
    ? manualHueRotate
    : hue - 42;

  return [
    'grayscale(0)',
    `sepia(${Math.min(0.45, 0.08 + saturation * 0.18).toFixed(2)})`,
    `saturate(${(1.35 + saturation * 2.1).toFixed(2)})`,
    `hue-rotate(${Math.round(hueRotation)}deg)`,
    `brightness(${(0.82 + lightness * 0.42).toFixed(2)})`,
    `contrast(${(0.92 + saturation * 0.35).toFixed(2)})`,
  ].join(' ');
}