import '../global.css';
import { useEffect, useState, Component, ReactNode } from 'react';
import { View, ActivityIndicator, Text, ScrollView } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

// Attrape les erreurs de rendu React et affiche un écran d'erreur lisible
// au lieu d'un écran blanc, utile pour le débogage en développement
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#000', padding: 20, paddingTop: 60 }}>
          <Text style={{ color: '#FF6584', fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
            Erreur de rendu
          </Text>
          <Text style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>{err.message}</Text>
          <Text style={{ color: '#999', fontSize: 11 }}>{err.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

// Redirige automatiquement l'utilisateur selon son état de connexion :
// - pas de session → page login
// - session active sur la page login → page principale
function AuthGuard({ session }: { session: Session | null }) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthScreen = segments[0] === 'login';

    if (!session && !inAuthScreen) {
      router.replace('/login');
    } else if (session && inAuthScreen) {
      router.replace('/');
    }
  }, [session, segments]);

  return null;
}

// Layout racine de l'app, rendu une seule fois au démarrage
// Il gère la session Supabase et fournit les providers globaux (React Query)
export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Récupère la session existante (stockée dans SecureStore) au démarrage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    // Écoute les changements de session (connexion, déconnexion, refresh du token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Spinner pendant la vérification de la session au démarrage
  if (!initialized) return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ActivityIndicator style={{ flex: 1 }} color="#6C63FF" />
    </View>
  );

  return (
    <ErrorBoundary>
      {/* QueryClientProvider rend React Query disponible dans toute l'app */}
      <QueryClientProvider client={queryClient}>
        <AuthGuard session={session} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="index" />
          <Stack.Screen name="plan" />
          <Stack.Screen name="checkin" />
          <Stack.Screen name="profile" />
        </Stack>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
