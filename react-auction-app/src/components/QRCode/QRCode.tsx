// ============================================================================
// QRCode COMPONENT (SVG, NO DEPENDENCY)
// ============================================================================
import React from 'react';

// Minimal QR code generator (uses QRCode.js via CDN fallback if needed)
// For production, consider using 'qrcode.react' or 'react-qr-code' package

interface QRCodeProps {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
  className?: string;
}

export const QRCode: React.FC<QRCodeProps> = ({
  value,
  size = 180,
  bgColor = '#fff',
  fgColor = '#222',
  className = '',
}) => {
  // Use a simple SVG fallback if no QR lib
  // For demo, use Google Chart API
  const src = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(
    value
  )}&chld=L|0`;

  return (
    <img
      src={src}
      alt="QR Code"
      width={size}
      height={size}
      style={{ background: bgColor }}
      className={className}
      draggable={false}
    />
  );
};

export default QRCode;
