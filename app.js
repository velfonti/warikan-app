/* ============================================================
   わりかん App — JavaScript Logic
   ============================================================ */

const STORAGE_KEY = 'warikan_v1';

// ── State ──────────────────────────────────────────────────
let state = {
  nameA: '自分',
  nameB: '相手',
  payments: [],   // { id, payer: 'A'|'B', desc, amount, date }
};

let selectedPayer = 'A';
let deleteTargetId = null;

// ── DOM Refs ───────────────────────────────────────────────
const nameAEl       = document.getElementById('nameA');
const nameBEl       = document.getElementById('nameB');
const labelAEl      = document.getElementById('labelA');
const labelBEl      = document.getElementById('labelB');
const amountAEl     = document.getElementById('amountA');
const amountBEl     = document.getElementById('amountB');
const balanceAmtEl  = document.getElementById('balanceAmount');
const balanceDirEl  = document.getElementById('balanceDirection');
const settleBanner  = document.getElementById('settlementBanner');
const settleTextEl  = document.getElementById('settlementText');
const payerBtnA     = document.getElementById('payerBtnA');
const payerBtnB     = document.getElementById('payerBtnB');
const descInputEl   = document.getElementById('descInput');
const amountInputEl = document.getElementById('amountInput');
const btnAddEl      = document.getElementById('btnAdd');
const historyListEl = document.getElementById('historyList');
const historyCountEl= document.getElementById('historyCount');
const emptyStateEl  = document.getElementById('emptyState');
const btnResetEl    = document.getElementById('btnReset');
const toastEl       = document.getElementById('toast');
const modalOverlay  = document.getElementById('modalOverlay');
const btnCancel     = document.getElementById('btnCancel');
const btnConfirm    = document.getElementById('btnConfirm');

// ── Persistence ────────────────────────────────────────────
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const loaded = JSON.parse(raw);
      Object.assign(state, loaded);
    } catch (e) { /* ignore corrupt data */ }
  }
}

// ── Format ─────────────────────────────────────────────────
function formatYen(n) {
  return '¥' + Math.abs(n).toLocaleString('ja-JP');
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// ── Render ─────────────────────────────────────────────────
function render() {
  // Names
  const nameA = state.nameA || '自分';
  const nameB = state.nameB || '相手';
  labelAEl.textContent = nameA;
  labelBEl.textContent = nameB;
  payerBtnA.textContent = nameA;
  payerBtnB.textContent = nameB;

  // Totals
  const totalA = state.payments
    .filter(p => p.payer === 'A')
    .reduce((s, p) => s + p.amount, 0);
  const totalB = state.payments
    .filter(p => p.payer === 'B')
    .reduce((s, p) => s + p.amount, 0);

  amountAEl.textContent = formatYen(totalA);
  amountBEl.textContent = formatYen(totalB);

  // Balance
  const diff = totalA - totalB;
  const absDiff = Math.abs(diff);
  balanceAmtEl.textContent = formatYen(absDiff);

  if (absDiff === 0) {
    balanceDirEl.textContent = 'イーブン 🤝';
    settleBanner.style.display = 'none';
  } else if (diff > 0) {
    // A paid more → B owes A
    balanceDirEl.textContent = `${nameB} → ${nameA}`;
    settleTextEl.textContent = `${nameB} が ${nameA} に ${formatYen(Math.round(absDiff / 2))} 支払うと精算完了！`;
    settleBanner.style.display = 'flex';
  } else {
    // B paid more → A owes B
    balanceDirEl.textContent = `${nameA} → ${nameB}`;
    settleTextEl.textContent = `${nameA} が ${nameB} に ${formatYen(Math.round(absDiff / 2))} 支払うと精算完了！`;
    settleBanner.style.display = 'flex';
  }

  // History
  renderHistory(nameA, nameB);

  // Count
  historyCountEl.textContent = `${state.payments.length}件`;
}

function renderHistory(nameA, nameB) {
  // Remove existing items (keep emptyState)
  const existing = historyListEl.querySelectorAll('.history-item');
  existing.forEach(el => el.remove());

  if (state.payments.length === 0) {
    emptyStateEl.style.display = 'block';
    return;
  }
  emptyStateEl.style.display = 'none';

  // Render newest first
  const sorted = [...state.payments].reverse();
  sorted.forEach(p => {
    const name = p.payer === 'A' ? nameA : nameB;
    const item = document.createElement('div');
    item.className = `history-item payer-${p.payer.toLowerCase()}`;
    item.dataset.id = p.id;
    item.innerHTML = `
      <div class="item-avatar ${p.payer.toLowerCase()}">${p.payer}</div>
      <div class="item-info">
        <div class="item-desc">${escapeHtml(p.desc)}</div>
        <div class="item-meta">${name} · ${formatDate(p.date)}</div>
      </div>
      <div class="item-amount">${formatYen(p.amount)}</div>
      <button class="item-delete" title="削除" data-id="${p.id}">✕</button>
    `;
    historyListEl.appendChild(item);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// ── Name Input Events ──────────────────────────────────────
nameAEl.addEventListener('input', () => {
  state.nameA = nameAEl.value.trim() || '自分';
  saveState();
  render();
});

nameBEl.addEventListener('input', () => {
  state.nameB = nameBEl.value.trim() || '相手';
  saveState();
  render();
});

// ── Payer Toggle ───────────────────────────────────────────
function setPayer(p) {
  selectedPayer = p;
  payerBtnA.classList.toggle('active', p === 'A');
  payerBtnB.classList.toggle('active', p === 'B');
}

payerBtnA.addEventListener('click', () => setPayer('A'));
payerBtnB.addEventListener('click', () => setPayer('B'));

// ── Add Payment ────────────────────────────────────────────
btnAddEl.addEventListener('click', () => {
  const desc = descInputEl.value.trim();
  const amountRaw = amountInputEl.value.trim();

  if (!desc) {
    showToast('⚠️ 内容を入力してください');
    descInputEl.focus();
    return;
  }
  const amount = parseInt(amountRaw, 10);
  if (!amount || amount <= 0) {
    showToast('⚠️ 正しい金額を入力してください');
    amountInputEl.focus();
    return;
  }

  state.payments.push({
    id: Date.now().toString(),
    payer: selectedPayer,
    desc,
    amount,
    date: new Date().toISOString(),
  });

  descInputEl.value = '';
  amountInputEl.value = '';

  saveState();
  render();
  showToast('✅ 追加しました');
  descInputEl.focus();
});

// Enter key on amount input triggers add
amountInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnAddEl.click();
});
descInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') amountInputEl.focus();
});

// ── Delete ─────────────────────────────────────────────────
historyListEl.addEventListener('click', e => {
  const btn = e.target.closest('.item-delete');
  if (!btn) return;
  deleteTargetId = btn.dataset.id;
  modalOverlay.style.display = 'flex';
});

btnCancel.addEventListener('click', () => {
  modalOverlay.style.display = 'none';
  deleteTargetId = null;
});

btnConfirm.addEventListener('click', () => {
  if (deleteTargetId) {
    state.payments = state.payments.filter(p => p.id !== deleteTargetId);
    saveState();
    render();
    showToast('🗑 削除しました');
  }
  modalOverlay.style.display = 'none';
  deleteTargetId = null;
});

modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) {
    modalOverlay.style.display = 'none';
    deleteTargetId = null;
  }
});

// ── Reset ──────────────────────────────────────────────────
btnResetEl.addEventListener('click', () => {
  if (!confirm('すべての支払い履歴をリセットしますか？')) return;
  state.payments = [];
  state.nameA = '自分';
  state.nameB = '相手';
  nameAEl.value = '自分';
  nameBEl.value = '相手';
  saveState();
  render();
  showToast('🔄 リセットしました');
});

// ── Sync name inputs on load ───────────────────────────────
function syncInputsFromState() {
  nameAEl.value = state.nameA;
  nameBEl.value = state.nameB;
}

// ── Init ───────────────────────────────────────────────────
loadState();
syncInputsFromState();
setPayer('A');
render();
