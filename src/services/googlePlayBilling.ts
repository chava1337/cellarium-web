/**
 * Stubs iOS/Web. Android: googlePlayBilling.android.ts
 * Patrón alineado con appleIapSubscription (compra → validar backend → finishTransaction en pantalla).
 */

import type { Purchase, ProductSubscription } from 'react-native-iap';
import type { GooglePlanUiId } from '../constants/googlePlayProducts';

export async function ensurePlayBillingConnection(): Promise<void> {
  /* no-op */
}

export async function loadSubscriptions(): Promise<ProductSubscription[]> {
  return [];
}

export async function purchaseGoogleSubscription(_plan: GooglePlanUiId): Promise<{ purchase: Purchase }> {
  throw new Error('Google Play Billing solo está disponible en Android');
}

export async function purchaseGoogleBranchAddon(_slots: 1 | 3): Promise<{ purchase: Purchase }> {
  throw new Error('Google Play Billing solo está disponible en Android');
}

export async function restoreGooglePurchases(): Promise<{ synced: boolean; message?: string }> {
  return { synced: false, message: 'Google Play Billing solo está disponible en Android' };
}

export async function finishGoogleTransactionIfNeeded(_purchase: Purchase): Promise<void> {
  /* no-op */
}

export function mainPlanSelectionIdToGooglePlan(_planId: string): GooglePlanUiId | null {
  return null;
}
