/**
 * 🔧 Utilidades de Geometría para Detección de Etiquetas
 * Funciones puras para cálculos geométricos y validación de quads
 */

import { Quad, BoundingBox, CameraConfig, GeometryUtils } from '../types';

/**
 * Calcula el área de un cuadrilátero usando la fórmula de Shoelace
 * @param quad - Cuadrilátero definido por 4 esquinas
 * @returns Área en píxeles cuadrados
 */
export const quadArea = (quad: Quad): number => {
  const [a, b, c, d] = quad;
  
  // Fórmula de Shoelace para polígonos
  const area = Math.abs(
    (a.x * b.y + b.x * c.y + c.x * d.y + d.x * a.y) -
    (a.y * b.x + b.y * c.x + c.y * d.x + d.y * a.x)
  ) / 2;
  
  return area;
};

/**
 * Calcula el bounding box (rectángulo envolvente) de un quad
 * @param quad - Cuadrilátero
 * @returns Bounding box con posición y dimensiones
 */
export const quadBoundingBox = (quad: Quad): BoundingBox => {
  const xs = quad.map(corner => corner.x);
  const ys = quad.map(corner => corner.y);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

/**
 * Calcula el aspect ratio (alto/ancho) de un quad
 * @param quad - Cuadrilátero
 * @returns Aspect ratio como número decimal
 */
export const aspectFromQuad = (quad: Quad): number => {
  const bbox = quadBoundingBox(quad);
  return bbox.height / bbox.width;
};

/**
 * Calcula la intersección sobre unión (IoU) de dos bounding boxes
 * @param boxA - Primer bounding box
 * @param boxB - Segundo bounding box
 * @returns IoU entre 0 y 1
 */
export const boxesIoU = (boxA: BoundingBox, boxB: BoundingBox): number => {
  // Calcular intersección
  const x1 = Math.max(boxA.x, boxB.x);
  const y1 = Math.max(boxA.y, boxB.y);
  const x2 = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const y2 = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
  
  if (x2 <= x1 || y2 <= y1) {
    return 0; // No hay intersección
  }
  
  const intersectionArea = (x2 - x1) * (y2 - y1);
  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - intersectionArea;
  
  return intersectionArea / unionArea;
};

/**
 * Calcula el drift promedio de las esquinas entre dos quads
 * @param quad1 - Quad anterior
 * @param quad2 - Quad actual
 * @returns Distancia promedio en píxeles
 */
export const avgCornerDrift = (quad1: Quad, quad2: Quad): number => {
  let totalDistance = 0;
  
  for (let i = 0; i < 4; i++) {
    const dx = quad1[i].x - quad2[i].x;
    const dy = quad1[i].y - quad2[i].y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    totalDistance += distance;
  }
  
  return totalDistance / 4;
};

/**
 * Escala un quad por factores X e Y
 * @param quad - Quad original
 * @param scaleX - Factor de escala X
 * @param scaleY - Factor de escala Y
 * @returns Quad escalado
 */
export const scaleQuad = (quad: Quad, scaleX: number, scaleY: number): Quad => {
  return quad.map(corner => ({
    x: corner.x * scaleX,
    y: corner.y * scaleY,
  })) as Quad;
};

/**
 * Mapea coordenadas del preview a coordenadas de la foto real
 * Considera diferencias de aspect ratio, rotación y letterboxing
 * @param quad - Quad en coordenadas del preview
 * @param previewSize - Dimensiones del preview
 * @param photoSize - Dimensiones de la foto real
 * @returns Quad mapeado a coordenadas de la foto
 */
export const mapPreviewQuadToPhoto = (
  quad: Quad,
  previewSize: { width: number; height: number },
  photoSize: { width: number; height: number }
): Quad => {
  // Calcular ratios de escala
  const scaleX = photoSize.width / previewSize.width;
  const scaleY = photoSize.height / previewSize.height;
  
  // Para manejar letterboxing, necesitamos considerar el aspect ratio
  const previewAspect = previewSize.width / previewSize.height;
  const photoAspect = photoSize.width / photoSize.height;
  
  let actualScaleX = scaleX;
  let actualScaleY = scaleY;
  let offsetX = 0;
  let offsetY = 0;
  
  if (previewAspect > photoAspect) {
    // Preview es más ancho, hay letterboxing vertical
    const scaledHeight = previewSize.height * scaleX;
    const letterboxHeight = (scaledHeight - photoSize.height) / 2;
    offsetY = letterboxHeight;
    actualScaleY = scaleX;
  } else {
    // Preview es más alto, hay letterboxing horizontal
    const scaledWidth = previewSize.width * scaleY;
    const letterboxWidth = (scaledWidth - photoSize.width) / 2;
    offsetX = letterboxWidth;
    actualScaleX = scaleY;
  }
  
  // Aplicar transformación
  return quad.map(corner => ({
    x: corner.x * actualScaleX - offsetX,
    y: corner.y * actualScaleY - offsetY,
  })) as Quad;
};

/**
 * Valida si un quad cumple con los criterios de configuración
 * @param quad - Quad a validar
 * @param config - Configuración de validación
 * @returns true si el quad es válido
 */
export const isValidQuad = (quad: Quad, config: CameraConfig): boolean => {
  const area = quadArea(quad);
  const aspectRatio = aspectFromQuad(quad);
  
  // Validar área mínima
  if (config.minArea && area < config.minArea) {
    return false;
  }
  
  // Validar aspect ratio mínimo
  if (config.minAspect && aspectRatio < config.minAspect) {
    return false;
  }
  
  // Validar aspect ratio máximo
  if (config.maxAspect && aspectRatio > config.maxAspect) {
    return false;
  }
  
  // Validar orientación esperada
  if (config.expectedOrientation) {
    const isVertical = aspectRatio > 1;
    const expectedVertical = config.expectedOrientation === "vertical";
    
    if (isVertical !== expectedVertical) {
      return false;
    }
  }
  
  return true;
};

/**
 * Encuentra el mejor quad de una lista basado en área y validez
 * @param quads - Lista de quads detectados
 * @param config - Configuración de validación
 * @returns Mejor quad o null si ninguno es válido
 */
export const findBestQuad = (quads: Quad[], config: CameraConfig): Quad | null => {
  const validQuads = quads.filter(quad => isValidQuad(quad, config));
  
  if (validQuads.length === 0) {
    return null;
  }
  
  // Ordenar por área (mayor primero)
  validQuads.sort((a, b) => quadArea(b) - quadArea(a));
  
  return validQuads[0];
};

/**
 * Calcula la distancia entre dos puntos
 * @param point1 - Primer punto
 * @param point2 - Segundo punto
 * @returns Distancia en píxeles
 */
export const distance = (point1: Corner, point2: Corner): number => {
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Calcula el centro de un quad
 * @param quad - Cuadrilátero
 * @returns Punto central
 */
export const quadCenter = (quad: Quad): Corner => {
  const avgX = quad.reduce((sum, corner) => sum + corner.x, 0) / 4;
  const avgY = quad.reduce((sum, corner) => sum + corner.y, 0) / 4;
  
  return { x: avgX, y: avgY };
};

/**
 * Verifica si un punto está dentro de un quad
 * @param point - Punto a verificar
 * @param quad - Cuadrilátero
 * @returns true si el punto está dentro
 */
export const isPointInQuad = (point: Corner, quad: Quad): boolean => {
  // Algoritmo ray casting
  let inside = false;
  
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    if (
      quad[i].y > point.y !== quad[j].y > point.y &&
      point.x < (quad[j].x - quad[i].x) * (point.y - quad[i].y) / (quad[j].y - quad[i].y) + quad[i].x
    ) {
      inside = !inside;
    }
  }
  
  return inside;
};

/**
 * Normaliza un quad a coordenadas 0-1
 * @param quad - Quad en coordenadas de píxeles
 * @param size - Dimensiones del canvas
 * @returns Quad normalizado
 */
export const normalizeQuad = (
  quad: Quad,
  size: { width: number; height: number }
): Quad => {
  return quad.map(corner => ({
    x: corner.x / size.width,
    y: corner.y / size.height,
  })) as Quad;
};

/**
 * Desnormaliza un quad de coordenadas 0-1 a píxeles
 * @param quad - Quad normalizado
 * @param size - Dimensiones del canvas
 * @returns Quad en coordenadas de píxeles
 */
export const denormalizeQuad = (
  quad: Quad,
  size: { width: number; height: number }
): Quad => {
  return quad.map(corner => ({
    x: corner.x * size.width,
    y: corner.y * size.height,
  })) as Quad;
};

// Exportar todas las utilidades como un objeto
export const geometryUtils: GeometryUtils = {
  quadArea,
  quadBoundingBox,
  aspectFromQuad,
  boxesIoU,
  avgCornerDrift,
  scaleQuad,
  mapPreviewQuadToPhoto,
  isValidQuad,
};
