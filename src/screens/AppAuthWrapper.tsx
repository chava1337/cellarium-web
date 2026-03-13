import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import AuthScreen from './AuthScreen';
import AppNavigator from './AppNavigator';
import { useRoute } from '@react-navigation/native';

const ENTRANDO_WATCHDOG_MS = 20000;

export default function AppAuthWrapper() {
  const { user, loading, session, refreshUserData, signOut, profileMissingMessage } = useAuth();
  const route = useRoute();
  const didTriggerRefreshRef = useRef(false);
  const sessionRef = useRef(session);
  const userRef = useRef(user);
  const loadingRef = useRef(loading);
  sessionRef.current = session;
  userRef.current = user;
  loadingRef.current = loading;

  useEffect(() => {
    if (!session) didTriggerRefreshRef.current = false;
    if (session && !user && !loading && !didTriggerRefreshRef.current) {
      didTriggerRefreshRef.current = true;
      refreshUserData();
    }
  }, [session, user, loading, refreshUserData]);

  useEffect(() => {
    if (!session || user || loading) return;
    const t = setTimeout(() => {
      if (sessionRef.current && !userRef.current && !loadingRef.current) {
        if (__DEV__) console.warn('[AppAuthWrapper] watchdog: session && !user && !loading >20s, signing out');
        signOut();
      }
    }, ENTRANDO_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [session, user, loading, signOut]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B0000" />
      </View>
    );
  }

  if (session && !user && loading) {
    return (
      <View style={styles.entrandoContainer}>
        <Text style={styles.entrandoTitle}>Entrando...</Text>
        <ActivityIndicator size="small" color="#8B0000" style={styles.spinner} />
      </View>
    );
  }

  if (!user) {
    const isOwnerRegistration = route.name === 'AppAuth' && route.params?.mode === 'register';
    return (
      <View style={styles.authContainer}>
        {profileMissingMessage ? (
          <View style={styles.profileMissingBanner}>
            <Text style={styles.profileMissingText}>{profileMissingMessage}</Text>
          </View>
        ) : null}
        <AuthScreen
          onAuthSuccess={() => {}}
          initialMode={isOwnerRegistration ? 'register' : 'login'}
        />
      </View>
    );
  }

  return <AppNavigator />;
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
  },
  profileMissingBanner: {
    backgroundColor: '#fff3cd',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ffc107',
  },
  profileMissingText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  entrandoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 24,
  },
  entrandoTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  spinner: {
    marginTop: 8,
  },
});

