import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { sentryDsn?: string } | undefined;
const fromEnv =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SENTRY_DSN
    ? String(process.env.EXPO_PUBLIC_SENTRY_DSN).trim()
    : '';
const fromExtra = (extra?.sentryDsn ?? '').trim();

const dsn = fromEnv || fromExtra;

export const isSentryEnabled = Boolean(dsn);

if (isSentryEnabled) {
  Sentry.init({
    dsn,
    debug: __DEV__,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.05,
    enableAutoSessionTracking: true,
    enableCaptureFailedRequests: false,
    beforeSend(event) {
      const msg = event.exception?.values?.[0]?.value;
      // Ignore share-unavailable noise in environments without share UI
      if (
        msg === 'Compartir no está disponible en este dispositivo' ||
        msg === 'Compartir no disponible'
      ) {
        return null;
      }
      return event;
    },
  });
}
