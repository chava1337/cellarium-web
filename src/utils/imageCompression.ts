/**
 * Helper para comprimir imágenes de cocteles antes de subirlas
 * Objetivo: mantener imágenes <= 300 KB manteniendo buena calidad visual
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { logger } from './logger';

const MAX_FILE_SIZE_KB = 300;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_KB * 1024; // 300 KB en bytes

/**
 * Comprime y redimensiona una imagen de coctel según el tipo de dispositivo.
 * La URI de entrada DEBE ser ya el resultado del crop (croppedUri); esta función
 * solo hace resize + encode, NUNCA crop, aspect ni cover.
 *
 * @param uri - URI de la imagen ya recortada (croppedUri del modal)
 * @param deviceType - Tipo de dispositivo ('smartphone' | 'tablet')
 * @returns URI de la imagen comprimida y sus dimensiones
 *
 * Dimensiones objetivo:
 * - Smartphone: maxWidth ~512px (2x del ancho visible ~256px)
 * - Tablet: maxWidth ~736px (2x del ancho visible ~368px)
 *
 * Proceso:
 * 1. Redimensiona manteniendo aspect ratio (resize: { width })
 * 2. Comprime con quality inicial 0.5
 * 3. Si > 300KB, reduce quality a 0.4
 * 4. Si aún > 350KB, reduce quality a 0.35 (máximo)
 */
export async function compressCocktailImage(
  uri: string,
  deviceType: 'smartphone' | 'tablet'
): Promise<{ uri: string; width: number; height: number }> {
  try {
    // Verificar si el módulo está disponible
    if (!ImageManipulator || !ImageManipulator.manipulateAsync) {
      const errorMsg = 'El módulo de compresión de imágenes no está disponible. Necesitas reconstruir la app con un desarrollo build.';
      logger.error('[compressCocktailImage]', errorMsg);
      throw new Error(errorMsg);
    }

    // Determinar ancho máximo según el dispositivo
    // Usamos 2x del ancho visible para pantallas de alta densidad (retina)
    const maxWidth = deviceType === 'tablet' ? 736 : 512; // 2x de 368px y 256px respectivamente

    logger.debug(`[compressCocktailImage] Comprimiendo imagen para ${deviceType}, maxWidth: ${maxWidth}px`);

    // Primera compresión: redimensionar y comprimir con quality 0.5
    let result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }], // Mantiene aspect ratio automáticamente
      {
        compress: 0.5,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // Verificar tamaño del archivo
    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    let fileSizeBytes = 0;

    if (fileInfo.exists && 'size' in fileInfo) {
      fileSizeBytes = fileInfo.size;
    }

    logger.debug(`[compressCocktailImage] Primera compresión: ${(fileSizeBytes / 1024).toFixed(2)} KB`);

    // Si el archivo es mayor a 300 KB, reducir calidad a 0.4
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      logger.debug(`[compressCocktailImage] Archivo > 300KB, reduciendo calidad a 0.4`);
      
      result = await ImageManipulator.manipulateAsync(
        uri, // Usar la imagen original, no la comprimida
        [{ resize: { width: maxWidth } }],
        {
          compress: 0.4,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const fileInfo2 = await FileSystem.getInfoAsync(result.uri);
      if (fileInfo2.exists && 'size' in fileInfo2) {
        fileSizeBytes = fileInfo2.size;
      }

      logger.debug(`[compressCocktailImage] Segunda compresión: ${(fileSizeBytes / 1024).toFixed(2)} KB`);

      // Si aún es mayor a 350 KB, reducir calidad a 0.35 (último intento)
      if (fileSizeBytes > 350 * 1024) {
        logger.debug(`[compressCocktailImage] Archivo > 350KB, reduciendo calidad a 0.35`);
        
        result = await ImageManipulator.manipulateAsync(
          uri, // Usar la imagen original
          [{ resize: { width: maxWidth } }],
          {
            compress: 0.35,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );

        const fileInfo3 = await FileSystem.getInfoAsync(result.uri);
        if (fileInfo3.exists && 'size' in fileInfo3) {
          fileSizeBytes = fileInfo3.size;
        }

        logger.debug(`[compressCocktailImage] Tercera compresión: ${(fileSizeBytes / 1024).toFixed(2)} KB`);
      }
    }

    logger.success(
      `[compressCocktailImage] Imagen comprimida exitosamente: ${(fileSizeBytes / 1024).toFixed(2)} KB, dimensiones: ${result.width}x${result.height}`
    );

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (error: any) {
    logger.error('[compressCocktailImage] Error comprimiendo imagen:', error);
    
    // Detectar si el error es por módulo nativo no disponible
    if (error?.message?.includes('native module') || 
        error?.message?.includes('Cannot find native module') ||
        error?.code === 'MODULE_NOT_FOUND') {
      const errorMsg = 'El módulo de compresión de imágenes no está disponible. Necesitas reconstruir la app con un desarrollo build usando: eas build --profile development --platform android';
      logger.error('[compressCocktailImage]', errorMsg);
      throw new Error(errorMsg);
    }
    
    // Error genérico
    const errorMessage = error?.message || 'No se pudo comprimir la imagen. Por favor, intenta con otra imagen.';
    throw new Error(errorMessage);
  }
}
