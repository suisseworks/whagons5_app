/**
 * BarcodeScannerModal - Full-screen camera-based barcode scanner.
 *
 * Lazy-loads expo-camera so the app doesn't crash if the native module
 * isn't available (e.g. running in Expo Go without a dev client rebuild).
 * Falls back to a manual text-entry prompt when the camera is unavailable.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamilies, fontSizes, radius } from '../config/designTokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIEWFINDER_WIDTH = SCREEN_WIDTH * 0.8;
const VIEWFINDER_HEIGHT = VIEWFINDER_WIDTH * 0.5;

// ---------------------------------------------------------------------------
// Lazy-loaded expo-camera references
// ---------------------------------------------------------------------------
let CameraModule: typeof import('expo-camera') | null = null;
let cameraLoadError = false;

async function loadCameraModule() {
  if (CameraModule) return CameraModule;
  if (cameraLoadError) return null;
  try {
    CameraModule = await import('expo-camera');
    return CameraModule;
  } catch {
    cameraLoadError = true;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  visible,
  onClose,
  onScan,
}) => {
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualValue, setManualValue] = useState('');

  // Load the camera module when the modal opens
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const mod = await loadCameraModule();
      if (cancelled) return;
      if (!mod) {
        setCameraAvailable(false);
        return;
      }
      setCameraAvailable(true);

      // Request permission
      try {
        const { status } = await mod.Camera.requestCameraPermissionsAsync();
        if (!cancelled) setPermissionGranted(status === 'granted');
      } catch {
        if (!cancelled) setPermissionGranted(false);
      }
      if (!cancelled) setCameraReady(true);
    })();
    return () => { cancelled = true; };
  }, [visible]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setScanned(false);
      setCameraReady(false);
      setManualValue('');
    }
  }, [visible]);

  const handleBarcodeScanned = useCallback(
    (result: { data: string }) => {
      if (scanned) return;
      setScanned(true);
      onScan(result.data);
      onClose();
    },
    [scanned, onScan, onClose],
  );

  const handleManualSubmit = useCallback(() => {
    if (manualValue.trim()) {
      onScan(manualValue.trim());
      onClose();
    }
  }, [manualValue, onScan, onClose]);

  const handleClose = useCallback(() => {
    setScanned(false);
    onClose();
  }, [onClose]);

  // ---------------------------------------------------------------------------
  // Render content
  // ---------------------------------------------------------------------------
  const renderContent = () => {
    // Still loading
    if (cameraAvailable === null) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.messageText}>Loading camera...</Text>
        </View>
      );
    }

    // Camera not available - show manual entry
    if (!cameraAvailable || !permissionGranted) {
      return (
        <View style={styles.centered}>
          <MaterialIcons
            name={!cameraAvailable ? 'camera-alt' : 'no-photography'}
            size={64}
            color="rgba(255,255,255,0.5)"
          />
          <Text style={styles.messageText}>
            {!cameraAvailable
              ? 'Camera scanner requires a dev build.\nEnter barcode manually:'
              : 'Camera permission denied.\nEnter barcode manually:'}
          </Text>
          <View style={styles.manualInputRow}>
            <TextInput
              style={styles.manualInput}
              value={manualValue}
              onChangeText={setManualValue}
              placeholder="Enter barcode..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoFocus
              onSubmitEditing={handleManualSubmit}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.manualSubmitButton} onPress={handleManualSubmit}>
              <MaterialIcons name="check" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {!cameraAvailable && (
            <Text style={styles.hintSmall}>
              Run "npx expo prebuild --clean && npx expo run:android" to enable camera scanning
            </Text>
          )}
          {cameraAvailable && !permissionGranted && (
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={async () => {
                const mod = await loadCameraModule();
                if (mod) {
                  const { status } = await mod.Camera.requestCameraPermissionsAsync();
                  setPermissionGranted(status === 'granted');
                }
              }}
            >
              <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // Camera available and permitted - render CameraView
    if (CameraModule) {
      const { CameraView } = CameraModule;
      return (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: [
              'code128',
              'code39',
              'code93',
              'ean13',
              'ean8',
              'upc_a',
              'upc_e',
              'itf14',
              'codabar',
              'qr',
              'datamatrix',
              'pdf417',
            ],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        />
      );
    }

    return null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {renderContent()}

        {/* Viewfinder overlay - only when camera is active */}
        {cameraAvailable && permissionGranted && cameraReady && (
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.overlayDark} />
            <View style={styles.middleRow}>
              <View style={styles.overlayDark} />
              <View style={styles.viewfinder}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <View style={styles.overlayDark} />
            </View>
            <View style={styles.overlayDark} />
          </View>
        )}

        {/* Header bar */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Barcode</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Bottom hint */}
        {cameraAvailable && permissionGranted && cameraReady && (
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>
              Point your camera at a barcode
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
  },
  manualInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyMedium,
    color: '#FFFFFF',
  },
  manualSubmitButton: {
    marginLeft: 8,
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintSmall: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyRegular,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  permissionButton: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#000000',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayDark: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  middleRow: {
    flexDirection: 'row',
    height: VIEWFINDER_HEIGHT,
  },
  viewfinder: {
    width: VIEWFINDER_WIDTH,
    height: VIEWFINDER_HEIGHT,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FFFFFF',
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },
  hintContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
});

export default BarcodeScannerModal;
