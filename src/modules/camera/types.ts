/**
 * 🎥 Tipos para el Módulo de Cámara Profesional
 * Sistema avanzado de captura de etiquetas de vino con detección automática
 */

export type Corner = {
  x: number;
  y: number;
};

export type Quad = [Corner, Corner, Corner, Corner];

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CameraConfig = {
  minArea?: number;          // Área mínima en píxeles del preview (ej. 50000)
  minAspect?: number;        // Aspect ratio mínimo (alto/ancho) (ej. 1.15)
  maxAspect?: number;        // Aspect ratio máximo (ej. 3.0)
  stabilityFrames?: number;  // Frames consecutivos estables requeridos (ej. 15)
  iouThreshold?: number;     // Umbral de IoU para estabilidad (ej. 0.85)
  cornerDrift?: number;      // Drift máximo de esquinas en píxeles (ej. 12)
  showGuide?: boolean;       // Mostrar overlay de guía
  guideShape?: "rect" | "bottle"; // Forma de la guía
  autoShoot?: boolean;       // Habilitar auto-disparo
  expectedOrientation?: "vertical" | "horizontal"; // Orientación esperada
  outputWidth?: number;      // Ancho de salida del warp (ej. 1200)
  outputAspect?: number;     // Aspect ratio de salida (ej. 4/5 = 0.8)
};

export type StabilityState = {
  quad: Quad | null;
  isStable: boolean;
  stabilityCount: number;
  shootNow: boolean;
  lastQuad: Quad | null;
  lastBoundingBox: BoundingBox | null;
};

export type CameraState = {
  isInitialized: boolean;
  hasPermission: boolean;
  isShooting: boolean;
  isProcessing: boolean;
  error: string | null;
  torchEnabled: boolean;
  cameraPosition: "front" | "back";
};

export type ProWineCameraProps = {
  onWarped?: (uri: string) => void;    // Imagen final corregida (warp)
  onOriginal?: (uri: string) => void;  // Imagen original capturada (opcional)
  onDebugQuad?: (quad: Quad | null) => void;   // Emite el quad detectado por frame (debug)
  onError?: (error: string) => void;    // Callback de errores
  config?: CameraConfig;
  style?: any;                         // Estilos del contenedor
  className?: string;                  // Clase CSS (si aplica)
};

export type WarpResult = {
  success: boolean;
  uri?: string;
  error?: string;
  originalUri?: string;
  quad?: Quad;
};

export type FrameProcessorResult = {
  quads: Quad[];
  bestQuad: Quad | null;
  confidence: number;
  area: number;
  aspectRatio: number;
};

export type GeometryUtils = {
  quadArea: (quad: Quad) => number;
  quadBoundingBox: (quad: Quad) => BoundingBox;
  aspectFromQuad: (quad: Quad) => number;
  boxesIoU: (boxA: BoundingBox, boxB: BoundingBox) => number;
  avgCornerDrift: (quad1: Quad, quad2: Quad) => number;
  scaleQuad: (quad: Quad, scaleX: number, scaleY: number) => Quad;
  mapPreviewQuadToPhoto: (
    quad: Quad, 
    previewSize: { width: number; height: number }, 
    photoSize: { width: number; height: number }
  ) => Quad;
  isValidQuad: (quad: Quad, config: CameraConfig) => boolean;
};

export type WarpUtils = {
  warpLabelFromQuad: (inputUri: string, quad: Quad, config?: CameraConfig) => Promise<WarpResult>;
  createPerspectiveMatrix: (quad: Quad, outputSize: { width: number; height: number }) => number[];
  applyPerspectiveTransform: (imageUri: string, matrix: number[], outputSize: { width: number; height: number }) => Promise<string>;
};

export type OverlayProps = {
  quad: Quad | null;
  isStable: boolean;
  stabilityCount: number;
  maxStabilityFrames: number;
  showGuide: boolean;
  guideShape: "rect" | "bottle";
  previewSize: { width: number; height: number };
  style?: any;
};

export type AutoCaptureHook = {
  stabilityState: StabilityState;
  updateQuad: (quad: Quad | null) => void;
  resetStability: () => void;
  shouldShoot: boolean;
};

export type CameraPermissions = {
  camera: boolean;
  microphone?: boolean;
};

export type DeviceInfo = {
  id: string;
  name: string;
  hasFlash: boolean;
  hasTorch: boolean;
  supportsFocus: boolean;
  minFocusDistance: number;
  maxFocusDistance: number;
  formats: any[];
};

export type CaptureOptions = {
  qualityPrioritization?: "speed" | "balanced" | "quality";
  flash?: "on" | "off" | "auto";
  enableAutoStabilization?: boolean;
  enableAutoRedEyeReduction?: boolean;
};

export type ProcessingStats = {
  frameRate: number;
  processingTime: number;
  detectionCount: number;
  stabilityChecks: number;
  lastUpdate: number;
};

// Constantes por defecto
export const DEFAULT_CONFIG: Required<CameraConfig> = {
  minArea: 50000,
  minAspect: 1.15,
  maxAspect: 3.0,
  stabilityFrames: 15,
  iouThreshold: 0.85,
  cornerDrift: 12,
  showGuide: true,
  guideShape: "rect",
  autoShoot: true,
  expectedOrientation: "vertical",
  outputWidth: 1200,
  outputAspect: 4/5, // 0.8
};

// Colores para el overlay
export const OVERLAY_COLORS = {
  unstable: "#FFD700", // Dorado
  stable: "#00FF00",    // Verde
  shooting: "#FF0000", // Rojo
  guide: "#FFFFFF",     // Blanco
  background: "rgba(0,0,0,0.3)", // Negro semitransparente
} as const;

// Mensajes de estado
export const STATUS_MESSAGES = {
  initializing: "Inicializando cámara...",
  noPermission: "Permisos de cámara requeridos",
  noDevice: "No se encontró dispositivo de cámara",
  ready: "Alinea la etiqueta y mantén estable",
  stable: "¡Perfecto! Capturando...",
  shooting: "Capturando imagen...",
  processing: "Procesando imagen...",
  error: "Error en la captura",
} as const;













































