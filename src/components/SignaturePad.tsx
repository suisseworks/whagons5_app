import React, { useRef, useCallback, useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  LayoutChangeEvent,
  Modal,
  Text,
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';
import { radius, fontFamilies, fontSizes } from '../config/designTokens';
import { useTheme } from '../context/ThemeContext';

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
  _width: number,
  _height: number,
  strokeColor: string,
): string {
  // Compute bounding box of all path coordinates so the viewBox fits the
  // actual drawing, not the full-screen canvas. This makes the preview
  // look correct regardless of container size.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const numRegex = /[ML]\s*([\d.]+)\s+([\d.]+)/g;
  for (const d of paths) {
    let m: RegExpExecArray | null;
    numRegex.lastIndex = 0;
    while ((m = numRegex.exec(d)) !== null) {
      const x = parseFloat(m[1]);
      const y = parseFloat(m[2]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const pad = 10;
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = _width; maxY = _height; }
  const vx = Math.max(0, minX - pad);
  const vy = Math.max(0, minY - pad);
  const vw = (maxX - minX) + pad * 2;
  const vh = (maxY - minY) + pad * 2;

  const pathElements = paths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">${pathElements}</svg>`;

  const encoded = btoa(svg);
  return `data:image/svg+xml;base64,${encoded}`;
}

/** Renders a saved signature from its data URI (base64 SVG or PNG) */
const ExistingSignature: React.FC<{ value: string; style?: any; strokeColor?: string }> = ({
  value,
  style,
  strokeColor,
}) => {
  const svgXml = useMemo(() => {
    if (value.startsWith('data:image/svg+xml;base64,')) {
      try {
        const decoded = atob(value.slice('data:image/svg+xml;base64,'.length));
        if (!strokeColor) return decoded;
        return decoded.replace(/stroke="[^"]*"/g, `stroke="${strokeColor}"`);
      } catch { return null; }
    }
    return null;
  }, [strokeColor, value]);

  if (svgXml) {
    return (
      <View style={[styles.preview, style]}>
        <SvgXml xml={svgXml} width="100%" height="100%" />
      </View>
    );
  }

  const { Image } = require('react-native');
  return <Image source={{ uri: value }} style={[styles.preview, style]} resizeMode="contain" />;
};

// ---------------------------------------------------------------------------
// Full-screen signature editor modal
// ---------------------------------------------------------------------------

const SignatureEditorModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSave: (dataUri: string) => void;
  strokeColor: string;
  initialValue?: string | null;
}> = ({ visible, onClose, onSave, strokeColor }) => {
  const { colors, primaryColor, isDarkMode } = useTheme();
  // Use refs for paths to avoid stale closures in gesture callbacks
  const pathsRef = useRef<string[]>([]);
  const [pathsState, setPathsState] = useState<string[]>([]);
  const currentPath = useRef<string>('');
  const [currentPathDisplay, setCurrentPathDisplay] = useState<string>('');
  const sizeRef = useRef({ width: 300, height: 300 });

  const hasDrawing = pathsState.length > 0 || currentPathDisplay.length > 0;

  // Get screen dimensions — we rotate the content so width↔height swap
  const { width: screenW, height: screenH } = Dimensions.get('screen');
  const landscapeW = Math.max(screenW, screenH);
  const landscapeH = Math.min(screenW, screenH);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    sizeRef.current = { width: Math.round(w), height: Math.round(h) };
  }, []);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      currentPath.current = `M ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
      setCurrentPathDisplay(currentPath.current);
    })
    .onUpdate((e) => {
      currentPath.current += ` L ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
      setCurrentPathDisplay(currentPath.current);
    })
    .onFinalize(() => {
      const finishedPath = currentPath.current;
      if (finishedPath) {
        const newPaths = [...pathsRef.current, finishedPath];
        pathsRef.current = newPaths;
        setPathsState(newPaths);
        currentPath.current = '';
        setCurrentPathDisplay('');
      }
    });

  const clear = useCallback(() => {
    pathsRef.current = [];
    setPathsState([]);
    currentPath.current = '';
    setCurrentPathDisplay('');
  }, []);

  const handleSave = useCallback(() => {
    const allPaths = pathsRef.current;
    if (allPaths.length === 0) {
      onClose();
      return;
    }
    const { width, height } = sizeRef.current;
    const dataUri = buildSvgDataUri(allPaths, width, height, strokeColor);
    onSave(dataUri);
  }, [strokeColor, onSave, onClose]);

  const handleShow = useCallback(() => {
    pathsRef.current = [];
    setPathsState([]);
    currentPath.current = '';
    setCurrentPathDisplay('');
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onShow={handleShow}
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        {/* Rotate the entire content 90° to simulate landscape.
            After rotation, the physical notch/status-bar side maps to the
            left edge, so we add horizontal padding to keep content clear. */}
        <View
          style={{
            width: landscapeW,
            height: landscapeH,
            transform: [{ rotate: '90deg' }],
            position: 'absolute',
            top: (screenH - landscapeH) / 2,
            left: (screenW - landscapeW) / 2,
            backgroundColor: colors.background,
            paddingLeft: 44,
            paddingRight: 44,
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          {/* Top bar: Cancel — title — Done */}
          <View style={[styles.modalHeader, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E5E5E5' }]}>
            <TouchableOpacity onPress={onClose} style={styles.modalHeaderButton}>
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Sign</Text>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.modalHeaderButton, !hasDrawing && { opacity: 0.4 }]}
              disabled={!hasDrawing}
            >
              <Text
                style={[
                  styles.modalSaveText,
                  { color: hasDrawing ? primaryColor : colors.textSecondary },
                ]}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>

          {/* Canvas */}
          <View
            style={[
              styles.modalCanvasWrapper,
              {
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E5E5E5',
                backgroundColor: colors.surface,
              },
            ]}
            onLayout={onLayout}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.modalCanvas}>
                <Svg style={StyleSheet.absoluteFill}>
                  {pathsState.map((d, i) => (
                    <Path
                      key={i}
                      d={d}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {currentPathDisplay ? (
                    <Path
                      d={currentPathDisplay}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                </Svg>

                {/* Signature line hint */}
                <View
                  style={[
                    styles.signatureLine,
                    { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.18)' : '#D1D5DB' },
                  ]}
                />
              </View>
            </GestureDetector>
          </View>

          {/* Footer: Clear button */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              onPress={clear}
              style={[
                styles.modalClearButton,
                {
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E5E5E5',
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                },
                !hasDrawing && { opacity: 0.4 },
              ]}
              disabled={!hasDrawing}
            >
              <MaterialIcons name="delete-outline" size={20} color="#F44336" />
              <Text style={styles.modalClearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// SignaturePad — display-only with edit/clear buttons
// ---------------------------------------------------------------------------

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  disabled = false,
  strokeColor = '#000000',
  borderColor = '#E6E1D7',
  backgroundColor = 'transparent',
  height = 150,
}) => {
  const { isDarkMode, colors } = useTheme();
  const [editorVisible, setEditorVisible] = useState(false);
  const hasValue = !!value;

  const handleSave = useCallback((dataUri: string) => {
    onChange(dataUri);
    setEditorVisible(false);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  if (disabled) {
    // Read-only: just show the signature or empty state
    return (
      <View style={[styles.container, { borderColor, backgroundColor, height }]}>
        {hasValue ? (
          <ExistingSignature value={value!} strokeColor={strokeColor} />
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="draw" size={24} color={colors.textSecondary} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      {/* Display area */}
      <View style={[styles.container, { borderColor, backgroundColor, height }]}>
        {hasValue ? (
          <ExistingSignature value={value!} strokeColor={strokeColor} />
        ) : (
          <TouchableOpacity
            style={styles.emptyTappable}
            onPress={() => setEditorVisible(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="draw" size={28} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Tap to sign</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Action buttons */}
      {hasValue && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                borderColor,
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255, 255, 255, 0.9)',
              },
            ]}
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <MaterialIcons name="delete-outline" size={16} color="#F44336" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                borderColor,
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255, 255, 255, 0.9)',
              },
            ]}
            onPress={() => setEditorVisible(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="edit" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Full-screen editor */}
      <SignatureEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        onSave={handleSave}
        strokeColor={strokeColor}
        initialValue={value}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  preview: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTappable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#9E9E9E',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal styles
  modalRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  modalHeaderButton: {
    minWidth: 70,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  modalTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.bodySemibold,
    color: '#000',
  },
  modalCancelText: {
    fontSize: fontSizes.base,
    fontFamily: fontFamilies.bodyMedium,
    color: '#666',
  },
  modalSaveText: {
    fontSize: fontSizes.base,
    fontFamily: fontFamilies.bodySemibold,
    textAlign: 'right',
  },
  modalCanvasWrapper: {
    flex: 1,
    marginHorizontal: 8,
    marginVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
  },
  modalCanvas: {
    flex: 1,
    position: 'relative',
  },
  signatureLine: {
    position: 'absolute',
    bottom: '30%',
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  modalFooter: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    alignItems: 'center',
  },
  modalClearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  modalClearText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    color: '#F44336',
  },
});

export default SignaturePad;
