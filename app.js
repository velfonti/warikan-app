/* ============================================================
   わりかん App — Firebase Firestore 対応版
   ============================================================ */

// ── Firebase 初期化 ─────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

// ── State ──────────────────────────────────────────────────
let currentRoomCode = null;
let unsubscribe = null;       // Firestoreリスナー解除用

// ── DOM Refs ───────────────────────────────────────────────
// ルーム画面
const roomScreen    = document.getElementById('roomScreen');
const appContainer  = document.getElementById('appContainer');
const btnCreate     = document.getElementById('btnCreate');
const btnJoin       = document.getElementById('btnJoin');
const roomCodeInput = document.getElementById('roomCodeInput');
const connStatus    = document.getElementById('connStatus');
const connLabel     = document.getElementById('connLabel');

// アプリ画面
const roomBadge     = document.getElementById('roomBadge');
const roomBadgeCode = document.getElementById('roomBadgeCode');
const btnLeave      = document.getElementById('btnLeave');
const syncDot       = document.getElementById('syncDot');
const syncLabel     = document.getElementById('syncLabel');
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
const categorySelEl = document.getElementById('categorySelect');
const amountInputEl = document.getElementById('amountInput');
const btnAddEl      = document.getElementById('btnAdd');
const historyListEl = document.getElementById('historyList');
const historyCountEl= document.getElementById('historyCount');
const emptyStateEl  = document.getElementById('emptyState');
const btnResetEl    = document.getElementById('btnReset');
const toastEl       = document.getElementById('toast');
const modalOverlay  = document.getElementById('modalOverlay');
const modalIcon     = document.getElementById('modalIcon');
const modalText     = document.getElementById('modalText');
const btnCancel     = document.getElementById('btnCancel');
const btnConfirm    = document.getElementById('btnConfirm');

// 検索・フィルター
const searchInputEl = document.getElementById('searchInput');
const searchClearEl = document.getElementById('searchClear');
const filterChipsEl = document.getElementById('filterChips');

// 自分はどちら？
const meBtnA        = document.getElementById('meBtnA');
const meBtnB        = document.getElementById('meBtnB');

let selectedPayer  = 'A';
let pendingAction  = null;   // モーダルで確認待ちのアクション
let myIdentity     = localStorage.getItem('warikan_me') || 'A'; // 自分はAかBか

// 検索・フィルターの状態
let allPayments   = [];   // Firestoreから取得した全件
let filterCat     = '';   // 選択中のカテゴリー（空文字列=すべて）
let searchQuery   = '';   // 検索クエリ

// ── ユーティリティ ─────────────────────────────────────────
function formatYen(n) {
  return '¥' + Math.abs(n).toLocaleString('ja-JP');
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    if (i === 3) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;   // 例: "AB3-K7Z"
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ── 同期バー ───────────────────────────────────────────────
function setSyncStatus(state) {
  syncDot.className = 'sync-dot';
  switch (state) {
    case 'live':
      syncDot.classList.add('live');
      syncLabel.textContent = 'リアルタイム同期中 ●';
      break;
    case 'syncing':
      syncDot.classList.add('syncing');
      syncLabel.textContent = '同期中…';
      break;
    case 'error':
      syncDot.classList.add('error');
      syncLabel.textContent = '接続エラー';
      break;
  }
}

// ── カテゴリ絵文字 ─────────────────────────────────────────
const CATEGORY_ICON = {
  '食費':    '🍽',
  '消耗品費': '🛒',
  '家賃':    '🏠',
  '光熱費':  '💡',
  'その他':  '📦',
};

// ── Firestore: ルームデータ取得 ────────────────────────────
function roomRef(code) {
  return db.collection('rooms').doc(code);
}

function paymentsRef(code) {
  return roomRef(code).collection('payments');
}

// ── ルーム入室処理 ─────────────────────────────────────────
async function enterRoom(code) {
  code = code.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!code) return;

  // 接続中UI
  connStatus.style.display = 'flex';
  connLabel.textContent = '接続中…';

  try {
    // ルームが存在しなければ初期データ作成
    const snap = await roomRef(code).get();
    if (!snap.exists) {
      await roomRef(code).set({ nameA: '自分', nameB: '相手', createdAt: new Date().toISOString() });
    }

    currentRoomCode = code;

    // ローカルに保存（次回自動入室用）
    localStorage.setItem('warikan_room', code);

    // 画面切り替え
    roomScreen.style.display = 'none';
    appContainer.style.display = 'block';
    roomBadgeCode.textContent = code;

    // 同期バーを接続中に
    setSyncStatus('syncing');

    // リアルタイムリスナー開始
    startListeners(code);

    connStatus.style.display = 'none';
    showToast(`🔗 ルーム ${code} に入室しました`);

    // URLパラメーターがあれば自動登録
    await handleUrlParams();

  } catch (e) {
    console.error(e);
    connStatus.style.display = 'none';
    showToast('❌ 接続に失敗しました。Firebaseの設定を確認してください');
  }
}

// ── リアルタイムリスナー ───────────────────────────────────
function startListeners(code) {
  // 既存のリスナーを解除
  if (unsubscribe) unsubscribe();

  // ルーム情報（nameA, nameB）のリスナー
  const unsubRoom = roomRef(code).onSnapshot(snap => {
    if (!snap.exists) return;
    const data = snap.data();
    const nameA = data.nameA || '自分';
    const nameB = data.nameB || '相手';

    // 入力欄が未フォーカスの時だけ更新（入力中を上書きしない）
    if (document.activeElement !== nameAEl) nameAEl.value = nameA;
    if (document.activeElement !== nameBEl) nameBEl.value = nameB;

    labelAEl.textContent = nameA;
    labelBEl.textContent = nameB;
    payerBtnA.textContent = nameA;
    payerBtnB.textContent = nameB;
  }, err => {
    console.error(err);
    setSyncStatus('error');
  });

  // 支払い履歴のリスナー
  const unsubPayments = paymentsRef(code)
    .orderBy('date', 'desc')
    .onSnapshot(snapshot => {
      setSyncStatus('live');
      const payments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll(payments);
    }, err => {
      console.error(err);
      setSyncStatus('error');
    });

  // 両リスナーをまとめて解除できるように
  unsubscribe = () => {
    unsubRoom();
    unsubPayments();
  };
}

// ── レンダリング ───────────────────────────────────────────
function renderAll(payments) {
  // 全件を保存（合計はフィルター前の全件で計算）
  allPayments = payments;

  const nameA = nameAEl.value || '自分';
  const nameB = nameBEl.value || '相手';

  // 合計（全件ベース）
  const totalA = payments.filter(p => p.payer === 'A').reduce((s, p) => s + p.amount, 0);
  const totalB = payments.filter(p => p.payer === 'B').reduce((s, p) => s + p.amount, 0);
  amountAEl.textContent = formatYen(totalA);
  amountBEl.textContent = formatYen(totalB);

  // 差額・精算案内
  const diff = totalA - totalB;
  const absDiff = Math.abs(diff);
  balanceAmtEl.textContent = formatYen(absDiff);

  if (absDiff === 0) {
    balanceDirEl.textContent = 'イーブン 🤝';
    settleBanner.style.display = 'none';
  } else if (diff > 0) {
    balanceDirEl.textContent = `${nameB} → ${nameA}`;
    settleTextEl.textContent = `${nameB} が ${nameA} に ${formatYen(Math.round(absDiff / 2))} 支払うと精算完了！`;
    settleBanner.style.display = 'flex';
  } else {
    balanceDirEl.textContent = `${nameA} → ${nameB}`;
    settleTextEl.textContent = `${nameA} が ${nameB} に ${formatYen(Math.round(absDiff / 2))} 支払うと精算完了！`;
    settleBanner.style.display = 'flex';
  }

  // フィルター済んだ履歴を描画
  renderHistory(nameA, nameB);
}

function renderHistory(nameA, nameB) {
  // フィルター：カテゴリー
  let filtered = filterCat
    ? allPayments.filter(p => p.category === filterCat)
    : [...allPayments];

  // フィルター：検索クエリ
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      (p.desc || '').toLowerCase().includes(q)
    );
  }

  // 件数表示（フィルター後の件数）
  historyCountEl.textContent = `${filtered.length}件`;

  // 既存アイテムを削除
  const existing = historyListEl.querySelectorAll('.history-item, .no-results');
  existing.forEach(el => el.remove());

  if (allPayments.length === 0) {
    emptyStateEl.style.display = 'block';
    return;
  }
  emptyStateEl.style.display = 'none';

  if (filtered.length === 0) {
    const noRes = document.createElement('div');
    noRes.className = 'no-results';
    noRes.textContent = '該当する履歴がありません';
    historyListEl.appendChild(noRes);
    return;
  }

  filtered.forEach(p => {
    const name = p.payer === 'A' ? nameA : nameB;
    const catIcon = CATEGORY_ICON[p.category] || '📦';
    const catLabel = p.category || 'その他';
    const item = document.createElement('div');
    item.className = `history-item payer-${p.payer.toLowerCase()}`;
    item.dataset.id = p.id;
    item.innerHTML = `
      <div class="item-avatar ${p.payer.toLowerCase()}">${p.payer}</div>
      <div class="item-info">
        <div class="item-desc">${escapeHtml(p.desc)}</div>
        <div class="item-meta">${escapeHtml(name)} · ${formatDate(p.date)}</div>
        <span class="item-category">${catIcon} ${escapeHtml(catLabel)}</span>
      </div>
      <div class="item-amount">${formatYen(p.amount)}</div>
      <button class="item-delete" title="削除" data-id="${p.id}">✕</button>
    `;
    historyListEl.appendChild(item);
  });
}

// ── 名前の変更（Firestore保存・デバウンス付き） ───────────
let nameDebounceTimer;
function saveNames() {
  if (!currentRoomCode) return;
  clearTimeout(nameDebounceTimer);
  nameDebounceTimer = setTimeout(() => {
    roomRef(currentRoomCode).update({
      nameA: nameAEl.value.trim() || '自分',
      nameB: nameBEl.value.trim() || '相手',
    });
  }, 600);
}

nameAEl.addEventListener('input', saveNames);
nameBEl.addEventListener('input', saveNames);

// ── 支払い人トグル ─────────────────────────────────────────
function setPayer(p) {
  selectedPayer = p;
  payerBtnA.classList.toggle('active', p === 'A');
  payerBtnB.classList.toggle('active', p === 'B');
}

payerBtnA.addEventListener('click', () => setPayer('A'));
payerBtnB.addEventListener('click', () => setPayer('B'));

// ── 支払い追加 ─────────────────────────────────────────────
btnAddEl.addEventListener('click', async () => {
  if (!currentRoomCode) return;

  const desc = descInputEl.value.trim();
  const category = categorySelEl.value;
  const amount = parseInt(amountInputEl.value, 10);

  if (!desc) { showToast('⚠️ 内容を入力してください'); descInputEl.focus(); return; }
  if (!amount || amount <= 0) { showToast('⚠️ 正しい金額を入力してください'); amountInputEl.focus(); return; }

  btnAddEl.disabled = true;
  setSyncStatus('syncing');

  try {
    await paymentsRef(currentRoomCode).add({
      payer: selectedPayer,
      desc,
      category,
      amount,
      date: new Date().toISOString(),
    });
    descInputEl.value = '';
    amountInputEl.value = '';
    categorySelEl.value = '食費';
    showToast('✅ 追加しました');
    descInputEl.focus();
  } catch (e) {
    console.error(e);
    showToast('❌ 追加に失敗しました');
    setSyncStatus('error');
  } finally {
    btnAddEl.disabled = false;
  }
});

amountInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') btnAddEl.click(); });
descInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') amountInputEl.focus(); });

// ── 削除 ───────────────────────────────────────────────────
historyListEl.addEventListener('click', e => {
  const btn = e.target.closest('.item-delete');
  if (!btn) return;
  const id = btn.dataset.id;
  openModal('🗑', 'この支払い記録を削除しますか？', '削除する', async () => {
    try {
      await paymentsRef(currentRoomCode).doc(id).delete();
      showToast('🗑 削除しました');
    } catch (e) {
      showToast('❌ 削除に失敗しました');
    }
  });
});

// ── 全リセット ─────────────────────────────────────────────
btnResetEl.addEventListener('click', () => {
  openModal('⚠️', 'すべての支払い履歴を削除しますか？\nこの操作は元に戻せません。', '全削除する', async () => {
    try {
      const snap = await paymentsRef(currentRoomCode).get();
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      showToast('🔄 リセットしました');
    } catch (e) {
      showToast('❌ リセットに失敗しました');
    }
  });
});

// ── モーダル ───────────────────────────────────────────────
function openModal(icon, text, confirmLabel, action) {
  modalIcon.textContent = icon;
  modalText.textContent = text;
  btnConfirm.textContent = confirmLabel;
  pendingAction = action;
  modalOverlay.style.display = 'flex';
}

function closeModal() {
  modalOverlay.style.display = 'none';
  pendingAction = null;
}

btnCancel.addEventListener('click', closeModal);
btnConfirm.addEventListener('click', async () => {
  if (pendingAction) await pendingAction();
  closeModal();
});
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// ── ルーム退出 ─────────────────────────────────────────────
btnLeave.addEventListener('click', () => {
  openModal('🚪', 'ルームを退出しますか？\n（データは削除されません）', '退出する', () => {
    if (unsubscribe) unsubscribe();
    currentRoomCode = null;
    localStorage.removeItem('warikan_room');
    appContainer.style.display = 'none';
    roomScreen.style.display = 'flex';
    roomCodeInput.value = '';
    showToast('退出しました');
  });
});

// ── ルームコードバッジクリック → コピー ───────────────────
roomBadge.addEventListener('click', () => {
  if (!currentRoomCode) return;
  navigator.clipboard.writeText(currentRoomCode).then(() => {
    showToast('📋 ルームコードをコピーしました');
  }).catch(() => {
    showToast(`ルームコード: ${currentRoomCode}`);
  });
});

// ── ルーム作成・参加 ───────────────────────────────────────
btnCreate.addEventListener('click', () => {
  const code = generateRoomCode();
  enterRoom(code);
});

btnJoin.addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) { showToast('⚠️ ルームコードを入力してください'); roomCodeInput.focus(); return; }
  enterRoom(code);
});

roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });

// 入力を大文字・ハイフン自動整形
roomCodeInput.addEventListener('input', () => {
  let val = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (val.length > 3) val = val.slice(0, 3) + '-' + val.slice(3, 6);
  roomCodeInput.value = val;
});

// ── 前回のルームを自動復元 ────────────────────────────────
const savedRoom = localStorage.getItem('warikan_room');
if (savedRoom) {
  enterRoom(savedRoom);
}

// ── Payer 初期化 ──────────────────────────────────────────
setPayer('A');

// ── 検索・フィルター ───────────────────────────────────────
// 検索入力
searchInputEl.addEventListener('input', () => {
  searchQuery = searchInputEl.value.trim();
  searchClearEl.style.display = searchQuery ? 'block' : 'none';
  const nameA = nameAEl.value || '自分';
  const nameB = nameBEl.value || '相手';
  renderHistory(nameA, nameB);
});

// 検索クリアボタン
searchClearEl.addEventListener('click', () => {
  searchInputEl.value = '';
  searchQuery = '';
  searchClearEl.style.display = 'none';
  searchInputEl.focus();
  const nameA = nameAEl.value || '自分';
  const nameB = nameBEl.value || '相手';
  renderHistory(nameA, nameB);
});

// カテゴリーチップ
filterChipsEl.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;

  // アクティブ切り替え
  filterChipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');

  filterCat = chip.dataset.cat;
  const nameA = nameAEl.value || '自分';
  const nameB = nameBEl.value || '相手';
  renderHistory(nameA, nameB);
});

// ── URLパラメーター自動登録（iOSショートカット連携） ─────────────────
async function handleUrlParams() {
  const params     = new URLSearchParams(window.location.search);
  const desc       = params.get('desc');
  const amount     = parseInt(params.get('amount'), 10);
  const payerParam = (params.get('payer') || 'me').toLowerCase();
  const cat        = params.get('cat') || '食費';
  const autosubmit = params.get('autosubmit') === '1';

  if (!desc || !amount || !autosubmit) return;
  if (!currentRoomCode) return;

  // 'me' / 'other' を A/B に変換
  let resolvedPayer;
  if (payerParam === 'me') {
    resolvedPayer = myIdentity;                              // 自分
  } else if (payerParam === 'other') {
    resolvedPayer = myIdentity === 'A' ? 'B' : 'A';          // 相手
  } else {
    resolvedPayer = payerParam.toUpperCase() === 'B' ? 'B' : 'A'; // A/B直指定
  }

  // フォームにセット
  descInputEl.value   = desc;
  amountInputEl.value = amount;
  categorySelEl.value = cat;
  setPayer(resolvedPayer);

  // Firestoreに登録
  try {
    await paymentsRef(currentRoomCode).add({
      payer:    resolvedPayer,
      desc,
      category: cat,
      amount,
      date:     new Date().toISOString(),
    });

    history.replaceState({}, '', window.location.pathname);
    showToast(`✅ 「${desc}」 ${formatYen(amount)} を登録しました`);

    descInputEl.value   = '';
    amountInputEl.value = '';
    categorySelEl.value = '食費';

  } catch(e) {
    console.error(e);
    showToast('❌ 自動登録に失敗しました');
  }
}

// ── 自分はどちら？の設定 ──────────────────────────────────
function updateMeBtnLabels() {
  const nameA = nameAEl.value || '自分';
  const nameB = nameBEl.value || '相手';
  meBtnA.textContent = `${nameA}（A）`;
  meBtnB.textContent = `${nameB}（B）`;
}

function setMyIdentity(id) {
  myIdentity = id;
  localStorage.setItem('warikan_me', id);
  meBtnA.classList.toggle('active', id === 'A');
  meBtnB.classList.toggle('active', id === 'B');
  updateMeBtnLabels();
}

meBtnA.addEventListener('click', () => setMyIdentity('A'));
meBtnB.addEventListener('click', () => setMyIdentity('B'));

// 初期化
setMyIdentity(myIdentity);

