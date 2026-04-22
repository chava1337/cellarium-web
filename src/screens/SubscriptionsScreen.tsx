import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import {
  CellariumHeader,
  CellariumModal,
  CellariumPrimaryButton,
  IosHeaderBackSlot,
} from '../components/cellarium';
import { RootStackParamList, type CanonicalPlanId } from '../types';

function stripeLookupKeyToCanonical(lookupKey: string): CanonicalPlanId | undefined {
  switch (lookupKey) {
    case 'bistro_monthly':
      return 'bistro';
    case 'trattoria_monthly':
      return 'trattoria';
    case 'grand_maison_monthly':
      return 'grand-maison';
    default:
      return undefined;
  }
}

function planTierRank(planId: string): number {
  switch (planId) {
    case 'cafe':
      return 0;
    case 'bistro':
      return 1;
    case 'trattoria':
      return 2;
    case 'grand_maison':
      return 3;
    default:
      return -1;
  }
}
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { useAdminGuard } from '../hooks/useAdminGuard';
import { supabase } from '../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import { CELLARIUM, CELLARIUM_THEME, CELLARIUM_LAYOUT, CELLARIUM_TEXT } from '../theme/cellariumTheme';
import { useLanguage } from '../contexts/LanguageContext';
import { log } from '../utils/logger';
import { getEffectivePlan } from '../utils/effectivePlan';
import { isSensitiveAllowed } from '../utils/sensitiveActionGating';
import { LEGAL_URLS, APPLE_STANDARD_EULA_URL } from '../config/legalUrls';
import { openExternalLegalUrl } from '../utils/openExternalLegalUrl';
import CellariumLoader from '../components/CellariumLoader';
import { captureCriticalError, sentryFlowBreadcrumb } from '../utils/sentryContext';
import { APPLE_SUBSCRIPTIONS_MANAGE_URL } from '../constants/appleIap';
import {
  ensureIapConnection,
  finishApplePurchasesAfterBackendSync,
  finishAppleTransactionIfNeeded,
  getReceiptBase64,
  purchaseAppleSubscription,
  purchaseAppleBranchAddon,
  restoreApplePurchasesForReceipt,
} from '../services/appleIapSubscription';
import { validateAppleReceiptBackend } from '../services/validateAppleReceipt';
import { validateGooglePurchaseBackend, getCellariumAndroidPackageName } from '../services/validateGooglePurchase';
import { finishGoogleTransactionIfNeeded } from '../services/googlePlayBilling';
import { useGooglePlayBilling } from '../hooks/useGooglePlayBilling';
import { isAndroidBillingApp, shouldUseStripeSubscriptionUi, stripeEdgeClientMeta } from '../utils/billingPlatform';

// Paleta: CELLARIUM como base; admin legacy solo sombra / warning donde no hay equivalente único.
const PALETTE = {
  headerBg: CELLARIUM.primaryDark,
  headerTitle: CELLARIUM.textOnDark,
  headerSubtitle: CELLARIUM.textOnDarkMuted,
  cardBg: CELLARIUM_THEME.admin.card,
  cardShadow: CELLARIUM_THEME.admin.shadow,
  text: CELLARIUM.text,
  subtext: CELLARIUM.muted,
  border: CELLARIUM.border,
  primary: CELLARIUM.primary,
  primaryDark: CELLARIUM.primaryDark,
  pillBg: CELLARIUM_THEME.admin.pillBg,
  /** Sin token "success" en cellariumTheme; verde para badge OK / CTA add-ons. */
  success: '#2d6a4f',
  blocked: CELLARIUM_THEME.admin.warning,
} as const;

/**
 * Radio 12 en cards legacy y fila de CTAs: densidad compacta en lista.
 * Distinto de CELLARIUM_LAYOUT.cardRadius (18), usado en bloques premium ya migrados.
 */
const SUBS_COMPACT_RADIUS = 12;
const SUBS_PILL_RADIUS = 20;

type LoadingActionSubscription =
  | 'subscribe'
  | 'open-portal'
  | 'save-addons'
  | 'upgrade'
  | 'apple-purchase'
  | 'apple-restore'
  | 'apple-sync'
  | 'google-purchase'
  | 'google-restore'
  | null;

type SubscriptionsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Subscriptions'>;
type SubscriptionsScreenRouteProp = RouteProp<RootStackParamList, 'Subscriptions'>;

interface Props {
  navigation: SubscriptionsScreenNavigationProp;
  route: SubscriptionsScreenRouteProp;
}

/**
 * Helper para invocar Edge Functions con Authorization Bearer token.
 * Obtiene sesión fresca (refresh + getSession) y envía el token en el header.
 * En 401 reintenta una vez tras refresh.
 */
async function invokeAuthedFunction<T = any>(
  functionName: string,
  body?: Record<string, any>,
  options?: { retryOn401?: boolean }
): Promise<{ data: T | null; error: any }> {
  const retryOn401 = options?.retryOn401 !== false;

  const getFreshSession = async () => {
    await supabase.auth.refreshSession();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    return { session, sessionError };
  };

  const doInvoke = async (session: { access_token: string }): Promise<{ data: T | null; error: any }> => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: body || {},
      headers: {
        authorization: `Bearer ${session.access_token}`,
      },
    });
    return { data, error };
  };

  try {
    const { session, sessionError } = await getFreshSession();

    if (sessionError) {
      log.error('session error', sessionError?.message ?? 'unknown');
      return {
        data: null,
        error: {
          message: 'Error al obtener sesión de autenticación',
          code: 'SESSION_ERROR',
        },
      };
    }

    if (!session?.access_token) {
      log.debug('no session');
      return {
        data: null,
        error: {
          message: 'No hay sesión activa. Por favor inicia sesión nuevamente.',
          code: 'NO_SESSION',
        },
      };
    }

    let { data, error } = await doInvoke(session);

    // Retry once on 401 with fresh session
    if (retryOn401 && error?.context?.response) {
      const res = error.context.response as Response;
      if (res.status === 401) {
        log.debug('401, retrying once');
        const { session: retrySession, sessionError: retryErr } = await getFreshSession();
        if (!retryErr && retrySession?.access_token) {
          const retry = await doInvoke(retrySession);
          if (!retry.error) return { data: retry.data, error: null };
          error = retry.error;
        }
      }
    }

    if (error) {
      let status: number | undefined;
      let bodyText: string | undefined;
      let bodyJson: Record<string, unknown> | null = null;

      if (error.context?.response) {
        const res = error.context.response as Response;
        status = res.status;
        try {
          bodyText = await res.clone().text();
        } catch {
          bodyText = undefined;
        }
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText) as unknown;
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              bodyJson = parsed as Record<string, unknown>;
            }
          } catch {
            // body is not JSON, keep bodyText only
          }
        }
      }

      const serverMessage = bodyJson?.error != null ? String(bodyJson.error) : bodyJson?.message != null ? String(bodyJson.message) : error.message;
      const serverCode = bodyJson?.code != null ? String(bodyJson.code) : error.code;
      const is401 = status === 401;
      const errorMessage =
        is401
          ? (__DEV__ ? 'Session missing/expired. Inicia sesión de nuevo.' : 'Tu sesión ha expirado. Inicia sesión de nuevo.')
          : (serverMessage || `Error al invocar ${functionName}`);
      const errorCode = is401 ? 'SESSION_EXPIRED' : (serverCode || 'FUNCTION_ERROR');

      if (__DEV__) {
        log.error(functionName, 'status', status ?? 'n/a', 'code', errorCode, bodyText != null ? bodyText.slice(0, 150) : '');
      }
      if (!error.context?.response && __DEV__) {
        log.error(functionName, 'no response', error.message ?? error.code);
      }

      return {
        data: null,
        error: {
          message: errorMessage,
          code: errorCode,
          status,
          bodyText: __DEV__ ? bodyText : undefined,
          bodyJson: __DEV__ ? bodyJson : undefined,
        },
      };
    }

    return { data, error: null };
  } catch (error: any) {
    log.error('invoke unexpected', functionName, error?.message ?? error);
    return {
      data: null,
      error: {
        message: error.message || 'Error inesperado',
        code: 'UNEXPECTED_ERROR',
      },
    };
  }
}

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  /** Importe mostrado en tarjeta (MXN fijo en UI). */
  priceCardText: string;
  /** Importe con moneda explícita en modales / detalle (MXN fijo en UI). */
  priceDetailText: string;
  features: string[];
  limitations: {
    branches: number;
    wines: number;
    managers: number;
  };
  blockedFeatures: string[];
  lookupKey?: string; // Stripe: bistro_monthly | trattoria_monthly | grand_maison_monthly (no IAP)
}

/** Precios mensuales visibles (MXN); fijos en UI; el cobro real sigue siendo el de la tienda / Stripe. */
const PRICE_BISTRO_MXN = 1799;
const PRICE_TRATTORIA_MXN = 2949;
const PRICE_GRAND_MAISON_MXN = 4499;
/** Sucursales base incluidas (modelo canónico). */
const BASE_BRANCHES_INCLUDED = 1;
/** Precio add-on sucursal (MXN). Fallback si get-addon-price falla. */
const PRICE_ADDON_BRANCH_MXN = 520;

/** Precio mensual del plan base en centavos (MXN); mismo valor que en tarjetas de planes / Stripe list price UI. */
function stripeBasePlanPriceCents(effective: ReturnType<typeof getEffectivePlan>): number {
  if (effective === 'bistro') return PRICE_BISTRO_MXN * 100;
  if (effective === 'trattoria') return PRICE_TRATTORIA_MXN * 100;
  if (effective === 'grand-maison') return PRICE_GRAND_MAISON_MXN * 100;
  return 0;
}

const BACKOFF_DELAYS_MS = [800, 1200, 2000, 3000, 4000, 0];
const MAX_ATTEMPTS = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Subcomponentes de UI (estilo Catálogo) ---
type StylesRecord = ReturnType<typeof StyleSheet.create>;

function CurrentStatusCard({
  styles,
  sectionTitle,
  planLabel,
  showFreePlanTagline,
  taglineFree,
  expirationRowLabel,
  expirationText,
  expirationOptionalLines,
  showAddonsRow,
  addonsCount,
  showExpiration,
  labels,
}: {
  styles: StylesRecord;
  sectionTitle: string;
  planLabel: string;
  showFreePlanTagline: boolean;
  taglineFree: string;
  expirationRowLabel: string;
  expirationText: string;
  expirationOptionalLines?: string[];
  showAddonsRow: boolean;
  addonsCount: number;
  showExpiration: boolean;
  labels: {
    addonsBranches: string;
  };
}) {
  return (
    <View style={styles.statusCard}>
      <View style={styles.statusHeaderRow}>
        <Text style={styles.statusTitle}>{sectionTitle}</Text>
        <View style={styles.planPill}>
          <Text style={styles.planPillText}>{planLabel}</Text>
        </View>
      </View>
      {showFreePlanTagline ? (
        <Text style={styles.statusTagline}>{taglineFree}</Text>
      ) : null}
      {showExpiration && (
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{expirationRowLabel}</Text>
          <Text style={styles.statusValue}>{expirationText}</Text>
        </View>
      )}
      {expirationOptionalLines?.map((line, i) => (
        <View key={i} style={styles.statusRow}>
          <Text style={styles.statusValue}>{line}</Text>
        </View>
      ))}
      {showAddonsRow && (
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{labels.addonsBranches}</Text>
          <Text style={styles.statusValue}>{addonsCount}</Text>
        </View>
      )}
    </View>
  );
}

/** Enlaces EULA + privacidad (Guideline 3.1.2). Reutilizado arriba del listado café y junto al CTA. */
function SubscriptionLegalLinksRow({
  styles,
  t,
  variant = 'inline',
}: {
  styles: StylesRecord;
  t: (key: string) => string;
  variant?: 'inline' | 'standalone';
}) {
  const rowStyle =
    variant === 'standalone'
      ? [styles.planLegalLinksRow, styles.planLegalLinksRowStandalone]
      : styles.planLegalLinksRow;

  return (
    <View style={rowStyle}>
      <TouchableOpacity
        onPress={() =>
          void openExternalLegalUrl(
            APPLE_STANDARD_EULA_URL,
            t('msg.error'),
            t('settings.link_open_error')
          )
        }
        hitSlop={{ top: 10, bottom: 6, left: 4, right: 4 }}
        accessibilityRole="link"
        accessibilityLabel={t('subscription.paywall_terms_eula')}
      >
        <Text style={styles.planLegalLink}>{t('subscription.paywall_terms_eula')}</Text>
      </TouchableOpacity>
      <Text style={styles.planLegalSep} accessible={false}>
        {' · '}
      </Text>
      <TouchableOpacity
        onPress={() =>
          void openExternalLegalUrl(
            LEGAL_URLS.privacyPolicy,
            t('msg.error'),
            t('settings.link_open_error')
          )
        }
        hitSlop={{ top: 10, bottom: 6, left: 4, right: 4 }}
        accessibilityRole="link"
        accessibilityLabel={t('subscription.paywall_privacy')}
      >
        <Text style={styles.planLegalLink}>{t('subscription.paywall_privacy')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function PlanCard({
  styles,
  plan,
  isSelected,
  isCurrentPlan,
  onSelect,
  labels,
  inSelectionBundle = false,
}: {
  styles: StylesRecord;
  plan: Plan;
  isSelected: boolean;
  isCurrentPlan: boolean;
  onSelect: (id: string) => void;
  labels: { includes: string; notIncludes: string; planCurrent: string; priceFree: string };
  /** Ficha superior del bloque unificado (borde + CTA debajo). */
  inSelectionBundle?: boolean;
}) {
  const isFree = plan.id === 'cafe';
  useEffect(() => {
    console.log('[Cellarium][PlanCard] RENDER PRICE', {
      id: plan.id,
      price: plan.price,
      priceCardText: plan.priceCardText,
      priceDetailText: plan.priceDetailText,
    });
  }, [plan.id, plan.price, plan.priceCardText, plan.priceDetailText]);
  return (
    <TouchableOpacity
      style={[
        styles.planCardBase,
        inSelectionBundle ? styles.planCardInBundle : styles.planCardStandalone,
        !inSelectionBundle && isSelected && styles.planCardSelected,
      ]}
      onPress={() => !isFree && onSelect(plan.id)}
      disabled={isFree}
    >
      {isCurrentPlan && (
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>{labels.planCurrent}</Text>
        </View>
      )}
      <View style={styles.planHeader}>
        <Text style={styles.planName}>{plan.name}</Text>
        <View style={styles.priceContainer}>
          <Text style={styles.priceAmount}>
            {isFree ? labels.priceFree : plan.priceCardText}
          </Text>
          {!isFree && (
            <Text style={styles.pricePeriod}>/{plan.period}</Text>
          )}
        </View>
      </View>
      <View style={styles.featuresContainer}>
        <Text style={styles.featuresTitle}>{labels.includes}</Text>
        {plan.features.map((feature, index) => (
          <View key={index} style={styles.featureItem}>
            <Text style={styles.featureIcon}>✓</Text>
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>
      {plan.blockedFeatures.length > 0 && (
        <View style={styles.blockedContainer}>
          <Text style={styles.blockedTitle}>{labels.notIncludes}</Text>
          {plan.blockedFeatures.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <Text style={styles.blockedIcon}>✗</Text>
              <Text style={styles.blockedText}>{feature}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function AddonBranchesCard({
  styles,
  addonTitle,
  introBlock,
  totalCapacityLine,
  addonBranchesLabel,
  addonBranchesQty,
  setAddonBranchesQty,
  minAllowedAddonQty,
  breakdownTitle,
  breakdownBusinessLabel,
  breakdownBusinessAmount,
  breakdownAddonsLabel,
  breakdownAddonsAmount,
  breakdownTotalLabel,
  breakdownTotalAmount,
  onUpdate,
  isProcessing,
  saveAddonsLabel,
  updateDisabled = false,
}: {
  styles: StylesRecord;
  addonTitle: string;
  introBlock: string;
  totalCapacityLine: string;
  addonBranchesLabel: string;
  addonBranchesQty: string;
  setAddonBranchesQty: (v: string) => void;
  /** Mínimo de sucursales adicionales permitido según sucursales activas en BD. */
  minAllowedAddonQty: number;
  breakdownTitle: string;
  breakdownBusinessLabel: string;
  breakdownBusinessAmount: string;
  breakdownAddonsLabel: string;
  breakdownAddonsAmount: string;
  breakdownTotalLabel: string;
  breakdownTotalAmount: string;
  onUpdate: () => void;
  isProcessing: boolean;
  saveAddonsLabel: string;
  updateDisabled?: boolean;
}) {
  const addonButtonDisabled = isProcessing || updateDisabled;
  return (
    <View style={[styles.addonCard, isProcessing && styles.buttonDisabled]}>
      <Text style={styles.addonTitle}>{addonTitle}</Text>
      <Text style={styles.addonIntro}>{introBlock}</Text>
      <Text style={styles.addonCapacityLine}>{totalCapacityLine}</Text>
      <Text style={styles.addonControlLabel}>{addonBranchesLabel}</Text>
      <View style={styles.addonControls}>
        <TouchableOpacity
          style={[styles.addonStepperBtn, isProcessing && styles.buttonDisabled]}
          onPress={() => {
            const current = parseInt(addonBranchesQty, 10) || 0;
            const next = current - 1;
            if (next < minAllowedAddonQty) return;
            if (current > 0) setAddonBranchesQty(next.toString());
          }}
          disabled={isProcessing}
        >
          <Text style={styles.addonStepperBtnText}>−</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.addonInput}
          value={addonBranchesQty}
          onChangeText={(text) => {
            const num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= 50) setAddonBranchesQty(text);
            else if (text === '') setAddonBranchesQty('0');
          }}
          keyboardType="number-pad"
          editable={!isProcessing}
          placeholder="0"
        />
        <TouchableOpacity
          style={[styles.addonStepperBtn, isProcessing && styles.buttonDisabled]}
          onPress={() => {
            const current = parseInt(addonBranchesQty, 10) || 0;
            if (current < 50) setAddonBranchesQty((current + 1).toString());
          }}
          disabled={isProcessing}
        >
          <Text style={styles.addonStepperBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.addonBreakdown}>
        <Text style={styles.addonBreakdownTitle}>{breakdownTitle}</Text>
        <View style={styles.addonSummaryRow}>
          <Text style={styles.addonSummaryLabel}>{breakdownBusinessLabel}</Text>
          <Text style={styles.addonSummaryAmount}>{breakdownBusinessAmount}</Text>
        </View>
        <View style={styles.addonSummaryRow}>
          <Text style={styles.addonSummaryLabel}>{breakdownAddonsLabel}</Text>
          <Text style={styles.addonSummaryAmount}>{breakdownAddonsAmount}</Text>
        </View>
        <View style={styles.addonSummaryDivider} />
        <View style={styles.addonSummaryRow}>
          <Text style={styles.addonSummaryTotalLabel}>{breakdownTotalLabel}</Text>
          <Text style={styles.addonSummaryTotalAmount}>{breakdownTotalAmount}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.addonUpdateButton, addonButtonDisabled && styles.buttonDisabled]}
        onPress={onUpdate}
        disabled={addonButtonDisabled}
      >
        {isProcessing ? (
          <ActivityIndicator color={CELLARIUM.card} size="small" />
        ) : (
          <Text style={styles.addonUpdateButtonText}>{saveAddonsLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function UpgradePlanSection({
  styles,
  plans,
  onUpgrade,
  isProcessing,
  labels,
}: {
  styles: StylesRecord;
  plans: Plan[];
  onUpgrade: (planLookupKey: string) => void;
  isProcessing: boolean;
  labels: { sectionTitle: string; upgradeCta: string; recommended: string };
}) {
  if (plans.length === 0) return null;
  return (
    <View style={styles.upgradeSection}>
      <Text style={styles.upgradeSectionTitle}>{labels.sectionTitle}</Text>
      {plans.map((plan) => {
        const showRecommended = plan.id === 'trattoria';
        return (
          <View key={plan.id} style={styles.upgradePlanCard}>
            {showRecommended ? (
              <View style={styles.upgradeRecommendedBadge}>
                <Text style={styles.upgradeRecommendedBadgeText}>{labels.recommended}</Text>
              </View>
            ) : null}
            <Text style={styles.upgradePlanName}>{plan.name}</Text>
            {plan.features.slice(0, 2).map((f, i) => (
              <View key={i} style={styles.upgradeBenefitRow}>
                <Text style={styles.upgradeBenefitBullet}>•</Text>
                <Text style={styles.upgradeBenefitText}>{f}</Text>
              </View>
            ))}
            <Text style={styles.upgradePlanPrice}>
              {plan.priceDetailText} / {plan.period}
            </Text>
            <TouchableOpacity
              style={[styles.upgradeCtaButton, isProcessing && styles.buttonDisabled]}
              onPress={() => plan.lookupKey && onUpgrade(plan.lookupKey)}
              disabled={isProcessing}
            >
              <Text style={styles.upgradeCtaButtonText}>{labels.upgradeCta}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const SubscriptionsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { status: guardStatus } = useAdminGuard({
    navigation,
    route,
    allowedRoles: ['owner'],
  });
  const { t, language } = useLanguage();
  const { user, refreshUser, profileReady } = useAuth();
  const { allBranches } = useBranch();

  if (guardStatus === 'loading' || guardStatus === 'profile_loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CELLARIUM.bg }}>
        <ActivityIndicator size="large" color={CELLARIUM.primary} />
      </View>
    );
  }
  if (guardStatus === 'pending') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CELLARIUM.bg, padding: 24 }}>
        <Text style={{ fontSize: 16, color: CELLARIUM.muted, textAlign: 'center' }}>Pendiente de aprobación</Text>
      </View>
    );
  }
  if (guardStatus === 'denied') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CELLARIUM.bg, padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: CELLARIUM.text, textAlign: 'center' }}>Sin permiso</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: CELLARIUM.muted, textAlign: 'center' }}>Solo el propietario puede gestionar suscripciones.</Text>
      </View>
    );
  }
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingActionSubscription>(null);
  const isProcessing = loadingAction !== null;
  const activeBranchesCount = allBranches.length;
  const minAllowedAddonQty = Math.max(0, activeBranchesCount - BASE_BRANCHES_INCLUDED);
  const [addonBranchesQty, setAddonBranchesQty] = useState<string>('0');
  type SubsPremiumNotice =
    | null
    | { kind: 'upgrade_success'; receiptUrl: string | null }
    | { kind: 'plan_synced' }
    | { kind: 'addon_saved'; qty: number };
  const [subsPremiumNotice, setSubsPremiumNotice] = useState<SubsPremiumNotice>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const verifyInputRef = useRef<TextInput>(null);
  const needsEmailVerification =
    user?.role === 'owner' &&
    user?.signup_method === 'password' &&
    user?.owner_email_verified !== true;
  /** Precio formateado del add-on (ej. "$499 MXN"). Cargado desde get-addon-price o fallback. */
  const [addonPriceFormatted, setAddonPriceFormatted] = useState<string>(`$${PRICE_ADDON_BRANCH_MXN}`);
  const addonPriceCacheRef = useRef<{ formatted: string; unit_amount: number } | null>(null);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const isIos = Platform.OS === 'ios';
  const isAndroid = isAndroidBillingApp();
  const useStripeSubscriptionUi = shouldUseStripeSubscriptionUi();
  const lastAppleSyncAtRef = useRef(0);
  const { buySubscription, restorePurchases: restoreGooglePlayPurchases } = useGooglePlayBilling();

  useFocusEffect(
    useCallback(() => {
      if (route.params?.openVerifyEmail && needsEmailVerification) {
        setTimeout(() => verifyInputRef.current?.focus(), 400);
      }
    }, [route.params?.openVerifyEmail, needsEmailVerification])
  );

  const dateLocale = language === 'en' ? 'en-US' : 'es-MX';
  const formatDate = useCallback(
    (iso?: string | null): string => {
      if (!iso) return t('common.na');
      try {
        return new Date(iso).toLocaleDateString(dateLocale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch {
        return t('common.na');
      }
    },
    [language, t]
  );

  /** Suscripción del owner (current_period_end, cancel_at_period_end, metadata) para UI de cancelación programada. */
  const [latestSubscription, setLatestSubscription] = useState<{
    current_period_end?: string;
    cancel_at_period_end?: boolean;
    metadata?: Record<string, unknown>;
  } | null>(null);
  useEffect(() => {
    if (!user?.id || user?.role !== 'owner') {
      setLatestSubscription(null);
      return;
    }
    const load = async () => {
      const ownerId = (user as any)?.owner_id ?? user.id;
      if (user.subscription_id) {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('current_period_end, cancel_at_period_end, metadata')
          .eq('id', user.subscription_id)
          .maybeSingle();
        if (__DEV__) {
          console.log('[SUBS_UI] latestSubscription fetch', {
            source: 'by_id',
            ownerId,
            error: (error as any)?.message ?? null,
            data,
            userCancel: user.subscription_cancel_at_period_end ?? null,
            cancel_at_period_end: (data as any)?.cancel_at_period_end ?? null,
            metaCancelScheduled: (data as any)?.metadata?.cancel_scheduled ?? null,
            metaCancelAtUnix: (data as any)?.metadata?.cancel_at_unix ?? null,
          });
        }
        setLatestSubscription(data ?? null);
      } else {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('current_period_end, cancel_at_period_end, metadata')
          .eq('owner_id', ownerId)
          .order('current_period_end', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (__DEV__) {
          console.log('[SUBS_UI] latestSubscription fetch', {
            source: 'by_owner',
            ownerId,
            error: (error as any)?.message ?? null,
            data,
            userCancel: user.subscription_cancel_at_period_end ?? null,
            cancel_at_period_end: (data as any)?.cancel_at_period_end ?? null,
            metaCancelScheduled: (data as any)?.metadata?.cancel_scheduled ?? null,
            metaCancelAtUnix: (data as any)?.metadata?.cancel_at_unix ?? null,
          });
        }
        setLatestSubscription(data ?? null);
      }
    };
    load();
  }, [user?.id, user?.role, user?.subscription_id]);

  // Prioridad: subscriptions.metadata > subscriptions > users (blindaje si users desincronizado)
  const expiresAt = useMemo(() => {
    const metaIso = latestSubscription?.metadata?.cancel_at_iso;
    const iso =
      (typeof metaIso === 'string' ? metaIso : null) ||
      latestSubscription?.current_period_end ||
      user?.subscription_expires_at ||
      null;
    return iso ? new Date(iso) : null;
  }, [
    latestSubscription?.metadata?.cancel_at_iso,
    latestSubscription?.current_period_end,
    user?.subscription_expires_at,
  ]);

  const cancelScheduled = useMemo(() => {
    if (latestSubscription?.metadata?.cancel_scheduled === true) return true;
    if (typeof latestSubscription?.metadata?.cancel_at_unix === 'number') return true;
    if (latestSubscription?.cancel_at_period_end === true) return true;
    if (user?.subscription_cancel_at_period_end === true) return true;
    return false;
  }, [
    latestSubscription?.metadata?.cancel_scheduled,
    latestSubscription?.metadata?.cancel_at_unix,
    latestSubscription?.cancel_at_period_end,
    user?.subscription_cancel_at_period_end,
  ]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log('[SUBS_HARDEN]', {
      cancelScheduled,
      metaCancelScheduled: latestSubscription?.metadata?.cancel_scheduled,
      metaCancelAtUnix: latestSubscription?.metadata?.cancel_at_unix,
      latestCancelAtPeriodEnd: latestSubscription?.cancel_at_period_end,
      userCancel: user?.subscription_cancel_at_period_end,
    });
  }, [
    cancelScheduled,
    latestSubscription?.metadata?.cancel_scheduled,
    latestSubscription?.metadata?.cancel_at_unix,
    latestSubscription?.cancel_at_period_end,
    user?.subscription_cancel_at_period_end,
  ]);

  const cancelAtIso = useMemo(() => {
    const iso = latestSubscription?.metadata?.cancel_at_iso;
    return typeof iso === 'string' ? iso : null;
  }, [latestSubscription?.metadata?.cancel_at_iso]);

  const refreshUserWithBackoffUntilUpdated = useCallback(
    async (expectedPlan?: CanonicalPlanId): Promise<boolean> => {
      if (!refreshUser) return false;
      const initialPlan = userRef.current?.subscription_plan;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          await refreshUser();
        } catch (e) {
          log.warn('refreshUser error', (e as Error)?.message);
        }
        const latest = userRef.current;
        const plan = latest?.subscription_plan;
        const updated = expectedPlan != null ? plan === expectedPlan : plan !== initialPlan;
        if (updated) return true;
        const delay = BACKOFF_DELAYS_MS[attempt] ?? 0;
        if (delay > 0) await sleep(delay);
      }
      return false;
    },
    [refreshUser]
  );

  /** Tras compra/restauración Apple: refresco inmediato del perfil (billing_provider) + backoff. */
  const refreshSubscriptionProfileImmediate = useCallback(
    async (expectedPlan?: CanonicalPlanId) => {
      try {
        await refreshUser?.();
      } catch {
        /* ignore */
      }
      await refreshUserWithBackoffUntilUpdated(expectedPlan);
    },
    [refreshUser, refreshUserWithBackoffUntilUpdated]
  );

  /** RPC enforce_subscription_expiry + refreshUser; fallback a solo refresh si la RPC falla. */
  const enforceExpiryAndRefresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('enforce_subscription_expiry');
      if (__DEV__) {
        if (error) log.debug('enforce_subscription_expiry', { error: error.message });
        else log.debug('enforce_subscription_expiry', { data });
      }
    } catch (e) {
      if (__DEV__) log.warn('enforce_subscription_expiry', (e as Error)?.message);
    }
    try {
      await refreshUser?.();
    } catch (e) {
      if (__DEV__) log.warn('refreshUser after enforce', (e as Error)?.message);
    }
  }, [refreshUser]);

  const didEnforceOnMount = useRef(false);
  useEffect(() => {
    if (!profileReady || !user?.id || !refreshUser || didEnforceOnMount.current) return;
    didEnforceOnMount.current = true;
    enforceExpiryAndRefresh();
  }, [profileReady, user?.id, refreshUser, enforceExpiryAndRefresh]);

  useFocusEffect(
    useCallback(() => {
      setLoadingAction(null);
      void refreshUser?.();
      if (Platform.OS !== 'ios') return;
      const u = userRef.current;
      if (!u || u.role !== 'owner' || u.billing_provider !== 'apple') return;
      if (Date.now() - lastAppleSyncAtRef.current < 90_000) return;
      lastAppleSyncAtRef.current = Date.now();
      (async () => {
        try {
          setLoadingAction('apple-sync');
          await ensureIapConnection();
          let receipt = await getReceiptBase64(false);
          if (!receipt) receipt = await getReceiptBase64(true);
          if (!receipt) return;
          const { error } = await validateAppleReceiptBackend(receipt, 'sync');
          if (!error) await refreshSubscriptionProfileImmediate();
        } catch {
          /* silencioso: revalidación en segundo plano */
        } finally {
          setLoadingAction(null);
        }
      })();
    }, [refreshUser, refreshSubscriptionProfileImmediate])
  );

  // Reflejar solo el add-on contratado en Stripe/BD (no mezclar con minAllowedAddonQty aquí:
  // ese mínimo solo aplica al stepper y al guardar; forzar max(servidor, min) mostraba 1 y $520 con 0 add-ons).
  useEffect(() => {
    if (user?.subscription_branch_addons_count === undefined) return;
    const fromServer = Math.min(50, Math.max(0, Math.floor(Number(user.subscription_branch_addons_count))));
    setAddonBranchesQty((prev) => (prev !== String(fromServer) ? String(fromServer) : prev));
  }, [user?.subscription_branch_addons_count]);

  useEffect(() => {
    if (Platform.OS === 'android') return;
    if (addonPriceCacheRef.current) {
      setAddonPriceFormatted(addonPriceCacheRef.current.formatted);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke<{ formatted?: string; unit_amount?: number }>(
        'get-addon-price',
        { body: {} }
      );
      if (cancelled) return;
      if (!error && data?.formatted != null) {
        const unit = data.unit_amount ?? 52000;
        addonPriceCacheRef.current = { formatted: data.formatted, unit_amount: unit };
        setAddonPriceFormatted(data.formatted);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const mainPlans = useMemo((): Plan[] => {
    const period = t('subscription.period_month');
    const mxn = 'MXN';
    const premiumTexts = (amountMxn: number) => ({
      priceCardText: `$${amountMxn}`,
      priceDetailText: `$${amountMxn} ${mxn}`,
    });
    const bistroT = premiumTexts(PRICE_BISTRO_MXN);
    const trattoriaT = premiumTexts(PRICE_TRATTORIA_MXN);
    const grandT = premiumTexts(PRICE_GRAND_MAISON_MXN);
    return [
      {
        id: 'cafe',
        name: t('subscription.plan_name.cafe'),
        price: 0,
        currency: 'MXN',
        period,
        priceCardText: '',
        priceDetailText: '',
        features: [
          t('subscription.plan.cafe.features.0'),
          t('subscription.plan.cafe.features.1'),
          t('subscription.plan.cafe.features.2'),
          t('subscription.plan.cafe.features.3'),
        ],
        limitations: { branches: 1, wines: 10, managers: 1 },
        blockedFeatures: [
          t('subscription.plan.cafe.blocked.0'),
          t('subscription.plan.cafe.blocked.1'),
        ],
      },
      {
        id: 'bistro',
        name: t('subscription.plan_name.bistro'),
        price: PRICE_BISTRO_MXN,
        currency: 'MXN',
        period,
        priceCardText: bistroT.priceCardText,
        priceDetailText: bistroT.priceDetailText,
        lookupKey: 'bistro_monthly',
        features: [
          t('subscription.plan.bistro.features.0'),
          t('subscription.plan.bistro.features.1'),
          t('subscription.plan.bistro.features.2'),
          t('subscription.plan.bistro.features.3'),
        ],
        limitations: { branches: 1, wines: 50, managers: 3 },
        blockedFeatures: [],
      },
      {
        id: 'trattoria',
        name: t('subscription.plan_name.trattoria'),
        price: PRICE_TRATTORIA_MXN,
        currency: 'MXN',
        period,
        priceCardText: trattoriaT.priceCardText,
        priceDetailText: trattoriaT.priceDetailText,
        lookupKey: 'trattoria_monthly',
        features: [
          t('subscription.plan.trattoria.features.0'),
          t('subscription.plan.trattoria.features.1'),
          t('subscription.plan.trattoria.features.2'),
        ],
        limitations: { branches: 1, wines: 150, managers: -1 },
        blockedFeatures: [],
      },
      {
        id: 'grand_maison',
        name: t('subscription.plan_name.grand_maison'),
        price: PRICE_GRAND_MAISON_MXN,
        currency: 'MXN',
        period,
        priceCardText: grandT.priceCardText,
        priceDetailText: grandT.priceDetailText,
        lookupKey: 'grand_maison_monthly',
        features: [t('subscription.plan.grand_maison.features.0'), t('subscription.plan.grand_maison.features.1')],
        limitations: { branches: 1, wines: -1, managers: -1 },
        blockedFeatures: [],
      },
    ];
  }, [t]);

  useEffect(() => {
    for (const plan of mainPlans) {
      if (plan.id === 'cafe') continue;
      console.log('[Cellarium][Subscriptions] PLAN DEBUG', {
        id: plan.id,
        price: plan.price,
        priceCardText: plan.priceCardText,
        priceDetailText: plan.priceDetailText,
      });
    }
  }, [mainPlans]);

  const effectivePlan = getEffectivePlan(user ?? null);
  const hasActiveSub = effectivePlan !== 'cafe';
  const isPremium = hasActiveSub;
  const showStripeAddonUi =
    useStripeSubscriptionUi &&
    !isIos &&
    user?.billing_provider !== 'apple' &&
    hasActiveSub &&
    !!user?.stripe_customer_id;

  const handleSelectPlan = useCallback((planId: string) => {
    if (planId === 'cafe' || planId === 'bistro' || planId === 'trattoria' || planId === 'grand_maison') {
      setSelectedPlan(planId);
    }
  }, []);

  const handleSubscribe = async () => {
    if (!selectedPlan) {
      Alert.alert(t('msg.error'), t('subscription.select_plan_first'));
      return;
    }
    if (!user?.id) {
      Alert.alert(t('msg.error'), t('subscription.error_no_session'));
      return;
    }
    const plan = mainPlans.find(p => p.id === selectedPlan);
    if (!plan) return;
    if (plan.id === 'cafe') {
      Alert.alert(t('subscription.plan_free_title'), t('subscription.plan_free_already'));
      return;
    }
    if (hasActiveSub) {
      Alert.alert(
        t('subscription.already_subscribed_title'),
        t(isIos ? 'subscription.already_subscribed_message_ios' : 'subscription.already_subscribed_message'),
        [{ text: t('subscription.alert_ok'), onPress: () => handleManageSubscription() }]
      );
      return;
    }
    if (!isSensitiveAllowed(user)) {
      Alert.alert(
        'Verificación requerida',
        'Verifica tu correo en el bloque de arriba para poder suscribirte.',
        [{ text: 'Entendido', style: 'cancel' }]
      );
      return;
    }
    if (isAndroid && plan.id !== 'cafe') {
      setLoadingAction('google-purchase');
      try {
        const { purchase } = await buySubscription(plan.id);
        const token = purchase.purchaseToken?.trim();
        const productId = purchase.productId?.trim();
        if (!token || !productId) {
          Alert.alert(t('msg.error'), t('subscription.error_generic'));
          return;
        }
        const { data, error } = await validateGooglePurchaseBackend({
          purchaseToken: token,
          productId,
          packageName: getCellariumAndroidPackageName(),
        });
        if (error) {
          const code = error.code;
          if (code === 'STRIPE_SUBSCRIPTION_ACTIVE' || code === 'APPLE_SUBSCRIPTION_ACTIVE') {
            Alert.alert(t('msg.error'), error.message ?? '');
          } else if (code === 'PLAY_PURCHASE_PENDING') {
            Alert.alert(t('msg.error'), error.message ?? t('subscription.google_pending_message'));
          } else if (code === 'PLAY_API_ERROR' || error.status === 502) {
            Alert.alert(t('msg.error'), error.message ?? t('subscription.error_generic'));
          } else {
            Alert.alert(t('msg.error'), error.message ?? t('subscription.error_generic'));
          }
          return;
        }
        const pendingCode = data?.code as string | undefined;
        if (pendingCode === 'PLAY_PURCHASE_PENDING') {
          Alert.alert(t('msg.error'), t('subscription.google_pending_message'));
          return;
        }
        if (data?.synced === 'lapsed' || data?.reason === 'subscription_inactive_or_expired') {
          await finishGoogleTransactionIfNeeded(purchase);
          await refreshSubscriptionProfileImmediate();
          Alert.alert(
            t('subscription.apple_sync_lapsed_title'),
            t('subscription.apple_sync_lapsed_message')
          );
          return;
        }
        if (data?.synced === 'active' || data?.ok === true) {
          await finishGoogleTransactionIfNeeded(purchase);
          const expectedPlan: CanonicalPlanId | undefined =
            plan.id === 'bistro'
              ? 'bistro'
              : plan.id === 'trattoria'
                ? 'trattoria'
                : plan.id === 'grand_maison'
                  ? 'grand-maison'
                  : undefined;
          await refreshSubscriptionProfileImmediate(expectedPlan);
          Alert.alert(t('subscription.google_success_title'), t('subscription.google_success_message'));
        } else {
          Alert.alert(t('msg.error'), t('subscription.error_generic'));
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Compra cancelada') {
          return;
        }
        captureCriticalError(error, {
          feature: 'google_iap_purchase',
          screen: 'Subscriptions',
          app_area: 'billing',
        });
        Alert.alert(
          t('msg.error'),
          error instanceof Error ? error.message : t('subscription.error_generic')
        );
      } finally {
        setLoadingAction(null);
      }
      return;
    }
    if (isIos && plan.id !== 'cafe') {
      Alert.alert(
        t('subscription.apple_confirm_title'),
        t('subscription.apple_confirm_message'),
        [
          { text: t('btn.cancel'), style: 'cancel' },
          {
            text: t('subscription.cta_subscribe'),
            onPress: async () => {
              try {
                setLoadingAction('apple-purchase');
                const applePlan =
                  plan.id === 'bistro'
                    ? 'bistro'
                    : plan.id === 'trattoria'
                      ? 'trattoria'
                      : 'grand_maison';
                const { purchase } = await purchaseAppleSubscription(applePlan);
                let receipt = await getReceiptBase64(false);
                if (!receipt) receipt = await getReceiptBase64(true);
                if (!receipt) {
                  Alert.alert(t('msg.error'), t('subscription.error_generic'));
                  return;
                }
                const { data, error } = await validateAppleReceiptBackend(receipt, 'purchase');
                if (error) {
                  if (error.code === 'STRIPE_SUBSCRIPTION_ACTIVE') {
                    Alert.alert(t('msg.error'), error.message);
                  } else if (error.code === 'NO_SESSION') {
                    Alert.alert(t('msg.error'), error.message ?? t('subscription.error_no_session'));
                  } else {
                    const base = error.message ?? t('subscription.error_generic');
                    Alert.alert(
                      t('msg.error'),
                      `${base}\n\n${t('subscription.apple_backend_retry_hint')}`
                    );
                  }
                  return;
                }
                const synced = data?.synced;
                const ok = data?.ok === true;
                if (synced === 'active' || ok) {
                  await finishAppleTransactionIfNeeded(purchase);
                  await finishApplePurchasesAfterBackendSync();
                  const expected =
                    selectedPlan === 'bistro'
                      ? 'bistro'
                      : selectedPlan === 'trattoria'
                        ? 'trattoria'
                        : selectedPlan === 'grand_maison'
                          ? 'grand-maison'
                          : undefined;
                  await refreshSubscriptionProfileImmediate(expected);
                  Alert.alert(t('subscription.apple_success_title'), t('subscription.apple_success_message'));
                } else if (synced === 'lapsed') {
                  await finishAppleTransactionIfNeeded(purchase);
                  await finishApplePurchasesAfterBackendSync();
                  await refreshSubscriptionProfileImmediate();
                  Alert.alert(
                    t('subscription.apple_sync_lapsed_title'),
                    t('subscription.apple_sync_lapsed_message')
                  );
                } else {
                  Alert.alert(t('msg.error'), t('subscription.apple_sync_unclear_message'));
                }
              } catch (error: unknown) {
                captureCriticalError(error, {
                  feature: 'apple_iap_purchase',
                  screen: 'Subscriptions',
                  app_area: 'billing',
                });
                Alert.alert(
                  t('msg.error'),
                  error instanceof Error ? error.message : t('subscription.error_generic')
                );
              } finally {
                setLoadingAction(null);
              }
            },
          },
        ]
      );
      return;
    }
    if (!plan.lookupKey) {
      Alert.alert(t('msg.error'), t('subscription.plan_invalid_checkout'));
      return;
    }
    const message = `${t('subscription.confirm_subscribe_message')} ${plan.priceDetailText}/${plan.period}?`;
    Alert.alert(
      t('subscription.confirm_subscribe'),
      message.replace('{plan}', plan.name),
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('subscription.cta_subscribe'),
          onPress: async () => {
            try {
              setLoadingAction('subscribe');
              const { data, error } = await invokeAuthedFunction<{ url: string; sessionId: string }>(
                'create-checkout-session',
                { planLookupKey: plan.lookupKey, ...stripeEdgeClientMeta() }
              );
      if (error) {
        setLoadingAction(null);
                if (error.code === 'ALREADY_SUBSCRIBED') {
                  await handleManageSubscription();
                  return;
                }
                if (error.code === 'APPLE_SUBSCRIPTION_ACTIVE') {
                  Alert.alert(t('msg.error'), error.message ?? '');
                  return;
                }
                if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
                  Alert.alert(
                    'Verificación requerida',
                    'Verifica tu correo en el bloque de arriba para continuar.',
                    [{ text: 'Entendido', style: 'cancel' }]
                  );
                  return;
                }
                Alert.alert(t('msg.error'), t('subscription.error_generic'));
                return;
              }
              if (!data?.url) {
                throw new Error('No checkout URL received');
              }
              const expectedPlan: CanonicalPlanId | undefined =
                selectedPlan === 'bistro'
                  ? 'bistro'
                  : selectedPlan === 'trattoria'
                    ? 'trattoria'
                    : selectedPlan === 'grand_maison'
                      ? 'grand-maison'
                      : undefined;
              const returnUrl = 'cellarium://auth-callback';
              if (__DEV__) console.log('[Checkout] opening', { url: data.url, returnUrl });
              const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
              if (__DEV__) console.log('[StripeAuthSession result]', result);
              const resultUrl = (result as { url?: string })?.url;
              if (__DEV__ && resultUrl) console.log('[StripeAuthSession url]', resultUrl);
              await refreshUserWithBackoffUntilUpdated(expectedPlan);
            } catch (error: any) {
              if (__DEV__) console.error('Error en suscripción:', error);
              captureCriticalError(error, {
                feature: 'stripe_checkout',
                screen: 'Subscriptions',
                app_area: 'billing',
              });
              Alert.alert(t('msg.error'), t('subscription.error_generic'));
            } finally {
              setLoadingAction(null);
            }
          },
        },
      ]
    );
  };

  const openAppleSubscriptionsManage = useCallback(() => {
    Alert.alert(
      t('subscription.apple_manage_title'),
      t('subscription.apple_manage_message'),
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('subscription.apple_manage_open'),
          onPress: () => {
            void Linking.openURL(APPLE_SUBSCRIPTIONS_MANAGE_URL);
          },
        },
      ]
    );
  }, [t]);

  const handleRestoreApplePurchases = useCallback(async () => {
    if (!user?.id) {
      Alert.alert(t('msg.error'), t('subscription.error_no_session'));
      return;
    }
    if (!isSensitiveAllowed(user)) {
      Alert.alert(
        'Verificación requerida',
        'Verifica tu correo en el bloque de arriba para continuar.',
        [{ text: 'Entendido', style: 'cancel' }]
      );
      return;
    }
    try {
      setLoadingAction('apple-restore');
      await restoreApplePurchasesForReceipt();
      let receipt = await getReceiptBase64(false);
      if (!receipt) receipt = await getReceiptBase64(true);
      if (!receipt) {
        Alert.alert(t('msg.error'), t('subscription.error_generic'));
        return;
      }
      const { data, error } = await validateAppleReceiptBackend(receipt, 'restore');
      if (error) {
        if (error.code === 'NO_SESSION') {
          Alert.alert(t('msg.error'), error.message ?? t('subscription.error_no_session'));
        } else {
          const base = error.message ?? t('subscription.error_generic');
          Alert.alert(t('msg.error'), `${base}\n\n${t('subscription.apple_backend_retry_hint')}`);
        }
        return;
      }
      await finishApplePurchasesAfterBackendSync();
      await refreshSubscriptionProfileImmediate();
      if (data?.synced === 'lapsed') {
        Alert.alert(
          t('subscription.apple_sync_lapsed_title'),
          t('subscription.apple_sync_lapsed_message')
        );
      } else {
        Alert.alert(t('subscription.apple_success_title'), t('subscription.apple_success_message'));
      }
    } catch (error: unknown) {
      captureCriticalError(error, {
        feature: 'apple_restore',
        screen: 'Subscriptions',
        app_area: 'billing',
      });
      Alert.alert(t('msg.error'), t('subscription.error_generic'));
    } finally {
      setLoadingAction(null);
    }
  }, [user, refreshSubscriptionProfileImmediate, t]);

  const handleRestoreGooglePurchases = useCallback(async () => {
    if (!isAndroid) return;
    if (!user?.id) {
      Alert.alert(t('msg.error'), t('subscription.error_no_session'));
      return;
    }
    if (!isSensitiveAllowed(user)) {
      Alert.alert(
        'Verificación requerida',
        'Verifica tu correo en el bloque de arriba para continuar.',
        [{ text: 'Entendido', style: 'cancel' }]
      );
      return;
    }
    try {
      setLoadingAction('google-restore');
      const { synced, message } = await restoreGooglePlayPurchases();
      await refreshUser?.();
      await refreshSubscriptionProfileImmediate();
      if (synced) {
        Alert.alert(t('subscription.google_success_title'), t('subscription.google_success_message'));
      } else {
        Alert.alert(
          t('subscription.android_play_coming_title'),
          message ?? t('subscription.google_restore_nothing_message')
        );
      }
    } catch (error: unknown) {
      captureCriticalError(error, {
        feature: 'google_restore',
        screen: 'Subscriptions',
        app_area: 'billing',
      });
      Alert.alert(t('msg.error'), t('subscription.error_generic'));
    } finally {
      setLoadingAction(null);
    }
  }, [isAndroid, user, refreshSubscriptionProfileImmediate, t, restoreGooglePlayPurchases, refreshUser]);

  const handleAppleBranchAddon = useCallback(
    async (slots: 1 | 3) => {
      if (!isIos) return;
      if (!user?.id) {
        Alert.alert(t('msg.error'), t('subscription.error_no_session'));
        return;
      }
      if (!isSensitiveAllowed(user)) {
        Alert.alert(
          'Verificación requerida',
          'Verifica tu correo en el bloque de arriba para continuar.',
          [{ text: 'Entendido', style: 'cancel' }]
        );
        return;
      }
      try {
        setLoadingAction('apple-purchase');
        const { purchase } = await purchaseAppleBranchAddon(slots);
        let receipt = await getReceiptBase64(false);
        if (!receipt) receipt = await getReceiptBase64(true);
        if (!receipt) {
          Alert.alert(t('msg.error'), t('subscription.error_generic'));
          return;
        }
        const { data, error } = await validateAppleReceiptBackend(receipt, 'purchase');
        if (error) {
          const base = error.message ?? t('subscription.error_generic');
          Alert.alert(t('msg.error'), `${base}\n\n${t('subscription.apple_backend_retry_hint')}`);
          return;
        }
        const synced = data?.synced;
        const ok = data?.ok === true;
        if (synced === 'active' || ok) {
          await finishAppleTransactionIfNeeded(purchase as never);
          await finishApplePurchasesAfterBackendSync();
          await refreshSubscriptionProfileImmediate();
          Alert.alert(t('subscription.apple_success_title'), t('subscription.apple_success_message'));
        } else if (synced === 'lapsed') {
          await finishAppleTransactionIfNeeded(purchase as never);
          await finishApplePurchasesAfterBackendSync();
          await refreshSubscriptionProfileImmediate();
          Alert.alert(t('subscription.apple_sync_lapsed_title'), t('subscription.apple_sync_lapsed_message'));
        } else {
          Alert.alert(t('msg.error'), t('subscription.apple_sync_unclear_message'));
        }
      } catch (error: unknown) {
        captureCriticalError(error, {
          feature: 'apple_iap_branch_addon',
          screen: 'Subscriptions',
          app_area: 'billing',
        });
        Alert.alert(
          t('msg.error'),
          error instanceof Error ? error.message : t('subscription.error_generic')
        );
      } finally {
        setLoadingAction(null);
      }
    },
    [user, t, refreshSubscriptionProfileImmediate, isIos]
  );

  const handleManageSubscription = useCallback(async () => {
    if (!user?.id) {
      Alert.alert(t('msg.error'), t('subscription.error_no_session'));
      return;
    }
    /** Solo App Store: nunca abrir portal Stripe para facturación Apple. */
    if (user?.billing_provider === 'apple') {
      openAppleSubscriptionsManage();
      return;
    }
    if (isAndroid) {
      /** Google Play primero: no usar `stripe_customer_id` heredado para mostrar el modal de facturación web. */
      if (user?.billing_provider === 'google') {
        const pkg = getCellariumAndroidPackageName();
        const url = `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(pkg)}`;
        void Linking.openURL(url);
        return;
      }
      if (user?.billing_provider === 'stripe' || !!user?.stripe_customer_id?.trim()) {
        Alert.alert(
          t('subscription.android_manage_stripe_title'),
          t('subscription.android_manage_stripe_message')
        );
        return;
      }
      Alert.alert(
        t('subscription.android_play_coming_title'),
        t('subscription.android_no_subscription_manage_message')
      );
      return;
    }
    if (!isSensitiveAllowed(user)) {
      Alert.alert(
        'Verificación requerida',
        'Verifica tu correo en el bloque de arriba para administrar tu suscripción.',
        [{ text: 'Entendido', style: 'cancel' }]
      );
      return;
    }
    try {
      setLoadingAction('open-portal');
      sentryFlowBreadcrumb('stripe_portal_start', {});
      const { data, error } = await invokeAuthedFunction<{ url: string }>(
        'create-portal-session',
        { ...stripeEdgeClientMeta() }
      );
      if (error) {
        setLoadingAction(null);
        if (error.code === 'APPLE_SUBSCRIPTION_ACTIVE') {
          Alert.alert(t('msg.error'), error.message ?? '');
          return;
        }
        if (error.code === 'NO_CUSTOMER') {
          Alert.alert(
            t('subscription.no_subscription'),
            t('subscription.no_subscription_message')
          );
          return;
        }
        if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
          Alert.alert(
            'Verificación requerida',
            'Verifica tu correo en el bloque de arriba para continuar.',
            [{ text: 'Entendido', style: 'cancel' }]
          );
          return;
        }
        Alert.alert(t('msg.error'), t('subscription.error_generic'));
        return;
      }
      if (!data?.url) {
        setLoadingAction(null);
        throw new Error('No portal URL received');
      }
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        'cellarium://auth-callback'
      );
      if (__DEV__) console.log('[StripeAuthSession result]', result);
      const resultUrl = (result as { url?: string })?.url;
      if (__DEV__ && resultUrl) console.log('[StripeAuthSession url]', resultUrl);
      const updated = await refreshUserWithBackoffUntilUpdated();
      if (updated) {
        setSubsPremiumNotice({ kind: 'plan_synced' });
      }
    } catch (error: any) {
      if (__DEV__) console.error('Error en portal:', error);
      captureCriticalError(error, {
        feature: 'stripe_customer_portal',
        screen: 'Subscriptions',
        app_area: 'billing',
      });
      Alert.alert(t('msg.error'), t('subscription.error_generic'));
    } finally {
      setLoadingAction(null);
    }
  }, [user, refreshUserWithBackoffUntilUpdated, t, openAppleSubscriptionsManage, isAndroid]);

  const handleUpgrade = useCallback(
    async (planLookupKey: string) => {
      if (!user?.id) {
        Alert.alert(t('msg.error'), t('subscription.error_no_session'));
        return;
      }
      if (isAndroidBillingApp()) {
        Alert.alert(
          t('subscription.android_upgrade_blocked_title'),
          t('subscription.android_upgrade_blocked_message')
        );
        return;
      }
      if (!isSensitiveAllowed(user)) {
        Alert.alert(
          'Verificación requerida',
          'Verifica tu correo en el bloque de arriba para continuar.',
          [{ text: 'Entendido', style: 'cancel' }]
        );
        return;
      }
      const targetPlan = mainPlans.find((p) => p.lookupKey === planLookupKey);
      if (!targetPlan?.lookupKey) {
        Alert.alert(t('msg.error'), t('subscription.plan_invalid_checkout'));
        return;
      }
      const addonBranchesQty = Math.min(50, Math.max(0, user.subscription_branch_addons_count ?? 0));
      try {
        setLoadingAction('upgrade');
        const { data, error } = await invokeAuthedFunction<{
          url: string;
          sessionId?: string;
          upgraded?: boolean;
          invoiceUrl?: string | null;
          amountDue?: number | null;
        }>('create-checkout-session', { planLookupKey, addonBranchesQty, ...stripeEdgeClientMeta() });
        if (error) {
          setLoadingAction(null);
          if (error.code === 'ALREADY_SUBSCRIBED') {
            Alert.alert(
              t('subscription.already_subscribed_title'),
              t('subscription.already_subscribed_message'),
              [
                { text: t('btn.cancel'), style: 'cancel' },
                { text: t('subscription.alert_open_portal'), onPress: () => void handleManageSubscription() },
              ]
            );
            return;
          }
          if (error.code === 'APPLE_SUBSCRIPTION_ACTIVE') {
            Alert.alert(t('msg.error'), error.message ?? '');
            return;
          }
          if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
            Alert.alert(
              'Verificación requerida',
              'Verifica tu correo en el bloque de arriba para continuar.',
              [{ text: 'Entendido', style: 'cancel' }]
            );
            return;
          }
          Alert.alert(t('msg.error'), t('subscription.error_generic'));
          return;
        }
        if (!data) {
          throw new Error('No checkout response');
        }
        const expectedPlan = stripeLookupKeyToCanonical(planLookupKey);

        if (data.upgraded === true) {
          if (__DEV__) {
            console.log('[Upgrade] server-side complete', {
              invoiceUrl: data.invoiceUrl ?? null,
              amountDue: data.amountDue ?? null,
              addonBranchesQty,
            });
          }
          await refreshUserWithBackoffUntilUpdated(expectedPlan);
          const inv = data.invoiceUrl;
          setSubsPremiumNotice({
            kind: 'upgrade_success',
            receiptUrl: typeof inv === 'string' && inv.length > 0 ? inv : null,
          });
          return;
        }

        if (!data?.url) {
          throw new Error('No checkout URL received');
        }
        const returnUrl = 'cellarium://auth-callback';
        if (__DEV__) console.log('[Upgrade checkout]', { url: data.url, returnUrl, addonBranchesQty });
        const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
        if (__DEV__) console.log('[StripeAuthSession result]', result);
        await refreshUserWithBackoffUntilUpdated(expectedPlan);
      } catch (error: unknown) {
        if (__DEV__) console.error('Error en upgrade:', error);
        captureCriticalError(error, {
          feature: 'stripe_checkout_upgrade',
          screen: 'Subscriptions',
          app_area: 'billing',
        });
        Alert.alert(t('msg.error'), t('subscription.error_generic'));
      } finally {
        setLoadingAction(null);
      }
    },
    [user, t, mainPlans, refreshUserWithBackoffUntilUpdated, handleManageSubscription]
  );

  const formatMxn = useCallback((cents: number) => {
    const locale = language === 'en' ? 'en-US' : 'es-MX';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
  }, [language]);

  const handleSendVerifyCode = useCallback(async () => {
    setSendingCode(true);
    try {
      const { data, error } = await invokeAuthedFunction<{ success?: boolean; code?: string; message?: string }>('send-owner-verification-email', {});
      const code = error?.code ?? (data as any)?.code;
      if (code === 'ALREADY_VERIFIED') {
        await refreshUser?.();
        return;
      }
      if (code) {
        Alert.alert('Aviso', (error?.message ?? (data as any)?.message) ?? 'No se pudo enviar el código');
        return;
      }
      Alert.alert('Código enviado', 'Revisa tu correo. El código es válido 15 minutos.');
    } catch (_) {
      Alert.alert('Error', 'No se pudo enviar el código. Intenta de nuevo.');
    } finally {
      setSendingCode(false);
    }
  }, [refreshUser]);

  const handleVerifyEmailCode = useCallback(async () => {
    const codeTrimmed = verifyCode.trim();
    if (!/^\d{6}$/.test(codeTrimmed)) {
      Alert.alert('Código inválido', 'Ingresa los 6 dígitos que recibiste por correo.');
      return;
    }
    setVerifyingCode(true);
    try {
      const { data, error } = await invokeAuthedFunction('verify-owner-email', { code: codeTrimmed });
      if (error?.code) {
        Alert.alert('Error', error.message ?? 'Código inválido o expirado');
        return;
      }
      setVerifyCode('');
      await refreshUser?.();
      Alert.alert('Correo verificado', 'Ya puedes usar suscripciones y generar QR.');
    } catch (_) {
      Alert.alert('Error', 'No se pudo verificar. Intenta de nuevo.');
    } finally {
      setVerifyingCode(false);
    }
  }, [verifyCode, refreshUser]);

  const handleUpdateAddonBranches = async () => {
    if (!user?.id) {
      Alert.alert(t('msg.error'), t('subscription.error_no_session'));
      return;
    }
    if (isAndroid) {
      Alert.alert(t('msg.error'), t('subscription.android_addons_blocked_message'));
      return;
    }
    if (!showStripeAddonUi) {
      Alert.alert(t('msg.error'), t('subscription.addons_stripe_only'));
      return;
    }
    const qty = parseInt(addonBranchesQty, 10);
    if (isNaN(qty) || qty < 0 || qty > 50) {
      Alert.alert(t('msg.error'), t('subscription.qty_validation'));
      return;
    }
    if (qty < minAllowedAddonQty) {
      Alert.alert(t('msg.error'), t('subscription.branch_reduction_blocked'));
      return;
    }
    const newAllowedBranches = BASE_BRANCHES_INCLUDED + qty;
    if (activeBranchesCount > newAllowedBranches) {
      Alert.alert(t('msg.error'), t('subscription.branch_reduction_blocked'));
      return;
    }
    const unitCents = addonPriceCacheRef.current?.unit_amount ?? 52000;
    const extraMonthlyCents = qty * unitCents;
    const lines: string[] = [
      `${t('subscription.addon_confirm_body')} ${qty}.`,
      '',
      `${t('subscription.addon_confirm_cost_per_branch')}: ${addonPriceFormatted} MXN/mes`,
      `${t('subscription.addon_confirm_extra_monthly')}: ${formatMxn(extraMonthlyCents)}`,
      '',
      t('subscription.addon_confirm_next_invoice'),
      t('subscription.addon_confirm_no_proration'),
    ];
    if (qty === 0) {
      lines.push('', t('subscription.addon_confirm_remove_note'));
    }
    const confirmMessage = lines.join('\n');
    Alert.alert(
      t('subscription.addon_confirm_title'),
      confirmMessage,
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('subscription.confirm'),
          onPress: async () => {
            if (!isSensitiveAllowed(user)) {
              Alert.alert(
                'Verificación requerida',
                t('subscription.verify_email_to_update_branches'),
                [{ text: 'Entendido', style: 'cancel' }]
              );
              return;
            }
            try {
              setLoadingAction('save-addons');
              const { error } = await invokeAuthedFunction('update-subscription', {
                addonBranchesQty: qty,
                ...stripeEdgeClientMeta(),
              });
              if (error) {
                setLoadingAction(null);
                log.error('update-subscription failed', error.status, error.code);
                if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
                  Alert.alert(
                    'Verificación requerida',
                    t('subscription.verify_email_to_continue'),
                    [{ text: 'Entendido', style: 'cancel' }]
                  );
                  return;
                }
                if (error.code === 'BRANCH_REDUCTION_NOT_ALLOWED') {
                  Alert.alert(t('msg.error'), t('subscription.branch_reduction_blocked'));
                  return;
                }
                Alert.alert(t('msg.error'), t('subscription.update_failed_message'));
                return;
              }
              await refreshUser?.();
              setSubsPremiumNotice({ kind: 'addon_saved', qty });
            } catch (err: unknown) {
              log.error('update-subscription error', (err as Error)?.message);
              Alert.alert(t('msg.error'), t('subscription.update_failed_message'));
            } finally {
              setLoadingAction(null);
            }
          },
        },
      ]
    );
  };

  const handleSimulatePayment = async () => {
    if (__DEV__ === false) return;
    if (!selectedPlan) {
      Alert.alert(t('msg.error'), t('subscription.select_plan_first'));
      return;
    }
    if (!user?.id) {
      Alert.alert(t('msg.error'), t('subscription.error_no_session'));
      return;
    }
    const plan = mainPlans.find(p => p.id === selectedPlan);
    if (!plan) return;
    if (plan.id === 'cafe') {
      Alert.alert(t('subscription.plan_free_title'), t('subscription.plan_free_already'));
      return;
    }
    Alert.alert(
      t('subscription.simulate_title'),
      `${t('subscription.simulate_message')} "${plan.name}"?`,
      [
        { text: t('btn.cancel'), style: 'cancel' },
        {
          text: t('subscription.simulate_cta'),
          onPress: async () => {
            try {
              const expiresAt = new Date();
              expiresAt.setMonth(expiresAt.getMonth() + 1);
              const subscriptionPlan: CanonicalPlanId =
                plan.id === 'bistro'
                  ? 'bistro'
                  : plan.id === 'trattoria'
                    ? 'trattoria'
                    : plan.id === 'grand_maison'
                      ? 'grand-maison'
                      : 'cafe';
              const { error } = await supabase
                .from('users')
                .update({
                  subscription_plan: subscriptionPlan,
                  subscription_expires_at: expiresAt.toISOString(),
                  subscription_branches_count: plan.limitations.branches,
                  subscription_active: true,
                })
                .eq('id', user.id);
              if (error) throw error;
              await refreshUser?.();
              const expiraStr = expiresAt.toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' });
              Alert.alert(
                `✅ ${t('subscription.simulate_success')}`,
                `Plan "${plan.name}" ${t('subscription.simulate_success_message')}\n\n${t('subscription.expires')}: ${expiraStr}`,
                [{ text: t('subscription.alert_ok'), onPress: () => navigation.goBack() }]
              );
            } catch (error: any) {
              if (__DEV__) console.error('Error simulando pago:', error);
              Alert.alert(t('msg.error'), t('subscription.error_generic'));
            }
          },
        },
      ]
    );
  };

  const currentPlanId = useMemo((): string => {
    if (effectivePlan === 'grand-maison') return 'grand_maison';
    return effectivePlan;
  }, [effectivePlan]);

  /** Planes de pago estrictamente superiores al actual (sin downgrades ni plan actual). */
  const upgradeTargetPlans = useMemo(() => {
    if (effectivePlan !== 'bistro' && effectivePlan !== 'trattoria') return [];
    const cur = planTierRank(currentPlanId);
    return mainPlans.filter((p) => p.lookupKey && planTierRank(p.id) > cur);
  }, [mainPlans, currentPlanId, effectivePlan]);

  const planMode = useMemo((): 'cafe' | 'paid' => (effectivePlan === 'cafe' ? 'cafe' : 'paid'), [effectivePlan]);

  if (
    __DEV__ &&
    user?.id &&
    effectivePlan === 'cafe' &&
    user.subscription_plan != null &&
    user.subscription_plan !== 'cafe'
  ) {
    log.debug('[SubscriptionsScreen] effective cafe (plan in DB but inactive/expired)', {
      userId: user.id,
      subscription_plan: user.subscription_plan,
      subscription_active: user.subscription_active ?? null,
      subscription_expires_at: user.subscription_expires_at ?? null,
    });
  }

  useEffect(() => {
    if (planMode !== 'cafe') setSelectedPlan(null);
  }, [planMode]);

  const plansForFreeUsers = useMemo(() => mainPlans.filter((p) => p.id !== 'cafe'), [mainPlans]);

  const expirationRowLabel = useMemo(() => {
    if (cancelScheduled) return t('subscription.access_until');
    if (isPremium) return t('subscription.renews_on');
    return t('subscription.expires_on');
  }, [cancelScheduled, isPremium, t]);

  const expirationText = useMemo(
    () => (expiresAt ? formatDate(expiresAt.toISOString()) : t('common.na')),
    [expiresAt, formatDate, t]
  );

  const expirationOptionalLines = useMemo(() => {
    if (!cancelScheduled) return [];
    const lines: string[] = [t('subscription.no_renewal')];
    if (cancelAtIso) {
      lines.push(`${t('subscription.cancel_scheduled_on')} ${formatDate(cancelAtIso)}`);
    }
    return lines;
  }, [cancelScheduled, cancelAtIso, formatDate, t]);
  const planCardLabels = useMemo(
    () => ({
      includes: t('subscription.includes'),
      notIncludes: t('subscription.not_includes'),
      planCurrent: t('subscription.plan_current'),
      priceFree: t('subscription.price_free'),
    }),
    [t]
  );
  const planLabelKey =
    currentPlanId === 'grand_maison'
      ? 'subscription.plan_name.grand_maison'
      : (`subscription.plan_name.${currentPlanId}` as
          | 'subscription.plan_name.cafe'
          | 'subscription.plan_name.bistro'
          | 'subscription.plan_name.trattoria');
  const planLabelForPill = t(planLabelKey);

  const addonIntroBlock = useMemo(
    () => t('subscription.addon_intro_short').replace('{price}', addonPriceFormatted),
    [t, addonPriceFormatted]
  );

  const addonTotalCapacityLine = useMemo(() => {
    const additional = user?.subscription_branch_addons_count ?? 0;
    const total = BASE_BRANCHES_INCLUDED + additional;
    if (additional === 0) {
      return t('subscription.addon_total_capacity_0').replace('{total}', String(total));
    }
    if (additional === 1) {
      return t('subscription.addon_total_capacity_1').replace('{total}', String(total));
    }
    return t('subscription.addon_total_capacity_n')
      .replace('{additional}', String(additional))
      .replace('{total}', String(total));
  }, [user?.subscription_branch_addons_count, t]);

  const addonMonthlyBreakdown = useMemo(() => {
    const qty = parseInt(addonBranchesQty, 10) || 0;
    const unitCents = addonPriceCacheRef.current?.unit_amount ?? 52000;
    const baseCents = stripeBasePlanPriceCents(effectivePlan);
    const addonsCents = qty * unitCents;
    const totalCents = baseCents + addonsCents;
    return {
      business: formatMxn(baseCents),
      addons: formatMxn(addonsCents),
      total: formatMxn(totalCents),
    };
  }, [addonBranchesQty, effectivePlan, formatMxn]);

  const subsPremiumReceiptUrl =
    subsPremiumNotice?.kind === 'upgrade_success' ? subsPremiumNotice.receiptUrl : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <CellariumHeader
        title={t('subscription.screen_title')}
        leftSlot={<IosHeaderBackSlot navigation={navigation} fallbackRoute="AdminDashboard" />}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {(!profileReady || user?.status === 'loading') && (
          <View style={[styles.card, styles.bannerFallback]}>
            <Text style={styles.bannerFallbackText}>
              {t('msg.loading') || 'Cargando perfil…'}
            </Text>
            <TouchableOpacity onPress={() => refreshUser?.()} style={styles.bannerRetryButton}>
              <Text style={styles.bannerRetryText}>{t('subscription.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {profileReady && user?.role !== 'owner' && (
          <View style={[styles.card, styles.bannerFallback]}>
            <Text style={styles.bannerFallbackText}>
              {t('subscription.owner_only') || 'Solo el owner puede administrar suscripciones.'}
            </Text>
          </View>
        )}
        {profileReady && user?.role === 'owner' && (
        <>
        {needsEmailVerification && (
          <View style={styles.verifyBlock} collapsable={false}>
            <Text style={styles.verifyBlockTitle}>Verificar correo</Text>
            <Text style={styles.verifyBlockSubtitle}>
              Para activar suscripciones y generación de QR, verifica tu correo con el código que te enviamos.
            </Text>
            <TouchableOpacity
              style={[styles.verifyButton, sendingCode && styles.verifyButtonDisabled]}
              onPress={handleSendVerifyCode}
              disabled={sendingCode}
            >
              {sendingCode ? (
                <ActivityIndicator size="small" color={CELLARIUM.card} />
              ) : (
                <Text style={styles.verifyButtonText}>Enviar código</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.verifyLabel}>Código de 6 dígitos</Text>
            <TextInput
              ref={verifyInputRef}
              style={styles.verifyInput}
              value={verifyCode}
              onChangeText={setVerifyCode}
              placeholder="000000"
              placeholderTextColor={CELLARIUM.muted}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.verifyButton, styles.verifyButtonPrimary, verifyingCode && styles.verifyButtonDisabled]}
              onPress={handleVerifyEmailCode}
              disabled={verifyingCode}
            >
              {verifyingCode ? (
                <ActivityIndicator size="small" color={CELLARIUM.card} />
              ) : (
                <Text style={styles.verifyButtonText}>Verificar</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        <CurrentStatusCard
          styles={styles}
          sectionTitle={t('subscription.current_plan_title')}
          planLabel={planLabelForPill}
          showFreePlanTagline={planMode === 'cafe'}
          taglineFree={t('subscription.status_card_tagline_free')}
          expirationRowLabel={expirationRowLabel}
          expirationText={expirationText}
          expirationOptionalLines={planMode === 'paid' ? expirationOptionalLines : []}
          showExpiration={planMode === 'paid' && !!expiresAt}
          showAddonsRow={hasActiveSub}
          addonsCount={user?.subscription_branch_addons_count ?? 0}
          labels={{ addonsBranches: t('subscription.addons_branches') }}
        />

        {isIos && (
          <View style={styles.appleRestoreBlock}>
            <TouchableOpacity
              style={[
                styles.manageButton,
                styles.appleRestoreButton,
                (isProcessing || needsEmailVerification) && styles.buttonDisabled,
              ]}
              onPress={handleRestoreApplePurchases}
              disabled={isProcessing || needsEmailVerification}
            >
              {isProcessing ? (
                <ActivityIndicator color={PALETTE.primary} size="small" />
              ) : (
                <Text style={styles.manageButtonText}>{t('subscription.apple_restore')}</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.appleRestoreHint}>{t('subscription.apple_restore_ios_hint')}</Text>
          </View>
        )}

        {planMode === 'paid' && (
          <>
            {(isIos || isAndroid) && (
              <View style={[styles.card, styles.storeGuidanceCard]}>
                <Text style={styles.storeGuidanceTitle}>{t('subscription.store_plan_guidance_title')}</Text>
                <Text style={styles.storeGuidanceBody}>
                  {isIos ? t('subscription.store_plan_guidance_body_ios') : t('subscription.store_plan_guidance_body_android')}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.manageButton,
                    styles.appleRestoreButton,
                    (isProcessing || needsEmailVerification) && styles.buttonDisabled,
                  ]}
                  onPress={handleManageSubscription}
                  disabled={isProcessing || needsEmailVerification}
                >
                  {isProcessing && loadingAction === 'open-portal' ? (
                    <ActivityIndicator color={PALETTE.primary} size="small" />
                  ) : (
                    <Text style={styles.manageButtonText}>{t('subscription.store_plan_cta')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
            {showStripeAddonUi && upgradeTargetPlans.length > 0 ? (
              <UpgradePlanSection
                styles={styles}
                plans={upgradeTargetPlans}
                onUpgrade={(key) => void handleUpgrade(key)}
                isProcessing={isProcessing}
                labels={{
                  sectionTitle: t('subscription.upgrade_section_title'),
                  upgradeCta: t('subscription.cta_upgrade'),
                  recommended: t('subscription.recommended_badge'),
                }}
              />
            ) : null}
            {showStripeAddonUi ? (
              <AddonBranchesCard
                styles={styles}
                addonTitle={t('subscription.addon_title')}
                introBlock={addonIntroBlock}
                totalCapacityLine={addonTotalCapacityLine}
                addonBranchesLabel={t('subscription.addon_quantity_label')}
                addonBranchesQty={addonBranchesQty}
                setAddonBranchesQty={setAddonBranchesQty}
                minAllowedAddonQty={minAllowedAddonQty}
                breakdownTitle={t('subscription.addon_monthly_summary_title')}
                breakdownBusinessLabel={t('subscription.addon_breakdown_base_plan')}
                breakdownBusinessAmount={addonMonthlyBreakdown.business}
                breakdownAddonsLabel={t('subscription.addon_breakdown_additional')}
                breakdownAddonsAmount={addonMonthlyBreakdown.addons}
                breakdownTotalLabel={t('subscription.addon_breakdown_estimated_total')}
                breakdownTotalAmount={addonMonthlyBreakdown.total}
                onUpdate={handleUpdateAddonBranches}
                isProcessing={isProcessing}
                saveAddonsLabel={t('subscription.save_addons')}
                updateDisabled={needsEmailVerification}
              />
            ) : null}
            {isIos && user?.billing_provider === 'apple' && hasActiveSub ? (
              <View style={styles.iosBranchAddonBlock}>
                <Text style={styles.appleRestoreHint}>{t('subscription.ios_branch_addon_intro')}</Text>
                <TouchableOpacity
                  style={[styles.manageButton, (isProcessing || needsEmailVerification) && styles.buttonDisabled]}
                  onPress={() => void handleAppleBranchAddon(1)}
                  disabled={isProcessing || needsEmailVerification}
                >
                  <Text style={styles.manageButtonText}>{t('subscription.ios_branch_addon_1')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.manageButton, (isProcessing || needsEmailVerification) && styles.buttonDisabled]}
                  onPress={() => void handleAppleBranchAddon(3)}
                  disabled={isProcessing || needsEmailVerification}
                >
                  <Text style={styles.manageButtonText}>{t('subscription.ios_branch_addon_3')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {Platform.OS === 'web' ? (
              <TouchableOpacity
                style={[styles.manageButtonTertiary, (isProcessing || needsEmailVerification) && styles.buttonDisabled]}
                onPress={handleManageSubscription}
                disabled={isProcessing || needsEmailVerification}
              >
                {isProcessing && loadingAction === 'open-portal' ? (
                  <ActivityIndicator color={PALETTE.subtext} size="small" />
                ) : (
                  <Text style={styles.manageButtonTertiaryText}>{t('subscription.manage')}</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </>
        )}

        {planMode === 'cafe' && (
          <>
            {(!selectedPlan || selectedPlan === 'cafe') && (
              <SubscriptionLegalLinksRow styles={styles} t={t} variant="standalone" />
            )}
            {plansForFreeUsers.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const showInlineSubscribe = isSelected && selectedPlan !== 'cafe';
              return (
                <View key={plan.id} style={styles.planTierBlock}>
                  {showInlineSubscribe ? (
                    <View style={styles.planBundleSelected}>
                      <PlanCard
                        styles={styles}
                        plan={plan}
                        isSelected={isSelected}
                        isCurrentPlan={plan.id === currentPlanId}
                        onSelect={handleSelectPlan}
                        labels={planCardLabels}
                        inSelectionBundle
                      />
                      <View style={styles.planBundleCtaZone}>
                        <SubscriptionLegalLinksRow styles={styles} t={t} variant="inline" />
                        <TouchableOpacity
                          style={[
                            styles.ctaButtonPrimary,
                            (isProcessing || needsEmailVerification) && styles.buttonDisabled,
                          ]}
                          onPress={handleSubscribe}
                          disabled={isProcessing || needsEmailVerification}
                        >
                          {isProcessing ? (
                            <ActivityIndicator color={CELLARIUM.card} size="small" />
                          ) : (
                            <Text style={styles.ctaButtonPrimaryText}>{t('subscription.subscribe_cta')}</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <PlanCard
                      styles={styles}
                      plan={plan}
                      isSelected={isSelected}
                      isCurrentPlan={plan.id === currentPlanId}
                      onSelect={handleSelectPlan}
                      labels={planCardLabels}
                    />
                  )}
                </View>
              );
            })}
          </>
        )}
        </>
        )}
      </ScrollView>
      {loadingAction && (
        <CellariumLoader
          overlay
          fullscreen
          label={
            loadingAction === 'subscribe'
              ? t('subscription.loading_subscribe')
              : loadingAction === 'open-portal'
                ? t('subscription.loading_portal')
                : loadingAction === 'upgrade'
                  ? t('subscription.loading_upgrade')
                  : loadingAction === 'save-addons'
                    ? t('subscription.loading_save_additional_branches')
                    : loadingAction === 'apple-purchase'
                      ? t('subscription.apple_loading_purchase')
                      : loadingAction === 'apple-restore'
                        ? t('subscription.apple_loading_restore')
                        : loadingAction === 'apple-sync'
                          ? t('subscription.apple_loading_sync')
                          : t('subscription.loading_updating_subscription')
          }
          size={140}
        />
      )}

      <CellariumModal
        visible={subsPremiumNotice !== null}
        onRequestClose={() => setSubsPremiumNotice(null)}
        title={
          subsPremiumNotice?.kind === 'plan_synced'
            ? t('subscription.plan_updated_title')
            : subsPremiumNotice?.kind === 'addon_saved'
              ? t('subscription.addon_saved_modal_title')
              : t('subscription.upgrade_success_title')
        }
        scrollable={false}
        presentation="card"
        footer={
          <View>
            <CellariumPrimaryButton
              title={t('subscription.upgrade_done_cta')}
              onPress={() => setSubsPremiumNotice(null)}
            />
            {subsPremiumReceiptUrl ? (
              <TouchableOpacity
                onPress={() => {
                  const u = subsPremiumReceiptUrl;
                  setSubsPremiumNotice(null);
                  if (u) void Linking.openURL(u);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                accessibilityRole="button"
              >
                <Text style={styles.subsPremiumModalReceiptLink}>{t('subscription.upgrade_receipt_optional')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      >
        <Text style={styles.subsPremiumModalBody}>
          {subsPremiumNotice?.kind === 'plan_synced'
            ? t('subscription.plan_updated_message')
            : subsPremiumNotice?.kind === 'addon_saved'
              ? t('subscription.addon_saved_modal_body').replace('{qty}', String(subsPremiumNotice.qty))
              : t('subscription.upgrade_success_message')}
        </Text>
      </CellariumModal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  subsPremiumModalBody: {
    ...CELLARIUM_TEXT.body,
    textAlign: 'center',
  },
  subsPremiumModalReceiptLink: {
    ...CELLARIUM_TEXT.caption,
    textAlign: 'center',
    color: CELLARIUM.muted,
    marginTop: 14,
    textDecorationLine: 'underline',
  },
  container: {
    flex: 1,
    backgroundColor: CELLARIUM_THEME.admin.bg,
  },
  content: {
    flex: 1,
    padding: CELLARIUM_LAYOUT.sectionGap,
  },
  card: {
    backgroundColor: PALETTE.cardBg,
    borderRadius: SUBS_COMPACT_RADIUS,
    padding: CELLARIUM_LAYOUT.headerHorizontalPadding,
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  bannerFallback: {
    backgroundColor: PALETTE.blocked,
    borderLeftWidth: 4,
    borderLeftColor: '#c2410c',
  },
  bannerFallbackText: {
    fontSize: 14,
    color: PALETTE.text,
    marginBottom: 10,
  },
  bannerRetryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
  },
  bannerRetryText: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text,
  },
  storeGuidanceCard: {
    borderLeftWidth: 4,
    borderLeftColor: PALETTE.primary,
  },
  storeGuidanceTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PALETTE.text,
    marginBottom: 10,
  },
  storeGuidanceBody: {
    fontSize: 14,
    color: PALETTE.subtext,
    lineHeight: 21,
    marginBottom: 16,
  },
  verifyBlock: {
    backgroundColor: PALETTE.cardBg,
    borderRadius: SUBS_COMPACT_RADIUS,
    padding: CELLARIUM_LAYOUT.headerHorizontalPadding,
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
    borderLeftWidth: 4,
    borderLeftColor: PALETTE.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  verifyBlockTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.primary,
    marginBottom: 8,
  },
  verifyBlockSubtitle: {
    fontSize: 14,
    color: PALETTE.subtext,
    marginBottom: 16,
  },
  verifyButton: {
    backgroundColor: CELLARIUM.neutralButton,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: CELLARIUM_LAYOUT.inputRadius,
    alignItems: 'center',
    marginBottom: 12,
  },
  verifyButtonPrimary: {
    backgroundColor: PALETTE.primary,
    marginTop: 8,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: CELLARIUM.card,
    fontWeight: '600',
    fontSize: 16,
  },
  verifyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.text,
    marginTop: 4,
    marginBottom: 8,
  },
  verifyInput: {
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: CELLARIUM_LAYOUT.inputRadius,
    padding: 16,
    fontSize: 18,
    letterSpacing: 4,
    marginBottom: 8,
  },
  statusCard: {
    backgroundColor: PALETTE.cardBg,
    borderRadius: SUBS_COMPACT_RADIUS,
    padding: CELLARIUM_LAYOUT.headerHorizontalPadding,
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  proUpgradeCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  proUpgradeGradientBar: {
    height: 4,
    width: '100%',
  },
  proUpgradeCardInner: {
    paddingHorizontal: CELLARIUM_LAYOUT.screenPadding,
    paddingTop: 12,
    paddingBottom: 14,
  },
  proUpgradeTitle: {
    ...CELLARIUM_TEXT.sectionTitle,
    fontSize: 18,
    color: CELLARIUM.text,
    marginBottom: 8,
  },
  proUpgradeBody: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    lineHeight: 21,
    color: CELLARIUM.muted,
    marginBottom: 10,
  },
  proUpgradeBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  proUpgradeBulletMark: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    color: CELLARIUM.primary,
    marginRight: 8,
    lineHeight: 20,
    width: 12,
  },
  proUpgradeBulletText: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    lineHeight: 20,
    color: CELLARIUM.text,
    flex: 1,
  },
  proCompareCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    paddingHorizontal: CELLARIUM_LAYOUT.screenPadding,
    paddingVertical: 12,
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
  },
  proCompareTitle: {
    ...CELLARIUM_TEXT.sectionTitle,
    fontSize: 15,
    color: CELLARIUM.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  proCompareColumns: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  proCompareCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  proCompareColHeader: {
    ...CELLARIUM_TEXT.label,
    fontSize: 12,
    letterSpacing: 0.8,
    color: CELLARIUM.muted,
    marginBottom: 8,
    textAlign: 'center',
  },
  proCompareColHeaderBusiness: {
    color: CELLARIUM.primary,
    fontWeight: '700',
  },
  proCompareDivider: {
    width: 1,
    backgroundColor: CELLARIUM.border,
    marginHorizontal: 4,
  },
  proCompareLine: {
    ...CELLARIUM_TEXT.caption,
    fontSize: 13,
    lineHeight: 18,
    color: CELLARIUM.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  proPrimaryCta: {
    marginTop: 0,
    marginBottom: 10,
  },
  proSecondaryCta: {
    marginTop: 0,
    marginBottom: 24,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusTagline: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    lineHeight: 21,
    color: CELLARIUM.muted,
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: PALETTE.text,
  },
  planPill: {
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: SUBS_PILL_RADIUS,
  },
  planPillText: {
    color: PALETTE.headerTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: PALETTE.subtext,
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 14,
    color: PALETTE.text,
    fontWeight: '600',
  },
  planTierBlock: {
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
  },
  planBundleSelected: {
    borderWidth: 2,
    borderColor: CELLARIUM.primary,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    backgroundColor: CELLARIUM.card,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  planBundleCtaZone: {
    paddingHorizontal: CELLARIUM_LAYOUT.headerHorizontalPadding,
    paddingTop: 6,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: CELLARIUM.border,
  },
  planLegalLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 4,
  },
  /** Separación respecto a la primera tarjeta de plan (bloque café, sin selección). */
  planLegalLinksRowStandalone: {
    marginBottom: CELLARIUM_LAYOUT.sectionGap,
    paddingTop: 0,
  },
  planLegalLink: {
    ...CELLARIUM_TEXT.caption,
    fontSize: 13,
    lineHeight: 18,
    color: PALETTE.primary,
    textDecorationLine: 'underline',
  },
  planLegalSep: {
    ...CELLARIUM_TEXT.caption,
    fontSize: 13,
    color: CELLARIUM.muted,
  },
  planCardBase: {
    backgroundColor: CELLARIUM.card,
    paddingHorizontal: CELLARIUM_LAYOUT.headerHorizontalPadding,
    paddingTop: 16,
    paddingBottom: 14,
  },
  planCardStandalone: {
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  planCardInBundle: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  planCardSelected: {
    borderWidth: 2,
    borderColor: CELLARIUM.primary,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  currentBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: PALETTE.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: SUBS_PILL_RADIUS,
  },
  currentBadgeText: {
    color: CELLARIUM.textOnDark,
    fontSize: 12,
    fontWeight: '600',
  },
  planHeader: {
    marginBottom: 12,
    paddingRight: 72,
  },
  planName: {
    ...CELLARIUM_TEXT.sectionTitle,
    fontSize: 18,
    marginBottom: 6,
    color: CELLARIUM.text,
    letterSpacing: 0.15,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 26,
    fontWeight: '700',
    color: CELLARIUM.primary,
  },
  pricePeriod: {
    ...CELLARIUM_TEXT.caption,
    fontSize: 15,
    color: CELLARIUM.muted,
    marginLeft: 4,
  },
  featuresContainer: {
    marginBottom: 4,
  },
  featuresTitle: {
    ...CELLARIUM_TEXT.label,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    color: CELLARIUM.muted,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  featureIcon: {
    color: CELLARIUM.primary,
    fontSize: 14,
    marginRight: 10,
    marginTop: 3,
    fontWeight: '700',
  },
  featureText: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    lineHeight: 21,
    color: CELLARIUM.text,
    flex: 1,
  },
  blockedContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CELLARIUM.border,
  },
  blockedTitle: {
    ...CELLARIUM_TEXT.label,
    fontSize: 14,
    color: CELLARIUM.danger,
    marginBottom: 6,
  },
  blockedIcon: {
    color: CELLARIUM.danger,
    fontSize: 14,
    marginRight: 10,
    marginTop: 3,
  },
  blockedText: {
    ...CELLARIUM_TEXT.caption,
    fontSize: 14,
    color: CELLARIUM.muted,
    flex: 1,
  },
  ctaButtonPrimary: {
    backgroundColor: CELLARIUM.primary,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    paddingVertical: 14,
    minHeight: CELLARIUM_LAYOUT.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonPrimaryText: {
    color: CELLARIUM.card,
    fontSize: 18,
    fontWeight: 'bold',
  },
  ctaButtonDisabled: {
    backgroundColor: CELLARIUM.neutralButton,
    borderRadius: SUBS_COMPACT_RADIUS,
    paddingVertical: 16,
    minHeight: CELLARIUM_LAYOUT.iconButtonSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabledText: {
    color: CELLARIUM.card,
    fontSize: 16,
    fontWeight: '600',
  },
  manageButton: {
    backgroundColor: CELLARIUM.neutralButton,
    borderRadius: SUBS_COMPACT_RADIUS,
    paddingVertical: 16,
    minHeight: CELLARIUM_LAYOUT.iconButtonSize,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  manageButtonText: {
    color: CELLARIUM.card,
    fontSize: 16,
    fontWeight: '600',
  },
  manageButtonTertiary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: SUBS_COMPACT_RADIUS,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  manageButtonTertiaryText: {
    color: PALETTE.subtext,
    fontSize: 15,
    fontWeight: '600',
  },
  appleRestoreBlock: {
    marginBottom: 20,
  },
  iosBranchAddonBlock: {
    marginBottom: 16,
    paddingHorizontal: CELLARIUM_LAYOUT.headerHorizontalPadding,
    gap: 10,
  },
  appleRestoreButton: {
    marginBottom: 8,
  },
  appleRestoreHint: {
    fontSize: 12,
    color: CELLARIUM.muted,
    textAlign: 'center',
    paddingHorizontal: CELLARIUM_LAYOUT.headerHorizontalPadding,
    lineHeight: 16,
  },
  secondaryButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: SUBS_COMPACT_RADIUS,
    paddingVertical: 16,
    minHeight: CELLARIUM_LAYOUT.iconButtonSize,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  secondaryButtonText: {
    color: CELLARIUM.card,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  upgradeSection: {
    marginBottom: 20,
  },
  upgradeSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: PALETTE.text,
    marginBottom: 12,
  },
  upgradePlanCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: SUBS_COMPACT_RADIUS,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  upgradeRecommendedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(107, 36, 51, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  upgradeRecommendedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: PALETTE.primary,
    letterSpacing: 0.5,
  },
  upgradePlanName: {
    fontSize: 17,
    fontWeight: '700',
    color: PALETTE.text,
    marginBottom: 8,
  },
  upgradeBenefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  upgradeBenefitBullet: {
    fontSize: 14,
    color: PALETTE.primary,
    marginRight: 8,
    width: 12,
    lineHeight: 20,
  },
  upgradeBenefitText: {
    flex: 1,
    fontSize: 14,
    color: PALETTE.subtext,
    lineHeight: 20,
  },
  upgradePlanPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: PALETTE.text,
    marginTop: 8,
    marginBottom: 12,
  },
  upgradeCtaButton: {
    backgroundColor: PALETTE.primary,
    borderRadius: SUBS_COMPACT_RADIUS,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeCtaButtonText: {
    color: CELLARIUM.card,
    fontSize: 16,
    fontWeight: '700',
  },
  addonCard: {
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  addonTitle: {
    ...CELLARIUM_TEXT.sectionTitle,
    fontSize: 17,
    marginBottom: 8,
    color: CELLARIUM.text,
  },
  addonIntro: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    lineHeight: 21,
    color: CELLARIUM.muted,
    marginBottom: 10,
  },
  addonCapacityLine: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    lineHeight: 20,
    color: CELLARIUM.text,
    marginBottom: 12,
  },
  addonControlLabel: {
    ...CELLARIUM_TEXT.label,
    fontSize: 14,
    marginBottom: 6,
    color: CELLARIUM.text,
  },
  addonControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  addonBreakdown: {
    borderTopWidth: 1,
    borderTopColor: CELLARIUM.border,
    paddingTop: 10,
    marginBottom: 10,
  },
  addonBreakdownTitle: {
    ...CELLARIUM_TEXT.sectionTitle,
    fontSize: 14,
    marginBottom: 8,
    color: CELLARIUM.text,
  },
  addonSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  addonSummaryLabel: {
    ...CELLARIUM_TEXT.caption,
    fontSize: 13,
    color: CELLARIUM.muted,
    flex: 1,
    paddingRight: 8,
  },
  addonSummaryAmount: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    fontWeight: '700',
    color: CELLARIUM.text,
  },
  addonSummaryDivider: {
    height: 1,
    backgroundColor: CELLARIUM.border,
    marginVertical: 6,
  },
  addonSummaryTotalLabel: {
    ...CELLARIUM_TEXT.body,
    fontSize: 14,
    fontWeight: '600',
    color: CELLARIUM.text,
    flex: 1,
    paddingRight: 8,
  },
  addonSummaryTotalAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: CELLARIUM.text,
  },
  addonStepperBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addonStepperBtnText: {
    color: CELLARIUM.text,
    fontSize: 20,
    fontWeight: '600',
  },
  addonInput: {
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    minWidth: 56,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: CELLARIUM.text,
  },
  addonUpdateButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: PALETTE.success,
    borderRadius: SUBS_COMPACT_RADIUS,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  addonUpdateButtonText: {
    color: PALETTE.success,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default SubscriptionsScreen;
