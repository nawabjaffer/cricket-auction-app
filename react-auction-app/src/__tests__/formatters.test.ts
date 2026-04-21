import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyCompact,
  parseCurrency,
  formatPercentage,
  formatNumber,
  truncateText,
  formatPlayerRole,
  formatTeamShortName,
  formatFileSize,
  formatDuration,
  padNumber,
  formatDate,
  formatDateTime,
  formatRelativeTime,
} from '../utils/formatters';

describe('formatCurrency', () => {
  it('formats crore amounts', () => {
    expect(formatCurrency(10000000)).toBe('₹1.00 Cr');
    expect(formatCurrency(25000000)).toBe('₹2.50 Cr');
    expect(formatCurrency(150000000)).toBe('₹15.00 Cr');
  });

  it('formats lakh amounts', () => {
    expect(formatCurrency(100000)).toBe('₹1.00 L');
    expect(formatCurrency(550000)).toBe('₹5.50 L');
    expect(formatCurrency(9999999)).toBe('₹100.00 L');
  });

  it('formats small amounts in INR locale', () => {
    expect(formatCurrency(0)).toMatch(/₹0/);
    expect(formatCurrency(1000)).toMatch(/₹/);
  });

  it('handles negative amounts', () => {
    expect(formatCurrency(-100000)).toBe('₹-1,00,000');
  });
});

describe('formatCurrencyCompact', () => {
  it('formats crores compactly', () => {
    expect(formatCurrencyCompact(10000000)).toBe('1.0Cr');
    expect(formatCurrencyCompact(25500000)).toBe('2.5Cr');
  });

  it('formats lakhs compactly', () => {
    expect(formatCurrencyCompact(100000)).toBe('1.0L');
    expect(formatCurrencyCompact(550000)).toBe('5.5L');
  });

  it('formats thousands compactly', () => {
    expect(formatCurrencyCompact(5000)).toBe('5K');
    expect(formatCurrencyCompact(99999)).toBe('100K');
  });

  it('formats small amounts as plain string', () => {
    expect(formatCurrencyCompact(500)).toBe('500');
    expect(formatCurrencyCompact(0)).toBe('0');
  });
});

describe('parseCurrency', () => {
  it('parses crore strings', () => {
    expect(parseCurrency('1Cr')).toBe(10000000);
    expect(parseCurrency('₹2.5 Cr')).toBe(25000000);
  });

  it('parses lakh strings', () => {
    expect(parseCurrency('1L')).toBe(100000);
    expect(parseCurrency('₹5.5L')).toBe(550000);
  });

  it('parses thousand strings', () => {
    expect(parseCurrency('10K')).toBe(10000);
  });

  it('parses plain numbers', () => {
    expect(parseCurrency('5000')).toBe(5000);
    expect(parseCurrency('₹1,000')).toBe(1000);
  });

  it('returns 0 for invalid input', () => {
    expect(parseCurrency('abc')).toBe(0);
    expect(parseCurrency('')).toBe(0);
  });
});

describe('formatPercentage', () => {
  it('formats with default decimals', () => {
    expect(formatPercentage(75.123)).toBe('75.1%');
  });

  it('formats with custom decimals', () => {
    expect(formatPercentage(75.123, 2)).toBe('75.12%');
    expect(formatPercentage(100, 0)).toBe('100%');
  });
});

describe('formatNumber', () => {
  it('formats numbers with locale', () => {
    const result = formatNumber(1234567);
    expect(result).toMatch(/1.*2.*3.*4.*5.*6.*7/);
  });
});

describe('truncateText', () => {
  it('returns full text when short enough', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
  });

  it('truncates and adds ellipsis', () => {
    expect(truncateText('Hello World', 8)).toBe('Hello...');
  });

  it('handles exact length', () => {
    expect(truncateText('Hello', 5)).toBe('Hello');
  });
});

describe('formatPlayerRole', () => {
  it('maps known roles', () => {
    expect(formatPlayerRole('Batsman')).toBe('BAT');
    expect(formatPlayerRole('Bowler')).toBe('BOWL');
    expect(formatPlayerRole('All-Rounder')).toBe('AR');
    expect(formatPlayerRole('Wicket-Keeper')).toBe('WK');
    expect(formatPlayerRole('Wicket Keeper')).toBe('WK');
    expect(formatPlayerRole('Wicket Keeper Batsman')).toBe('WK');
  });

  it('truncates unknown roles', () => {
    expect(formatPlayerRole('CustomRole')).toBe('CUS');
  });
});

describe('formatTeamShortName', () => {
  it('returns first 3 characters uppercased', () => {
    expect(formatTeamShortName('Mumbai Indians')).toBe('MUM');
    expect(formatTeamShortName('AB')).toBe('AB');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats KB', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats MB', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('formats GB', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3725000)).toBe('1h 2m');
  });
});

describe('padNumber', () => {
  it('pads with leading zeros', () => {
    expect(padNumber(5, 3)).toBe('005');
    expect(padNumber(42, 4)).toBe('0042');
  });

  it('returns as-is when already long enough', () => {
    expect(padNumber(123, 2)).toBe('123');
  });
});

describe('formatDate', () => {
  it('formats Date object', () => {
    const d = new Date('2024-06-15T12:00:00Z');
    const result = formatDate(d);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Jun/i);
    expect(result).toMatch(/2024/);
  });

  it('formats date string', () => {
    const result = formatDate('2024-01-01');
    expect(result).toMatch(/2024/);
  });

  it('formats timestamp number', () => {
    const result = formatDate(1700000000000);
    expect(result).toMatch(/2023/);
  });
});

describe('formatDateTime', () => {
  it('formats date with time', () => {
    const d = new Date('2024-06-15T14:30:00Z');
    const result = formatDateTime(d);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });
});

describe('formatRelativeTime', () => {
  it('shows seconds ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 30000); // 30s ago
    expect(formatRelativeTime(date)).toMatch(/\d+s ago/);
  });

  it('shows minutes ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 300000); // 5m ago
    expect(formatRelativeTime(date)).toMatch(/\d+m ago/);
  });

  it('shows hours ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 7200000); // 2h ago
    expect(formatRelativeTime(date)).toMatch(/\d+h ago/);
  });

  it('shows days ago', () => {
    const now = new Date();
    const date = new Date(now.getTime() - 259200000); // 3d ago
    expect(formatRelativeTime(date)).toMatch(/\d+d ago/);
  });

  it('shows formatted date for old dates', () => {
    const oldDate = new Date('2020-01-01');
    const result = formatRelativeTime(oldDate);
    expect(result).toMatch(/2020/);
  });
});
