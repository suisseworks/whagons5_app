import React, { useRef, useCallback, useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';
import { radius } from '../config/designTokens';

interface SignaturePadProps {
  value?: string | null;
  onChange: (signature: string | null) => void;
  disabled?: boolean;
  strokeColor?: string;
  borderColor?: string;
  backgroundColor?: string;
  height?: number;
}

function buildSvgDataUri(
  paths: string[],
  width: number,
  height: number,
  strokeColor: string,
): string {
  const pathElements = paths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${pathElements}</svg>`;

  const encoded = btoa(svg);
  return `data:image/svg+xml;base64,${encoded}`;
}

/** Renders a saved signature from its data URI (base64 SVG or PNG) */
const ExistingSignature: React.FC<{ value: string }> = ({ value }) => {
  const svgXml = useMemo(() => {
    // Decode base64 SVG data URI → raw SVG string
    if (value.startsWith('data:image/svg+xml;base64,')) {
      try {
        return atob(value.slice('data:image/svg+xml;base64,'.length));
      } catch { return null; }
    }
    return null;
  }, [value]);

  if (svgXml) {
    return (
      <View style={styles.preview}>
        <SvgXml xml={svgXml} width="100%" height="100%" />
      </View>
    );
  }

  // Fallback for PNG data URIs from web signatures
  const { Image } = require('react-native');
  return <Image source={{ uri: value }} style={styles.preview} resizeMode="contain" />;
};

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  disabled = false,
  strokeColor = '#000000',
  borderColor = '#E6E1D7',
  backgroundColor = 'transparent',
  height = 180,
}) => {
  const [paths, setPaths] = useState<string[]>([]);
  const currentPath = useRef<string>('');
  const [currentPathDisplay, setCurrentPathDisplay] = useState<string>('');
  const sizeRef = useRef({ width: 300, height });

  const hasDrawing = paths.length > 0 || currentPathDisplay.length > 0;
  const hasExistingValue = !!value && paths.length === 0 && !currentPathDisplay;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    sizeRef.current = { width: Math.round(w), height: Math.round(h) };
  }, []);

  const emitChange = useCallback(
    (allPaths: string[]) => {
      if (allPaths.length === 0) {
        onChange(null);
        return;
      }
      const { width, height: h } = sizeRef.current;
      onChange(buildSvgDataUri(allPaths, width, h, strokeColor));
    },
    [onChange, strokeColor],
  );

  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(!disabled && !hasExistingValue)
    .minDistance(0)
    .onBegin((e) => {
      currentPath.current = `M ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
      setCurrentPathDisplay(currentPath.current);
    })
    .onUpdate((e) => {
      currentPath.current += ` L ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
      setCurrentPathDisplay(currentPath.current);
    })
    .onEnd(() => {
      if (currentPath.current) {
        const newPaths = [...paths, currentPath.current];
        setPaths(newPaths);
        currentPath.current = '';
        setCurrentPathDisplay('');
        emitChange(newPaths);
      }
    });

  const clear = useCallback(() => {
    setPaths([]);
    currentPath.current = '';
    setCurrentPathDisplay('');
    onChange(null);
  }, [onChange]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <View
        style={[
          styles.container,
          {
            borderColor,
            backgroundColor,
            height,
          },
        ]}
        onLayout={onLayout}
      >
        {hasExistingValue ? (
          <ExistingSignature value={value!} />
        ) : (
          <GestureDetector gesture={pan}>
            <View style={styles.canvas}>
              <Svg style={StyleSheet.absoluteFill}>
                {paths.map((d, i) => (
                  <Path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentPathDisplay ? (
                  <Path
                    d={currentPathDisplay}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
              </Svg>
            </View>
          </GestureDetector>
        )}

        {/* Clear button */}
        {!disabled && (hasDrawing || hasExistingValue) && (
          <TouchableOpacity
            style={[styles.clearButton, { borderColor }]}
            onPress={clear}
            activeOpacity={0.7}
          >
            <MaterialIcons name="delete-outline" size={18} color="#F44336" />
          </TouchableOpacity>
        )}
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  container: {
    width: '100%',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  canvas: {
    flex: 1,
  },
  preview: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  clearButton: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SignaturePad;
