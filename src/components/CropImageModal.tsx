/**
 * Modal de recorte por captura del viewport (react-native-view-shot).
 * Lo que el usuario ve dentro del marco se captura exactamente.
 * Requiere: npx expo install react-native-view-shot y nuevo dev build (Android).
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
  Image,
  ActivityIndicator,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { CELLARIUM } from '../theme/cellariumTheme';

const FRAME_WIDTH_RATIO = 0.88;
const FRAME_MAX_WIDTH = 320;
const FRAME_HEIGHT_MAX_RATIO = 0.85;
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const OVERLAY_OPACITY = 0.6;

export interface CropImageModalProps {
  visible: boolean;
  imageUri: string | null;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
}

export const CropImageModal: React.FC<CropImageModalProps> = ({
  visible,
  imageUri,
  onCancel,
  onConfirm,
}) => {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [cropAreaSize, setCropAreaSize] = useState<{ w: number; h: number } | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);

  const cropRef = useRef<View>(null);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (!visible || !imageUri) {
      setImageSize(null);
      setCropAreaSize(null);
      setError(null);
      return;
    }
    Image.getSize(
      imageUri,
      (w, h) => setImageSize({ width: w, height: h }),
      () => setError('No se pudo cargar la imagen')
    );
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [visible, imageUri]);

  const onCropAreaLayout = React.useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setCropAreaSize({ w: width, h: height });
  }, []);

  const { cropX, cropY, cropW, cropH } = useMemo(() => {
    if (!cropAreaSize?.w || !cropAreaSize?.h) return { cropX: 0, cropY: 0, cropW: 0, cropH: 0 };
    const containerW = cropAreaSize.w;
    const containerH = cropAreaSize.h;
    let frameW = Math.min(containerW * FRAME_WIDTH_RATIO, FRAME_MAX_WIDTH);
    let frameH = frameW * (5 / 4);
    if (frameH > containerH * FRAME_HEIGHT_MAX_RATIO) {
      frameH = containerH * FRAME_HEIGHT_MAX_RATIO;
      frameW = frameH * (4 / 5);
    }
    const frameLeft = (containerW - frameW) / 2;
    const frameTop = (containerH - frameH) / 2;
    return { cropX: frameLeft, cropY: frameTop, cropW: frameW, cropH: frameH };
  }, [cropAreaSize?.w, cropAreaSize?.h]);

  const composed = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onUpdate((e: { scale: number }) => {
        'worklet';
        const next = savedScale.value * e.scale;
        scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      })
      .onEnd(() => {
        'worklet';
        savedScale.value = scale.value;
      });

    const pan = Gesture.Pan()
      .onUpdate((e: { translationX: number; translationY: number }) => {
        'worklet';
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      })
      .onEnd(() => {
        'worklet';
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      });

    return Gesture.Simultaneous(pinch, pan);
  }, []);

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const handleConfirm = React.useCallback(async () => {
    if (!cropRef.current) return;
    setIsCropping(true);
    setError(null);
    try {
      const uri = await captureRef(cropRef, {
        format: 'jpg',
        quality: 1,
        result: 'tmpfile',
      });
      if (__DEV__) console.log('[CropConfirm] viewshotUri', uri);
      onConfirm(uri);
    } catch (e) {
      setError((e as Error)?.message ?? 'Error al capturar');
    } finally {
      setIsCropping(false);
    }
  }, [onConfirm]);

  if (!visible) return null;

  const containerW = cropAreaSize?.w ?? 0;
  const containerH = cropAreaSize?.h ?? 0;
  const initialScale =
    imageSize && cropW > 0 && cropH > 0
      ? Math.min(cropW / imageSize.width, cropH / imageSize.height)
      : 1;
  const renderW = imageSize ? imageSize.width * initialScale : 0;
  const renderH = imageSize ? imageSize.height * initialScale : 0;

  const hasCropArea = !!(cropAreaSize?.w && cropAreaSize?.h);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: bottomPad }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Recortar</Text>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!imageSize || !hasCropArea || isCropping}
              style={styles.headerBtn}
            >
              {isCropping ? (
                <ActivityIndicator size="small" color={CELLARIUM.primary} />
              ) : (
                <Text style={styles.useText}>Usar foto</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.cropArea}>
            <View style={styles.cropAreaInner} onLayout={onCropAreaLayout}>
              {error ? (
                <View style={styles.centered}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : !imageUri || !imageSize ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color={CELLARIUM.primary} />
                </View>
              ) : !hasCropArea ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color={CELLARIUM.primary} />
                </View>
              ) : (
                <>
                  <Text style={styles.hintText} pointerEvents="none">
                    Mueve y acerca/aleja para encuadrar
                  </Text>
                  {/* Overlay oscuro fuera del marco */}
                  <View style={[styles.overlayStrip, { left: 0, top: 0, width: containerW, height: cropY }]} pointerEvents="none" />
                  <View style={[styles.overlayStrip, { left: 0, top: cropY + cropH, width: containerW, height: Math.max(0, containerH - cropY - cropH) }]} pointerEvents="none" />
                  <View style={[styles.overlayStrip, { left: 0, top: cropY, width: cropX, height: cropH }]} pointerEvents="none" />
                  <View style={[styles.overlayStrip, { left: cropX + cropW, top: cropY, width: Math.max(0, containerW - cropX - cropW), height: cropH }]} pointerEvents="none" />

                  {/* Viewport centrado: captura exactamente esta área */}
                  <View style={[styles.viewportWrapper, { width: containerW, height: containerH }]}>
                    <View
                      ref={cropRef}
                      collapsable={false}
                      style={[styles.frameViewport, { width: cropW, height: cropH, borderRadius: 18 }]}
                    >
                      <GestureDetector gesture={composed}>
                        <Animated.View style={[styles.imageLayer, { width: cropW, height: cropH }]}>
                          <Animated.View
                            style={[
                              styles.imageInner,
                              { width: renderW, height: renderH },
                              animatedImageStyle,
                            ]}
                          >
                            <Image
                              source={{ uri: imageUri }}
                              style={{ width: renderW, height: renderH }}
                              resizeMode="cover"
                              pointerEvents="none"
                            />
                          </Animated.View>
                        </Animated.View>
                      </GestureDetector>
                    </View>
                    <View
                      pointerEvents="none"
                      style={[
                        styles.frameBorder,
                        {
                          width: cropW,
                          height: cropH,
                          borderRadius: 18,
                          left: (containerW - cropW) / 2,
                          top: (containerH - cropH) / 2,
                        },
                      ]}
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerBtn: {
    minWidth: 80,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  useText: {
    fontSize: 16,
    fontWeight: '600',
    color: CELLARIUM.primary,
  },
  cropArea: {
    flex: 1,
    overflow: 'hidden',
  },
  cropAreaInner: {
    flex: 1,
  },
  overlayStrip: {
    position: 'absolute',
    backgroundColor: `rgba(0,0,0,${OVERLAY_OPACITY})`,
  },
  viewportWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameViewport: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  imageLayer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageInner: {
    overflow: 'hidden',
  },
  frameBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  hintText: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    zIndex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
  },
});

export default CropImageModal;
