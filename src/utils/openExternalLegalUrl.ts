import { Alert, Linking } from 'react-native';

/**
 * Abre URLs legales / soporte en el navegador del sistema.
 * Mismo comportamiento que la sección Legal de Ajustes.
 */
export async function openExternalLegalUrl(
  url: string,
  errorTitle: string,
  errorMessage: string
): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    Alert.alert(errorTitle, errorMessage);
    return;
  }
  try {
    const supported = await Linking.canOpenURL(trimmed);
    if (!supported) {
      Alert.alert(errorTitle, errorMessage);
      return;
    }
    await Linking.openURL(trimmed);
  } catch {
    Alert.alert(errorTitle, errorMessage);
  }
}
