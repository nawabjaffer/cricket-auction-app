// QR code renderer built from plain Views (no SVG / native dependency).
import React, { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';

export function QrCode({ value, size = 220 }: Readonly<{ value: string; size?: number }>) {
  const rows = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_unused, column) => qr.isDark(row, column)));
  }, [value]);

  const count = rows.length;
  const quiet = 2;
  const cell = size / (count + quiet * 2);
  return (
    <View
      accessible
      accessibilityLabel="QR code"
      style={{ width: size, height: size, backgroundColor: '#fff', padding: cell * quiet, borderRadius: 10 }}
    >
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', height: cell }}>
          {row.map((dark, columnIndex) => (
            <View key={columnIndex} style={{ width: cell, height: cell, backgroundColor: dark ? '#000' : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
  );
}
