import React from 'react';
import { StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Image as ExpoImage, type ImageContentFit } from 'expo-image';

import { getOptimizedImageUrl, type ImgproxyResizeMode } from '../utils/imgproxy';

const PREVIEW_DIMENSION = 96;
const THUMBNAIL_DIMENSION = 320;
const RESPONSIVE_PRESETS = [320, 512, 768, 1024, 1440, 1920, 2560, 3200, 4096] as const;
const loadedStageSourcesByOriginal = new Map<string, Set<string>>();

function getPresetDimension(target: number): number {
  const normalized = Math.max(1, Math.ceil(target));
  for (const preset of RESPONSIVE_PRESETS) {
    if (normalized <= preset) return preset;
  }
  return RESPONSIVE_PRESETS[RESPONSIVE_PRESETS.length - 1];
}

function getLoadedStages(originalSrc?: string | null): Set<string> {
  if (!originalSrc) return new Set<string>();
  let loaded = loadedStageSourcesByOriginal.get(originalSrc);
  if (!loaded) {
    loaded = new Set<string>();
    loadedStageSourcesByOriginal.set(originalSrc, loaded);
  }
  return loaded;
}

function buildPresetUrl(
  src: string,
  width: number,
  height: number,
  mode: ImgproxyResizeMode,
  maxDpr: number,
  presetDimension: number,
): string | null {
  const longestEdge = Math.max(width, height, 1);
  const scale = presetDimension / longestEdge;
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));

  return getOptimizedImageUrl(src, {
    width: nextWidth,
    height: nextHeight,
    mode,
    maxDpr,
  });
}

interface ProgressiveImageProps {
  uri?: string | null;
  width: number;
  height: number;
  mode?: ImgproxyResizeMode;
  maxDpr?: number;
  contentFit?: ImageContentFit;
  style?: StyleProp<ImageStyle>;
  transition?: number;
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  includeOriginalAtEnd?: boolean;
  onError?: () => void;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  uri,
  width,
  height,
  mode = 'fit',
  maxDpr = 2,
  contentFit = 'cover',
  style,
  transition = 200,
  cachePolicy = 'disk',
  includeOriginalAtEnd = false,
  onError,
}) => {
  const stageSources = React.useMemo(() => {
    if (!uri) return [] as string[];

    const previewSrc = buildPresetUrl(uri, width, height, mode, 1, PREVIEW_DIMENSION);
    const thumbnailSrc = buildPresetUrl(uri, width, height, mode, 1, THUMBNAIL_DIMENSION);
    const optimizedSrc = buildPresetUrl(
      uri,
      width,
      height,
      mode,
      maxDpr,
      getPresetDimension(Math.max(width * maxDpr, height * maxDpr)),
    );

    const unique = Array.from(new Set([previewSrc, thumbnailSrc, optimizedSrc].filter(Boolean))) as string[];
    if (includeOriginalAtEnd) {
      unique.push(uri);
    }
    return Array.from(new Set(unique));
  }, [height, includeOriginalAtEnd, maxDpr, mode, uri, width]);

  const [stageIndex, setStageIndex] = React.useState(() => {
    if (!uri || stageSources.length === 0) return 0;
    const loaded = getLoadedStages(uri);
    for (let index = stageSources.length - 1; index >= 0; index -= 1) {
      if (loaded.has(stageSources[index])) return index;
    }
    return 0;
  });
  const [useOriginalFallback, setUseOriginalFallback] = React.useState(false);
  const previousOriginalRef = React.useRef<string | null | undefined>(uri);

  React.useEffect(() => {
    if (previousOriginalRef.current !== uri) {
      previousOriginalRef.current = uri;
      setUseOriginalFallback(false);
      if (!uri || stageSources.length === 0) {
        setStageIndex(0);
        return;
      }

      const loaded = getLoadedStages(uri);
      let nextIndex = 0;
      for (let index = stageSources.length - 1; index >= 0; index -= 1) {
        if (loaded.has(stageSources[index])) {
          nextIndex = index;
          break;
        }
      }
      setStageIndex(nextIndex);
      return;
    }

    if (stageIndex >= stageSources.length) {
      setStageIndex(Math.max(0, stageSources.length - 1));
    }
  }, [stageIndex, stageSources, uri]);

  const currentSource = React.useMemo(() => {
    if (!uri) return null;
    if (useOriginalFallback) return uri;
    return stageSources[Math.min(stageIndex, Math.max(0, stageSources.length - 1))] ?? uri;
  }, [stageIndex, stageSources, uri, useOriginalFallback]);

  if (!currentSource) {
    return null;
  }

  return (
    <ExpoImage
      source={{ uri: currentSource }}
      style={style as StyleProp<ImageStyle | ViewStyle>}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
      transition={transition}
      onLoad={() => {
        if (!uri) return;
        getLoadedStages(uri).add(currentSource);
        if (!useOriginalFallback && stageIndex < stageSources.length - 1) {
          setStageIndex((current) => (current < stageSources.length - 1 ? current + 1 : current));
        }
      }}
      onError={() => {
        if (useOriginalFallback) {
          onError?.();
          return;
        }

        if (stageIndex < stageSources.length - 1) {
          setStageIndex((current) => (current < stageSources.length - 1 ? current + 1 : current));
          return;
        }

        setUseOriginalFallback(true);
      }}
    />
  );
};
