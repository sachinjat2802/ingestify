import { lookup } from 'mime-types';

/**
 * Detect MIME type from file name or extension.
 * Falls back to 'application/octet-stream' if unknown.
 */
export function detectMimeType(fileName: string): string {
  return lookup(fileName) || 'application/octet-stream';
}

/**
 * Get file extension from filename (without dot).
 */
export function getExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Check if a MIME type matches an allowed type pattern.
 * Supports exact match and wildcard patterns like 'text/*'.
 */
export function matchesMimeType(mimeType: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '*/*') return true;
  if (pattern === mimeType) return true;

  // Handle extension patterns like '.pdf', '.csv'
  if (pattern.startsWith('.')) {
    const ext = getExtension(pattern);
    const mimeFromExt = lookup(ext);
    return mimeFromExt === mimeType;
  }

  // Handle wildcard like 'text/*'
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return mimeType.startsWith(prefix + '/');
  }

  return false;
}

/**
 * Human-readable file size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * Parse a human-readable file size string (e.g., '50mb') to bytes.
 */
export function parseFileSize(size: string | number): number {
  if (typeof size === 'number') return size;

  const match = size.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!match) throw new Error(`Invalid file size: "${size}"`);

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'b').toLowerCase();

  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]);
}
