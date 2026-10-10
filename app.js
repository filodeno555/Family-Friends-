// Family Friends — kleine lokale App zum Verwalten von Darlehen im Familien-/Freundeskreis.
// Alle Daten liegen nur im Browser (localStorage) des jeweiligen Geräts.

const STORAGE_KEY = 'familyFriendsData';
const TODAY = new Date().toISOString().slice(0, 10);
const ME_ID = '__me__'; // repräsentiert die Person, die die App nutzt

const seedData = {
  circleName: 'Müller & Friends',
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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (!data.groups) data.groups = structuredClone(seedData.groups);
      if (!data.requests) data.requests = [];
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
  } catch (e) { /* falls localStorage nicht verfügbar ist, mit Seed-Daten starten */ }
  return structuredClone(seedData);
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { /* Speichern fehlgeschlagen — App funktioniert trotzdem für diese Sitzung */ }
}

let state = loadState();
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

function loanRate(loan) { return loan.amount / loan.installments; }
function loanRemaining(loan) { return Math.max(0, (loan.installments - loan.paidInstallments) * loanRate(loan)); }
function loanTotalWithInterest(loan) { return loan.amount * (1 + loan.interest / 100); }

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
      <p class="offer-terms">Zurückzahlen in ${offer.installments} Raten zu je ${money(offer.amount / offer.installments)} · Zinsen: ${percent(offer.interest)}</p>
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
        <div class="fact"><dt>Zurückzahlen in</dt><dd>${r.installments} Raten zu je ${money(r.amount / r.installments)}</dd></div>
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
    `Das sind ${money(amount / installments)} pro Monat.` +
    (interest ? ` Mit Zinsen insgesamt ${money(amount * (1 + interest / 100))}.` : ' Keine Zinsen.');
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

  const lenderId = direction === 'verliehen' ? ME_ID : memberId;
  const borrowerId = direction === 'verliehen' ? memberId : ME_ID;

  state.loans.unshift({
    id: 'l' + Date.now(), lenderId, borrowerId, purpose,
    amount, installments, paidInstallments: 0, interest, startDate: TODAY, groupId: null,
  });
  state.activity.unshift({
    id: 'a' + Date.now(),
    desc: direction === 'verliehen'
      ? `Du hast ${memberName(memberId)} Geld gegeben${purpose ? ` (${purpose})` : ''}`
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

function openLoanModal(direction) {
  const lend = direction === 'verliehen';
  document.getElementById('loanDirection').value = direction;
  document.getElementById('modalTitle').textContent = lend ? 'Geld verleihen' : 'Geld leihen';
  document.getElementById('modalHint').textContent = lend
    ? 'Du gibst einer Person Geld. Sie zahlt es dir in Raten zurück.'
    : 'Eine Person gibt dir Geld. Du zahlst es in Raten zurück.';
  document.getElementById('loanPersonLabel').textContent = lend ? 'An wen gibst du Geld?' : 'Von wem bekommst du Geld?';
  openOverlay('modalOverlay');
}

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

// Schließen: ✕-Knopf, „Abbrechen“, Klick auf den dunklen Hintergrund
['modalOverlay', 'requestModalOverlay', 'offerModalOverlay', 'memberModalOverlay', 'groupModalOverlay', 'helpModalOverlay'].forEach(id => {
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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('confirmModalOverlay').hidden) { closeConfirm(); return; }
  document.querySelectorAll('.modal-overlay:not([hidden])').forEach(o => closeOverlay(o.id));
});

renderAll();
