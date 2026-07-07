// ─────────────────────────────────────────────────────────────
// Admin Spin — point d'entrée
//
// 1. Pas de session         → formulaire de login (même Auth que l'app)
// 2. Session mais pas admin → accès refusé
// 3. Admin                  → la file de curation (Queue)
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Queue from './pages/Queue';

type AdminCheck = 'loading' | 'yes' | 'no';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isAdmin, setIsAdmin] = useState<AdminCheck>('loading');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Vérifie le flag is_admin dès qu'une session existe
  useEffect(() => {
    if (!session) { setIsAdmin('loading'); return; }
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setIsAdmin(data?.is_admin ? 'yes' : 'no'));
  }, [session]);

  if (!initialized) return <div className="center muted">Chargement…</div>;
  if (!session) return <Login />;
  if (isAdmin === 'loading') return <div className="center muted">Vérification…</div>;
  if (isAdmin === 'no') {
    return (
      <div className="center">
        <h2>⛔ Accès refusé</h2>
        <p className="muted">Ce compte n'est pas administrateur.</p>
        <button onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    );
  }

  return <Queue onLogout={() => supabase.auth.signOut()} />;
}

// ── Login ─────────────────────────────────────────────────────

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div className="center">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>🎰 Spin Admin</h1>
        <p className="muted">Connecte-toi avec ton compte admin</p>
        <input
          type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)} required
        />
        <input
          type="password" placeholder="Mot de passe" value={password}
          onChange={e => setPassword(e.target.value)} required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
