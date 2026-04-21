import { PixelRatio } from 'react-native';

export type ImgproxyResizeMode = 'fit' | 'fill' | 'auto' | 'force';

interface ImgproxyOptions {
  width?: number;
  height?: number;
  mode?: ImgproxyResizeMode;
  maxDpr?: number;
}

const DEFAULT_IMGPROXY_URL = 'https://imgproxy.whagons.com';
const MAX_DIMENSION = 4096;

function getImgproxyBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_IMGPROXY_URL || DEFAULT_IMGPROXY_URL).trim().replace(/\/+$/, '');
}

function fixConvexStorageUrl(url: string): string {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return url;

  try {
    const expected = new URL(convexUrl);
    const actual = new URL(url);

    const isConvexLikeSource =
      actual.pathname.includes('/api/storage/') ||
      actual.hostname.includes('convex') ||
      actual.hostname.startsWith('cvx-');

    if (!isConvexLikeSource) {
      return url;
    }

    if (actual.hostname !== expected.hostname) {
      actual.hostname = expected.hostname;
      return actual.toString();
    }
  } catch {}

  return url;
}

function getConvexHost(): string | null {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;

  try {
    return new URL(convexUrl).hostname;
  } catch {
    return null;
  }
}

function getBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getTargetDimension(value?: number, maxDpr = 2): number {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  const dpr = Math.min(PixelRatio.get() || 1, maxDpr);
  return Math.min(MAX_DIMENSION, Math.max(1, Math.round(value * dpr)));
}

export function getOptimizedImageUrl(url?: string | null, options: ImgproxyOptions = {}): string | null {
  if (!url) return null;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;

  const normalized = fixConvexStorageUrl(url);

  try {
    const source = new URL(normalized);
    const proxy = new URL(getImgproxyBaseUrl());
    const convexHost = getConvexHost();

    if (!convexHost) {
      return normalized;
    }

    if (source.origin === proxy.origin) {
      return normalized;
    }

    if (source.hostname !== convexHost && !source.pathname.includes('/api/storage/')) {
      return normalized;
    }
  } catch {
    return normalized;
  }

  const width = getTargetDimension(options.width, options.maxDpr);
  const height = getTargetDimension(options.height, options.maxDpr);

  if (width === 0 && height === 0) {
    return normalized;
  }

  const mode = options.mode || 'fit';
  return `${getImgproxyBaseUrl()}/unsafe/rs:${mode}:${width}:${height}:0/${getBase64Url(normalized)}`;
}
