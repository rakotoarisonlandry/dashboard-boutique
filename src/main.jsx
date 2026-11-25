import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertsControl, Empty, Icon, LiveBadge, Login, Modal, Shell, Stat, ToastProvider, addDays, dayKey, downloadCsv, e, formatDate, formatDay, formatTime,
  initials, post, request, timeAgo, useAlerts, useClockRefresh, useConfirm, useDocumentTitle, useLiveStream, useNow, useSession, useToast,
} from './common';
import { QrScanner } from './qr-scanner';
import './style.css';

const STATUS = { pending: 'En attente', confirmed: 'Confirmé', rejected: 'Refusé', cancelled: 'Annulé' };
const SERVICES = { 'orange-money': 'Orange Money', 'orange-number': 'Numéro Orange', subscription: 'Abonnements', purchase: 'Achats' };
const LATE_AFTER = 15 * 60_000;
const FILTERS = [['all', 'Tous'], ['pending', 'En attente'], ['confirmed', 'À accueillir'], ['late', 'En retard'], ['arrived', 'Arrivés'], ['closed', 'Annulés / refusés']];

const isOpen = item => ['pending', 'confirmed'].includes(item.status) && !item.checkedInAt;
const isLate = (item, now) => isOpen(item) && Date.parse(item.slot?.startsAt) + LATE_AFTER < now;
const matches = (item, filter, now) => filter === 'all' ? true
  : filter === 'arrived' ? !!item.checkedInAt
    : filter === 'closed' ? ['rejected', 'cancelled'].includes(item.status)
      : filter === 'late' ? isLate(item, now)
        : item.status === filter && !item.checkedInAt;
const normalize = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Same short code as the customer app shows on the ticket (last 6 characters). */
const ticketCode = id => { const clean = String(id || '').replace(/[^A-Za-z0-9]/g, ''); return (clean.length > 6 ? clean.slice(-6) : clean).toUpperCase(); };
const searchable = item => normalize([item.customerName, item.phone, item.id, ...(item.serviceIds || []).map(id => SERVICES[id] || id)].join(' '));

function AgentDashboard({ user, logout }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const now = useNow(20_000);
  const today = dayKey(now);
  const [shops, setShops] = useState([]);
  const [shop, setShop] = useState('');
  const [day, setDay] = useState(today);
  const [windowStart, setWindowStart] = useState(today);
  const [view, setView] = useState('agenda');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [agenda, setAgenda] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [syncedAt, setSyncedAt] = useState(0);
  const [resultFor, setResultFor] = useState(null);
  const [fresh, setFresh] = useState([]);
  const seen = useRef(null);
  const ticketInput = useRef(null);
  const selected = useRef({ shop, day }); selected.current = { shop, day };
  const current = shops.find(item => item.id === shop);
  useDocumentTitle(`${queue.length ? `(${queue.length}) ` : ''}Espace boutique · Robia IoT`);

  useEffect(() => {
    let active = true;
    request('/appointments/agent/shops')
      .then(items => { if (active) { setShops(items); setShop(items[0]?.id || ''); } })
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const refresh = useCallback(async () => {
    const target = selected.current;
    if (!target.shop) return;
    try {
      const [dayItems, latest] = await Promise.all([
        request(`/appointments/agent/shops/${e(target.shop)}/bookings?date=${target.day}`),
        request(`/appointments/agent/shops/${e(target.shop)}/bookings`),
      ]);
      if (selected.current.shop !== target.shop || selected.current.day !== target.day) return;
      setAgenda(dayItems);
      setQueue(latest.filter(item => item.status === 'pending' && Date.parse(item.slot?.startsAt) > Date.now() - LATE_AFTER)
        .sort((a, b) => Date.parse(a.slot?.startsAt) - Date.parse(b.slot?.startsAt)));
      if (seen.current) {
        const arrived = latest.filter(item => !seen.current.has(item.id) && item.status === 'pending');
        if (arrived.length) {
          setFresh(arrived.map(item => item.id));
          setTimeout(() => setFresh([]), 15_000);
          const text = arrived.length === 1 ? `${arrived[0].customerName} · ${formatDate(arrived[0].slot?.startsAt)}` : `${arrived.length} nouvelles demandes`;
          toast(arrived.length === 1 ? `Nouvelle demande de ${text}` : text, 'info');
          alertsRef.current?.notify('Nouvelle demande de rendez-vous', text);
        }
      }
      seen.current = new Set(latest.map(item => item.id));
      setSyncedAt(Date.now()); setError('');
    } catch (err) { if (selected.current.shop === target.shop) setError(err.message); }
  }, [toast]);
  useEffect(() => { seen.current = null; setQueue([]); setFresh([]); setQuery(''); }, [shop]);
  useEffect(() => { setAgenda(null); if (shop) void refresh(); }, [day, shop, refresh]);

  // Real time: the server pushes each change; a debounce groups bursts.
  const alerts = useAlerts();
  const alertsRef = useRef(alerts); alertsRef.current = alerts;
  const refreshTimer = useRef(null);
  const scheduleRefresh = useCallback(() => { clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(() => void refresh(), 250); }, [refresh]);
  const reloadShops = useCallback(() => request('/appointments/agent/shops').then(items => {
    setShops(items);
    setShop(currentShop => items.some(item => item.id === currentShop) ? currentShop : items[0]?.id || '');
  }).catch(() => {}), []);
  const live = useLiveStream(event => {
    if (event.type === 'ready') { void reloadShops(); scheduleRefresh(); return; }
    if (event.type === 'team.changed') { void reloadShops().then(() => toast('Vos boutiques ont été mises à jour.', 'info')); return; }
    if (event.type === 'shop.changed') void reloadShops();
    if (event.data?.locationId === selected.current.shop) scheduleRefresh();
    else if (event.type === 'booking.created') {
      const other = shops.find(item => item.id === event.data?.locationId)?.name || 'une autre boutique';
      toast(`Nouvelle demande · ${other}`, 'info');
      alerts.notify('Nouvelle demande de rendez-vous', other);
    }
  });
  // Safety net only: the live stream drives updates while it is connected.
  useClockRefresh(refresh, live === 'live' ? 60_000 : 10_000);

  // « / » jumps to ticket verification, like a search field.
  useEffect(() => {
    const onKey = event => {
      if (event.key !== '/' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      event.preventDefault(); ticketInput.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const run = async (key, work, success) => {
    if (busy) return false;
    setBusy(key);
    try { await work(); if (success) toast(success, 'success'); await refresh(); return true; }
    catch (err) { toast(err.message, 'error'); await refresh(); return false; }
    finally { setBusy(''); }
  };
  const base = `/appointments/agent/shops/${e(shop)}`;
  const setStatus = (item, status) => run(item.id, () => request(`${base}/bookings/${e(item.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    status === 'confirmed' ? `Rendez-vous de ${item.customerName} confirmé.` : 'Demande refusée. La place est de nouveau libre.');
  const refuse = async item => { if (await confirm({ title: `Refuser la demande de ${item.customerName} ?`, text: 'Le client est prévenu par notification et la place est remise à disposition.', confirm: 'Refuser la demande', danger: true })) void setStatus(item, 'rejected'); };
  const welcome = async item => {
    if (!await confirm({ eyebrow: 'Accueil', title: `${item.customerName} est arrivé ?`, text: item.status === 'pending' ? 'La demande sera confirmée puis l’arrivée enregistrée à l’heure actuelle.' : 'L’arrivée sera enregistrée à l’heure actuelle.', confirm: 'Enregistrer l’arrivée' })) return;
    void run(item.id, async () => {
      if (item.status === 'pending') await request(`${base}/bookings/${e(item.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) });
      await post(`${base}/tickets/${e(item.id)}/check-in`);
    }, `Arrivée de ${item.customerName} enregistrée.`);
  };

  const list = agenda || [];
  const needle = normalize(query.trim().replace(/^#/, ''));
  const searched = item => !needle || searchable(item).includes(needle);
  const visible = list.filter(item => matches(item, filter, now) && searched(item));
  const queueVisible = queue.filter(searched);
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of visible) { const key = formatTime(item.slot?.startsAt); map.set(key, [...(map.get(key) || []), item]); }
    return [...map.entries()];
  }, [visible]);
  const counts = {
    queue: queue.length,
    day: list.filter(item => !['rejected', 'cancelled'].includes(item.status)).length,
    arrived: list.filter(item => item.checkedInAt).length,
    waiting: list.filter(item => item.status === 'confirmed' && !item.checkedInAt).length,
    late: list.filter(item => isLate(item, now)).length,
  };
  const days = Array.from({ length: 7 }, (_, index) => dayKey(addDays(windowStart, index)));
  const stale = syncedAt && now - syncedAt > 40_000;
  const chooseDay = key => { setDay(key); if (!days.includes(key)) setWindowStart(key); };
  const exportDay = () => downloadCsv(`rendez-vous-${current?.name || 'boutique'}-${day}.csv`.replace(/\s+/g, '-').toLowerCase(), [
    ['Heure', 'Client', 'Téléphone', 'Services', 'Statut', 'Arrivée', 'Retour', 'Message', 'Référence'],
    ...list.map(item => [formatTime(item.slot?.startsAt), item.customerName, item.phone, (item.serviceIds || []).map(id => SERVICES[id] || id).join(', '), STATUS[item.status] || item.status, item.checkedInAt ? formatTime(item.checkedInAt) : '', item.serviceResult === 'treated' ? 'Traité' : item.serviceResult === 'not_treated' ? 'Non traité' : '', item.serviceMessage, item.id]),
  ]);

  const nav = <>
    <div className="side-label">VOS BOUTIQUES</div>
    <nav className="nav">{shops.map(item => <button key={item.id} className={`nav-item ${item.id === shop ? 'active' : ''}`} onClick={() => setShop(item.id)}>
      <Icon name="shop" size={19}/><span className="nav-copy"><span>{item.name}</span><small>{item.city || item.address || 'Boutique'}</small></span>
      {item.id === shop && counts.queue > 0 && <span className="dot">{counts.queue}</span>}
    </button>)}</nav>
    <div className="side-label">RACCOURCI</div>
    <p className="hint" style={{ padding: '0 12px' }}><span className="kbd">/</span> vérifier un ticket</p>
  </>;
  const mobileNav = shops.length > 1 && <select aria-label="Boutique" value={shop} onChange={event => setShop(event.target.value)}>{shops.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
  const card = item => <BookingCard key={item.id} item={item} now={now} busy={busy} fresh={fresh.includes(item.id)} showDay={view === 'queue'} onConfirm={() => void setStatus(item, 'confirmed')} onRefuse={() => void refuse(item)} onWelcome={() => void welcome(item)} onResult={() => setResultFor(item)}/>;

  return <Shell user={user} logout={logout} role="Espace boutique" nav={nav} mobileNav={mobileNav}>
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="date-line">{formatDay(now)} · {formatTime(now)}</div>
          <h1>Bonjour{user?.name ? ` ${user.name.split(' ')[0]}` : ''}<span className="accent">.</span></h1>
          <p>{current ? <>Vous gérez <strong>{current.name}</strong>{current.address ? ` · ${current.address}` : ''}</> : 'Accueillez vos clients en toute simplicité.'}</p>
        </div>
        {shop && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <AlertsControl alerts={alerts}/>
          <LiveBadge status={live === 'live' ? 'live' : stale ? 'connecting' : 'connecting'}/>
          {syncedAt > 0 && <small title={`Dernière synchronisation : ${formatTime(syncedAt)}`}>Mis à jour {timeAgo(syncedAt, now)}</small>}
        </div>}
      </div>
      {error && <div className="notice" role="alert">{error}</div>}

      {loading ? <div className="stats">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 92 }}/>)}</div>
        : !shops.length ? <div className="panel"><Empty icon="shop" title="Aucune boutique ne vous est affectée" text="Communiquez l’adresse e-mail de votre compte au propriétaire : il pourra vous ajouter à son équipe depuis l’administration."><p className="ref" style={{ marginTop: 14 }}>{user?.email}</p></Empty></div>
          : <>
            <div className="stats">
              <Stat hero={counts.queue > 0} icon="bell" label="À traiter" value={counts.queue} caption="Demandes en attente"/>
              <Stat icon="calendar" label={day === today ? 'Aujourd’hui' : formatDay(addDays(day, 0), { weekday: 'long', day: 'numeric' })} value={counts.day} caption="Rendez-vous prévus"/>
              <Stat icon="clock" label="À accueillir" value={counts.waiting} caption={counts.late ? `dont ${counts.late} en retard` : 'Confirmés, pas encore arrivés'}/>
              <Stat icon="check" label="Arrivés" value={counts.arrived} caption="Clients accueillis"/>
            </div>

            <div className="grid-2">
              <section>
                <div className="section-head">
                  <div className="tabs" role="tablist">
                    <button role="tab" aria-selected={view === 'agenda'} className={`tab ${view === 'agenda' ? 'active' : ''}`} onClick={() => setView('agenda')}>Agenda</button>
                    <button role="tab" aria-selected={view === 'queue'} className={`tab ${view === 'queue' ? 'active' : ''}`} onClick={() => setView('queue')}>À traiter{counts.queue ? ` · ${counts.queue}` : ''}</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {view === 'agenda' && <button className="btn ghost small" disabled={!list.length} onClick={exportDay} title="Exporter la journée (CSV)"><Icon name="download" size={16}/>Exporter</button>}
                    <button className="btn ghost small" onClick={() => void refresh()}><Icon name="refresh" size={16}/>Actualiser</button>
                  </div>
                </div>

                {view === 'agenda' && <div className="day-nav">
                  <button className="day-arrow" aria-label="Jours précédents" onClick={() => setWindowStart(dayKey(addDays(windowStart, -7)))}><Icon name="back" size={18}/></button>
                  {days.map(key => <button key={key} className={`day-chip ${key === day ? 'active' : ''}`} onClick={() => setDay(key)} aria-pressed={key === day} aria-label={formatDay(addDays(key, 0))}>
                    <small>{key === today ? 'Auj.' : formatDay(addDays(key, 0), { weekday: 'short' }).replace('.', '')}</small><strong>{Number(key.slice(8))}</strong>
                  </button>)}
                  <button className="day-arrow" aria-label="Jours suivants" onClick={() => setWindowStart(dayKey(addDays(windowStart, 7)))}><Icon name="arrow" size={18}/></button>
                  <input type="date" className="date-input" aria-label="Aller à une date" value={day} onChange={event => event.target.value && chooseDay(event.target.value)}/>
                  {day !== today && <button className="btn soft small" onClick={() => { setDay(today); setWindowStart(today); }}>Aujourd’hui</button>}
                </div>}

                <div className="toolbar">
                  <div className="search"><Icon name="search" size={17}/><input aria-label="Rechercher un client" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nom, téléphone, code ticket ou service"/></div>
                </div>
                {view === 'agenda' && <div className="chips" style={{ marginTop: 12 }}>{FILTERS.map(([key, label]) => {
                  const count = list.filter(item => matches(item, key, now)).length;
                  if (key === 'late' && !count) return null;
                  return <button key={key} className={`chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>{label}{key !== 'all' && count > 0 && <span className="count">{count}</span>}</button>;
                })}</div>}

                {view === 'agenda' ? (
                  agenda === null ? <div className="timeline">{[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 120, marginTop: 10 }}/>)}</div>
                    : !groups.length ? <div className="panel" style={{ marginTop: 14 }}><Empty icon={needle ? 'search' : 'calendar'} title={needle ? 'Aucun résultat' : list.length ? 'Aucun rendez-vous pour ce filtre' : 'Journée libre'} text={needle ? `Aucun client ne correspond à « ${query.trim()} » ce jour-là.` : list.length ? 'Changez de filtre pour voir les autres rendez-vous.' : 'Aucun client n’a réservé ce jour-là pour le moment.'}/></div>
                      : <div className="timeline">{groups.map(([time, items]) => {
                        const isNow = day === today && Math.abs(Date.parse(items[0].slot?.startsAt) - now) < 30 * 60_000;
                        return <div key={time} className={`time-group ${isNow ? 'now' : ''}`}>
                          <div className="time-label">{time}</div>
                          <div className="time-cards">{items.map(card)}</div>
                        </div>;
                      })}</div>
                ) : <div className="list" style={{ marginTop: 14 }}>
                  {!queueVisible.length ? <div className="panel"><Empty icon={needle ? 'search' : 'check'} title={needle ? 'Aucun résultat' : 'Tout est traité'} text={needle ? 'Aucune demande en attente ne correspond.' : 'Les nouvelles demandes apparaîtront ici automatiquement.'}/></div>
                    : queueVisible.map(card)}
                </div>}
              </section>

              <div className="stack">
                <TicketCheck base={base} busy={busy} run={run} inputRef={ticketInput}/>
                <Recovery base={base} confirm={confirm} run={run}/>
                <div className="panel">
                  <span className="eyebrow">Horaires d’accueil</span>
                  <h3 style={{ marginTop: 6 }}>Lundi – samedi · 08:00 – 16:00</h3>
                  <p className="hint">Un client confirmé est signalé « En retard » 15 minutes après l’heure de son rendez-vous.</p>
                </div>
              </div>
            </div>
          </>}
    </div>
    {resultFor && <ResultDialog item={resultFor} onClose={() => setResultFor(null)} onSubmit={(result, message) => { const item = resultFor; setResultFor(null); void run(item.id, () => post(`${base}/bookings/${e(item.id)}/result`, { result, message }), 'Retour envoyé au client.'); }}/>}
    {confirmDialog}
  </Shell>;
}

function BookingCard({ item, now, busy, fresh, showDay, onConfirm, onRefuse, onWelcome, onResult }) {
  const working = busy === item.id;
  const open = isOpen(item);
  const late = isLate(item, now);
  return <article className={`booking ${fresh ? 'highlight' : ''}`} aria-busy={working}>
    <div className="booking-top">
      <span className="avatar soft">{initials(item.customerName)}</span>
      <div className="booking-title">
        <strong>{item.customerName} <span className="ticket-code" title="Code affiché sur le ticket du client">#{ticketCode(item.id)}</span></strong>
        <span>{showDay ? `${formatDate(item.slot?.startsAt)} · ` : ''}{item.phone ? <a href={`tel:${item.phone.replace(/\s+/g, '')}`} style={{ color: 'inherit' }}>{item.phone}</a> : 'Téléphone non renseigné'}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {late && <span className="tag late">En retard</span>}
        {item.checkedInAt ? <span className="tag arrived">Arrivé · {formatTime(item.checkedInAt)}</span> : <span className={`tag ${item.status}`}>{STATUS[item.status] || item.status}</span>}
      </div>
    </div>
    <div className="booking-meta">{item.serviceIds?.map(id => <span key={id} className="service-chip">{SERVICES[id] || id}</span>)}<span className="service-chip">Demandé {formatDate(item.createdAt)}</span></div>
    {item.serviceResult && <div className="result-box"><strong style={{ color: item.serviceResult === 'treated' ? 'var(--success)' : 'var(--danger)' }}>{item.serviceResult === 'treated' ? '✓ Demande traitée' : 'Demande non traitée'}</strong>{item.serviceMessage}</div>}
    {(open || (item.checkedInAt && !item.serviceResult)) && <div className="booking-actions">
      {open && <button className="btn primary small" disabled={!!busy} onClick={onWelcome}><Icon name="check" size={16}/>{working ? 'Patientez…' : 'Client arrivé'}</button>}
      {item.status === 'pending' && !item.checkedInAt && <>
        <button className="btn success small" disabled={!!busy} onClick={onConfirm}>Confirmer</button>
        <button className="btn danger small" disabled={!!busy} onClick={onRefuse}>Refuser</button>
      </>}
      {item.checkedInAt && !item.serviceResult && <button className="btn soft small" disabled={!!busy} onClick={onResult}><Icon name="bell" size={16}/>Envoyer le retour au client</button>}
    </div>}
    <span className="ref">Réf. {item.id}</span>
  </article>;
}

function ResultDialog({ item, onClose, onSubmit }) {
  const [result, setResult] = useState('treated');
  const [message, setMessage] = useState('');
  return <Modal as="form" onClose={onClose} label={`Retour au client ${item.customerName}`} onSubmit={event => { event.preventDefault(); if (message.trim()) onSubmit(result, message.trim()); }}>
    <span className="eyebrow">Retour au client</span>
    <h2>{item.customerName}</h2>
    <p>Ce message apparaît dans l’application du client, avec une notification. Un seul retour est possible.</p>
    <div className="tabs" style={{ marginTop: 16 }} role="radiogroup" aria-label="Résultat">
      <button type="button" role="radio" aria-checked={result === 'treated'} className={`tab ${result === 'treated' ? 'active' : ''}`} onClick={() => setResult('treated')}>Demande traitée</button>
      <button type="button" role="radio" aria-checked={result === 'not_treated'} className={`tab ${result === 'not_treated' ? 'active' : ''}`} onClick={() => setResult('not_treated')}>Non traitée</button>
    </div>
    <label>Message<textarea autoFocus rows={4} maxLength={500} required value={message} onChange={event => setMessage(event.target.value)} placeholder={result === 'treated' ? 'Ex. Votre carte SIM a été remplacée.' : 'Ex. Merci de revenir avec un justificatif de domicile.'}/></label>
    <p className="hint">{message.length}/500</p>
    <div className="dialog-actions"><button type="button" className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" disabled={!message.trim()}>Envoyer au client</button></div>
  </Modal>;
}

function TicketCheck({ base, busy, run, inputRef }) {
  const [reference, setReference] = useState('');
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const verify = async value => {
    if (!value.trim()) return;
    setChecking(true); setError(''); setTicket(null);
    try { setTicket(await request(`${base}/tickets/${e(value.trim())}`)); }
    catch (err) { setError(err.message); }
    finally { setChecking(false); }
  };
  const check = event => { event.preventDefault(); void verify(reference); };
  const scanned = value => { setScanning(false); setReference(value); void verify(value); };
  return <form className="panel" onSubmit={check}>
    <span className="eyebrow">Accueil au guichet</span>
    <h2 style={{ marginTop: 6 }}>Vérifier un ticket</h2>
    <p>Scannez le QR code du ticket, ou saisissez la référence affichée dessous.</p>
    <button type="button" className="btn primary full" style={{ marginTop: 10 }} onClick={() => setScanning(true)}><Icon name="scan" size={18}/>Scanner le QR code</button>
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input ref={inputRef} aria-label="Référence du ticket" value={reference} onChange={event => { setReference(event.target.value); setTicket(null); setError(''); }} placeholder="Ou saisissez la référence (raccourci /)" style={{ flex: 1 }}/>
      <button className="btn dark" aria-label="Vérifier" disabled={checking || !reference.trim()} style={{ marginTop: 7 }}><Icon name="search" size={17}/></button>
    </div>
    {error && <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
    {ticket && <div className="ticket-check" aria-live="polite">
      <div className={`ticket-check-head ${ticket.valid ? '' : 'bad'}`}>{ticket.valid ? '✓ Ticket valide' : ticket.checkedInAt ? 'Client déjà accueilli' : ticket.status === 'pending' ? 'Demande pas encore confirmée' : 'Ticket non utilisable'}</div>
      <div className="ticket-check-body">
        <strong>{ticket.customerName}</strong>
        <small>{formatDate(ticket.slot?.startsAt)} · {STATUS[ticket.status] || ticket.status}</small>
        {ticket.valid && <button type="button" className="btn primary small" disabled={!!busy} onClick={() => void run(ticket.id, () => post(`${base}/tickets/${e(ticket.id)}/check-in`), `Arrivée de ${ticket.customerName} enregistrée.`).then(ok => { if (ok) { setTicket(null); setReference(''); } })}>Enregistrer l’arrivée</button>}
      </div>
    </div>}
    {scanning && <QrScanner onResult={scanned} onClose={() => setScanning(false)}/>}
  </form>;
}

function Recovery({ base, confirm, run }) {
  const [open, setOpen] = useState(false);
  const [recoveryId, setRecoveryId] = useState(''); const [bookingId, setBookingId] = useState(''); const [verified, setVerified] = useState(false);
  const submit = async () => {
    if (!await confirm({ eyebrow: 'Assistance', title: 'Transférer l’accès du client ?', text: 'Ses anciens appareils seront déconnectés. Vérifiez bien la CIN originale.', confirm: 'Transférer l’accès' })) return;
    void run('recovery', () => post(`${base}/recovery/${e(recoveryId.trim())}/approve`, { bookingId: bookingId.trim(), identityVerified: true }), 'Accès transféré sur le nouvel appareil.')
      .then(ok => { if (ok) { setRecoveryId(''); setBookingId(''); setVerified(false); } });
  };
  return <div className="panel">
    <button className="row-item" style={{ background: 'none', padding: 0 }} onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="icon-tile"><Icon name="key" size={20}/></span>
      <span className="row-copy"><strong>Récupération d’accès</strong><small>Client qui a changé de téléphone</small></span>
      <span style={{ transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform .2s' }}><Icon name="arrow" size={16}/></span>
    </button>
    {open && <div style={{ marginTop: 8 }}>
      <label>Référence de la demande<input value={recoveryId} onChange={event => setRecoveryId(event.target.value)}/></label>
      <label>Référence d’un rendez-vous du client<input value={bookingId} onChange={event => setBookingId(event.target.value)}/></label>
      <label className="check"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)}/> J’ai vérifié la CIN originale et la concordance du dossier.</label>
      <button className="btn soft full" style={{ marginTop: 14 }} disabled={!verified || !recoveryId.trim() || !bookingId.trim()} onClick={() => void submit()}>Valider la récupération</button>
    </div>}
  </div>;
}

function App() {
  const session = useSession();
  return <ToastProvider>{session.user
    ? <AgentDashboard {...session}/>
    : <Login title="Espace boutique" subtitle="Connectez-vous avec votre compte Robia. Le propriétaire doit vous avoir ajouté à une boutique." login={session.login}/>}</ToastProvider>;
}
createRoot(document.getElementById('root')).render(<App/>);
