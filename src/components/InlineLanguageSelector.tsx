import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useLanguage, type Language } from '../contexts/LanguageContext';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../theme/cellariumTheme';

const ALL_LANGUAGES: Language[] = ['es', 'en', 'pt-BR'];

const LANGUAGE_FLAGS: Record<Language, string> = {
  es: '🇲🇽',
  en: '🇺🇸',
  'pt-BR': '🇧🇷',
};

const LABEL_KEYS: Record<Language, string> = {
  es: 'language.spanish',
  en: 'language.english',
  'pt-BR': 'language.portuguese',
};

const SIZE_CONFIG = {
  compact: { chip: 40, flag: 20, gap: 8, padH: 10, padV: 4 },
  default: { chip: 42, flag: 22, gap: 10, padH: 12, padV: 5 },
} as const;

export type InlineLanguageSelectorProps = {
  size?: 'compact' | 'default';
  showLabels?: boolean;
};

const InlineLanguageSelector: React.FC<InlineLanguageSelectorProps> = ({
  size = 'default',
  showLabels = false,
}) => {
  const { language, setLanguage, t } = useLanguage();
  const selectingRef = useRef(false);
  const dims = SIZE_CONFIG[size];

  const selectLanguage = useCallback(
    async (lang: Language) => {
      if (selectingRef.current || lang === language) return;
      selectingRef.current = true;
      try {
        await setLanguage(lang);
      } finally {
        selectingRef.current = false;
      }
    },
    [language, setLanguage]
  );

  return (
    <View
      style={[
        styles.pill,
        {
          paddingHorizontal: dims.padH,
          paddingVertical: dims.padV,
          gap: dims.gap,
        },
      ]}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('language.select')}
    >
      {ALL_LANGUAGES.map((lang) => {
        const active = language === lang;
        return (
          <TouchableOpacity
            key={lang}
            style={[
              styles.chip,
              {
                width: dims.chip,
                height: dims.chip,
                borderRadius: dims.chip / 2,
              },
              active ? styles.chipActive : styles.chipInactive,
            ]}
            onPress={() => void selectLanguage(lang)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t(LABEL_KEYS[lang])}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.flag, { fontSize: dims.flag }]}>{LANGUAGE_FLAGS[lang]}</Text>
            {showLabels ? (
              <Text
                style={[styles.label, active ? styles.labelActive : styles.labelInactive]}
                numberOfLines={1}
              >
                {t(LABEL_KEYS[lang])}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.buttonRadius,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    maxHeight: 48,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  chip: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'rgba(146, 64, 72, 0.12)',
    borderColor: CELLARIUM.primary,
    transform: [{ scale: 1.04 }],
    ...Platform.select({
      ios: {
        shadowColor: CELLARIUM.primary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.18,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  chipInactive: {
    backgroundColor: 'transparent',
    opacity: 0.75,
  },
  flag: {
    textAlign: 'center',
  },
  label: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '500',
  },
  labelActive: {
    color: CELLARIUM.primary,
  },
  labelInactive: {
    color: CELLARIUM.muted,
  },
});

export default InlineLanguageSelector;
