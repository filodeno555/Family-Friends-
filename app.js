// Family Friends — kleine lokale App zum Verwalten von Darlehen im Familien-/Freundeskreis.
// Alle Daten liegen nur im Browser (localStorage) des jeweiligen Geräts.

const STORAGE_KEY = 'familyFriendsData';

const seedData = {
  circleName: 'Müller & Friends',
  members: [
    { id: 'm1', name: 'Tante Sabine' },
    { id: 'm2', name: 'Papa' },
    { id: 'm3', name: 'Max' },
  ],
  loans: [
    {
      id: 'l1', memberId: 'm1', direction: 'verliehen',
      amount: 600, installments: 10, paidInstallments: 4,
      interest: 3, nextDate: '2026-10-01',
    },
    {
      id: 'l2', memberId: 'm2', direction: 'verliehen',
      amount: 300, installments: 6, paidInstallments: 1,
      interest: 2, nextDate: '2026-10-03',
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
    if (raw) return JSON.parse(raw);
  } catch (e) { /* falls localStorage nicht verfügbar ist, mit Seed-Daten starten */ }
  return structuredClone(seedData);
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { /* Speichern fehlgeschlagen — App funktioniert trotzdem für diese Sitzung */ }
}

let state = loadState();
let activeFilter = 'alle';

const euro = (n) => n.toLocaleString('de-DE', { maximumFractionDigits: 0 });
const initials = (name) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};

function memberName(id) {
  const m = state.members.find(m => m.id === id);
  return m ? m.name : 'Unbekannt';
}

// ---------- Berechnungen ----------

function loanRate(loan) {
  return loan.amount / loan.installments;
}

function circulatingTotal() {
  return state.loans
    .filter(l => l.direction === 'verliehen')
    .reduce((sum, l) => sum + (loan_remaining(l)), 0);
}

function loan_remaining(loan) {
  const rate = loanRate(loan);
  return Math.max(0, Math.round((loan.installments - loan.paidInstallments) * rate));
}

function activeLoanCount() {
  return state.loans.filter(l => l.paidInstallments < l.installments).length;
}

// ---------- Rendering ----------

function renderAll() {
  document.getElementById('circleName').textContent = state.circleName;
  document.getElementById('balanceValue').textContent = euro(circulatingTotal());
  document.getElementById('balanceSub').textContent =
    `${state.members.length} Mitglieder · ${activeLoanCount()} laufende Darlehen`;

  renderLoanList(document.getElementById('loanPreviewList'), state.loans.slice(0, 2));
  renderLoanList(document.getElementById('loanFullList'), filteredLoans());
  renderActivity(document.getElementById('activityPreviewList'), state.activity.slice(0, 3));
  renderActivity(document.getElementById('activityFullList'), state.activity);
  renderMembers();
  populateMemberSelect();
}

function filteredLoans() {
  if (activeFilter === 'alle') return state.loans;
  return state.loans.filter(l => l.direction === activeFilter);
}

function loanCardHTML(loan) {
  const rate = loanRate(loan);
  const pct = Math.round((loan.paidInstallments / loan.installments) * 100);
  const done = loan.paidInstallments >= loan.installments;
  return `
    <div class="loan-card" data-loan="${loan.id}">
      <div class="loan-top">
        <div class="avatar">${initials(memberName(loan.memberId))}</div>
        <div class="loan-name">${memberName(loan.memberId)}
          <span class="loan-direction">${loan.direction === 'verliehen' ? 'an Kreis verliehen' : 'vom Kreis geliehen'}</span>
        </div>
        <span class="loan-amount">${euro(loan_remaining(loan))}&nbsp;€</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="loan-meta">
        <span>${loan.paidInstallments}/${loan.installments} Raten · ${loan.interest}% Zins</span>
        ${done
          ? `<span>abbezahlt</span>`
          : `<button class="btn-tick" data-tick="${loan.id}">Rate (${euro(Math.round(rate))}&nbsp;€) verbuchen</button>`}
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
    return `
      <div class="member-card">
        <div class="avatar">${initials(m.name)}</div>
        <div class="member-info">
          <div class="name">${m.name}</div>
          <div class="role">${loanCount ? `${loanCount} laufendes Darlehen` : 'kein laufendes Darlehen'}</div>
        </div>
      </div>`;
  }).join('');
}

function populateMemberSelect() {
  const select = document.getElementById('loanPerson');
  select.innerHTML = state.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
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
    date: new Date().toISOString().slice(0, 10),
  });
  saveState();
  renderAll();
  showToast(loan.paidInstallments >= loan.installments ? 'Darlehen vollständig abbezahlt 🎉' : 'Rate verbucht');
}

function addLoan(e) {
  e.preventDefault();
  const memberId = document.getElementById('loanPerson').value;
  const amount = Number(document.getElementById('loanAmount').value);
  const installments = Number(document.getElementById('loanInstallments').value);
  const interest = Number(document.getElementById('loanInterest').value);
  const direction = document.getElementById('loanDirection').value;
  if (!memberId || !amount || !installments) return;

  const loan = {
    id: 'l' + Date.now(), memberId, direction,
    amount, installments, paidInstallments: 0, interest,
    nextDate: new Date().toISOString().slice(0, 10),
  };
  state.loans.unshift(loan);
  state.activity.unshift({
    id: 'a' + Date.now(),
    desc: `Darlehen ${direction === 'verliehen' ? 'an' : 'von'} ${memberName(memberId)} ${direction === 'verliehen' ? 'vergeben' : 'aufgenommen'}`,
    amount: direction === 'verliehen' ? -amount : amount,
    type: direction === 'verliehen' ? 'out' : 'in',
    date: new Date().toISOString().slice(0, 10),
  });
  saveState();
  renderAll();
  closeModal();
  showToast('Darlehen angelegt');
  e.target.reset();
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
  if (e.key === 'Escape') { closeModal(); closeMemberModal(); }
});

renderAll();
