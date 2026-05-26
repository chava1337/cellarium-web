import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { useLanguage, type Language } from '../contexts/LanguageContext';
import { useDeviceInfo } from '../hooks/useDeviceInfo';
import { CELLARIUM, CELLARIUM_LAYOUT } from '../theme/cellariumTheme';

const ALL_LANGUAGES: Language[] = ['es', 'en', 'pt-BR'];

const LANGUAGE_META: Record<Language, { flag: string; label: string }> = {
  es: { flag: '🇲🇽', label: 'Español' },
  en: { flag: '🇺🇸', label: 'English' },
  'pt-BR': { flag: '🇧🇷', label: 'Português' },
};

const MENU_WIDTH = 172;
const MENU_GAP = 6;

type MenuAnchor = { top: number; left: number };

const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const deviceInfo = useDeviceInfo();
  const size = deviceInfo.deviceType === 'tablet' ? 36 : 32;

  const anchorRef = useRef<View>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const selectingRef = useRef(false);

  const otherLanguages = useMemo(
    () => ALL_LANGUAGES.filter((lang) => lang !== language),
    [language]
  );

  const currentMeta = LANGUAGE_META[language];

  const openMenu = useCallback(() => {
    if (selectingRef.current) return;
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      const windowWidth = Dimensions.get('window').width;
      let left = x + width - MENU_WIDTH;
      if (left < 8) left = 8;
      if (left + MENU_WIDTH > windowWidth - 8) {
        left = windowWidth - MENU_WIDTH - 8;
      }
      setMenuAnchor({ top: y + height + MENU_GAP, left });
      setMenuVisible(true);
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
    setMenuAnchor(null);
  }, []);

  const selectLanguage = useCallback(
    async (lang: Language) => {
      if (selectingRef.current || lang === language) return;
      selectingRef.current = true;
      closeMenu();
      try {
        await setLanguage(lang);
      } finally {
        selectingRef.current = false;
      }
    },
    [closeMenu, language, setLanguage]
  );

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={styles.anchor}>
        <TouchableOpacity
          style={[
            styles.trigger,
            {
              width: size,
              height: size,
            },
          ]}
          onPress={openMenu}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Idioma actual: ${currentMeta.label}`}
          accessibilityHint="Abre el selector de idioma"
        >
          <Text style={styles.flag}>{currentMeta.flag}</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={closeMenu} accessibilityLabel="Cerrar selector de idioma" />
          {menuAnchor ? (
            <View
              style={[
                styles.menuCard,
                {
                  top: menuAnchor.top,
                  left: menuAnchor.left,
                  width: MENU_WIDTH,
                },
              ]}
            >
              {otherLanguages.map((lang) => {
                const meta = LANGUAGE_META[lang];
                return (
                  <TouchableOpacity
                    key={lang}
                    style={styles.menuRow}
                    onPress={() => void selectLanguage(lang)}
                    activeOpacity={0.65}
                    accessibilityRole="button"
                    accessibilityLabel={meta.label}
                  >
                    <Text style={styles.menuFlag}>{meta.flag}</Text>
                    <Text style={styles.menuLabel} numberOfLines={1}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  anchor: {
    alignSelf: 'flex-start',
  },
  trigger: {
    borderRadius: 20,
    backgroundColor: CELLARIUM.card,
    borderWidth: 1,
    borderColor: CELLARIUM.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  flag: {
    fontSize: 18,
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  menuCard: {
    position: 'absolute',
    backgroundColor: CELLARIUM.card,
    borderRadius: CELLARIUM_LAYOUT.cardRadius,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    paddingVertical: 6,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  menuFlag: {
    fontSize: 20,
    width: 26,
    textAlign: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: CELLARIUM.text,
    letterSpacing: 0.1,
  },
});

export default LanguageSelector;
