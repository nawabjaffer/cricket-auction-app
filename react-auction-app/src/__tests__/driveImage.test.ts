import { describe, it, expect } from 'vitest';
import {
  extractDriveFileId,
  getDriveImageUrl,
  getProxiedDriveUrl,
  getAlternativeDriveUrl,
} from '../utils/driveImage';

describe('extractDriveFileId', () => {
  it('extracts ID from /file/d/ URLs', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/1abcDEF/view')).toBe('1abcDEF');
    expect(extractDriveFileId('https://drive.google.com/file/d/xyz123/view?usp=sharing')).toBe('xyz123');
  });

  it('extracts ID from ?id= URLs', () => {
    expect(extractDriveFileId('https://drive.google.com/uc?id=1abcDEF&export=view')).toBe('1abcDEF');
    expect(extractDriveFileId('https://drive.google.com/thumbnail?id=xyz123&sz=w800')).toBe('xyz123');
  });

  it('returns null for empty or non-Drive URLs', () => {
    expect(extractDriveFileId('')).toBeNull();
    expect(extractDriveFileId('https://example.com/image.jpg')).toBeNull();
  });

  it('returns null for invalid inputs', () => {
    expect(extractDriveFileId('not-a-url')).toBeNull();
  });
});

describe('getDriveImageUrl', () => {
  it('returns lh3 URL for Drive URLs', () => {
    const result = getDriveImageUrl('https://drive.google.com/file/d/abc123/view');
    expect(result).toBe('https://lh3.googleusercontent.com/d/abc123=w800');
  });

  it('returns null for non-Drive URLs', () => {
    expect(getDriveImageUrl('https://example.com/image.jpg')).toBeNull();
  });
});

describe('getProxiedDriveUrl', () => {
  it('returns proxy URL on localhost', () => {
    // In test environment (jsdom), hostname is 'localhost'
    const result = getProxiedDriveUrl('abc123');
    expect(result).toBe('/api/proxy-drive?id=abc123');
  });
});

describe('getAlternativeDriveUrl', () => {
  it('returns thumbnail URL for Drive URLs', () => {
    const result = getAlternativeDriveUrl('https://drive.google.com/file/d/abc123/view');
    expect(result).toBe('https://drive.google.com/thumbnail?id=abc123&sz=w600');
  });

  it('returns null for non-Drive URLs', () => {
    expect(getAlternativeDriveUrl('https://example.com/img.jpg')).toBeNull();
  });
});
