// ============================================================================
// QRCode COMPONENT - Using qrcode.react library
// ============================================================================
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

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
  bgColor = '#ffffff',
  fgColor = '#000000',
  className = '',
}) => {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      bgColor={bgColor}
      fgColor={fgColor}
      level="M"
      marginSize={2}
      className={className}
    />
  );
};

export default QRCode;
