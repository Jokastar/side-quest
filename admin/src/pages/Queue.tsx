// ─────────────────────────────────────────────────────────────
// Queue — la file de curation des événements
//
// 3 onglets : En attente / Approuvés / Rejetés
// Actions par carte : approuver, rejeter, restaurer, changer la
// catégorie. Header : compteurs + bouton "Lancer une sync".
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { supabase, type AdminEvent, type EventStatus } from '../lib/supabase';

const TABS: { key: EventStatus; label: string; emoji: string }[] = [
  { key: 'pending',  label: 'En attente', emoji: '📥' },
  { key: 'approved', label: 'Approuvés',  emoji: '✅' },
  { key: 'rejected', label: 'Rejetés',    emoji: '🚫' },
];

const CATEGORIES: AdminEvent['category'][] = ['lieu', 'restaurant', 'ambiance'];

const CATEGORY_STYLE: Record<string, { color: string; label: string }> = {
  lieu:       { color: '#7C3AED', label: '🎭 Lieu' },
  restaurant: { color: '#EA580C', label: '🍽️ Table' },
  ambiance:   { color: '#DB2777', label: '🎶 Sortie' },
};

interface QueueProps {
  onLogout: () => void;
}

export default function Queue({ onLogout }: QueueProps) {
  const [tab, setTab] = useState<EventStatus>('pending');
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [counts, setCounts] = useState<Record<EventStatus, number>>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);

    // Liste de l'onglet actif + compteurs des 3 statuts en parallèle
    const [listRes, ...countRes] = await Promise.all([
      supabase.from('events').select('*').eq('status', tab).order('start_date'),
      ...TABS.map(t =>
        supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', t.key),
      ),
    ]);

    setEvents((listRes.data ?? []) as AdminEvent[]);
    setCounts({
      pending:  countRes[0].count ?? 0,
      approved: countRes[1].count ?? 0,
      rejected: countRes[2].count ?? 0,
    });
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ────────────────────────────────────────────────

  async function setStatus(id: string, status: EventStatus) {
    // Optimiste : on retire la carte tout de suite, rollback si erreur
    const prev = events;
    setEvents(evts => evts.filter(e => e.id !== id));
    setCounts(c => ({ ...c, [tab]: c[tab] - 1, [status]: c[status] + 1 }));

    const { error } = await supabase.from('events').update({ status }).eq('id', id);
    if (error) {
      alert(`Erreur : ${error.message}`);
      setEvents(prev);
      load();
    }
  }

  async function setCategory(id: string, category: AdminEvent['category']) {
    setEvents(evts => evts.map(e => (e.id === id ? { ...e, category } : e)));
    const { error } = await supabase.from('events').update({ category }).eq('id', id);
    if (error) { alert(`Erreur : ${error.message}`); load(); }
  }

  async function runSync() {
    setSyncing(true);
    // NB : la fonction est déployée sous le nom 'sync-data-' (tiret final)
    const { data, error } = await supabase.functions.invoke('sync-data-');
    setSyncing(false);
    if (error) alert(`Sync échouée : ${error.message}`);
    else {
      alert(`Sync OK — ${data?.events ?? '?'} événements, ${data?.venues ?? '?'} venues`);
      load();
    }
  }

  // ── Rendu ──────────────────────────────────────────────────

  const filtered = search
    ? events.filter(e =>
        (e.title + ' ' + (e.venue_name ?? '') + ' ' + (e.description ?? ''))
          .toLowerCase().includes(search.toLowerCase()),
      )
    : events;

  return (
    <div className="queue">
      {/* Header */}
      <header>
        <h1>🎰 Spin Admin</h1>
        <div className="header-actions">
          <button className="sync-btn" onClick={runSync} disabled={syncing}>
            {syncing ? 'Sync en cours…' : '🔄 Lancer une sync'}
          </button>
          <button className="ghost" onClick={onLogout}>Déconnexion</button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={tab === t.key ? 'tab active' : 'tab'}
            onClick={() => setTab(t.key)}
          >
            {t.emoji} {t.label}
            <span className="count">{counts[t.key]}</span>
          </button>
        ))}
      </nav>

      {/* Search */}
      <input
        className="search"
        placeholder="Rechercher (titre, lieu, description)…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Liste */}
      {loading ? (
        <p className="muted center-text">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="muted center-text">
          {tab === 'pending' ? '🎉 File vide — tout est traité !' : 'Aucun événement.'}
        </p>
      ) : (
        <div className="cards">
          {filtered.map(e => (
            <EventCard
              key={e.id}
              event={e}
              tab={tab}
              onApprove={() => setStatus(e.id, 'approved')}
              onReject={() => setStatus(e.id, 'rejected')}
              onRestore={() => setStatus(e.id, 'pending')}
              onCategory={c => setCategory(e.id, c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Carte événement ───────────────────────────────────────────

interface EventCardProps {
  event: AdminEvent;
  tab: EventStatus;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onCategory: (c: AdminEvent['category']) => void;
}

function EventCard({ event, tab, onApprove, onReject, onRestore, onCategory }: EventCardProps) {
  const cat = CATEGORY_STYLE[event.category];
  const dates = formatDates(event.start_date, event.end_date);

  return (
    <div className="card">
      {event.photo_url
        ? <img className="card-photo" src={event.photo_url} alt="" loading="lazy" />
        : <div className="card-photo placeholder">🎪</div>}

      <div className="card-body">
        <div className="card-top">
          <select
            className="category-select"
            style={{ color: cat.color, borderColor: cat.color + '55' }}
            value={event.category}
            onChange={e => onCategory(e.target.value as AdminEvent['category'])}
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_STYLE[c].label}</option>
            ))}
          </select>
          <span className="badges-inline">
            {!event.is_indoor && <span className="badge outdoor">🌳 Extérieur</span>}
            {event.access_type === 'obligatoire' && <span className="badge resa">🎟 Résa obligatoire</span>}
            <span className="price">{event.price === 0 ? 'Gratuit' : `${event.price}€`}</span>
          </span>
        </div>

        <h3>{event.title}</h3>

        {/* Types source (Expo, Concert, Balade…) */}
        {event.tags && (
          <div className="tags">
            {event.tags.split(';').map(t => (
              <span key={t} className="tag">{t.trim()}</span>
            ))}
          </div>
        )}

        {(event.venue_name || event.address) && (
          <p className="venue">
            📍 {event.venue_name}{event.venue_name && event.address ? ' · ' : ''}{event.address}
          </p>
        )}
        {/* Première ligne de transport (métro le plus proche) */}
        {event.transport && (
          <p className="venue">🚇 {event.transport.split('\n')[0].replace('->', '·')}</p>
        )}
        <p className="dates">🗓 {dates}</p>
        {todayOccurrence(event.occurrences) && (
          <p className="dates today">🕐 Aujourd'hui : {todayOccurrence(event.occurrences)}</p>
        )}
        {/* Horaires en clair (date_description de l'API) — le plus utile pour les expos */}
        {event.schedule_text && (
          <p className="schedule">🕐 {event.schedule_text}</p>
        )}
        {event.description && <p className="desc">{event.description}</p>}
        <div className="links">
          {event.url && (
            <a className="link" href={event.url} target="_blank" rel="noreferrer">
              Voir la page source ↗
            </a>
          )}
          {event.access_link && (
            <a className="link" href={event.access_link} target="_blank" rel="noreferrer">
              Lien de réservation ↗
            </a>
          )}
        </div>

        <div className="card-actions">
          {tab === 'pending' && (
            <>
              <button className="approve" onClick={onApprove}>✅ Approuver</button>
              <button className="reject" onClick={onReject}>🚫 Rejeter</button>
            </>
          )}
          {tab === 'approved' && (
            <button className="reject" onClick={onReject}>🚫 Retirer</button>
          )}
          {tab === 'rejected' && (
            <button className="restore" onClick={onRestore}>↩️ Restaurer</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Cherche dans la liste des créneaux ("start_end;start_end;…") celui
// d'aujourd'hui, et retourne ses horaires ("18h00 – 20h00"), sinon null.
function todayOccurrence(occurrences: string | null): string | null {
  if (!occurrences) return null;
  const todayKey = new Date().toDateString();
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');

  for (const slot of occurrences.split(';')) {
    const [start, end] = slot.split('_');
    if (!start) continue;
    const s = new Date(start);
    if (s.toDateString() !== todayKey) continue;
    const e = end ? new Date(end) : null;
    return e ? `${fmtTime(s)} – ${fmtTime(e)}` : fmtTime(s);
  }
  return null;
}

function formatDates(start: string, end: string | null): string {
  const s = new Date(start);
  const e = end ? new Date(end) : null;

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  // Minuit pile = pas d'heure renseignée par la source, on ne l'affiche pas
  const hasTime = (d: Date) => d.getHours() !== 0 || d.getMinutes() !== 0;

  // Même jour → "7 juil. 2026 · 19h00 – 21h30"
  if (e && fmtDate(s) === fmtDate(e)) {
    const times = hasTime(s)
      ? ` · ${fmtTime(s)}${hasTime(e) ? ` – ${fmtTime(e)}` : ''}`
      : '';
    return fmtDate(s) + times;
  }

  // Jour unique sans fin → "7 juil. 2026 · 19h00"
  if (!e) return fmtDate(s) + (hasTime(s) ? ` · ${fmtTime(s)}` : '');

  // Période (expo, festival…) → dates seules, l'heure de début
  // d'il y a 3 mois n'a aucun sens affichée seule
  return `${fmtDate(s)} → ${fmtDate(e)}`;
}
