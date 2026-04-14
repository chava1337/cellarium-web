import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { ProductSubscription } from 'react-native-iap';
import {
  ensurePlayBillingConnection,
  loadSubscriptions,
  mainPlanSelectionIdToGooglePlan,
  purchaseGoogleSubscription,
  restoreGooglePurchases,
} from '../services/googlePlayBilling';

/**
 * Google Play Billing en Android (react-native-iap).
 * Misma idea que appleIapSubscription.ios: API imperativa; el hook solo expone estado del catálogo.
 */
export function useGooglePlayBilling() {
  const [playSubscriptions, setPlaySubscriptions] = useState<ProductSubscription[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);

  const reloadSubscriptions = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      await ensurePlayBillingConnection();
      const list = await loadSubscriptions();
      setPlaySubscriptions(list);
    } catch (e) {
      if (__DEV__) console.warn('[useGooglePlayBilling] reloadSubscriptions', e);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setCatalogReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await ensurePlayBillingConnection();
        const list = await loadSubscriptions();
        if (!cancelled) setPlaySubscriptions(list);
      } catch (e) {
        if (__DEV__) console.warn('[useGooglePlayBilling] initial load', e);
      } finally {
        if (!cancelled) setCatalogReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** planId: bistro | trattoria | grand_maison | grand-maison */
  const buySubscription = useCallback(async (planId: string) => {
    const plan = mainPlanSelectionIdToGooglePlan(planId);
    if (!plan) {
      throw new Error('Plan no válido para Google Play');
    }
    return purchaseGoogleSubscription(plan);
  }, []);

  const restorePurchases = useCallback(async () => restoreGooglePurchases(), []);

  return {
    playSubscriptions,
    catalogReady,
    reloadSubscriptions,
    buySubscription,
    restorePurchases,
  };
}
