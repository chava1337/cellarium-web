import { Alert } from 'react-native';
import { useFocusEffect, RouteProp as RNRouteProp } from '@react-navigation/native';
import { useCallback, useMemo } from 'react';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { useGuest } from '../contexts/GuestContext';
import { useAuth } from '../contexts/AuthContext';
import { canAccessAdminPanel, type Role } from '../utils/rolePermissions';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type RoutePropType<T extends keyof RootStackParamList> = RNRouteProp<RootStackParamList, T>;

export type AdminGuardStatus = 'loading' | 'profile_loading' | 'pending' | 'denied' | 'allowed';

export interface UseAdminGuardResult {
  status: AdminGuardStatus;
}

interface UseAdminGuardOptions<T extends keyof RootStackParamList> {
  navigation: NavigationProp;
  route: RoutePropType<T>;
  requireAuth?: boolean;
  /** Si no se pasa, se usa canAccessAdminPanel(role): owner, gerente, sommelier, supervisor, personal. */
  allowedRoles?: Role[];
}

/**
 * Guard para pantallas administrativas. Expone estado claro para evitar redirects
 * incorrectos con usuario optimista (role/status no hidratados) o staff pending.
 * Por defecto permite todos los roles con acceso al panel (sommelier incluido).
 * Solo redirige a AdminLogin cuando profileReady y usuario sin permisos o inactivo.
 */
export function useAdminGuard<T extends keyof RootStackParamList>({
  navigation,
  route,
  requireAuth = true,
  allowedRoles,
}: UseAdminGuardOptions<T>): UseAdminGuardResult {
  const { session: guestSession, currentBranch: guestBranch } = useGuest();
  const { user, loading: authLoading, profileReady } = useAuth();

  const isGuest = useCallback(() => {
    if (route.params && 'isGuest' in route.params && route.params.isGuest === true) return true;
    if (guestSession || guestBranch) return true;
    return false;
  }, [route.params, guestSession, guestBranch]);

  const status: AdminGuardStatus = useMemo(() => {
    if (isGuest()) return 'denied';
    if (!requireAuth) return 'allowed';

    if (authLoading) return 'loading';
    if (!user) return 'denied';

    if (user.status === 'loading' || user.role == null) return 'profile_loading';
    if (user.status === 'pending') return 'pending';

    if (!profileReady) return 'profile_loading';

    if (user.status === 'inactive') return 'denied';
    const roleAllowed = allowedRoles != null
      ? allowedRoles.length > 0 && allowedRoles.includes(user.role as Role)
      : canAccessAdminPanel(user.role as Role);
    if (!roleAllowed) return 'denied';
    return 'allowed';
  }, [isGuest, requireAuth, authLoading, user, profileReady, allowedRoles]);

  useFocusEffect(
    useCallback(() => {
      if (isGuest()) {
        Alert.alert(
          'Acceso restringido',
          'Esta sección es solo para administración. Los comensales no pueden acceder a funciones administrativas.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'WineCatalog', params: { isGuest: true } }],
                });
              },
            },
          ],
          { cancelable: false }
        );
        return;
      }

      if (status === 'denied' && requireAuth) {
        Alert.alert(
          'Acceso restringido',
          'Debes iniciar sesión como administrador para acceder a esta sección.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('AdminLogin');
              },
            },
          ],
          { cancelable: false }
        );
      }
    }, [isGuest, status, requireAuth, navigation])
  );

  return { status };
}
