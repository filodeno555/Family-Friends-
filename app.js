// Family Friends — kleine lokale App zum Verwalten von Darlehen im Familien-/Freundeskreis.
// Alle Daten liegen nur im Browser (localStorage) des jeweiligen Geräts.

const STORAGE_KEY = 'familyFriendsData';
const TODAY = new Date().toISOString().slice(0, 10);

const seedData = {
  circleName: 'Müller & Friends',
  members: [
    { id: 'm1', name: 'Tante Sabine' },
    { id: 'm2', name: 'Papa' },
    { id: 'm3', name: 'Max' },
  ],
  loans: [
    {
      id: 'l1', memberId: 'm1', direction: 'verliehen', purpose: 'Zahnarztrechnung',
      amount: 600, installments: 10, paidInstallments: 4,
      interest: 3, startDate: '2026-06-01',
    },
    {
      id: 'l2', memberId: 'm2', direction: 'verliehen', purpose: 'Werkstattrechnung',
      amount: 300, installments: 6, paidInstallments: 1,
      interest: 2, startDate: '2026-08-03',
    },
  ],
  requests: [
    {
      id: 'r1', memberId: 'm3', purpose: 'Neues Fahrrad', amount: 250,
      installments: 5, interest: 1.5, date: '2026-09-24', status: 'offen',
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
      if (!data.requests) data.requests = [];
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
let expandedLoanId = null;

const euro = (n) => Math.round(n).toLocaleString('de-DE', { maximumFractionDigits: 0 });
const initials = (name) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const formatDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const formatDateFull = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

function memberName(id) {
  const m = state.members.find(m => m.id === id);
  return m ? m.name : 'Unbekannt';
}

// ---------- Berechnungen ----------

function loanRate(loan) {
  return loan.amount / loan.installments;
}

function loanRemaining(loan) {
  const rate = loanRate(loan);
  return Math.max(0, (loan.installments - loan.paidInstallments) * rate);
}

function loanTotalWithInterest(loan) {
  return loan.amount * (1 + loan.interest / 100);
}

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
  return state.loans
    .filter(l => l.direction === 'verliehen')
    .reduce((sum, l) => sum + loanRemaining(l), 0);
}

function totalByDirection(direction) {
  return state.loans
    .filter(l => l.direction === direction)
    .reduce((sum, l) => sum + loanRemaining(l), 0);
}

function activeLoanCount() {
  return state.loans.filter(l => l.paidInstallments < l.installments).length;
}

function openRequestCount() {
  return state.requests.filter(r => r.status === 'offen').length;
}

// Kreditscore: startet bei 650, steigt mit Rückzahlungsfortschritt und
// abgeschlossenen Darlehen, sinkt bei überfälligen Raten. Bereich 300–850.
function creditScore(memberId) {
  const loans = state.loans.filter(l => l.memberId === memberId);
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

  document.getElementById('sumVerliehen').textContent = `${euro(totalByDirection('verliehen'))}\u00A0€`;
  document.getElementById('sumGeliehen').textContent = `${euro(totalByDirection('geliehen'))}\u00A0€`;
  document.getElementById('sumNetto').textContent = `${euro(totalByDirection('verliehen') - totalByDirection('geliehen'))}\u00A0€`;

  renderLoanList(document.getElementById('loanPreviewList'), state.loans.slice(0, 2));
  renderLoanList(document.getElementById('loanFullList'), filteredLoans());
  renderActivity(document.getElementById('activityPreviewList'), state.activity.slice(0, 3));
  renderActivity(document.getElementById('activityFullList'), state.activity);
  renderMembers();
  renderRequests();
  populateMemberSelect();

  const badge = document.getElementById('requestBadge');
  badge.hidden = openRequestCount() === 0;
}

function filteredLoans() {
  if (activeFilter === 'alle') return state.loans;
  return state.loans.filter(l => l.direction === activeFilter);
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
        <div class="avatar">${initials(memberName(loan.memberId))}</div>
        <div class="loan-name">${memberName(loan.memberId)}
          <span class="loan-direction">${loan.direction === 'verliehen' ? 'an Kreis verliehen' : 'vom Kreis geliehen'}</span>
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
        ${done
          ? ''
          : `<button class="btn-tick" data-tick="${loan.id}">Rate (${euro(rate)}&nbsp;€) verbuchen</button>`}
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
  container.querySelectorAll('[data-tick]').forEach(btn => {
    btn.addEventListener('click', () => bookInstallment(btn.dataset.tick));
  });
  container.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      expandedLoanId = expandedLoanId === btn.dataset.toggle ? null : btn.dataset.toggle;
      renderLoanList(document.getElementById('loanPreviewList'), state.loans.slice(0, 2));
      renderLoanList(document.getElementById('loanFullList'), filteredLoans());
    });
  });
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
    const loanCount = state.loans.filter(l => l.memberId === m.id && l.paidInstallments < l.installments).length;
    const score = creditScore(m.id);
    const label = scoreLabel(score);
    return `
      <div class="member-card">
        <div class="avatar">${initials(m.name)}</div>
        <div class="member-info">
          <div class="name">${m.name}</div>
          <div class="role">${loanCount ? `${loanCount} laufendes Darlehen` : 'kein laufendes Darlehen'}</div>
        </div>
        <span class="score-badge ${label.cls}" title="Kreditscore">${score} · ${label.text}</span>
      </div>`;
  }).join('');
}

function renderRequests() {
  const openList = document.getElementById('requestOpenList');
  const historyList = document.getElementById('requestHistoryList');

  const open = state.requests.filter(r => r.status === 'offen');
  const history = state.requests.filter(r => r.status !== 'offen');

  openList.innerHTML = open.length ? open.map(r => `
    <div class="request-card" data-request="${r.id}">
      <div class="request-top">
        <div class="avatar">${initials(memberName(r.memberId))}</div>
        <div class="loan-name">${memberName(r.memberId)}<span class="loan-direction">bittet um ${euro(r.amount)}&nbsp;€</span></div>
      </div>
      <p class="request-purpose">Zweck: ${r.purpose}</p>
      <p class="request-meta">${r.installments} Raten à ${euro(r.amount / r.installments)}&nbsp;€ · ${r.interest}% Zins · gestellt am ${formatDate(r.date)}</p>
      <div class="request-actions">
        <button class="btn-accept" data-accept="${r.id}">Annehmen</button>
        <button class="btn-decline" data-decline="${r.id}">Ablehnen</button>
      </div>
    </div>`).join('') : `<div class="empty-state">Keine offenen Anfragen.</div>`;

  historyList.innerHTML = history.length ? history.map(r => `
    <div class="request-card">
      <div class="request-top">
        <div class="avatar">${initials(memberName(r.memberId))}</div>
        <div class="loan-name">${memberName(r.memberId)}<span class="loan-direction">${euro(r.amount)}&nbsp;€ · ${r.purpose}</span></div>
        <span class="request-status ${r.status}">${r.status}</span>
      </div>
    </div>`).join('') : `<div class="empty-state">Noch kein Verlauf.</div>`;

  openList.querySelectorAll('[data-accept]').forEach(btn => btn.addEventListener('click', () => resolveRequest(btn.dataset.accept, true)));
  openList.querySelectorAll('[data-decline]').forEach(btn => btn.addEventListener('click', () => resolveRequest(btn.dataset.decline, false)));
}

function populateMemberSelect() {
  const options = state.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  document.getElementById('loanPerson').innerHTML = options;
  document.getElementById('requestPerson').innerHTML = options;
}

// ---------- Aktionen ----------

function bookInstallment(loanId) {
  const loan = state.loans.find(l => l.id === loanId);
  if (!loan || loan.paidInstallments >= loan.installments) return;
  loan.paidInstallments += 1;
  const rate = Math.round(loanRate(loan));
  state.activity.unshift({
    id: 'a' + Date.now(),
    desc: `Rate von ${memberName(loan.memberId)} erhalten`,
    amount: loan.direction === 'verliehen' ? rate : -rate,
    type: loan.direction === 'verliehen' ? 'in' : 'out',
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

  state.loans.unshift({
    id: 'l' + Date.now(), memberId, direction, purpose,
    amount, installments, paidInstallments: 0, interest, startDate: TODAY,
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
  const memberId = document.getElementById('requestPerson').value;
  const purpose = document.getElementById('requestPurpose').value.trim();
  const amount = Number(document.getElementById('requestAmount').value);
  const installments = Number(document.getElementById('requestInstallments').value);
  const interest = Number(document.getElementById('requestInterest').value);
  if (!memberId || !amount || !installments || !purpose) return;

  state.requests.unshift({
    id: 'r' + Date.now(), memberId, purpose, amount, installments, interest,
    date: TODAY, status: 'offen',
  });
  saveState();
  renderAll();
  closeRequestModal();
  showToast('Anfrage gestellt');
  e.target.reset();
}

function resolveRequest(requestId, accepted) {
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return;
  req.status = accepted ? 'angenommen' : 'abgelehnt';

  if (accepted) {
    state.loans.unshift({
      id: 'l' + Date.now(), memberId: req.memberId, direction: 'verliehen', purpose: req.purpose,
      amount: req.amount, installments: req.installments, paidInstallments: 0,
      interest: req.interest, startDate: TODAY,
    });
    state.activity.unshift({
      id: 'a' + Date.now(),
      desc: `Anfrage von ${memberName(req.memberId)} angenommen (${req.purpose})`,
      amount: -req.amount, type: 'out', date: TODAY,
    });
  } else {
    state.activity.unshift({
      id: 'a' + Date.now(),
      desc: `Anfrage von ${memberName(req.memberId)} abgelehnt (${req.purpose})`,
      amount: 0, type: 'out', date: TODAY,
    });
  }
  saveState();
  renderAll();
  showToast(accepted ? 'Anfrage angenommen — Darlehen angelegt' : 'Anfrage abgelehnt');
}

function addMember(e) {
  e.preventDefault();
  const name = document.getElementById('memberName').value.trim();
  if (!name) return;
  state.members.push({ id: 'm' + Date.now(), name });
  saveState();
  renderAll();
  closeMemberModal();
  showToast('Person hinzugefügt');
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

function openRequestModal() { document.getElementById('requestModalOverlay').hidden = false; }
function closeRequestModal() { document.getElementById('requestModalOverlay').hidden = true; }

function openMemberModal() { document.getElementById('memberModalOverlay').hidden = false; }
function closeMemberModal() { document.getElementById('memberModalOverlay').hidden = true; }

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

// ---------- Event-Bindings ----------

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.goto));
});

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

document.getElementById('btnNewMember').addEventListener('click', openMemberModal);
document.getElementById('memberModalClose').addEventListener('click', closeMemberModal);
document.getElementById('memberModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'memberModalOverlay') closeMemberModal(); });
document.getElementById('memberForm').addEventListener('submit', addMember);

document.querySelectorAll('.filter').forEach(f => {
  f.addEventListener('click', () => {
    activeFilter = f.dataset.filter;
    document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === f));
    renderLoanList(document.getElementById('loanFullList'), filteredLoans());
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeRequestModal(); closeMemberModal(); }
});

renderAll();
