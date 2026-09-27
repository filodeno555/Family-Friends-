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

// ---------- Rendering ----------

function renderAll() {
  document.getElementById('circleName').textContent = state.circleName;
  document.getElementById('balanceValue').textContent = euro(circulatingTotal());
  document.getElementById('balanceSub').textContent =
    `${state.members.length} Mitglieder · ${activeLoanCount()} laufende Darlehen`;

  document.getElementById('sumVerliehen').textContent = `${euro(totalLentByMe())}\u00A0€`;
  document.getElementById('sumGeliehen').textContent = `${euro(totalBorrowedByMe())}\u00A0€`;
  document.getElementById('sumNetto').textContent = `${euro(totalLentByMe() - totalBorrowedByMe())}\u00A0€`;

  renderLoanList(document.getElementById('loanPreviewList'), state.loans.slice(0, 2));
  renderLoanList(document.getElementById('loanFullList'), filteredLoans());
  renderActivity(document.getElementById('activityPreviewList'), state.activity.slice(0, 3));
  renderActivity(document.getElementById('activityFullList'), state.activity);
  renderMembers();
  renderGroupFilters();
  renderRequests();
  populateSelects();

  document.getElementById('requestBadge').hidden = openRequestCount() === 0;
}

function filteredLoans() {
  if (activeFilter === 'alle') return state.loans;
  if (activeFilter === 'verliehen') return state.loans.filter(l => l.lenderId === ME_ID);
  return state.loans.filter(l => l.borrowerId === ME_ID);
}

function loanPartyLine(loan) {
  if (loan.lenderId === ME_ID) return `an ${memberName(loan.borrowerId)} verliehen`;
  if (loan.borrowerId === ME_ID) return `von ${memberName(loan.lenderId)} geliehen`;
  return `${memberName(loan.lenderId)} → ${memberName(loan.borrowerId)}`;
}
function loanAvatarLabel(loan) {
  const other = loan.lenderId === ME_ID ? loan.borrowerId : (loan.borrowerId === ME_ID ? loan.lenderId : loan.borrowerId);
  return initials(memberName(other));
}
function loanHeadName(loan) {
  if (loan.lenderId === ME_ID || loan.borrowerId === ME_ID) {
    return memberName(loan.lenderId === ME_ID ? loan.borrowerId : loan.lenderId);
  }
  return `${memberName(loan.lenderId)} & ${memberName(loan.borrowerId)}`;
}

function loanCardHTML(loan) {
  const rate = loanRate(loan);
  const pct = Math.round((loan.paidInstallments / loan.installments) * 100);
  const done = loan.paidInstallments >= loan.installments;
  const overdue = isOverdue(loan);
  const due = nextDueDate(loan);
  const expanded = expandedLoanId === loan.id;

  return `
    <div class="loan-card" data-loan="${loan.id}">
      <div class="loan-top">
        <div class="avatar">${loanAvatarLabel(loan)}</div>
        <div class="loan-name">${loanHeadName(loan)}
          <span class="loan-direction">${loanPartyLine(loan)}${loan.groupId ? ` · ${groupName(loan.groupId)}` : ''}</span>
        </div>
        <span class="loan-amount">${euro(loanRemaining(loan))}&nbsp;€</span>
      </div>
      ${loan.purpose ? `<p class="loan-purpose">Zweck: ${loan.purpose}</p>` : ''}
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="loan-meta">
        <span>Rate ${loan.paidInstallments} von ${loan.installments} abbezahlt · ${loan.interest}% Zins</span>
      </div>
      <div class="loan-foot">
        <span class="due-note ${overdue ? 'overdue' : ''}">${done ? 'vollständig abbezahlt' : `${overdue ? 'überfällig seit' : 'fällig am'} ${formatDateFull(due)}`}</span>
        ${done ? '' : `<button class="btn-tick" data-tick="${loan.id}">Rate (${euro(rate)}&nbsp;€) verbuchen</button>`}
      </div>
      <button class="details-toggle" data-toggle="${loan.id}">${expanded ? 'Details ausblenden' : 'Genaue Infos zur Rate'}</button>
      <div class="loan-details" ${expanded ? '' : 'hidden'}>
        <div class="detail-item"><span class="label">Gesamtbetrag</span><span class="value">${euro(loan.amount)}&nbsp;€</span></div>
        <div class="detail-item"><span class="label">Bereits gezahlt</span><span class="value">${euro(loan.paidInstallments * rate)}&nbsp;€</span></div>
        <div class="detail-item"><span class="label">Offener Betrag</span><span class="value">${euro(loanRemaining(loan))}&nbsp;€</span></div>
        <div class="detail-item"><span class="label">Rate pro Monat</span><span class="value">${euro(rate)}&nbsp;€</span></div>
        <div class="detail-item"><span class="label">Start</span><span class="value">${formatDateFull(loan.startDate)}</span></div>
        <div class="detail-item"><span class="label">Gesamt inkl. Zins</span><span class="value">${euro(loanTotalWithInterest(loan))}&nbsp;€</span></div>
      </div>
    </div>`;
}

function renderLoanList(container, loans) {
  if (!loans.length) {
    container.innerHTML = `<div class="empty-state">Noch keine Darlehen — leg oben eins an.</div>`;
    return;
  }
  container.innerHTML = loans.map(loanCardHTML).join('');
  container.querySelectorAll('[data-tick]').forEach(btn => btn.addEventListener('click', () => bookInstallment(btn.dataset.tick)));
  container.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
    expandedLoanId = expandedLoanId === btn.dataset.toggle ? null : btn.dataset.toggle;
    renderLoanList(document.getElementById('loanPreviewList'), state.loans.slice(0, 2));
    renderLoanList(document.getElementById('loanFullList'), filteredLoans());
  }));
}

function renderActivity(container, items) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">Noch keine Aktivität.</div>`;
    return;
  }
  container.innerHTML = items.map(a => `
    <div class="activity-row">
      <span class="desc">${a.desc}</span>
      <span class="date">${formatDate(a.date)}</span>
      <span class="amount ${a.type}">${a.type === 'in' ? '+' : '−'}${euro(Math.abs(a.amount))}&nbsp;€</span>
    </div>`).join('');
}

function renderMembers() {
  const container = document.getElementById('memberList');
  if (!state.members.length) {
    container.innerHTML = `<div class="empty-state">Noch niemand im Kreis.</div>`;
    return;
  }
  container.innerHTML = state.members.map(m => {
    const loanCount = state.loans.filter(l => (l.borrowerId === m.id || l.lenderId === m.id) && l.paidInstallments < l.installments).length;
    const score = creditScore(m.id);
    const label = scoreLabel(score);
    const chips = m.groupIds.map(gid => `<span class="group-chip">${groupName(gid)}</span>`).join('');
    return `
      <div class="member-card">
        <div class="avatar">${initials(m.name)}</div>
        <div class="member-info">
          <div class="name">${m.name}</div>
          <div class="role">${loanCount ? `${loanCount} laufendes Darlehen` : 'kein laufendes Darlehen'}</div>
          <div class="member-groups">${chips || '<span class="group-chip">keine Gruppe</span>'}</div>
        </div>
        <span class="score-badge ${label.cls}" title="Kreditscore">${score} · ${label.text}</span>
      </div>`;
  }).join('');
}

function renderGroupFilters() {
  const row = document.getElementById('groupFilterRow');
  const chips = ['<button class="filter ' + (activeGroupFilter === 'alle' ? 'active' : '') + '" data-groupfilter="alle">Alle</button>']
    .concat(state.groups.map(g => `<button class="filter ${activeGroupFilter === g.id ? 'active' : ''}" data-groupfilter="${g.id}">${g.name}</button>`));
  row.innerHTML = chips.join('');
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

function offerRowHTML(offer, request) {
  return `
    <div class="offer-row" data-offer="${offer.id}">
      <div class="offer-top">
        <span>${memberName(offer.offererId)} bietet <strong>${euro(offer.amount)}&nbsp;€</strong></span>
        ${offer.status === 'ausstehend'
          ? ''
          : `<span class="request-status ${offer.status}">${offer.status}</span>`}
      </div>
      <p class="offer-terms">${offer.installments} Raten à ${euro(offer.amount / offer.installments)}&nbsp;€ · ${offer.interest}% Zins</p>
      ${offer.status === 'ausstehend' ? `
        <div class="request-actions">
          <button class="btn-accept" data-accept-offer="${offer.id}" data-req="${request.id}">Annehmen</button>
          <button class="btn-decline" data-decline-offer="${offer.id}" data-req="${request.id}">Ablehnen</button>
        </div>` : ''}
    </div>`;
}

function requestCardHTML(r, isHistory) {
  const funded = fundedAmount(r);
  const pct = Math.min(100, Math.round((funded / r.amount) * 100));
  return `
    <div class="request-card" data-request="${r.id}">
      <div class="request-top">
        <div class="avatar">${initials(memberName(r.requesterId))}</div>
        <div class="loan-name">${memberName(r.requesterId)}<span class="loan-direction">bittet um ${euro(r.amount)}&nbsp;€</span></div>
        ${r.groupId ? `<span class="request-group-tag">${groupName(r.groupId)}</span>` : ''}
        ${isHistory ? `<span class="request-status ${r.status}">${r.status}</span>` : ''}
      </div>
      <p class="request-purpose">Zweck: ${r.purpose}</p>
      <p class="request-meta">Wunsch: ${r.installments} Raten à ${euro(r.amount / r.installments)}&nbsp;€ · ${r.interest}% Zins · gestellt am ${formatDate(r.date)}</p>
      ${!isHistory ? `
        <div class="request-progress-label"><span>Finanziert</span><span>${euro(funded)} / ${euro(r.amount)}&nbsp;€</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      ` : ''}
      ${r.offers.length ? `<div class="offer-list">${r.offers.map(o => offerRowHTML(o, r)).join('')}</div>` : ''}
      ${!isHistory ? `<button class="btn-offer" data-make-offer="${r.id}">+ Angebot machen</button>` : ''}
    </div>`;
}

function renderRequests() {
  const openList = document.getElementById('requestOpenList');
  const historyList = document.getElementById('requestHistoryList');
  const all = requestsForFilter();
  const open = all.filter(r => r.status === 'offen');
  const history = all.filter(r => r.status !== 'offen');

  openList.innerHTML = open.length ? open.map(r => requestCardHTML(r, false)).join('') : `<div class="empty-state">Keine offenen Anfragen in dieser Auswahl.</div>`;
  historyList.innerHTML = history.length ? history.map(r => requestCardHTML(r, true)).join('') : `<div class="empty-state">Noch kein Verlauf.</div>`;

  openList.querySelectorAll('[data-make-offer]').forEach(btn => btn.addEventListener('click', () => openOfferModal(btn.dataset.makeOffer)));
  openList.querySelectorAll('[data-accept-offer]').forEach(btn => btn.addEventListener('click', () => resolveOffer(btn.dataset.req, btn.dataset.acceptOffer, true)));
  openList.querySelectorAll('[data-decline-offer]').forEach(btn => btn.addEventListener('click', () => resolveOffer(btn.dataset.req, btn.dataset.declineOffer, false)));
}

function populateSelects() {
  const allOptions = state.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  document.getElementById('loanPerson').innerHTML = allOptions;

  const groupOptions = state.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  const reqGroupSelect = document.getElementById('requestGroup');
  reqGroupSelect.innerHTML = groupOptions;
  updateRequestPersonOptions();
  reqGroupSelect.onchange = updateRequestPersonOptions;
}

function updateRequestPersonOptions() {
  const groupId = document.getElementById('requestGroup').value;
  const members = membersInGroup(groupId);
  document.getElementById('requestPerson').innerHTML =
    members.length ? members.map(m => `<option value="${m.id}">${m.name}</option>`).join('')
                    : `<option value="">Keine Person in dieser Gruppe</option>`;
}

function populateMemberGroupCheckboxes() {
  const field = document.getElementById('memberGroupsField');
  field.innerHTML = state.groups.map(g => `
    <label class="checkbox-chip">
      <input type="checkbox" value="${g.id}" class="member-group-checkbox">
      ${g.name}
    </label>`).join('');
}

// ---------- Aktionen ----------

function bookInstallment(loanId) {
  const loan = state.loans.find(l => l.id === loanId);
  if (!loan || loan.paidInstallments >= loan.installments) return;
  loan.paidInstallments += 1;
  const rate = Math.round(loanRate(loan));
  state.activity.unshift({
    id: 'a' + Date.now(),
    desc: `Rate zwischen ${memberName(loan.lenderId)} und ${memberName(loan.borrowerId)} verbucht`,
    amount: loan.lenderId === ME_ID ? rate : (loan.borrowerId === ME_ID ? -rate : 0),
    type: loan.lenderId === ME_ID ? 'in' : 'out',
    date: TODAY,
  });
  saveState();
  renderAll();
  showToast(loan.paidInstallments >= loan.installments ? 'Darlehen vollständig abbezahlt 🎉' : 'Rate verbucht');
}

function addLoan(e) {
  e.preventDefault();
  const memberId = document.getElementById('loanPerson').value;
  const purpose = document.getElementById('loanPurpose').value.trim();
  const amount = Number(document.getElementById('loanAmount').value);
  const installments = Number(document.getElementById('loanInstallments').value);
  const interest = Number(document.getElementById('loanInterest').value);
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
    desc: `Darlehen ${direction === 'verliehen' ? 'an' : 'von'} ${memberName(memberId)} ${direction === 'verliehen' ? 'vergeben' : 'aufgenommen'}${purpose ? ` (${purpose})` : ''}`,
    amount: direction === 'verliehen' ? -amount : amount,
    type: direction === 'verliehen' ? 'out' : 'in',
    date: TODAY,
  });
  saveState();
  renderAll();
  closeModal();
  showToast('Darlehen angelegt');
  e.target.reset();
}

function addRequest(e) {
  e.preventDefault();
  const groupId = document.getElementById('requestGroup').value;
  const requesterId = document.getElementById('requestPerson').value;
  const purpose = document.getElementById('requestPurpose').value.trim();
  const amount = Number(document.getElementById('requestAmount').value);
  const installments = Number(document.getElementById('requestInstallments').value);
  const interest = Number(document.getElementById('requestInterest').value);
  if (!groupId || !requesterId || !amount || !installments || !purpose) return;

  state.requests.unshift({
    id: 'r' + Date.now(), requesterId, groupId, purpose, amount, installments, interest,
    date: TODAY, status: 'offen', offers: [],
  });
  saveState();
  renderAll();
  closeRequestModal();
  showToast('Anfrage in der Gruppe gestellt');
  e.target.reset();
}

function openOfferModal(requestId) {
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return;
  document.getElementById('offerRequestId').value = requestId;
  document.getElementById('offerRequestHint').textContent =
    `${memberName(req.requesterId)} möchte ${euro(req.amount)}\u00A0€ für „${req.purpose}“ (Wunsch: ${req.installments} Raten, ${req.interest}% Zins).`;
  const candidates = membersInGroup(req.groupId).filter(m => m.id !== req.requesterId);
  document.getElementById('offerPerson').innerHTML = candidates.length
    ? candidates.map(m => `<option value="${m.id}">${m.name}</option>`).join('')
    : `<option value="">Niemand sonst in dieser Gruppe</option>`;
  document.getElementById('offerModalOverlay').hidden = false;
}
function closeOfferModal() { document.getElementById('offerModalOverlay').hidden = true; }

function addOffer(e) {
  e.preventDefault();
  const requestId = document.getElementById('offerRequestId').value;
  const req = state.requests.find(r => r.id === requestId);
  const offererId = document.getElementById('offerPerson').value;
  const amount = Number(document.getElementById('offerAmount').value);
  const installments = Number(document.getElementById('offerInstallments').value);
  const interest = Number(document.getElementById('offerInterest').value);
  if (!req || !offererId || !amount || !installments) return;

  req.offers.push({ id: 'o' + Date.now(), offererId, amount, installments, interest, date: TODAY, status: 'ausstehend' });
  saveState();
  renderAll();
  closeOfferModal();
  showToast('Angebot gesendet');
  e.target.reset();
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
      desc: `${memberName(offer.offererId)} finanziert ${memberName(req.requesterId)} mit ${euro(offer.amount)}\u00A0€ (${req.purpose})`,
      amount: offer.offererId === ME_ID ? -offer.amount : (req.requesterId === ME_ID ? offer.amount : 0),
      type: offer.offererId === ME_ID ? 'out' : 'in',
      date: TODAY,
    });
  }

  if (fundedAmount(req) >= req.amount) req.status = 'abgeschlossen';
  saveState();
  renderAll();
  showToast(accepted ? 'Angebot angenommen — Darlehen angelegt' : 'Angebot abgelehnt');
}

function addMember(e) {
  e.preventDefault();
  const name = document.getElementById('memberName').value.trim();
  if (!name) return;
  const groupIds = Array.from(document.querySelectorAll('.member-group-checkbox:checked')).map(cb => cb.value);
  state.members.push({ id: 'm' + Date.now(), name, groupIds });
  saveState();
  renderAll();
  closeMemberModal();
  showToast('Person hinzugefügt');
  e.target.reset();
}

function addGroup(e) {
  e.preventDefault();
  const name = document.getElementById('groupName').value.trim();
  if (!name) return;
  state.groups.push({ id: 'g' + Date.now(), name });
  saveState();
  renderAll();
  closeGroupModal();
  showToast('Gruppe angelegt');
  e.target.reset();
}

// ---------- UI-Steuerung ----------

function switchTab(tabName) {
  document.querySelectorAll('[data-screen]').forEach(s => s.hidden = (s.id !== `screen-${tabName}`));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
}

function openModal(direction) {
  document.getElementById('loanDirection').value = direction;
  document.getElementById('modalTitle').textContent = direction === 'verliehen' ? 'Geld verleihen' : 'Geld leihen';
  document.getElementById('modalOverlay').hidden = false;
}
function closeModal() { document.getElementById('modalOverlay').hidden = true; }

function openRequestModal() { document.getElementById('requestModalOverlay').hidden = false; updateRequestPersonOptions(); }
function closeRequestModal() { document.getElementById('requestModalOverlay').hidden = true; }

function openMemberModal() { populateMemberGroupCheckboxes(); document.getElementById('memberModalOverlay').hidden = false; }
function closeMemberModal() { document.getElementById('memberModalOverlay').hidden = true; }

function openGroupModal() { document.getElementById('groupModalOverlay').hidden = false; }
function closeGroupModal() { document.getElementById('groupModalOverlay').hidden = true; }

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

// ---------- Event-Bindings ----------

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.goto)));

document.getElementById('btnLend').addEventListener('click', () => openModal('verliehen'));
document.getElementById('btnBorrow').addEventListener('click', () => openModal('geliehen'));
document.getElementById('btnNewLoanFromList').addEventListener('click', () => openModal('verliehen'));
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
document.getElementById('loanForm').addEventListener('submit', addLoan);

document.getElementById('btnNewRequest').addEventListener('click', openRequestModal);
document.getElementById('btnNewRequestFromHome').addEventListener('click', openRequestModal);
document.getElementById('requestModalClose').addEventListener('click', closeRequestModal);
document.getElementById('requestModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'requestModalOverlay') closeRequestModal(); });
document.getElementById('requestForm').addEventListener('submit', addRequest);

document.getElementById('offerModalClose').addEventListener('click', closeOfferModal);
document.getElementById('offerModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'offerModalOverlay') closeOfferModal(); });
document.getElementById('offerForm').addEventListener('submit', addOffer);

document.getElementById('btnNewMember').addEventListener('click', openMemberModal);
document.getElementById('memberModalClose').addEventListener('click', closeMemberModal);
document.getElementById('memberModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'memberModalOverlay') closeMemberModal(); });
document.getElementById('memberForm').addEventListener('submit', addMember);

document.getElementById('btnNewGroup').addEventListener('click', openGroupModal);
document.getElementById('groupModalClose').addEventListener('click', closeGroupModal);
document.getElementById('groupModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'groupModalOverlay') closeGroupModal(); });
document.getElementById('groupForm').addEventListener('submit', addGroup);

document.querySelectorAll('.filter[data-filter]').forEach(f => f.addEventListener('click', () => {
  activeFilter = f.dataset.filter;
  document.querySelectorAll('.filter[data-filter]').forEach(x => x.classList.toggle('active', x === f));
  renderLoanList(document.getElementById('loanFullList'), filteredLoans());
}));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeRequestModal(); closeOfferModal(); closeMemberModal(); closeGroupModal(); }
});

renderAll();
