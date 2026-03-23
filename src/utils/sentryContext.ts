import * as Sentry from '@sentry/react-native';
import type { User } from '../types';
import { getEffectivePlan } from './effectivePlan';
import { isSentryEnabled } from './sentryInit';

/**
 * Sincroniza usuario y tags de negocio cuando el perfil público está listo (`userDataStatus === 'ok'`).
 */
export function setSentryUserContext(user: User): void {
  if (!isSentryEnabled) return;

  const plan = getEffectivePlan(user);
  const ownerId = user.owner_id ?? user.id;
  const role = user.role ?? 'unknown';

  Sentry.setUser({
    id: user.id,
    email: user.email || undefined,
    username: user.username,
  });

  Sentry.setTag('role', role);
  Sentry.setTag('branch_id', user.branch_id ?? 'none');
  Sentry.setTag('owner_id', ownerId);
  Sentry.setTag('plan', plan);

  Sentry.setContext('cellarium', {
    role,
    branch_id: user.branch_id ?? null,
    owner_id: ownerId,
    subscription_plan: user.subscription_plan ?? null,
    effective_plan: plan,
  });
}

export function clearSentryUserContext(): void {
  if (!isSentryEnabled) return;
  Sentry.setUser(null);
}

export function sentryFlowBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!isSentryEnabled) return;
  Sentry.addBreadcrumb({
    category: 'cellarium.flow',
    message,
    level: 'info',
    data: data ?? {},
  });
}

/**
 * Errores en flujos críticos (PDF, share, checkout). Sin PII en `extra`.
 */
export function captureCriticalError(
  error: unknown,
  extra: { feature: string; screen?: string; app_area?: string; [key: string]: unknown }
): void {
  if (!isSentryEnabled) return;

  const { feature, screen, app_area, ...rest } = extra;

  Sentry.withScope((scope) => {
    scope.setTag('feature', feature);
    if (screen) scope.setTag('screen', screen);
    if (app_area) scope.setTag('app_area', app_area);
    scope.setContext('cellarium_critical', {
      feature,
      screen: screen ?? null,
      app_area: app_area ?? null,
      ...rest,
    });
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'non_error_throwable');
    Sentry.captureException(err);
  });
}
