// ─────────────────────────────────────────────────────────────
// Écran de connexion / inscription.
//
// Affiché par l'AuthGuard (_layout.tsx) quand il n'y a pas de
// session. Après un login réussi, l'AuthGuard redirige tout seul :
// vers /onboarding (premier lancement) ou / (accueil).
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, signUp, loading } = useAuth();

  const canSubmit = email.length > 3 && password.length >= 6 && !loading;

  return (
    <SafeAreaView style={styles.root}>
      {/* Remonte le formulaire quand le clavier s'ouvre (iOS surtout) */}
      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* En-tête */}
        <Text style={styles.logo}>🗼</Text>
        <Text style={styles.title}>Spin</Text>
        <Text style={styles.subtitle}>Compose ta journée à Paris</Text>

        {/* Formulaire */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Mot de passe (6 caractères min.)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
            disabled={!canSubmit}
            onPress={() => signIn(email, password)}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            disabled={!canSubmit}
            onPress={() => signUp(email, password)}
          >
            <Text style={styles.secondaryBtnText}>Créer un compte</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a16' },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 28, gap: 6,
  },

  logo:     { fontSize: 56 },
  title:    { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: 2 },
  subtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 24 },

  form: { alignSelf: 'stretch', gap: 12 },
  input: {
    backgroundColor: '#12122a',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    color: '#fff', fontSize: 15,
  },

  primaryBtn: {
    backgroundColor: '#7C3AED', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.4 },

  secondaryBtn: { alignItems: 'center', paddingVertical: 10 },
  secondaryBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
});
