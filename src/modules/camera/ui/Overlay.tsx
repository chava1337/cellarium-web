/**
 * 🎨 Componente de Overlay SVG para Cámara
 * Proporciona feedback visual y guías para la captura de etiquetas
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { 
  Polygon, 
  Rect, 
  Path, 
  Text, 
  Defs, 
  LinearGradient, 
  Stop,
  Mask,
  Circle
} from 'react-native-svg';
import { OverlayProps, OVERLAY_COLORS, STATUS_MESSAGES } from '../types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * Componente de overlay para la cámara
 * Muestra guías, detección en tiempo real y feedback de estabilidad
 */
export const CameraOverlay: React.FC<OverlayProps> = ({
  quad,
  isStable,
  stabilityCount,
  maxStabilityFrames,
  showGuide,
  guideShape,
  previewSize,
  style,
}) => {
  // Calcular posición y escala del overlay
  const overlayWidth = previewSize.width;
  const overlayHeight = previewSize.height;
  
  // Calcular color del borde basado en estabilidad
  const getBorderColor = () => {
    if (isStable) return OVERLAY_COLORS.stable;
    if (stabilityCount > maxStabilityFrames * 0.7) return OVERLAY_COLORS.unstable;
    return OVERLAY_COLORS.unstable;
  };
  
  // Calcular opacidad del borde
  const getBorderOpacity = () => {
    if (isStable) return 1.0;
    return Math.min(0.5 + (stabilityCount / maxStabilityFrames) * 0.5, 1.0);
  };
  
  // Calcular grosor del borde
  const getBorderWidth = () => {
    if (isStable) return 4;
    return 2;
  };
  
  return (
    <View style={[styles.container, style]}>
      <Svg
        width={overlayWidth}
        height={overlayHeight}
        style={styles.svg}
      >
        <Defs>
          {/* Gradiente para el borde */}
          <LinearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={getBorderColor()} stopOpacity={getBorderOpacity()} />
            <Stop offset="100%" stopColor={getBorderColor()} stopOpacity={getBorderOpacity() * 0.7} />
          </LinearGradient>
          
          {/* Máscara para el área de captura */}
          <Mask id="captureMask">
            <Rect width={overlayWidth} height={overlayHeight} fill="white" />
            {quad && (
              <Polygon
                points={quad.map(corner => `${corner.x},${corner.y}`).join(' ')}
                fill="black"
              />
            )}
          </Mask>
        </Defs>
        
        {/* Fondo semitransparente con máscara */}
        <Rect
          width={overlayWidth}
          height={overlayHeight}
          fill={OVERLAY_COLORS.background}
          mask="url(#captureMask)"
        />
        
        {/* Guía base */}
        {showGuide && (
          <GuideShape
            shape={guideShape}
            width={overlayWidth}
            height={overlayHeight}
            color={OVERLAY_COLORS.guide}
          />
        )}
        
        {/* Quad detectado */}
        {quad && (
          <Polygon
            points={quad.map(corner => `${corner.x},${corner.y}`).join(' ')}
            fill="none"
            stroke="url(#borderGradient)"
            strokeWidth={getBorderWidth()}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        
        {/* Esquinas del quad con indicadores */}
        {quad && quad.map((corner, index) => (
          <Circle
            key={index}
            cx={corner.x}
            cy={corner.y}
            r={isStable ? 8 : 6}
            fill={getBorderColor()}
            opacity={getBorderOpacity()}
          />
        ))}
        
        {/* Indicador de estabilidad */}
        {quad && (
          <StabilityIndicator
            quad={quad}
            isStable={isStable}
            stabilityCount={stabilityCount}
            maxStabilityFrames={maxStabilityFrames}
          />
        )}
        
        {/* Mensaje de estado */}
        <StatusMessage
          isStable={isStable}
          stabilityCount={stabilityCount}
          maxStabilityFrames={maxStabilityFrames}
          width={overlayWidth}
          height={overlayHeight}
        />
      </Svg>
    </View>
  );
};

/**
 * Componente para la forma de guía
 */
const GuideShape: React.FC<{
  shape: "rect" | "bottle";
  width: number;
  height: number;
  color: string;
}> = ({ shape, width, height, color }) => {
  const centerX = width / 2;
  const centerY = height / 2;
  
  if (shape === "rect") {
    // Guía rectangular
    const guideWidth = width * 0.6;
    const guideHeight = height * 0.4;
    
    return (
      <Rect
        x={centerX - guideWidth / 2}
        y={centerY - guideHeight / 2}
        width={guideWidth}
        height={guideHeight}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="10,5"
        opacity={0.5}
      />
    );
  } else {
    // Guía de botella (silueta)
    const bottleWidth = width * 0.3;
    const bottleHeight = height * 0.6;
    
    const bottlePath = `
      M ${centerX - bottleWidth/2} ${centerY - bottleHeight/2}
      L ${centerX + bottleWidth/2} ${centerY - bottleHeight/2}
      L ${centerX + bottleWidth/2} ${centerY - bottleHeight/4}
      Q ${centerX + bottleWidth/2} ${centerY} ${centerX + bottleWidth/4} ${centerY}
      L ${centerX + bottleWidth/4} ${centerY + bottleHeight/4}
      L ${centerX - bottleWidth/4} ${centerY + bottleHeight/4}
      Q ${centerX - bottleWidth/2} ${centerY} ${centerX - bottleWidth/2} ${centerY - bottleHeight/4}
      Z
    `;
    
    return (
      <Path
        d={bottlePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="10,5"
        opacity={0.5}
      />
    );
  }
};

/**
 * Indicador de estabilidad
 */
const StabilityIndicator: React.FC<{
  quad: any;
  isStable: boolean;
  stabilityCount: number;
  maxStabilityFrames: number;
}> = ({ quad, isStable, stabilityCount, maxStabilityFrames }) => {
  // Calcular posición del indicador (arriba del quad)
  const centerX = quad.reduce((sum: number, corner: any) => sum + corner.x, 0) / 4;
  const minY = Math.min(...quad.map((corner: any) => corner.y));
  const indicatorY = minY - 30;
  
  // Calcular progreso de estabilidad
  const progress = stabilityCount / maxStabilityFrames;
  
  return (
    <g>
      {/* Barra de progreso */}
      <Rect
        x={centerX - 50}
        y={indicatorY - 10}
        width={100}
        height={8}
        fill="rgba(255,255,255,0.3)"
        rx={4}
      />
      
      <Rect
        x={centerX - 50}
        y={indicatorY - 10}
        width={100 * progress}
        height={8}
        fill={isStable ? OVERLAY_COLORS.stable : OVERLAY_COLORS.unstable}
        rx={4}
      />
      
      {/* Texto de progreso */}
      <Text
        x={centerX}
        y={indicatorY + 5}
        textAnchor="middle"
        fontSize="12"
        fill="white"
        fontWeight="bold"
      >
        {isStable ? "¡LISTO!" : `${stabilityCount}/${maxStabilityFrames}`}
      </Text>
    </g>
  );
};

/**
 * Mensaje de estado
 */
const StatusMessage: React.FC<{
  isStable: boolean;
  stabilityCount: number;
  maxStabilityFrames: number;
  width: number;
  height: number;
}> = ({ isStable, stabilityCount, maxStabilityFrames, width, height }) => {
  const message = isStable 
    ? STATUS_MESSAGES.stable 
    : STATUS_MESSAGES.ready;
  
  return (
    <Text
      x={width / 2}
      y={height - 50}
      textAnchor="middle"
      fontSize="16"
      fill="white"
      fontWeight="bold"
      opacity={0.9}
    >
      {message}
    </Text>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  svg: {
    flex: 1,
  },
});

export default CameraOverlay;













































