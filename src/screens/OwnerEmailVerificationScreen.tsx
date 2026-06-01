import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';

type NavProp = StackNavigationProp<RootStackParamList, 'OwnerEmailVerification'>;
type RoutePropType = RouteProp<RootStackParamList, 'OwnerEmailVerification'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

const PRIMARY = '#8B0000';

const OwnerEmailVerificationScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useLanguage();
  const { user, refreshUser } = useAuth();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    await supabase.auth.refreshSession();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No session');
    return { authorization: `Bearer ${session.access_token}` };
  };

  const handleSendCode = async () => {
    setSending(true);
    try {
      const headers = await getAuthHeaders();
      const { data, error } = await supabase.functions.invoke('send-owner-verification-email', {
        headers,
      });
      if (error) throw error;
      if (data?.code === 'ALREADY_VERIFIED') {
        Alert.alert(t('auth.verify_success_title'), t('auth.verify_already_done'));
        await refreshUser?.();
        navigation.goBack();
        return;
      }
      if (data?.code) {
        Alert.alert(t('auth.warning'), data.message ?? t('auth.verify_send_failed'));
        return;
      }
      Alert.alert(t('auth.verify_code_sent_title'), t('auth.verify_code_sent_body'));
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? t('auth.verify_send_failed');
      Alert.alert(t('common.error'), msg);
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      Alert.alert(t('auth.verify_invalid_code_title'), t('auth.verify_invalid_code_body'));
      return;
    }
    setVerifying(true);
    try {
      const headers = await getAuthHeaders();
      const { data, error } = await supabase.functions.invoke('verify-owner-email', {
        body: { code: trimmed },
        headers,
      });
      if (error) throw error;
      if (data?.code) {
        Alert.alert(t('common.error'), data.message ?? t('auth.verify_invalid_or_expired'));
        return;
      }
      Alert.alert(t('auth.verify_success_title'), t('auth.verify_success_body'));
      await refreshUser?.();
      navigation.goBack();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? t('auth.verify_invalid_or_expired');
      Alert.alert(t('common.error'), msg);
    } finally {
      setVerifying(false);
    }
  };

  if (user?.role !== 'owner') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.message}>{t('auth.verify_owners_only')}</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>{t('auth.verify_back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>{t('auth.verify_email_title')}</Text>
        <Text style={styles.subtitle}>
          {t('auth.verify_email_subtitle')}
        </Text>

        <TouchableOpacity
          style={[styles.button, sending && styles.buttonDisabled]}
          onPress={handleSendCode}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('auth.verify_send_code')}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.label}>{t('auth.verify_code_label')}</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder={t('auth.verify_code_placeholder')}
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={6}
        />

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, verifying && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={verifying}
        >
          {verifying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('auth.verify_button')}</Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
  },
  inner: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: PRIMARY,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#555',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    letterSpacing: 4,
  },
  button: {
    backgroundColor: '#666',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPrimary: {
    backgroundColor: PRIMARY,
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  message: {
    fontSize: 16,
    color: '#555',
    marginBottom: 16,
  },
});

export default OwnerEmailVerificationScreen;
