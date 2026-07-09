import { useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// Authentification email + mot de passe via Supabase Auth.
//
// Il n'y a PAS de redirection ici : quand la connexion réussit,
// Supabase émet un événement de session que _layout.tsx écoute
// (onAuthStateChange) — c'est l'AuthGuard qui navigue ensuite.
// Chaque brique fait une seule chose.
// ─────────────────────────────────────────────────────────────

export function useAuth() {
  // Désactive les boutons pendant l'appel réseau (évite le double-tap)
  const [loading, setLoading] = useState(false);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Erreur', error.message);
    setLoading(false);
  };

  const signUp = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) Alert.alert('Erreur', error.message);
    // Selon la config Supabase, l'inscription demande une confirmation email
    else Alert.alert('Succès', 'Vérifie ton email pour confirmer ton compte.');
    setLoading(false);
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  };

  return { signIn, signUp, signOut, loading };
}
