import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';

const TastingNotesScreen: React.FC = () => {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('tasting.title')}</Text>
        <Text style={styles.subtitle}>{t('tasting.coming_soon')}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t('tasting.notes_dev_title')}</Text>
          <Text style={styles.infoText}>
            {t('tasting.notes_dev_intro')}
            {'\n\n'}
            {t('tasting.notes_dev_bullet_notes')}
            {'\n'}
            {t('tasting.notes_dev_bullet_ratings')}
            {'\n'}
            {t('tasting.notes_dev_bullet_private')}
            {'\n'}
            {t('tasting.notes_dev_bullet_detailed')}
            {'\n'}
            {t('tasting.notes_dev_bullet_history')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B0000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
});

export default TastingNotesScreen;
