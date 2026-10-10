// Family Friends — kleine lokale App zum Verwalten von Darlehen im Familien-/Freundeskreis.
// Alle Daten liegen nur im Browser (localStorage) des jeweiligen Geräts.

const STORAGE_KEY = 'familyFriendsData';
const TODAY = new Date().toISOString().slice(0, 10);
const ME_ID = '__me__'; // repräsentiert die Person, die die App nutzt

const seedData = {
  circleName: 'Müller & Friends',
  // Verleih-Topf: Betrag, den du zum Verleihen bereitstellst (null = noch nicht eingerichtet)
  pot: null,
  groups: [
    { id: 'g1', name: 'Familie' },
    { id: 'g2', name: 'Freunde' },
    { id: 'g3', name: 'Uni' },
    { id: 'g4', name: 'Schule' },
  ],
  members: [
    { id: 'm1', name: 'Tante Sabine', groupIds: ['g1'] },
    { id: 'm2', name: 'Papa', groupIds: ['g1'] },
    { id: 'm3', name: 'Max', groupIds: ['g2', 'g3'] },
    { id: 'm4', name: 'Lena', groupIds: ['g2'] },
  ],
  // Direkte Darlehen zwischen "Du" (ME_ID) und einer Person, oder — aus
  // angenommenen Angeboten — zwischen zwei Kreismitgliedern.
  loans: [
    {
      id: 'l1', lenderId: ME_ID, borrowerId: 'm1', purpose: 'Zahnarztrechnung',
      amount: 600, installments: 10, paidInstallments: 4,
      interest: 3, startDate: '2026-06-01', groupId: null,
    },
    {
      id: 'l2', lenderId: ME_ID, borrowerId: 'm2', purpose: 'Werkstattrechnung',
      amount: 300, installments: 6, paidInstallments: 1,
      interest: 2, startDate: '2026-08-03', groupId: null,
    },
  ],
  // Anfragen: eine Person bittet innerhalb einer Gruppe um Geld zu Wunschbedingungen.
  // Andere Mitglieder der Gruppe können mit einem Angebot antworten (Betrag + eigene Bedingungen).
  requests: [
    {
      id: 'r1', requesterId: 'm3', groupId: 'g2', purpose: 'Neues Fahrrad',
      amount: 250, installments: 5, interest: 1.5, date: '2026-09-24', status: 'offen',
      offers: [
        { id: 'o1', offererId: 'm4', amount: 150, installments: 4, interest: 2, date: '2026-09-25', status: 'ausstehend' },
      ],
    },
  ],
  activity: [
    { id: 'a1', desc: 'Rate von Max erhalten', amount: 45, type: 'in', date: '2026-09-20' },
    { id: 'a2', desc: 'Darlehen an Papa vergeben', amount: -300, type: 'out', date: '2026-09-10' },
  ],
};

// Bringt gespeicherte Daten (auch aus älteren App-Versionen) auf den aktuellen Stand.
function normalizeState(data) {
  if (!data.groups) data.groups = structuredClone(seedData.groups);
  if (!data.requests) data.requests = [];
  if (!data.members) data.members = [];
  if (!data.activity) data.activity = [];
  if (data.pot === undefined) data.pot = null;
  data.members.forEach(m => { if (!m.groupIds) m.groupIds = []; });
  // Migration von der alten Darlehen-Struktur (memberId/direction) falls vorhanden
  data.loans = (data.loans || []).map(l => {
    if (l.lenderId || l.borrowerId) return l;
    return {
      ...l,
      lenderId: l.direction === 'verliehen' ? ME_ID : l.memberId,
      borrowerId: l.direction === 'verliehen' ? l.memberId : ME_ID,
      groupId: null,
    };
  });
  data.requests = data.requests.map(r => {
    if (r.requesterId) return r;
    return { ...r, requesterId: r.memberId, groupId: r.groupId || null, offers: r.offers || [] };
  });
  return data;
}

// Neues, leeres Konto: nur die Standard-Gruppen, noch keine Personen oder Darlehen.
function emptyState(name) {
  return {
    circleName: `Kreis von ${name}`,
    pot: null,
    groups: structuredClone(seedData.groups),
    members: [], loans: [], requests: [], activity: [],
  };
}

// Daten aus der Zeit vor dem Login (unverschlüsselt) — werden ins erste Konto übernommen.
function legacyState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// Speichert verschlüsselt im Konto der angemeldeten Person (siehe „Anmeldung“ unten).
let saveChain = Promise.resolve();
function saveState() {
  if (!session) return;
  if (session.cloud) { scheduleCloudSave(); return; }
  const json = JSON.stringify(state);
  const current = session;
  saveChain = saveChain.then(() => encryptAndStore(current, json)).catch(() => {
    showToast('! Speichern hat nicht geklappt. Ist der Speicher voll?');
  });
}

let state = null;  // wird nach der Anmeldung geladen
let activeFilter = 'alle';
let activeGroupFilter = 'alle';
let expandedLoanId = null;

const euro = (n) => Math.round(n).toLocaleString('de-DE', { maximumFractionDigits: 0 });
const initials = (name) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const formatDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const formatDateFull = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

function memberName(id) {
  if (id === ME_ID) return 'Du';
  const m = state.members.find(m => m.id === id);
  return m ? m.name : 'Unbekannt';
}
function groupName(id) {
  const g = state.groups.find(g => g.id === id);
  return g ? g.name : '';
}
function membersInGroup(groupId) {
  return state.members.filter(m => m.groupIds.includes(groupId));
}

// ---------- Berechnungen ----------

// Eine Rate enthält den Anteil am Betrag plus den Anteil an den Zinsen.
function loanRate(loan) { return loanTotalWithInterest(loan) / loan.installments; }
function loanTotalWithInterest(loan) { return loan.amount * (1 + loan.interest / 100); }
function loanInterestTotal(loan) { return loan.amount * loan.interest / 100; }
function loanInterestPaid(loan) { return loanInterestTotal(loan) * loan.paidInstallments / loan.installments; }
function loanRemaining(loan) { return Math.max(0, (loan.installments - loan.paidInstallments) * loanRate(loan)); }

function nextDueDate(loan) {
  const d = new Date(loan.startDate);
  d.setMonth(d.getMonth() + loan.paidInstallments + 1);
  return d.toISOString().slice(0, 10);
}
function isOverdue(loan) {
  if (loan.paidInstallments >= loan.installments) return false;
  return nextDueDate(loan) < TODAY;
}

function circulatingTotal() {
  return state.loans.filter(l => l.lenderId === ME_ID).reduce((s, l) => s + loanRemaining(l), 0);
}
function totalLentByMe() { return state.loans.filter(l => l.lenderId === ME_ID).reduce((s, l) => s + loanRemaining(l), 0); }
function totalBorrowedByMe() { return state.loans.filter(l => l.borrowerId === ME_ID).reduce((s, l) => s + loanRemaining(l), 0); }
function activeLoanCount() { return state.loans.filter(l => l.paidInstallments < l.installments).length; }
function openRequestCount() { return state.requests.filter(r => r.status === 'offen').length; }

// ---------- Geldfluss ----------

const isActive = (l) => l.paidInstallments < l.installments;
const myLent = () => state.loans.filter(l => l.lenderId === ME_ID);
const myBorrowed = () => state.loans.filter(l => l.borrowerId === ME_ID);

function monthlyIn() { return myLent().filter(isActive).reduce((s, l) => s + loanRate(l), 0); }
function monthlyOut() { return myBorrowed().filter(isActive).reduce((s, l) => s + loanRate(l), 0); }

function profitEarned() { return myLent().reduce((s, l) => s + loanInterestPaid(l), 0); }
function profitTotal() { return myLent().reduce((s, l) => s + loanInterestTotal(l), 0); }
function interestCostPaid() { return myBorrowed().reduce((s, l) => s + loanInterestPaid(l), 0); }
function interestCostTotal() { return myBorrowed().reduce((s, l) => s + loanInterestTotal(l), 0); }

// Verteilt alle offenen Raten auf die nächsten Monate. Überfällige Raten zählen zum aktuellen Monat.
function flowForecast(months = 6) {
  const now = new Date(TODAY);
  const base = now.getFullYear() * 12 + now.getMonth();
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { label: d.toLocaleDateString('de-DE', { month: 'short' }), full: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), in: 0, out: 0 };
  });
  let overdue = 0;
  state.loans.forEach(l => {
    const dir = l.lenderId === ME_ID ? 'in' : (l.borrowerId === ME_ID ? 'out' : null);
    if (!dir) return;
    const start = new Date(l.startDate);
    for (let k = l.paidInstallments + 1; k <= l.installments; k++) {
      const due = new Date(start.getFullYear(), start.getMonth() + k, start.getDate());
      const idx = due.getFullYear() * 12 + due.getMonth() - base;
      if (due < now && dir === 'in') overdue += 1;
      const bucket = buckets[Math.max(0, idx)];
      if (bucket) bucket[dir] += loanRate(l);
    }
  });
  return { buckets, overdue };
}

// ---------- Verleih-Topf ----------
// Geld aus dem Topf wird verliehen; zurückgezahlte Raten fließen zurück in den Topf.
// Mit „Zinsen wieder verleihen“ bleiben auch die Zinsen im Topf (Zinseszins).

const potLoans = () => state.loans.filter(l => l.fromPot && l.lenderId === ME_ID);

function potStats() {
  const pot = state.pot;
  if (!pot) return null;
  const loans = potLoans();
  const lent = loans.reduce((s, l) => s + l.amount, 0);
  const returned = loans.reduce((s, l) => s + l.paidInstallments * loanRate(l), 0);
  const interestEarned = loans.reduce((s, l) => s + loanInterestPaid(l), 0);
  const outstanding = loans.reduce((s, l) => s + loanRemaining(l), 0);
  const available = pot.amount - lent + returned - (pot.reinvest ? 0 : interestEarned);
  const value = pot.amount + (pot.reinvest ? interestEarned : 0);
  return { lent, returned, interestEarned, outstanding, available: Math.max(0, available), value, activeCount: loans.filter(isActive).length };
}

// Schätzung: Wie groß wird der Topf in X Jahren, wenn das Geld immer wieder verliehen wird?
// Ein „Durchgang“ dauert so viele Monate wie Raten; pro Durchgang kommen die Zinsen dazu.
function potForecast(years) {
  const pot = state.pot;
  const i = pot.interest / 100;
  const rounds = (12 / pot.installments) * years;
  return {
    withReinvest: pot.amount * Math.pow(1 + i, rounds),
    withoutReinvest: pot.amount * (1 + i * rounds),
  };
}

function fundedAmount(request) {
  return request.offers.filter(o => o.status === 'angenommen').reduce((s, o) => s + o.amount, 0);
}

// Kreditscore: bewertet das Rückzahlverhalten einer Person als Kreditnehmer.
// Start 650, steigt mit Fortschritt/Abschlüssen, sinkt bei überfälligen Raten. Bereich 300–850.
function creditScore(memberId) {
  const loans = state.loans.filter(l => l.borrowerId === memberId);
  if (!loans.length) return 650;
  let score = 650;
  loans.forEach(l => {
    const ratio = l.paidInstallments / l.installments;
    score += Math.round(ratio * 35);
    if (l.paidInstallments >= l.installments) score += 40;
    if (isOverdue(l)) score -= 70;
  });
  return Math.max(300, Math.min(850, score));
}
function scoreLabel(score) {
  if (score >= 750) return { text: 'sehr gut', cls: 'sehr-gut' };
  if (score >= 680) return { text: 'gut', cls: 'gut' };
  if (score >= 580) return { text: 'mittel', cls: 'mittel' };
  return { text: 'niedrig', cls: 'niedrig' };
}

// ---------- Hilfsfunktionen für die Anzeige ----------

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${euro(n)} €`;
const percent = (n) => `${String(n).replace('.', ',')} %`;

function hasBorrowed(memberId) { return state.loans.some(l => l.borrowerId === memberId); }

// ---------- Rendering ----------

function renderAll() {
  document.getElementById('circleName').textContent = state.circleName;

  const owedToMe = totalLentByMe();
  const iOwe = totalBorrowedByMe();
  document.getElementById('balanceOwedToMe').textContent = money(owedToMe);
  document.getElementById('balanceIOwe').textContent = money(iOwe);
  document.getElementById('balanceSub').textContent =
    `${state.members.length} Personen · ${activeLoanCount()} laufende Darlehen`;

  document.getElementById('sumVerliehen').textContent = money(owedToMe);
  document.getElementById('sumGeliehen').textContent = money(iOwe);
  const net = owedToMe - iOwe;
  document.getElementById('sumNetto').textContent = money(Math.abs(net));
  document.getElementById('sumNettoHint').textContent =
    net > 0 ? `Du bekommst insgesamt ${money(net)} mehr zurück, als du zahlen musst.`
    : net < 0 ? `Du musst insgesamt ${money(-net)} mehr zahlen, als du zurückbekommst.`
    : 'Du bekommst genauso viel zurück, wie du zahlen musst.';

  const activeLoans = state.loans.filter(l => l.paidInstallments < l.installments);
  renderLoanList(document.getElementById('loanPreviewList'), activeLoans.slice(0, 2));
  renderLoanList(document.getElementById('loanFullList'), filteredLoans());
  renderActivity(document.getElementById('activityPreviewList'), state.activity.slice(0, 3));
  renderActivity(document.getElementById('activityFullList'), state.activity);
  renderFlow();
  renderMembers();
  renderGroupFilters();
  renderRequests();
  populateSelects();

  const badge = document.getElementById('requestBadge');
  const open = openRequestCount();
  badge.hidden = open === 0;
  badge.textContent = open;
  badge.setAttribute('aria-label', `${open} offene Anfragen`);
}

function rerenderLoanLists() {
  const activeLoans = state.loans.filter(l => l.paidInstallments < l.installments);
  renderLoanList(document.getElementById('loanPreviewList'), activeLoans.slice(0, 2));
  renderLoanList(document.getElementById('loanFullList'), filteredLoans());
}

function filteredLoans() {
  if (activeFilter === 'alle') return state.loans;
  if (activeFilter === 'verliehen') return state.loans.filter(l => l.lenderId === ME_ID);
  return state.loans.filter(l => l.borrowerId === ME_ID);
}

function loanPartyLine(loan) {
  if (loan.lenderId === ME_ID) return `Du hast Geld gegeben`;
  if (loan.borrowerId === ME_ID) return `Du hast Geld bekommen`;
  return `${esc(memberName(loan.lenderId))} hat ${esc(memberName(loan.borrowerId))} Geld gegeben`;
}
function loanHeadName(loan) {
  if (loan.lenderId === ME_ID) return memberName(loan.borrowerId);
  if (loan.borrowerId === ME_ID) return memberName(loan.lenderId);
  return `${memberName(loan.lenderId)} → ${memberName(loan.borrowerId)}`;
}
function loanAvatarLabel(loan) {
  const other = loan.lenderId === ME_ID ? loan.borrowerId : (loan.borrowerId === ME_ID ? loan.lenderId : loan.borrowerId);
  return initials(memberName(other));
}
function loanRemainingLabel(loan) {
  if (loan.lenderId === ME_ID) return 'Bekommst du noch';
  if (loan.borrowerId === ME_ID) return 'Musst du noch zahlen';
  return 'Noch offen';
}

function loanCardHTML(loan) {
  const rate = loanRate(loan);
  const pct = Math.round((loan.paidInstallments / loan.installments) * 100);
  const done = loan.paidInstallments >= loan.installments;
  const overdue = isOverdue(loan);
  const expanded = expandedLoanId === loan.id;
  const remainingCls = loan.lenderId === ME_ID ? 'positive' : (loan.borrowerId === ME_ID ? 'negative' : '');

  const status = done ? '<span class="status done">✓ Fertig</span>'
    : overdue ? '<span class="status late">! Zu spät</span>'
    : '<span class="status ok">✓ Pünktlich</span>';

  return `
    <article class="card" data-loan="${loan.id}">
      <div class="card-top">
        <div class="avatar" aria-hidden="true">${esc(loanAvatarLabel(loan))}</div>
        <div class="card-name">${esc(loanHeadName(loan))}
          <span class="card-sub">${loanPartyLine(loan)}${loan.groupId ? ` · Gruppe ${esc(groupName(loan.groupId))}` : ''}</span>
        </div>
        ${status}
      </div>
      <dl class="facts">
        ${loan.purpose ? `<div class="fact"><dt>Wofür</dt><dd>${esc(loan.purpose)}</dd></div>` : ''}
        <div class="fact big"><dt>${loanRemainingLabel(loan)}</dt><dd class="${remainingCls}">${money(loanRemaining(loan))}</dd></div>
      </dl>
      <div class="progress-label"><span>Bezahlte Raten</span><span><strong>${loan.paidInstallments} von ${loan.installments}</strong></span></div>
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${pct} Prozent bezahlt"><div class="progress-fill" style="width:${pct}%"></div></div>
      ${done
        ? '<p class="due-note">Alles ist zurückgezahlt.</p>'
        : `<p class="due-note ${overdue ? 'overdue' : ''}">${overdue ? 'Die nächste Rate ist zu spät. Sie war fällig am' : 'Nächste Rate fällig am'} <strong>${formatDateFull(nextDueDate(loan))}</strong> · ${money(rate)}</p>
           <button class="btn positive-btn small full" style="margin-top:0" data-tick="${loan.id}">✓ Rate wurde bezahlt</button>`}
      <button class="details-toggle" data-toggle="${loan.id}" aria-expanded="${expanded}">${expanded ? '▲ Weniger anzeigen' : '▼ Mehr anzeigen'}</button>
      <dl class="details" ${expanded ? '' : 'hidden'}>
        <div class="fact"><dt>Betrag am Anfang</dt><dd>${money(loan.amount)}</dd></div>
        <div class="fact"><dt>Zinsen in Euro</dt><dd>${money(loanInterestTotal(loan))}</dd></div>
        <div class="fact"><dt>Schon bezahlt</dt><dd>${money(loan.paidInstallments * rate)}</dd></div>
        <div class="fact"><dt>Noch offen</dt><dd>${money(loanRemaining(loan))}</dd></div>
        <div class="fact"><dt>1 Rate (pro Monat)</dt><dd>${money(rate)}</dd></div>
        <div class="fact"><dt>Zinsen</dt><dd>${percent(loan.interest)}</dd></div>
        <div class="fact"><dt>Gesamt mit Zinsen</dt><dd>${money(loanTotalWithInterest(loan))}</dd></div>
        <div class="fact"><dt>Gestartet am</dt><dd>${formatDateFull(loan.startDate)}</dd></div>
      </dl>
    </article>`;
}

function renderLoanList(container, loans) {
  if (!loans.length) {
    container.innerHTML = `<div class="empty-state">Hier gibt es noch keine Darlehen.</div>`;
    return;
  }
  container.innerHTML = loans.map(loanCardHTML).join('');
  container.querySelectorAll('[data-tick]').forEach(btn => btn.addEventListener('click', () => confirmInstallment(btn.dataset.tick)));
  container.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
    expandedLoanId = expandedLoanId === btn.dataset.toggle ? null : btn.dataset.toggle;
    rerenderLoanLists();
  }));
}

function renderActivity(container, items) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">Es ist noch nichts passiert.</div>`;
    return;
  }
  container.innerHTML = items.map(a => {
    const kind = a.amount === 0 ? 'neutral' : a.type;
    const sign = kind === 'in' ? '+' : kind === 'out' ? '−' : '';
    const icon = kind === 'in' ? '↓' : kind === 'out' ? '↑' : '•';
    return `
    <div class="activity-row">
      <span class="activity-icon ${kind}" aria-hidden="true">${icon}</span>
      <span class="activity-text">
        <span class="desc">${esc(a.desc)}</span>
        <span class="date">${formatDateFull(a.date)}</span>
      </span>
      ${a.amount ? `<span class="amount ${kind}">${sign}${money(Math.abs(a.amount))}</span>` : ''}
    </div>`;
  }).join('');
}

function renderMembers() {
  const container = document.getElementById('memberList');
  if (!state.members.length) {
    container.innerHTML = `<div class="empty-state">Es gibt noch keine Personen. Tippe auf „+ Person“.</div>`;
    return;
  }
  container.innerHTML = state.members.map(m => {
    const loanCount = state.loans.filter(l => (l.borrowerId === m.id || l.lenderId === m.id) && l.paidInstallments < l.installments).length;
    const chips = m.groupIds.map(gid => `<span class="group-chip">${esc(groupName(gid))}</span>`).join('');
    let scoreHTML;
    if (hasBorrowed(m.id)) {
      const score = creditScore(m.id);
      const label = scoreLabel(score);
      const pct = Math.round(((score - 300) / 550) * 100);
      scoreHTML = `
        <div class="score-line"><span>Zuverlässigkeit</span><strong>${label.text}</strong></div>
        <div class="score-meter" role="img" aria-label="Zuverlässigkeit ${label.text}, ${score} von 850 Punkten"><div class="${label.cls}" style="width:${pct}%"></div></div>
        <p class="card-sub" style="margin:6px 0 0">${score} von 850 Punkten</p>`;
    } else {
      scoreHTML = `<div class="score-line"><span>Zuverlässigkeit</span><strong>noch keine Bewertung</strong></div>
        <p class="card-sub" style="margin:4px 0 0">Diese Person hat sich noch kein Geld geliehen.</p>`;
    }
    return `
      <article class="card">
        <div class="card-top">
          <div class="avatar" aria-hidden="true">${esc(initials(m.name))}</div>
          <div class="card-name">${esc(m.name)}
            <span class="card-sub">${loanCount === 0 ? 'Kein laufendes Darlehen' : loanCount === 1 ? '1 laufendes Darlehen' : `${loanCount} laufende Darlehen`}</span>
            <div class="member-groups">${chips || '<span class="group-chip">In keiner Gruppe</span>'}</div>
          </div>
        </div>
        ${scoreHTML}
      </article>`;
  }).join('');
}

function renderGroupFilters() {
  const row = document.getElementById('groupFilterRow');
  const items = [{ id: 'alle', name: 'Alle Gruppen' }].concat(state.groups);
  row.innerHTML = items.map(g =>
    `<button class="chip ${activeGroupFilter === g.id ? 'active' : ''}" data-groupfilter="${g.id}" aria-pressed="${activeGroupFilter === g.id}">${esc(g.name)}</button>`).join('');
  row.querySelectorAll('[data-groupfilter]').forEach(btn => btn.addEventListener('click', () => {
    activeGroupFilter = btn.dataset.groupfilter;
    renderGroupFilters();
    renderRequests();
  }));
}

function requestsForFilter() {
  if (activeGroupFilter === 'alle') return state.requests;
  return state.requests.filter(r => r.groupId === activeGroupFilter);
}

const OFFER_STATUS = {
  ausstehend: '<span class="status wait">Wartet auf Antwort</span>',
  angenommen: '<span class="status ok">✓ Angenommen</span>',
  abgelehnt: '<span class="status late">✕ Abgelehnt</span>',
};
const REQUEST_STATUS = {
  abgeschlossen: '<span class="status done">✓ Erledigt</span>',
  storniert: '<span class="status late">✕ Abgebrochen</span>',
};

function offerHTML(offer, request, isHistory) {
  return `
    <div class="offer">
      <div class="offer-top">
        <span>${esc(memberName(offer.offererId))} gibt <strong>${money(offer.amount)}</strong></span>
        ${OFFER_STATUS[offer.status] || ''}
      </div>
      <p class="offer-terms">Zurückzahlen in ${offer.installments} Raten zu je ${money(offer.amount * (1 + offer.interest / 100) / offer.installments)} · Zinsen: ${percent(offer.interest)}</p>
      ${offer.status === 'ausstehend' && !isHistory ? `
        <div class="btn-row">
          <button class="btn negative-btn small" data-decline-offer="${offer.id}" data-req="${request.id}">✕ Ablehnen</button>
          <button class="btn positive-btn small" data-accept-offer="${offer.id}" data-req="${request.id}">✓ Annehmen</button>
        </div>` : ''}
    </div>`;
}

function requestCardHTML(r, isHistory) {
  const funded = fundedAmount(r);
  const pct = Math.min(100, Math.round((funded / r.amount) * 100));
  return `
    <article class="card">
      <div class="card-top">
        <div class="avatar" aria-hidden="true">${esc(initials(memberName(r.requesterId)))}</div>
        <div class="card-name">${esc(memberName(r.requesterId))}
          <span class="card-sub">bittet um ${money(r.amount)}${r.groupId ? ` · Gruppe ${esc(groupName(r.groupId))}` : ''}</span>
        </div>
        ${isHistory ? (REQUEST_STATUS[r.status] || '') : '<span class="status wait">Offen</span>'}
      </div>
      <dl class="facts">
        <div class="fact"><dt>Wofür</dt><dd>${esc(r.purpose)}</dd></div>
        <div class="fact"><dt>Zurückzahlen in</dt><dd>${r.installments} Raten zu je ${money(r.amount * (1 + r.interest / 100) / r.installments)}</dd></div>
        <div class="fact"><dt>Zinsen</dt><dd>${percent(r.interest)}</dd></div>
        <div class="fact"><dt>Gefragt am</dt><dd>${formatDateFull(r.date)}</dd></div>
      </dl>
      <div class="progress-label"><span>Schon zugesagt</span><span><strong>${money(funded)} von ${money(r.amount)}</strong></span></div>
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${pct} Prozent zugesagt"><div class="progress-fill" style="width:${pct}%"></div></div>
      ${r.offers.length ? `<p class="offer-list-title">Angebote (${r.offers.length})</p><div class="offer-list">${r.offers.map(o => offerHTML(o, r, isHistory)).join('')}</div>` : (isHistory ? '' : '<p class="card-sub">Noch kein Angebot.</p>')}
      ${!isHistory ? `<button class="btn secondary small full" data-make-offer="${r.id}">+ Ich möchte Geld anbieten</button>` : ''}
    </article>`;
}

function renderRequests() {
  const openList = document.getElementById('requestOpenList');
  const historyList = document.getElementById('requestHistoryList');
  const all = requestsForFilter();
  const open = all.filter(r => r.status === 'offen');
  const history = all.filter(r => r.status !== 'offen');

  openList.innerHTML = open.length ? open.map(r => requestCardHTML(r, false)).join('') : `<div class="empty-state">Hier gibt es gerade keine offenen Anfragen.</div>`;
  historyList.innerHTML = history.length ? history.map(r => requestCardHTML(r, true)).join('') : `<div class="empty-state">Noch keine erledigten Anfragen.</div>`;

  openList.querySelectorAll('[data-make-offer]').forEach(btn => btn.addEventListener('click', () => openOfferModal(btn.dataset.makeOffer)));
  openList.querySelectorAll('[data-accept-offer]').forEach(btn => btn.addEventListener('click', () => confirmOffer(btn.dataset.req, btn.dataset.acceptOffer, true)));
  openList.querySelectorAll('[data-decline-offer]').forEach(btn => btn.addEventListener('click', () => confirmOffer(btn.dataset.req, btn.dataset.declineOffer, false)));
}

function optionsHTML(list, emptyText) {
  return list.length ? list.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')
                     : `<option value="">${emptyText}</option>`;
}

function populateSelects() {
  document.getElementById('loanPerson').innerHTML = optionsHTML(state.members, 'Bitte zuerst eine Person anlegen');
  const reqGroupSelect = document.getElementById('requestGroup');
  reqGroupSelect.innerHTML = optionsHTML(state.groups, 'Bitte zuerst eine Gruppe anlegen');
  updateRequestPersonOptions();
  reqGroupSelect.onchange = updateRequestPersonOptions;
}

function updateRequestPersonOptions() {
  const groupId = document.getElementById('requestGroup').value;
  document.getElementById('requestPerson').innerHTML = optionsHTML(membersInGroup(groupId), 'In dieser Gruppe ist noch niemand');
}

function populateMemberGroupCheckboxes() {
  document.getElementById('memberGroupsField').innerHTML = state.groups.map(g => `
    <label class="checkbox-chip">
      <input type="checkbox" value="${g.id}" class="member-group-checkbox">
      ${esc(g.name)}
    </label>`).join('');
}

function updateLoanPreview() {
  const amount = Number(document.getElementById('loanAmount').value);
  const installments = Number(document.getElementById('loanInstallments').value);
  const interest = Number(document.getElementById('loanInterest').value) || 0;
  const preview = document.getElementById('loanPreview');
  if (!amount || !installments) { preview.hidden = true; return; }
  preview.hidden = false;
  preview.textContent = `Zusammenfassung: ${money(amount)} in ${installments} ${installments === 1 ? 'Rate' : 'Raten'}. ` +
    `Mit ${interest ? `Zinsen insgesamt ${money(amount * (1 + interest / 100))}` : 'keinen Zinsen'}. ` +
    `Das sind ${money(amount * (1 + interest / 100) / installments)} pro Monat.` +
    (interest ? ` Der Gewinn durch Zinsen ist ${money(amount * interest / 100)}.` : '');
}

// ---------- Geldfluss-Seite ----------

const signedMoney = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;

function renderFlow() {
  const inM = monthlyIn(), outM = monthlyOut(), net = inM - outM;
  const earned = profitEarned(), total = profitTotal();
  const lentAmount = myLent().reduce((s, l) => s + l.amount, 0);

  document.getElementById('miniNetFlow').textContent = signedMoney(net);
  document.getElementById('miniNetFlow').className = `mini-value ${net > 0 ? 'positive' : net < 0 ? 'negative' : ''}`;
  document.getElementById('miniNetFlowSub').textContent = `${money(inM)} rein · ${money(outM)} raus`;
  document.getElementById('miniProfit').textContent = money(earned);
  document.getElementById('miniProfitSub').textContent = `von ${money(total)} insgesamt`;

  document.getElementById('flowIn').textContent = money(inM);
  document.getElementById('flowOut').textContent = money(outM);
  const netEl = document.getElementById('flowNet');
  netEl.textContent = signedMoney(net);
  netEl.className = net > 0 ? 'positive' : net < 0 ? 'negative' : '';
  document.getElementById('flowNetHint').textContent =
    net > 0 ? `Jeden Monat bekommst du ${money(net)} mehr, als du zahlst.`
    : net < 0 ? `Jeden Monat zahlst du ${money(-net)} mehr, als du bekommst.`
    : 'Gerade fließt jeden Monat gleich viel rein wie raus.';

  document.getElementById('profitEarned').textContent = money(earned);
  document.getElementById('profitPending').textContent = money(total - earned);
  document.getElementById('profitTotal').textContent = money(total);
  document.getElementById('profitHint').textContent = lentAmount
    ? `Du hast insgesamt ${money(lentAmount)} verliehen. Dafür bekommst du ${money(total)} Zinsen. Das sind ${percent(Math.round((total / lentAmount) * 1000) / 10)} von deinem verliehenen Geld.`
    : 'Du hast noch kein Geld verliehen.';

  // Gewinn pro Darlehen
  const lent = myLent();
  document.getElementById('profitList').innerHTML = lent.length ? lent.map(l => `
    <div class="activity-row">
      <span class="activity-icon in" aria-hidden="true">%</span>
      <span class="activity-text">
        <span class="desc">${esc(memberName(l.borrowerId))}${l.purpose ? ` · ${esc(l.purpose)}` : ''}</span>
        <span class="date">${money(l.amount)} zu ${percent(l.interest)} · ${money(loanInterestPaid(l))} von ${money(loanInterestTotal(l))} schon verdient</span>
      </span>
      <span class="amount in">+${money(loanInterestTotal(l))}</span>
    </div>`).join('') : '<div class="empty-state">Du hast noch kein Geld verliehen.</div>';

  // Zinsen, die ich selbst zahle
  const costTotal = interestCostTotal();
  document.getElementById('interestCostBlock').hidden = costTotal === 0;
  document.getElementById('costPaid').textContent = money(interestCostPaid());
  document.getElementById('costPending').textContent = money(costTotal - interestCostPaid());

  renderFlowChart();
  renderPot();
}

function renderFlowChart() {
  const { buckets, overdue } = flowForecast(6);
  const max = Math.max(1, ...buckets.map(b => Math.max(b.in, b.out)));
  const chart = document.getElementById('flowChart');
  chart.innerHTML = buckets.map((b, i) => `
    <div class="chart-col" data-col="${i}" tabindex="0" aria-label="${b.full}: ${money(b.in)} rein, ${money(b.out)} raus">
      <div class="chart-bars">
        <div class="bar in" style="height:${(b.in / max) * 100}%"></div>
        <div class="bar out" style="height:${(b.out / max) * 100}%"></div>
      </div>
      <span class="chart-label">${b.label}</span>
    </div>`).join('');

  document.getElementById('flowTableBody').innerHTML = buckets.map(b => {
    const n = b.in - b.out;
    return `<tr><th scope="row">${b.full}</th><td class="positive">${money(b.in)}</td><td class="negative">${money(b.out)}</td><td class="${n > 0 ? 'positive' : n < 0 ? 'negative' : ''}">${signedMoney(n)}</td></tr>`;
  }).join('');

  const hint = document.getElementById('flowOverdueHint');
  hint.hidden = overdue === 0;
  hint.textContent = overdue === 1
    ? '! 1 Rate an dich ist zu spät. Sie ist im aktuellen Monat mitgezählt.'
    : `! ${overdue} Raten an dich sind zu spät. Sie sind im aktuellen Monat mitgezählt.`;

  const tip = document.getElementById('flowTooltip');
  const card = chart.closest('.chart-card');
  const show = (col) => {
    const b = buckets[Number(col.dataset.col)];
    tip.innerHTML = `<strong>${b.full}</strong><span class="positive">↓ Rein: ${money(b.in)}</span><span class="negative">↑ Raus: ${money(b.out)}</span><span>Übrig: ${signedMoney(b.in - b.out)}</span>`;
    tip.hidden = false;
    const c = card.getBoundingClientRect(), r = col.getBoundingClientRect();
    const left = Math.min(Math.max(r.left - c.left + r.width / 2 - tip.offsetWidth / 2, 8), c.width - tip.offsetWidth - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${chart.getBoundingClientRect().top - c.top + 4}px`;
    chart.querySelectorAll('.chart-col').forEach(x => x.classList.toggle('dim', x !== col));
  };
  const hide = () => { tip.hidden = true; chart.querySelectorAll('.chart-col').forEach(x => x.classList.remove('dim')); };
  chart.querySelectorAll('.chart-col').forEach(col => {
    col.addEventListener('mouseenter', () => show(col));
    col.addEventListener('focus', () => show(col));
    col.addEventListener('click', () => show(col));
    col.addEventListener('mouseleave', hide);
    col.addEventListener('blur', hide);
  });
}

// ---------- Verleih-Topf anzeigen ----------

const POT_YEARS = [1, 2, 3, 5, 10];

function renderPot() {
  const block = document.getElementById('potBlock');
  const editBtn = document.getElementById('btnPotEdit');
  const st = potStats();
  editBtn.hidden = !st;
  if (!st) {
    block.innerHTML = `
      <div class="card pot-empty">
        <p class="pot-empty-title">Lass dein Geld für dich arbeiten</p>
        <p class="card-sub">Lege einen Betrag fest, den du verleihen möchtest. Zurückgezahltes Geld und Zinsen kommen wieder in den Topf und können neu verliehen werden. So wächst dein Geld mit der Zeit immer schneller.</p>
        <button class="btn primary full" id="btnPotCreate">Verleih-Topf einrichten</button>
      </div>`;
    document.getElementById('btnPotCreate').addEventListener('click', openPotModal);
    return;
  }
  const pot = state.pot;
  const fc = POT_YEARS.map(y => ({ y, ...potForecast(y) }));
  const max = Math.max(...fc.map(f => f.withReinvest));
  const pct = pot.amount ? Math.min(100, Math.round((st.available / pot.amount) * 100)) : 0;

  block.innerHTML = `
    <div class="card pot-card">
      <p class="hero-label">Wert deines Topfs</p>
      <p class="pot-value">${money(st.value)}</p>
      <p class="card-sub">Startbetrag ${money(pot.amount)}${pot.reinvest && st.interestEarned ? ` · <span class="positive">+${money(st.interestEarned)} Zinsen</span>` : ''}</p>
      <div class="pot-status">
        <span class="status ${pot.reinvest ? 'ok' : 'done'}">${pot.reinvest ? '↻ Zinsen werden wieder verliehen' : 'Zinsen werden nicht wieder verliehen'}</span>
      </div>
      <dl class="facts pot-facts">
        <div class="fact big"><dt>Frei zum Verleihen</dt><dd class="positive">${money(st.available)}</dd></div>
        <div class="fact"><dt>Gerade verliehen (${st.activeCount} ${st.activeCount === 1 ? 'Darlehen' : 'Darlehen'})</dt><dd>${money(st.outstanding)}</dd></div>
        <div class="fact"><dt>Zinsen schon verdient</dt><dd>${money(st.interestEarned)}</dd></div>
        ${pot.reinvest ? '' : `<div class="fact"><dt>Davon an dich ausgezahlt</dt><dd>${money(st.interestEarned)}</dd></div>`}
        <div class="fact"><dt>Vorschlag pro Darlehen</dt><dd>${percent(pot.interest)} Zinsen · ${pot.installments} Raten</dd></div>
      </dl>
      <div class="progress-label"><span>Frei im Topf</span><span><strong>${pct} %</strong></span></div>
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${pct} Prozent des Topfs sind frei"><div class="progress-fill" style="width:${pct}%"></div></div>
      <button class="btn primary full" style="margin-top:4px" id="btnPotLend" ${st.available < 1 ? 'disabled' : ''}>${st.available < 1 ? 'Gerade ist alles verliehen' : `Aus dem Topf verleihen (bis ${money(st.available)})`}</button>
    </div>

    <h3 class="sub-label">So kann dein Topf wachsen</h3>
    <div class="card chart-card" id="potChartCard">
      <p class="card-sub" style="margin:0 0 12px">Wenn du ${money(pot.amount)} immer wieder zu ${percent(pot.interest)} in ${pot.installments} Raten verleihst und die Zinsen ${pot.reinvest ? 'wieder mitverleihst' : 'mitverleihen würdest'}:</p>
      <div class="chart pot-chart" id="potChart" role="img" aria-label="Geschätzter Wert des Topfs nach 1, 2, 3, 5 und 10 Jahren. Die Zahlen stehen auch in der Tabelle darunter.">
        ${fc.map((f, i) => `
          <div class="chart-col" data-col="${i}" tabindex="0" aria-label="Nach ${f.y} ${f.y === 1 ? 'Jahr' : 'Jahren'}: ${money(f.withReinvest)}">
            <div class="chart-bars"><div class="bar in wide" style="height:${(f.withReinvest / max) * 100}%"></div></div>
            <span class="chart-label">${f.y} ${f.y === 1 ? 'Jahr' : 'J.'}</span>
          </div>`).join('')}
      </div>
      <div class="chart-tooltip" id="potTooltip" hidden></div>
      <table class="flow-table">
        <caption class="sr-only">Geschätzter Wert des Topfs</caption>
        <thead><tr><th scope="col">Nach</th><th scope="col">Zinsen wieder verliehen</th><th scope="col">Zinsen nicht verliehen</th></tr></thead>
        <tbody>${fc.map(f => `<tr><th scope="row">${f.y} ${f.y === 1 ? 'Jahr' : 'Jahren'}</th><td class="positive">${money(f.withReinvest)}</td><td>${money(f.withoutReinvest)}</td></tr>`).join('')}</tbody>
      </table>
      <p class="summary-hint" style="margin-top:12px">Das ist eine Schätzung. Sie stimmt nur, wenn das Geld immer verliehen ist und alle pünktlich zurückzahlen. Zinsen sind Einnahmen und müssen eventuell versteuert werden.</p>
    </div>`;

  document.getElementById('btnPotLend').addEventListener('click', () => openLoanModal('verliehen', true));

  const chart = document.getElementById('potChart');
  const tip = document.getElementById('potTooltip');
  const card = document.getElementById('potChartCard');
  const show = (col) => {
    const f = fc[Number(col.dataset.col)];
    tip.innerHTML = `<strong>Nach ${f.y} ${f.y === 1 ? 'Jahr' : 'Jahren'}</strong><span class="positive">Mit Wiederverleihen: ${money(f.withReinvest)}</span><span>Ohne: ${money(f.withoutReinvest)}</span>`;
    tip.hidden = false;
    const c = card.getBoundingClientRect(), r = col.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(r.left - c.left + r.width / 2 - tip.offsetWidth / 2, 8), c.width - tip.offsetWidth - 8)}px`;
    tip.style.top = `${chart.getBoundingClientRect().top - c.top + 4}px`;
    chart.querySelectorAll('.chart-col').forEach(x => x.classList.toggle('dim', x !== col));
  };
  const hide = () => { tip.hidden = true; chart.querySelectorAll('.chart-col').forEach(x => x.classList.remove('dim')); };
  chart.querySelectorAll('.chart-col').forEach(col => {
    col.addEventListener('mouseenter', () => show(col));
    col.addEventListener('focus', () => show(col));
    col.addEventListener('click', () => show(col));
    col.addEventListener('mouseleave', hide);
    col.addEventListener('blur', hide);
  });
}

function openPotModal() {
  const pot = state.pot;
  document.getElementById('potModalTitle').textContent = pot ? 'Verleih-Topf ändern' : 'Verleih-Topf einrichten';
  document.getElementById('potAmount').value = pot ? pot.amount : '';
  document.getElementById('potInterest').value = pot ? pot.interest : 3;
  document.getElementById('potInstallments').value = pot ? pot.installments : 6;
  document.getElementById('potReinvest').checked = pot ? pot.reinvest : true;
  document.getElementById('potDelete').hidden = !pot;
  openOverlay('potModalOverlay');
}

function savePot(e) {
  e.preventDefault();
  const amount = Number(document.getElementById('potAmount').value);
  const interest = Number(document.getElementById('potInterest').value) || 0;
  const installments = Number(document.getElementById('potInstallments').value);
  const reinvest = document.getElementById('potReinvest').checked;
  if (!amount || !installments) return;
  const isNew = !state.pot;
  state.pot = { amount, interest, installments, reinvest, createdAt: state.pot ? state.pot.createdAt : TODAY };
  state.activity.unshift({
    id: 'a' + Date.now(),
    desc: isNew ? `Verleih-Topf mit ${money(amount)} eingerichtet` : `Verleih-Topf geändert (${money(amount)})`,
    amount: 0, type: 'neutral', date: TODAY,
  });
  saveState();
  renderAll();
  closeOverlay('potModalOverlay');
  showToast(isNew ? '✓ Dein Verleih-Topf ist eingerichtet.' : '✓ Dein Verleih-Topf wurde geändert.');
}

function deletePot() {
  askConfirm('Topf auflösen?',
    'Der Verleih-Topf wird gelöscht. Deine Darlehen bleiben erhalten, sie zählen nur nicht mehr zum Topf.',
    'Ja, auflösen', () => {
      state.pot = null;
      state.loans.forEach(l => { delete l.fromPot; });
      saveState();
      renderAll();
      closeOverlay('potModalOverlay');
      showToast('Der Verleih-Topf wurde aufgelöst.');
    });
}

function updatePotField() {
  const lend = document.getElementById('loanDirection').value === 'verliehen';
  const field = document.getElementById('loanFromPotField');
  const st = potStats();
  field.hidden = !(lend && st);
  if (!field.hidden) {
    document.getElementById('loanFromPotHint').textContent = `Frei im Topf: ${money(st.available)}`;
  } else {
    document.getElementById('loanFromPot').checked = false;
  }
  document.getElementById('loanError').hidden = true;
}

// ---------- Bestätigung ----------

let confirmCallback = null;
function askConfirm(title, text, yesLabel, onYes) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmText').textContent = text;
  document.getElementById('confirmYes').textContent = yesLabel;
  confirmCallback = onYes;
  document.getElementById('confirmModalOverlay').hidden = false;
  document.getElementById('confirmNo').focus();
}
function closeConfirm() {
  document.getElementById('confirmModalOverlay').hidden = true;
  confirmCallback = null;
}

function confirmInstallment(loanId) {
  const loan = state.loans.find(l => l.id === loanId);
  if (!loan) return;
  const who = loan.lenderId === ME_ID ? `${memberName(loan.borrowerId)} hat dir`
    : loan.borrowerId === ME_ID ? `Du hast ${memberName(loan.lenderId)}`
    : `${memberName(loan.borrowerId)} hat ${memberName(loan.lenderId)}`;
  askConfirm('Rate eintragen?',
    `${who} eine Rate von ${money(loanRate(loan))} gezahlt. Das ist Rate ${loan.paidInstallments + 1} von ${loan.installments}.`,
    'Ja, eintragen', () => bookInstallment(loanId));
}

function confirmOffer(requestId, offerId, accepted) {
  const req = state.requests.find(r => r.id === requestId);
  const offer = req && req.offers.find(o => o.id === offerId);
  if (!offer) return;
  if (accepted) {
    askConfirm('Angebot annehmen?',
      `${memberName(offer.offererId)} gibt ${memberName(req.requesterId)} ${money(offer.amount)}. Dafür wird ein Darlehen angelegt.`,
      'Ja, annehmen', () => resolveOffer(requestId, offerId, true));
  } else {
    askConfirm('Angebot ablehnen?',
      `Das Angebot von ${memberName(offer.offererId)} über ${money(offer.amount)} wird abgelehnt.`,
      'Ja, ablehnen', () => resolveOffer(requestId, offerId, false));
  }
}

// ---------- Aktionen ----------

function bookInstallment(loanId) {
  const loan = state.loans.find(l => l.id === loanId);
  if (!loan || loan.paidInstallments >= loan.installments) return;
  loan.paidInstallments += 1;
  const rate = Math.round(loanRate(loan));
  state.activity.unshift({
    id: 'a' + Date.now(),
    desc: `Rate von ${memberName(loan.borrowerId)} an ${memberName(loan.lenderId)} bezahlt`,
    amount: loan.lenderId === ME_ID ? rate : (loan.borrowerId === ME_ID ? -rate : 0),
    type: loan.lenderId === ME_ID ? 'in' : 'out',
    date: TODAY,
  });
  saveState();
  renderAll();
  showToast(loan.paidInstallments >= loan.installments ? '✓ Fertig! Das Darlehen ist komplett zurückgezahlt.' : '✓ Die Rate wurde eingetragen.');
}

function addLoan(e) {
  e.preventDefault();
  const memberId = document.getElementById('loanPerson').value;
  const purpose = document.getElementById('loanPurpose').value.trim();
  const amount = Number(document.getElementById('loanAmount').value);
  const installments = Number(document.getElementById('loanInstallments').value);
  const interest = Number(document.getElementById('loanInterest').value) || 0;
  const direction = document.getElementById('loanDirection').value;
  if (!memberId || !amount || !installments) return;

  const fromPot = direction === 'verliehen' && document.getElementById('loanFromPot').checked && !!state.pot;
  if (fromPot) {
    const free = potStats().available;
    if (amount > free + 0.5) {
      const err = document.getElementById('loanError');
      err.textContent = `Im Topf sind nur ${money(free)} frei. Bitte gib einen kleineren Betrag ein oder schalte „Aus deinem Verleih-Topf nehmen“ aus.`;
      err.hidden = false;
      document.getElementById('loanAmount').focus();
      return;
    }
  }

  const lenderId = direction === 'verliehen' ? ME_ID : memberId;
  const borrowerId = direction === 'verliehen' ? memberId : ME_ID;

  state.loans.unshift({
    id: 'l' + Date.now(), lenderId, borrowerId, purpose,
    amount, installments, paidInstallments: 0, interest, startDate: TODAY, groupId: null,
    ...(fromPot ? { fromPot: true } : {}),
  });
  state.activity.unshift({
    id: 'a' + Date.now(),
    desc: direction === 'verliehen'
      ? `Du hast ${memberName(memberId)} Geld gegeben${fromPot ? ' (aus dem Topf)' : ''}${purpose ? ` (${purpose})` : ''}`
      : `${memberName(memberId)} hat dir Geld gegeben${purpose ? ` (${purpose})` : ''}`,
    amount: direction === 'verliehen' ? -amount : amount,
    type: direction === 'verliehen' ? 'out' : 'in',
    date: TODAY,
  });
  saveState();
  renderAll();
  closeOverlay('modalOverlay');
  showToast('✓ Das Darlehen wurde gespeichert.');
  resetForm(e.target);
}

function addRequest(e) {
  e.preventDefault();
  const groupId = document.getElementById('requestGroup').value;
  const requesterId = document.getElementById('requestPerson').value;
  const purpose = document.getElementById('requestPurpose').value.trim();
  const amount = Number(document.getElementById('requestAmount').value);
  const installments = Number(document.getElementById('requestInstallments').value);
  const interest = Number(document.getElementById('requestInterest').value) || 0;
  if (!groupId || !requesterId || !amount || !installments || !purpose) return;

  state.requests.unshift({
    id: 'r' + Date.now(), requesterId, groupId, purpose, amount, installments, interest,
    date: TODAY, status: 'offen', offers: [],
  });
  saveState();
  renderAll();
  closeOverlay('requestModalOverlay');
  showToast('✓ Die Anfrage wurde an die Gruppe gesendet.');
  resetForm(e.target);
}

function openOfferModal(requestId) {
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return;
  document.getElementById('offerRequestId').value = requestId;
  document.getElementById('offerRequestHint').textContent =
    `${memberName(req.requesterId)} möchte ${money(req.amount)} für „${req.purpose}“. Wunsch: ${req.installments} Raten, ${percent(req.interest)} Zinsen. Du kannst auch weniger anbieten.`;
  const candidates = membersInGroup(req.groupId).filter(m => m.id !== req.requesterId);
  document.getElementById('offerPerson').innerHTML = optionsHTML(candidates, 'Sonst ist niemand in dieser Gruppe');
  openOverlay('offerModalOverlay');
}

function addOffer(e) {
  e.preventDefault();
  const requestId = document.getElementById('offerRequestId').value;
  const req = state.requests.find(r => r.id === requestId);
  const offererId = document.getElementById('offerPerson').value;
  const amount = Number(document.getElementById('offerAmount').value);
  const installments = Number(document.getElementById('offerInstallments').value);
  const interest = Number(document.getElementById('offerInterest').value) || 0;
  if (!req || !offererId || !amount || !installments) return;

  req.offers.push({ id: 'o' + Date.now(), offererId, amount, installments, interest, date: TODAY, status: 'ausstehend' });
  saveState();
  renderAll();
  closeOverlay('offerModalOverlay');
  showToast('✓ Das Angebot wurde gesendet.');
  resetForm(e.target);
}

function resolveOffer(requestId, offerId, accepted) {
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return;
  const offer = req.offers.find(o => o.id === offerId);
  if (!offer) return;
  offer.status = accepted ? 'angenommen' : 'abgelehnt';

  if (accepted) {
    state.loans.unshift({
      id: 'l' + Date.now(), lenderId: offer.offererId, borrowerId: req.requesterId, purpose: req.purpose,
      amount: offer.amount, installments: offer.installments, paidInstallments: 0,
      interest: offer.interest, startDate: TODAY, groupId: req.groupId,
    });
    state.activity.unshift({
      id: 'a' + Date.now(),
      desc: `${memberName(offer.offererId)} gibt ${memberName(req.requesterId)} ${money(offer.amount)} (${req.purpose})`,
      amount: offer.offererId === ME_ID ? -offer.amount : (req.requesterId === ME_ID ? offer.amount : 0),
      type: offer.offererId === ME_ID ? 'out' : 'in',
      date: TODAY,
    });
  }

  if (fundedAmount(req) >= req.amount) req.status = 'abgeschlossen';
  saveState();
  renderAll();
  showToast(accepted ? '✓ Angenommen. Das Darlehen wurde angelegt.' : 'Das Angebot wurde abgelehnt.');
}

function addMember(e) {
  e.preventDefault();
  const name = document.getElementById('memberName').value.trim();
  if (!name) return;
  const groupIds = Array.from(document.querySelectorAll('.member-group-checkbox:checked')).map(cb => cb.value);
  state.members.push({ id: 'm' + Date.now(), name, groupIds });
  saveState();
  renderAll();
  closeOverlay('memberModalOverlay');
  showToast(`✓ ${name} wurde hinzugefügt.`);
  resetForm(e.target);
}

function addGroup(e) {
  e.preventDefault();
  const name = document.getElementById('groupName').value.trim();
  if (!name) return;
  state.groups.push({ id: 'g' + Date.now(), name });
  saveState();
  renderAll();
  closeOverlay('groupModalOverlay');
  showToast(`✓ Die Gruppe „${name}“ wurde angelegt.`);
  resetForm(e.target);
}

function resetForm(form) {
  form.reset();
  updateLoanPreview();
}

// ---------- UI-Steuerung ----------

function switchTab(tabName) {
  document.querySelectorAll('[data-screen]').forEach(s => s.hidden = (s.id !== `screen-${tabName}`));
  document.querySelectorAll('.tab').forEach(t => {
    const active = t.dataset.tab === tabName;
    t.classList.toggle('active', active);
    if (active) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

let lastFocus = null;
function openOverlay(id) {
  lastFocus = document.activeElement;
  const overlay = document.getElementById(id);
  document.getElementById('toast').hidden = true;
  overlay.hidden = false;
  const first = overlay.querySelector('select, input:not([type=hidden]), button');
  if (first) first.focus();
}
function closeOverlay(id) {
  document.getElementById(id).hidden = true;
  if (lastFocus) lastFocus.focus();
}

function openLoanModal(direction, fromPot = false) {
  const lend = direction === 'verliehen';
  document.getElementById('loanDirection').value = direction;
  document.getElementById('modalTitle').textContent = lend ? 'Geld verleihen' : 'Geld leihen';
  document.getElementById('modalHint').textContent = lend
    ? 'Du gibst einer Person Geld. Sie zahlt es dir in Raten zurück.'
    : 'Eine Person gibt dir Geld. Du zahlst es in Raten zurück.';
  document.getElementById('loanPersonLabel').textContent = lend ? 'An wen gibst du Geld?' : 'Von wem bekommst du Geld?';
  updatePotField();
  const usePot = lend && !!state.pot && fromPot;
  document.getElementById('loanFromPot').checked = usePot;
  if (usePot) {
    document.getElementById('loanInterest').value = state.pot.interest;
    document.getElementById('loanInstallments').value = state.pot.installments;
    updateLoanPreview();
  }
  openOverlay('modalOverlay');
}

// ---------- Darstellung (hell / dunkel / automatisch) ----------

const THEME_KEY = 'ffTheme';
function currentTheme() {
  try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'system'; }
  catch (e) { return document.documentElement.getAttribute('data-theme') || 'system'; }
}
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* nur für diese Sitzung */ }
  updateThemeColor();
}
// Design (Minimal = Standard, Klassisch, Sanft)
const DESIGN_KEY = 'ffDesign';
function currentDesign() {
  return document.documentElement.getAttribute('data-design') || 'minimal';
}
function applyDesign(design) {
  if (design === 'klassisch' || design === 'sanft') document.documentElement.setAttribute('data-design', design);
  else document.documentElement.removeAttribute('data-design');
  try { localStorage.setItem(DESIGN_KEY, design); } catch (e) { /* nur für diese Sitzung */ }
  updateThemeColor();
}

// Farbe der Browser-/Statusleiste an den Modus anpassen
function updateThemeColor() {
  const css = getComputedStyle(document.documentElement);
  // Klassisch hat eine dunkelblaue Kopfzeile, sonst passt die Hintergrundfarbe
  const bg = currentDesign() === 'klassisch' ? css.getPropertyValue('--primary-ink').trim() === '#ffffff' ? '#0b2a5b' : '#07183a' : css.getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name=theme-color]').forEach(m => { m.setAttribute('content', bg); m.removeAttribute('media'); });
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor);
updateThemeColor();

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

// ---------- Event-Bindings ----------

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.goto)));

document.getElementById('btnLend').addEventListener('click', () => openLoanModal('verliehen'));
document.getElementById('btnBorrow').addEventListener('click', () => openLoanModal('geliehen'));
document.getElementById('btnNewLoanFromList').addEventListener('click', () => openLoanModal('verliehen'));
document.getElementById('loanForm').addEventListener('submit', addLoan);
document.getElementById('loanFromPot').addEventListener('change', (e) => {
  document.getElementById('loanError').hidden = true;
  if (e.target.checked && state.pot) {
    document.getElementById('loanInterest').value = state.pot.interest;
    if (!document.getElementById('loanInstallments').value) document.getElementById('loanInstallments').value = state.pot.installments;
    updateLoanPreview();
  }
});
document.getElementById('loanAmount').addEventListener('input', () => { document.getElementById('loanError').hidden = true; });
document.getElementById('potForm').addEventListener('submit', savePot);
document.getElementById('potDelete').addEventListener('click', deletePot);
document.getElementById('btnPotEdit').addEventListener('click', openPotModal);
['loanAmount', 'loanInstallments', 'loanInterest'].forEach(id =>
  document.getElementById(id).addEventListener('input', updateLoanPreview));

document.getElementById('btnNewRequest').addEventListener('click', () => { openOverlay('requestModalOverlay'); updateRequestPersonOptions(); });
document.getElementById('btnNewRequestFromHome').addEventListener('click', () => { openOverlay('requestModalOverlay'); updateRequestPersonOptions(); });
document.getElementById('requestForm').addEventListener('submit', addRequest);
document.getElementById('offerForm').addEventListener('submit', addOffer);

document.getElementById('btnNewMember').addEventListener('click', () => { populateMemberGroupCheckboxes(); openOverlay('memberModalOverlay'); });
document.getElementById('memberForm').addEventListener('submit', addMember);
document.getElementById('btnNewGroup').addEventListener('click', () => openOverlay('groupModalOverlay'));
document.getElementById('groupForm').addEventListener('submit', addGroup);

document.getElementById('helpBtn').addEventListener('click', () => openOverlay('helpModalOverlay'));
document.getElementById('settingsBtn').addEventListener('click', () => {
  document.querySelectorAll('input[name=theme]').forEach(r => { r.checked = r.value === currentTheme(); });
  document.querySelectorAll('input[name=design]').forEach(r => { r.checked = r.value === currentDesign(); });
  openOverlay('settingsModalOverlay');
});
const DESIGN_NAMES = { minimal: 'Minimal', klassisch: 'Klassisch', sanft: 'Sanft' };
document.querySelectorAll('input[name=design]').forEach(r => r.addEventListener('change', () => {
  applyDesign(r.value);
  showToast(`✓ Das Design „${DESIGN_NAMES[r.value]}“ ist an.`);
}));
document.querySelectorAll('input[name=theme]').forEach(r => r.addEventListener('change', () => {
  applyTheme(r.value);
  showToast(r.value === 'light' ? '✓ Helle Darstellung ist an.' : r.value === 'dark' ? '✓ Dunkle Darstellung ist an.' : '✓ Die App sieht jetzt aus wie dein Gerät.');
}));

// Schließen: ✕-Knopf, „Abbrechen“, Klick auf den dunklen Hintergrund
['modalOverlay', 'requestModalOverlay', 'offerModalOverlay', 'memberModalOverlay', 'groupModalOverlay', 'helpModalOverlay', 'settingsModalOverlay', 'potModalOverlay'].forEach(id => {
  const overlay = document.getElementById(id);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(id); });
  overlay.querySelectorAll('[data-close], .close-btn').forEach(btn => btn.addEventListener('click', () => closeOverlay(id)));
});

document.getElementById('confirmNo').addEventListener('click', closeConfirm);
document.getElementById('confirmYes').addEventListener('click', () => {
  const cb = confirmCallback;
  closeConfirm();
  if (cb) cb();
});

document.querySelectorAll('.segment[data-filter]').forEach(f => f.addEventListener('click', () => {
  activeFilter = f.dataset.filter;
  document.querySelectorAll('.segment[data-filter]').forEach(x => {
    x.classList.toggle('active', x === f);
    x.setAttribute('aria-pressed', x === f);
  });
  renderLoanList(document.getElementById('loanFullList'), filteredLoans());
}));

const TAB_ORDER = ['uebersicht', 'geldfluss', 'darlehen', 'anfragen', 'kreis', 'aktivitaet'];
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  const modalOpen = document.querySelector('.modal-overlay:not([hidden])') || !document.getElementById('authScreen').hidden;
  if (!typing && !modalOpen && !e.metaKey && !e.ctrlKey && !e.altKey && /^[1-6]$/.test(e.key)) {
    switchTab(TAB_ORDER[Number(e.key) - 1]);
    return;
  }
  if (e.key !== 'Escape') return;
  if (!document.getElementById('confirmModalOverlay').hidden) { closeConfirm(); return; }
  document.querySelectorAll('.modal-overlay:not([hidden])').forEach(o => closeOverlay(o.id));
});

// =====================================================================
// Anmeldung: Konten auf diesem Gerät, Daten mit dem Passwort verschlüsselt
// (PBKDF2 → AES-GCM). Es gibt keinen Server; ohne Passwort sind die Daten
// nicht lesbar. Ein vergessenes Passwort kann nicht wiederhergestellt werden.
// =====================================================================

const USERS_KEY = 'ffUsers';
const SESSION_KEY = 'ffSession';
const DATA_PREFIX = 'ffData:';
const PBKDF2_ITERATIONS = 210000;

let session = null; // lokal: { user, key } · online: { user, cloud: true }

// Fehler mit einem Text, der so der Person angezeigt werden kann
class FriendlyError extends Error {}

const textEnc = new TextEncoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));
const normEmail = (e) => e.trim().toLowerCase();

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (e) { return []; }
}
function saveUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }

// Aus dem Passwort werden 512 Bit abgeleitet: die erste Hälfte ist der Schlüssel,
// die zweite Hälfte wird gespeichert, um das Passwort beim Anmelden zu prüfen.
async function deriveFromPassword(password, saltB64, iterations) {
  const base = await crypto.subtle.importKey('raw', textEnc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64(saltB64), iterations, hash: 'SHA-256' }, base, 512);
  return { raw: bits.slice(0, 32), verifier: toB64(bits.slice(32)) };
}
const importKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function encryptAndStore(sess, json) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sess.key, textEnc.encode(json));
  localStorage.setItem(DATA_PREFIX + sess.user.id, JSON.stringify({ v: 1, iv: toB64(iv), ct: toB64(ct) }));
}
async function loadUserData(user, key) {
  const raw = localStorage.getItem(DATA_PREFIX + user.id);
  if (!raw) return emptyState(user.name);
  const { iv, ct } = JSON.parse(raw);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct));
  return normalizeState(JSON.parse(new TextDecoder().decode(plain)));
}

function rememberSession(user, raw) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, key: toB64(raw) })); } catch (e) { /* nur bis zum Neuladen angemeldet */ }
}

async function registerAccount(name, email, password) {
  const users = loadUsers();
  if (users.some(u => u.email === email)) throw new FriendlyError('Mit dieser E-Mail gibt es auf diesem Gerät schon ein Konto. Bitte melde dich an.');
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const { raw, verifier } = await deriveFromPassword(password, salt, PBKDF2_ITERATIONS);
  const user = { id: 'u' + Date.now(), name, email, salt, verifier, iterations: PBKDF2_ITERATIONS, createdAt: TODAY };

  const legacy = users.length === 0 ? legacyState() : null;
  state = legacy ? normalizeState(legacy) : emptyState(name);
  session = { user, key: await importKey(raw) };
  saveUsers(users.concat(user));
  await encryptAndStore(session, JSON.stringify(state));
  if (legacy) localStorage.removeItem(STORAGE_KEY); // jetzt verschlüsselt im Konto
  rememberSession(user, raw);
  return { adopted: !!legacy };
}

async function loginAccount(email, password) {
  const user = loadUsers().find(u => u.email === email);
  if (!user) throw new FriendlyError('Zu dieser E-Mail gibt es auf diesem Gerät kein Konto. Prüfe die E-Mail oder erstelle ein neues Konto.');
  const { raw, verifier } = await deriveFromPassword(password, user.salt, user.iterations);
  if (verifier !== user.verifier) throw new FriendlyError('Das Passwort ist falsch. Bitte versuche es noch einmal.');
  const key = await importKey(raw);
  state = await loadUserData(user, key);
  session = { user, key };
  rememberSession(user, raw);
}

async function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (!saved) return false;
    const user = loadUsers().find(u => u.id === saved.userId);
    if (!user) return false;
    const key = await importKey(fromB64(saved.key));
    state = await loadUserData(user, key);
    session = { user, key };
    return true;
  } catch (e) { return false; }
}


// =====================================================================
// Online-Konto mit Supabase (wenn in config.js eingetragen):
// Bestätigungs-E-Mail, Passwort zurücksetzen per E-Mail, Daten auf allen Geräten.
// =====================================================================

const CFG = window.FF_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
// Die Adresse der App: dorthin führen die Links in den E-Mails zurück
const APP_URL = location.origin + location.pathname;
// Den Teil der Adresse nach „#“ merken, bevor Supabase ihn auswertet und entfernt
const INITIAL_HASH = new URLSearchParams(location.hash.slice(1));
const sb = CLOUD ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
}) : null;

function cloudErrorText(error) {
  const msg = (error && (error.code || error.message) || '').toLowerCase();
  if (msg.includes('email_not_confirmed') || msg.includes('not confirmed')) return 'not_confirmed';
  if (msg.includes('invalid_credentials') || msg.includes('invalid login')) return 'E-Mail oder Passwort ist falsch. Bitte versuche es noch einmal.';
  if (msg.includes('user_already_exists') || msg.includes('already registered')) return 'Mit dieser E-Mail gibt es schon ein Konto. Bitte melde dich an.';
  if (msg.includes('weak_password') || msg.includes('password should')) return 'Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen, am besten mit Zahlen.';
  if (msg.includes('rate') || msg.includes('security purposes') || (error && error.status === 429)) return 'Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten und versuche es dann noch einmal.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Keine Verbindung zum Internet. Bitte prüfe deine Verbindung.';
  return 'Das hat leider nicht geklappt. Bitte versuche es noch einmal.';
}

function cloudUser(u) {
  return { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || u.email.split('@')[0] };
}

// Lädt die Daten des Kontos. Beim allerersten Mal werden Daten von diesem Gerät übernommen
// (ein lokales Konto mit derselben E-Mail und demselben Passwort, oder ältere Daten).
async function loadCloudData(user, password) {
  const { data, error } = await sb.from('app_data').select('data').eq('user_id', user.id).maybeSingle();
  if (error) throw new FriendlyError('Deine Daten konnten nicht geladen werden. Ist die Datenbank eingerichtet (siehe SUPABASE.md)?');
  if (data) return { state: normalizeState(data.data), imported: false };

  let initial = null;
  const local = loadUsers().find(u => u.email === user.email);
  if (local && password) {
    try {
      const { raw, verifier } = await deriveFromPassword(password, local.salt, local.iterations);
      if (verifier === local.verifier) initial = await loadUserData(local, await importKey(raw));
    } catch (e) { /* dann eben ohne Übernahme */ }
  }
  if (!initial && legacyState()) initial = normalizeState(legacyState());
  const result = { state: initial || emptyState(user.name), imported: !!initial };
  const { error: upErr } = await sb.from('app_data').upsert({ user_id: user.id, data: result.state, updated_at: new Date().toISOString() });
  if (upErr) throw new FriendlyError('Deine Daten konnten nicht gespeichert werden. Ist die Datenbank eingerichtet (siehe SUPABASE.md)?');
  if (initial && !local) localStorage.removeItem(STORAGE_KEY);
  return result;
}

let cloudSaveTimer = null;
function scheduleCloudSave() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(flushCloudSave, 500);
}
function flushCloudSave() {
  clearTimeout(cloudSaveTimer);
  if (!session || !session.cloud) return saveChain;
  const payload = { user_id: session.user.id, data: JSON.parse(JSON.stringify(state)), updated_at: new Date().toISOString() };
  saveChain = saveChain.then(async () => {
    const { error } = await sb.from('app_data').upsert(payload);
    if (error) showToast('! Speichern hat nicht geklappt. Bitte prüfe deine Internetverbindung.');
  });
  return saveChain;
}
window.addEventListener('pagehide', () => { if (session && session.cloud) flushCloudSave(); });

async function cloudRegister(name, email, password) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: APP_URL } });
  if (error) throw new FriendlyError(cloudErrorText(error));
  // Supabase meldet bei bereits bestätigten Adressen keinen Fehler, aber ein Konto ohne Identitäten
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new FriendlyError('Mit dieser E-Mail gibt es schon ein Konto. Bitte melde dich an.');
  }
  if (data.session) { // falls die E-Mail-Bestätigung im Dashboard ausgeschaltet ist
    await sb.auth.signOut();
    return { needsConfirm: false };
  }
  return { needsConfirm: true };
}

async function cloudLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    const text = cloudErrorText(error);
    if (text === 'not_confirmed') { const e = new FriendlyError('not_confirmed'); e.notConfirmed = true; throw e; }
    throw new FriendlyError(text);
  }
  const user = cloudUser(data.user);
  const { state: loaded, imported } = await loadCloudData(user, password);
  state = loaded;
  session = { user, cloud: true };
  return { imported };
}

let resendCooldown = 0;
async function cloudResend(email) {
  const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: APP_URL } });
  if (error) throw new FriendlyError(cloudErrorText(error));
}

// ---------- Anmelde-Seite ----------

const AUTH_PANELS = { login: 'loginForm', register: 'registerForm', verify: 'verifyPanel', reset: 'resetForm' };

function showAuthMode(mode, info) {
  document.querySelectorAll('[data-auth]').forEach(b => {
    const active = b.dataset.auth === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
  });
  Object.entries(AUTH_PANELS).forEach(([m, id]) => { document.getElementById(id).hidden = m !== mode; });
  document.querySelector('.auth-switch').hidden = mode === 'verify' || mode === 'reset';
  document.querySelectorAll('.auth .form-error').forEach(e => { e.hidden = true; });
  const infoEl = document.getElementById('authInfo');
  infoEl.hidden = !info;
  infoEl.textContent = info || '';
  const first = { login: '#loginEmail', register: '#registerName', verify: '#verifyDoneBtn', reset: '#resetPassword' }[mode];
  const el = document.querySelector(first);
  if (el) el.focus();
}

function showVerify(email) {
  document.getElementById('verifyEmail').textContent = email;
  document.getElementById('verifyPanel').dataset.email = email;
  showAuthMode('verify');
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.hidden = false;
}

async function withBusy(button, busyText, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  try { await fn(); } finally { button.disabled = false; button.textContent = label; }
}

function startApp(message) {
  document.getElementById('authScreen').hidden = true;
  document.querySelector('.phone').hidden = false;
  document.getElementById('accountName').textContent = session.user.name;
  document.getElementById('accountEmail').textContent = session.user.email + (session.cloud ? ' · ✓ bestätigt' : '');
  document.getElementById('accountAvatar').textContent = initials(session.user.name);
  renderAll();
  switchTab('uebersicht');
  if (message) showToast(message);
}

function showAuth(mode, info) {
  document.querySelector('.phone').hidden = true;
  document.getElementById('authScreen').hidden = false;
  const hasUsers = loadUsers().length > 0;
  document.getElementById('legacyHint').hidden = !legacyState() || (!CLOUD && hasUsers);
  showAuthMode(mode || (hasUsers || CLOUD ? 'login' : 'register'), info);
}

if (CLOUD) {
  document.getElementById('authNote').textContent = '🔒 Dein Konto ist durch deine bestätigte E-Mail geschützt. Deine Daten sind auf all deinen Geräten gleich.';
  document.getElementById('registerPwHint').textContent = 'Mindestens 8 Zeichen. Falls du es vergisst, kannst du es per E-Mail zurücksetzen.';
  document.getElementById('legacyHint').textContent = 'Daten von diesem Gerät werden in dein Online-Konto übernommen.';
}

document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => showAuthMode(b.dataset.auth)));

document.querySelectorAll('[data-toggle-pw]').forEach(btn => btn.addEventListener('click', () => {
  const input = document.getElementById(btn.dataset.togglePw);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Verbergen' : 'Anzeigen';
  btn.setAttribute('aria-pressed', show);
}));

const genericError = (err, fallback) => (err instanceof FriendlyError ? err.message : fallback);

document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = normEmail(document.getElementById('loginEmail').value);
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showAuthError('loginError', 'Bitte gib deine E-Mail und dein Passwort ein.'); return; }
  withBusy(e.submitter || e.target.querySelector('[type=submit]'), 'Bitte warten …', async () => {
    try {
      if (CLOUD) {
        const { imported } = await cloudLogin(email, password);
        e.target.reset();
        startApp(imported ? `✓ Hallo ${session.user.name}! Deine Daten von diesem Gerät sind jetzt in deinem Konto.` : `✓ Hallo ${session.user.name}, du bist angemeldet.`);
      } else {
        await loginAccount(email, password);
        e.target.reset();
        startApp(`✓ Hallo ${session.user.name}, du bist angemeldet.`);
      }
    } catch (err) {
      if (err.notConfirmed) { showVerify(email); showAuthError('verifyError', 'Deine E-Mail ist noch nicht bestätigt. Bitte tippe zuerst auf den Link in der E-Mail.'); return; }
      showAuthError('loginError', genericError(err, 'Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal.'));
    }
  });
});

document.getElementById('registerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = normEmail(document.getElementById('registerEmail').value);
  const password = document.getElementById('registerPassword').value;
  const repeat = document.getElementById('registerPassword2').value;
  if (!name || !email) { showAuthError('registerError', 'Bitte gib deinen Namen und deine E-Mail ein.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError('registerError', 'Die E-Mail sieht nicht richtig aus. Beispiel: name@beispiel.de'); return; }
  if (password.length < 8) { showAuthError('registerError', 'Das Passwort muss mindestens 8 Zeichen lang sein.'); return; }
  if (password !== repeat) { showAuthError('registerError', 'Die beiden Passwörter sind nicht gleich. Bitte gib sie noch einmal ein.'); return; }
  withBusy(e.submitter || e.target.querySelector('[type=submit]'), 'Konto wird erstellt …', async () => {
    try {
      if (CLOUD) {
        const { needsConfirm } = await cloudRegister(name, email, password);
        e.target.reset();
        document.getElementById('loginEmail').value = email;
        if (needsConfirm) showVerify(email);
        else showAuthMode('login', '✓ Dein Konto ist erstellt. Melde dich jetzt an.');
      } else {
        const { adopted } = await registerAccount(name, email, password);
        e.target.reset();
        startApp(adopted ? `✓ Willkommen ${name}! Deine bisherigen Daten sind jetzt in deinem Konto.` : `✓ Willkommen ${name}! Dein Konto ist erstellt.`);
      }
    } catch (err) {
      showAuthError('registerError', genericError(err, 'Das Konto konnte nicht erstellt werden. Bitte versuche es noch einmal.'));
    }
  });
});

document.getElementById('verifyDoneBtn').addEventListener('click', () => {
  document.getElementById('loginEmail').value = document.getElementById('verifyPanel').dataset.email || '';
  showAuthMode('login', 'Melde dich jetzt mit deiner E-Mail und deinem Passwort an.');
  document.getElementById('loginPassword').focus();
});

document.getElementById('resendBtn').addEventListener('click', (e) => {
  const email = document.getElementById('verifyPanel').dataset.email;
  if (!email) return;
  if (Date.now() < resendCooldown) {
    showAuthError('verifyError', `Bitte warte noch ${Math.ceil((resendCooldown - Date.now()) / 1000)} Sekunden, bevor du die E-Mail noch einmal sendest.`);
    return;
  }
  withBusy(e.currentTarget, 'Wird gesendet …', async () => {
    try {
      await cloudResend(email);
      resendCooldown = Date.now() + 60000;
      document.getElementById('verifyError').hidden = true;
      showToast('✓ Die E-Mail wurde noch einmal gesendet.');
    } catch (err) {
      showAuthError('verifyError', genericError(err, 'Die E-Mail konnte nicht gesendet werden.'));
    }
  });
});

document.getElementById('resetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const password = document.getElementById('resetPassword').value;
  if (password.length < 8) { showAuthError('resetError', 'Das Passwort muss mindestens 8 Zeichen lang sein.'); return; }
  if (password !== document.getElementById('resetPassword2').value) { showAuthError('resetError', 'Die beiden Passwörter sind nicht gleich.'); return; }
  withBusy(e.submitter || e.target.querySelector('[type=submit]'), 'Wird gespeichert …', async () => {
    const { error } = await sb.auth.updateUser({ password });
    if (error) { showAuthError('resetError', cloudErrorText(error)); return; }
    await sb.auth.signOut();
    e.target.reset();
    showAuthMode('login', '✓ Dein neues Passwort ist gespeichert. Melde dich jetzt damit an.');
  });
});

document.getElementById('forgotBtn').addEventListener('click', (e) => {
  const email = normEmail(document.getElementById('loginEmail').value);
  if (CLOUD) {
    if (!email) { showAuthError('loginError', 'Gib oben deine E-Mail ein und tippe dann noch einmal auf „Passwort vergessen?“.'); return; }
    withBusy(e.currentTarget, 'Wird gesendet …', async () => {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
      if (error && cloudErrorText(error).startsWith('Zu viele')) { showAuthError('loginError', cloudErrorText(error)); return; }
      document.getElementById('loginError').hidden = true;
      showAuthMode('login', `Wenn es ein Konto mit ${email} gibt, haben wir dir eine E-Mail geschickt. Tippe auf den Link darin, um ein neues Passwort festzulegen.`);
    });
    return;
  }
  const user = loadUsers().find(u => u.email === email);
  if (!user) {
    showAuthError('loginError', 'Gib oben die E-Mail deines Kontos ein und tippe dann noch einmal auf „Passwort vergessen?“.');
    return;
  }
  askConfirm('Passwort vergessen',
    `Deine Daten sind mit deinem Passwort verschlüsselt. Ohne Passwort kann sie niemand öffnen, auch nicht diese App. Du kannst das Konto ${user.email} auf diesem Gerät löschen und neu anfangen. Dabei gehen alle Daten dieses Kontos verloren.`,
    'Konto löschen', () => {
      localStorage.removeItem(DATA_PREFIX + user.id);
      saveUsers(loadUsers().filter(u => u.id !== user.id));
      showAuthMode(loadUsers().length ? 'login' : 'register');
      showToast('Das Konto wurde von diesem Gerät gelöscht.');
    });
});

async function logout() {
  if (session && session.cloud) {
    await flushCloudSave();
    await sb.auth.signOut();
  } else {
    await saveChain;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* egal */ }
  }
  location.reload();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  askConfirm('Abmelden?', 'Deine Daten bleiben gespeichert. Zum Weitermachen meldest du dich wieder mit E-Mail und Passwort an.', 'Ja, abmelden', logout);
});

async function initCloud() {
  const type = INITIAL_HASH.get('type');
  const hashError = INITIAL_HASH.get('error_description');
  const { data: { session: sbSession } } = await sb.auth.getSession();

  if (hashError) {
    history.replaceState(null, '', APP_URL);
    showAuth('login', /expired|invalid/i.test(hashError)
      ? 'Der Link ist abgelaufen oder wurde schon benutzt. Melde dich an – falls deine E-Mail noch nicht bestätigt ist, kannst du die E-Mail noch einmal senden.'
      : 'Der Link hat nicht funktioniert. Bitte versuche es noch einmal.');
    return;
  }
  if (type === 'recovery' && sbSession) { showAuth('reset'); return; }
  if ((type === 'signup' || type === 'email') && sbSession) {
    // Bestätigt! Einmal mit Passwort anmelden, damit Daten von diesem Gerät übernommen werden können.
    const email = sbSession.user.email;
    await sb.auth.signOut();
    document.getElementById('loginEmail').value = email;
    showAuth('login', '✓ Deine E-Mail ist bestätigt. Melde dich jetzt mit deinem Passwort an.');
    return;
  }
  if (sbSession) {
    try {
      const user = cloudUser(sbSession.user);
      state = (await loadCloudData(user, null)).state;
      session = { user, cloud: true };
      startApp();
      return;
    } catch (err) {
      showAuth('login', genericError(err, 'Bitte melde dich noch einmal an.'));
      return;
    }
  }
  showAuth();
}

async function initAuth() {
  if (CLOUD) { initCloud(); return; }
  if (!window.crypto || !crypto.subtle) {
    document.getElementById('authScreen').hidden = false;
    document.querySelector('.phone').hidden = true;
    showAuthError('loginError', 'Dein Browser unterstützt die Verschlüsselung nicht. Bitte öffne die App über https:// oder in einem aktuellen Browser.');
    return;
  }
  if (await restoreSession()) startApp();
  else showAuth();
}

initAuth();
