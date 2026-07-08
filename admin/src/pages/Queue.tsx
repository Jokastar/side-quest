// ─────────────────────────────────────────────────────────────
// Queue — la file de curation des items (modèle unifié)
//
// 3 onglets de statut : En attente / Approuvés / Rejetés
// Filtre par nature : Tous / Éphémères / Permanents
// Actions par carte : approuver, rejeter, restaurer,
// corriger le slot (rouleau) et la catégorie.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  supabase,
  type AdminItem, type ItemStatus, type Slot, type Category,
} from '../lib/supabase';

const TABS: { key: ItemStatus; label: string; emoji: string }[] = [
  { key: 'pending',  label: 'En attente', emoji: '📥' },
  { key: 'approved', label: 'Approuvés',  emoji: '✅' },
  { key: 'rejected', label: 'Rejetés',    emoji: '🚫' },
];

type NatureFilter = 'all' | 'ephemere' | 'permanent';

const SLOTS: Slot[] = ['activite', 'table', 'sortie'];
const SLOT_STYLE: Record<Slot, { color: string; label: string }> = {
  activite: { color: '#7C3AED', label: '🎭 Activité' },
  table:    { color: '#EA580C', label: '🍽️ Table' },
  sortie:   { color: '#DB2777', label: '🎶 Sortie' },
};

const CATEGORIES: Category[] = ['culture', 'loisir', 'plein_air', 'food', 'bar', 'club', 'concert'];
const CATEGORY_LABEL: Record<Category, string> = {
  culture: 'Culture', loisir: 'Loisir', plein_air: 'Plein air',
  food: 'Food', bar: 'Bar', club: 'Club', concert: 'Concert',
};

function priceLabel(item: AdminItem): string {
  if (item.price != null) return item.price === 0 ? 'Gratuit' : `${item.price}€`;
  if (item.price_level != null) return '€'.repeat(item.price_level);
  return '—';
}

interface QueueProps {
  onLogout: () => void;
}

export default function Queue({ onLogout }: QueueProps) {
  const [tab, setTab] = useState<ItemStatus>('pending');
  const [nature, setNature] = useState<NatureFilter>('all');
  const [items, setItems] = useState<AdminItem[]>([]);
  const [counts, setCounts] = useState<Record<ItemStatus, number>>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);

    let listQuery = supabase.from('items').select('*').eq('status', tab)
      .order('start_date', { ascending: true, nullsFirst: false });
    if (nature !== 'all') listQuery = listQuery.eq('nature', nature);

    // Liste de l'onglet actif + compteurs des 3 statuts en parallèle
    const [listRes, ...countRes] = await Promise.all([
      listQuery,
      ...TABS.map(t =>
        supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', t.key),
      ),
    ]);

    setItems((listRes.data ?? []) as AdminItem[]);
    setCounts({
      pending:  countRes[0].count ?? 0,
      approved: countRes[1].count ?? 0,
      rejected: countRes[2].count ?? 0,
    });
    setLoading(false);
  }, [tab, nature]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ────────────────────────────────────────────────

  async function setStatus(id: string, status: ItemStatus) {
    // Optimiste : on retire la carte tout de suite, rollback si erreur
    const prev = items;
    setItems(list => list.filter(i => i.id !== id));
    setCounts(c => ({ ...c, [tab]: c[tab] - 1, [status]: c[status] + 1 }));

    const { error } = await supabase.from('items').update({ status }).eq('id', id);
    if (error) {
      alert(`Erreur : ${error.message}`);
      setItems(prev);
      load();
    }
  }

  async function patchItem(id: string, patch: Partial<Pick<AdminItem, 'slot' | 'category'>>) {
    setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from('items').update(patch).eq('id', id);
    if (error) { alert(`Erreur : ${error.message}`); load(); }
  }

  async function runSync() {
    setSyncing(true);
    // NB : la fonction est déployée sous le nom 'sync-data-' (tiret final)
    const { data, error } = await supabase.functions.invoke('sync-data-');
    setSyncing(false);
    if (error) alert(`Sync échouée : ${error.message}`);
    else {
      alert(`Sync OK — ${data?.ephemeres ?? '?'} éphémères, ${data?.permanents ?? '?'} permanents`);
      load();
    }
  }

  // ── Rendu ──────────────────────────────────────────────────

  const filtered = search
    ? items.filter(i =>
        (i.name + ' ' + (i.address ?? '') + ' ' + (i.description ?? ''))
          .toLowerCase().includes(search.toLowerCase()),
      )
    : items;

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

      {/* Tabs statut */}
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

      {/* Filtre nature + recherche */}
      <div className="filter-row">
        <select
          className="nature-select"
          value={nature}
          onChange={e => setNature(e.target.value as NatureFilter)}
        >
          <option value="all">Tous</option>
          <option value="ephemere">⏳ Éphémères</option>
          <option value="permanent">🏛 Permanents</option>
        </select>
        <input
          className="search"
          placeholder="Rechercher (nom, adresse, description)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Liste */}
      {loading ? (
        <p className="muted center-text">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="muted center-text">
          {tab === 'pending' ? '🎉 File vide — tout est traité !' : 'Aucun item.'}
        </p>
      ) : (
        <div className="cards">
          {filtered.map(i => (
            <ItemCard
              key={i.id}
              item={i}
              tab={tab}
              onApprove={() => setStatus(i.id, 'approved')}
              onReject={() => setStatus(i.id, 'rejected')}
              onRestore={() => setStatus(i.id, 'pending')}
              onPatch={patch => patchItem(i.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Carte item ────────────────────────────────────────────────

interface ItemCardProps {
  item: AdminItem;
  tab: ItemStatus;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onPatch: (patch: Partial<Pick<AdminItem, 'slot' | 'category'>>) => void;
}

function ItemCard({ item, tab, onApprove, onReject, onRestore, onPatch }: ItemCardProps) {
  const slotStyle = SLOT_STYLE[item.slot];
  const dates = item.start_date ? formatDates(item.start_date, item.end_date) : null;
  const today = todayOccurrence(item.occurrences);

  return (
    <div className="card">
      {item.photo_url
        ? <img className="card-photo" src={item.photo_url} alt="" loading="lazy" />
        : <div className="card-photo placeholder">{item.nature === 'permanent' ? '🏛' : '🎪'}</div>}

      <div className="card-body">
        <div className="card-top">
          <span className="selects">
            {/* Rouleau (routage) */}
            <select
              className="category-select"
              style={{ color: slotStyle.color, borderColor: slotStyle.color + '55' }}
              value={item.slot}
              onChange={e => onPatch({ slot: e.target.value as Slot })}
            >
              {SLOTS.map(s => (
                <option key={s} value={s}>{SLOT_STYLE[s].label}</option>
              ))}
            </select>
            {/* Catégorie (classification) */}
            <select
              className="category-select"
              value={item.category}
              onChange={e => onPatch({ category: e.target.value as Category })}
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </span>
          <span className="badges-inline">
            <span className={item.nature === 'permanent' ? 'badge perm' : 'badge eph'}>
              {item.nature === 'permanent' ? '🏛 Permanent' : '⏳ Éphémère'}
            </span>
            {!item.is_indoor && <span className="badge outdoor">🌳 Extérieur</span>}
            {item.access_type === 'obligatoire' && <span className="badge resa">🎟 Résa obligatoire</span>}
            <span className="price">{priceLabel(item)}</span>
          </span>
        </div>

        <h3>{item.name}</h3>

        {/* Labels source (Expo, Concert, Balade…) */}
        {item.tags && (
          <div className="tags">
            {item.tags.split(';').map(t => (
              <span key={t} className="tag">{t.trim()}</span>
            ))}
          </div>
        )}

        {item.address && <p className="venue">📍 {item.address}</p>}
        {item.transport && (
          <p className="venue">🚇 {item.transport.split('\n')[0].replace('->', '·')}</p>
        )}
        {dates && <p className="dates">🗓 {dates}</p>}
        {today && <p className="dates today">🕐 Aujourd'hui : {today}</p>}
        {item.schedule_text && (
          <p className="schedule">🕐 {item.schedule_text}</p>
        )}
        {item.description && <p className="desc">{item.description}</p>}

        <div className="links">
          {item.url && (
            <a className="link" href={item.url} target="_blank" rel="noreferrer">
              Voir la page source ↗
            </a>
          )}
          {item.access_link && (
            <a className="link" href={item.access_link} target="_blank" rel="noreferrer">
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

  // Période (expo, festival…) → dates seules
  return `${fmtDate(s)} → ${fmtDate(e)}`;
}
