// ── Budget Tracker App ────────────────────────────────────────
'use strict';

// ── State ─────────────────────────────────────────────────────
let currentPage = 'dashboard';
let viewMonth, viewYear;
let txFilter = 'all';

function initState() {
  const now = new Date();
  viewMonth = now.getMonth() + 1;
  viewYear  = now.getFullYear();
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Navigation ────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  currentPage = page;
  renderPage(page);
}

function renderPage(page) {
  switch(page) {
    case 'dashboard':    renderDashboard(); break;
    case 'transactions': renderTransactions(); break;
    case 'analytics':    renderAnalytics(); break;
    case 'reports':      renderReports(); break;
    case 'settings':     renderSettings(); break;
  }
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  const now = new Date();
  const stats = getMonthlyStats(now.getFullYear(), now.getMonth() + 1);
  const balances = getAccountBalances();
  const allTxs = DB.transactions;

  // Net worth
  const kbcBal = balances.kbc ?? 0;
  const beoBal = balances.beobank ?? 0;
  const net = kbcBal + beoBal;
  const prevStats = getMonthlyStats(now.getFullYear(), now.getMonth());
  const change = stats.net - prevStats.net;

  document.getElementById('nw-amount').textContent = `€${net.toFixed(2)}`;
  const chEl = document.getElementById('nw-change');
  if (change !== 0) {
    chEl.textContent = `${change >= 0 ? '↑' : '↓'} €${Math.abs(change).toFixed(2)} vs last month`;
    chEl.className = `nw-change ${change >= 0 ? 'up' : 'down'}`;
  } else {
    chEl.textContent = `This month's activity`;
    chEl.className = 'nw-change';
  }

  // Account balances
  document.getElementById('kbc-balance').textContent = balances.kbc != null ? `€${balances.kbc.toFixed(2)}` : '—';
  document.getElementById('beobank-balance').textContent = balances.beobank != null ? `€${Math.abs(balances.beobank).toFixed(2)}` : '—';

  // Stats row
  document.getElementById('dash-income').textContent   = `€${stats.income.toFixed(0)}`;
  document.getElementById('dash-expenses').textContent = `€${stats.expenses.toFixed(0)}`;
  document.getElementById('dash-net').textContent      = `${stats.net >= 0 ? '+' : ''}€${stats.net.toFixed(0)}`;
  document.getElementById('dash-net').style.color      = stats.net >= 0 ? 'var(--em)' : 'var(--red)';

  // Recent transactions
  renderRecentTxs(allTxs.slice(0, 8));

  // Budget overview
  renderBudgetCards(getBudgetProgress(now.getFullYear(), now.getMonth() + 1).slice(0, 4), 'dash-budgets');
}

function renderRecentTxs(txs) {
  const container = document.getElementById('recent-txs');
  if (!txs.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🧾</div><p>No transactions yet.<br>Import your first CSV to get started.</p></div>`;
    return;
  }
  container.innerHTML = txs.map(t => txItem(t)).join('');
}

function txItem(t) {
  const cat = CATEGORIES[t.category] || CATEGORIES.other;
  const isCredit = t.amount > 0;
  return `<div class="tx-item" onclick="openTxDetail('${t.id}')">
    <div class="tx-icon" style="background:${cat.color}22">${cat.emoji}</div>
    <div class="tx-info">
      <div class="tx-name">${escHtml(t.description)}</div>
      <div class="tx-meta">${formatDate(t.date)} · ${t.accountLabel || t.account.toUpperCase()} · ${cat.label}</div>
    </div>
    <div class="tx-amount ${isCredit ? 'credit' : 'debit'}">${isCredit ? '+' : '−'}€${Math.abs(t.amount).toFixed(2)}</div>
  </div>`;
}

function renderBudgetCards(budgets, containerId) {
  const container = document.getElementById(containerId);
  if (!budgets.length) { container.innerHTML = ''; return; }
  container.innerHTML = budgets.map(b => {
    const cls = b.pct >= 100 ? 'over' : b.pct >= 80 ? 'warn' : 'ok';
    const overBadge = b.pct >= 100 ? `<div class="budget-over-badge">OVER BUDGET</div>` : '';
    return `<div class="budget-card" onclick="navigate('settings')">
      <div class="budget-emoji">${b.emoji}</div>
      <div class="budget-name">${b.name}</div>
      <div class="budget-bar-wrap"><div class="budget-bar ${cls}" style="width:${Math.min(b.pct,100)}%"></div></div>
      <div class="budget-amounts"><span class="spent">€${b.spent.toFixed(0)}</span><span>/ €${b.limit}</span></div>
      ${overBadge}
    </div>`;
  }).join('');
}

// ── Transactions ──────────────────────────────────────────────
function renderTransactions() {
  const all = DB.transactions;
  let filtered = all;

  if (txFilter === 'kbc')     filtered = all.filter(t => t.account === 'kbc');
  if (txFilter === 'beobank') filtered = all.filter(t => t.account === 'beobank');
  if (txFilter === 'income')  filtered = all.filter(t => t.amount > 0);
  if (txFilter === 'expense') filtered = all.filter(t => t.amount < 0);

  const search = document.getElementById('tx-search')?.value?.toLowerCase() || '';
  if (search) filtered = filtered.filter(t => t.description.toLowerCase().includes(search) || t.category.includes(search));

  const container = document.getElementById('tx-list');
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><p>${all.length ? 'No matching transactions.' : 'Import CSVs to see transactions.'}</p></div>`;
    return;
  }

  // Group by date
  const groups = {};
  for (const t of filtered) {
    const d = t.date.slice(0, 7);
    if (!groups[d]) groups[d] = [];
    groups[d].push(t);
  }

  container.innerHTML = Object.entries(groups)
    .sort((a,b) => b[0].localeCompare(a[0]))
    .map(([month, txs]) => {
      const label = new Date(month + '-01').toLocaleString('en', { month: 'long', year: 'numeric' });
      const total = txs.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
      return `<div class="section-header" style="margin-top:16px">
        <span class="section-title">${label}</span>
        <span style="font-size:0.78rem;color:var(--muted)">−€${total.toFixed(2)}</span>
      </div>
      <div class="tx-list">${txs.map(t => txItem(t)).join('')}</div>`;
    }).join('');
}

function setTxFilter(f) {
  txFilter = f;
  document.querySelectorAll('.pill[data-filter]').forEach(p => {
    p.classList.toggle('active', p.dataset.filter === f);
  });
  renderTransactions();
}

// ── Analytics ─────────────────────────────────────────────────
function renderAnalytics() {
  const stats = getMonthlyStats(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth-1, 1).toLocaleString('en', {month:'long', year:'numeric'});
  document.getElementById('analytics-month').textContent = monthLabel;

  // Stats
  document.getElementById('an-income').textContent   = `€${stats.income.toFixed(2)}`;
  document.getElementById('an-expenses').textContent = `€${stats.expenses.toFixed(2)}`;
  document.getElementById('an-txcount').textContent  = stats.count;
  const avg = stats.count ? (stats.expenses / Math.max(stats.count,1)) : 0;
  document.getElementById('an-avg').textContent = `€${avg.toFixed(2)}`;

  // Donut
  const cats = renderDonut('donut-chart', stats.byCategory);

  // Legend
  const legendEl = document.getElementById('donut-legend');
  if (cats && cats.length) {
    const total = cats.reduce((s,[,v]) => s+v, 0);
    legendEl.innerHTML = cats.map(([k, v]) => {
      const cat = CATEGORIES[k] || CATEGORIES.other;
      const pct = ((v/total)*100).toFixed(1);
      return `<div class="report-cat-row">
        <div class="report-cat-dot" style="background:${cat.color}"></div>
        <div class="report-cat-name">${cat.emoji} ${cat.label}</div>
        <div class="report-cat-pct">${pct}%</div>
        <div class="report-cat-amt">€${v.toFixed(2)}</div>
      </div>`;
    }).join('');
  } else {
    legendEl.innerHTML = '';
  }

  // Monthly bar
  renderMonthlyBar('bar-chart', getLast6MonthsStats());
}

function shiftMonth(dir) {
  viewMonth += dir;
  if (viewMonth > 12) { viewMonth = 1; viewYear++; }
  if (viewMonth < 1)  { viewMonth = 12; viewYear--; }
  renderAnalytics();
}

// ── Reports ───────────────────────────────────────────────────
function renderReports() {
  const stats = getMonthlyStats(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth-1, 1).toLocaleString('en', {month:'long', year:'numeric'});

  document.getElementById('report-month-label').textContent = monthLabel;
  document.getElementById('report-income').textContent   = `€${stats.income.toFixed(2)}`;
  document.getElementById('report-expenses').textContent = `€${stats.expenses.toFixed(2)}`;
  document.getElementById('report-net').textContent      = `${stats.net>=0?'+':''}€${stats.net.toFixed(2)}`;
  document.getElementById('report-net').style.color      = stats.net >= 0 ? 'var(--em)' : 'var(--red)';
  document.getElementById('report-txcount').textContent  = stats.count;

  // Category breakdown
  const total = stats.expenses;
  const catList = document.getElementById('report-cat-list');
  const cats = Object.entries(stats.byCategory).sort((a,b)=>b[1]-a[1]);
  if (cats.length) {
    catList.innerHTML = cats.map(([k, v]) => {
      const cat = CATEGORIES[k] || CATEGORIES.other;
      const pct = total ? ((v/total)*100).toFixed(1) : '0.0';
      return `<div class="report-cat-row">
        <div class="report-cat-dot" style="background:${cat.color}"></div>
        <div class="report-cat-name">${cat.emoji} ${cat.label}</div>
        <div class="report-cat-pct">${pct}%</div>
        <div class="report-cat-amt">€${v.toFixed(2)}</div>
      </div>`;
    }).join('');
  } else {
    catList.innerHTML = `<div class="empty-state" style="padding:20px"><p>No data for this month.</p></div>`;
  }

  // Budgets
  renderBudgetCards(getBudgetProgress(viewYear, viewMonth), 'report-budgets');

  // Report month selector
  document.getElementById('report-month').textContent = monthLabel;
}

function shiftReportMonth(dir) {
  viewMonth += dir;
  if (viewMonth > 12) { viewMonth = 1; viewYear++; }
  if (viewMonth < 1)  { viewMonth = 12; viewYear--; }
  renderReports();
  renderAnalytics();
}

function printReport() {
  const stats = getMonthlyStats(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth-1, 1).toLocaleString('en', {month:'long', year:'numeric'});
  const cats = Object.entries(stats.byCategory).sort((a,b)=>b[1]-a[1]);
  const budgets = getBudgetProgress(viewYear, viewMonth);

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Budget Tracker Report – ${monthLabel}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; color: #1a1a2e; }
  h1 { color: #10b981; } h2 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f8f9fa; font-weight: 700; }
  .positive { color: #10b981; } .negative { color: #e53e3e; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 20px 0; }
  .summary-box { background: #f8f9fa; border-radius: 8px; padding: 16px; text-align: center; }
  .summary-box .value { font-size: 1.4rem; font-weight: 800; }
  .summary-box .label { font-size: 0.8rem; color: #666; margin-top: 4px; }
  .bar-wrap { background: #eee; border-radius: 4px; height: 8px; margin: 4px 0; }
  .bar-fill { height: 100%; border-radius: 4px; background: #10b981; }
  .bar-fill.warn { background: #f59e0b; } .bar-fill.over { background: #e53e3e; }
  @media print { body { margin: 20px; } }
</style>
</head><body>
<h1>🌿 Budget Tracker Finance Report</h1>
<p style="color:#666">${monthLabel} · Generated ${new Date().toLocaleDateString()}</p>

<div class="summary-grid">
  <div class="summary-box"><div class="value positive">€${stats.income.toFixed(2)}</div><div class="label">Income</div></div>
  <div class="summary-box"><div class="value negative">€${stats.expenses.toFixed(2)}</div><div class="label">Expenses</div></div>
  <div class="summary-box"><div class="value ${stats.net>=0?'positive':'negative'}">${stats.net>=0?'+':''}€${stats.net.toFixed(2)}</div><div class="label">Net</div></div>
</div>

<h2>Spending by Category</h2>
<table>
  <thead><tr><th>Category</th><th>Amount</th><th>% of Total</th></tr></thead>
  <tbody>${cats.map(([k,v])=>{
    const cat=CATEGORIES[k]||CATEGORIES.other;
    const pct=stats.expenses?((v/stats.expenses)*100).toFixed(1):'0';
    return `<tr><td>${cat.emoji} ${cat.label}</td><td>€${v.toFixed(2)}</td><td>${pct}%</td></tr>`;
  }).join('')}</tbody>
</table>

<h2>Budget Performance</h2>
<table>
  <thead><tr><th>Budget</th><th>Spent</th><th>Limit</th><th>Status</th></tr></thead>
  <tbody>${budgets.map(b=>{
    const status=b.pct>=100?'⚠️ OVER':b.pct>=80?'⚡ Warning':'✅ OK';
    return `<tr><td>${b.emoji} ${b.name}</td><td>€${b.spent.toFixed(2)}</td><td>€${b.limit}</td><td>${status} (${b.pct.toFixed(0)}%)</td></tr>`;
  }).join('')}</tbody>
</table>

<h2>Account Breakdown</h2>
<table>
  <thead><tr><th>Account</th><th>Expenses</th></tr></thead>
  <tbody>
    <tr><td>🏦 KBC</td><td>€${(stats.byAccount.kbc||0).toFixed(2)}</td></tr>
    <tr><td>💳 Beobank</td><td>€${(stats.byAccount.beobank||0).toFixed(2)}</td></tr>
  </tbody>
</table>

<p style="margin-top:40px;color:#aaa;font-size:0.8rem;text-align:center">Generated by Budget Tracker · Your personal finance tracker</p>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ── Settings ──────────────────────────────────────────────────
function renderSettings() {
  const budgets = DB.budgets;
  const bl = document.getElementById('budget-list');
  bl.innerHTML = budgets.map(b => `
    <div class="settings-item" onclick="openBudgetModal('${b.id}')">
      <div class="settings-item-left">
        <span class="settings-item-icon">${b.emoji}</span>
        <span>${b.name}</span>
      </div>
      <div class="settings-item-right">€${b.limit}/mo ›</div>
    </div>`).join('');
}

// ── Import CSV ────────────────────────────────────────────────
function initImport() {
  const zone = document.getElementById('import-zone');
  const input = document.getElementById('csv-input');

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    processFiles(Array.from(e.dataTransfer.files));
  });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => processFiles(Array.from(input.files)));
}

async function processFiles(files) {
  let totalAdded = 0;
  const results = [];

  for (const file of files) {
    if (!file.name.match(/\.(csv|txt|tsv)$/i)) continue;
    const text = await file.text();
    try {
      const { txs, bank, rowCount } = parseCSVFile(text, file.name);
      const added = addTransactions(txs);
      totalAdded += added;
      results.push(`${file.name}: ${added} new transactions (${bank.toUpperCase()})`);
    } catch(err) {
      results.push(`${file.name}: Error - ${err.message}`);
    }
  }

  if (totalAdded > 0) {
    showToast(`✅ Imported ${totalAdded} transactions!`, 'success');
    renderPage(currentPage);
  } else if (files.length > 0) {
    showToast('No new transactions found (may be duplicates)', 'error');
  }

  // Show results in modal if multiple files
  if (results.length > 1) {
    alert(results.join('\n'));
  }

  document.getElementById('csv-input').value = '';
}

// ── Transaction Detail Modal ──────────────────────────────────
function openTxDetail(id) {
  const txs = DB.transactions;
  const t = txs.find(t => t.id === id);
  if (!t) return;
  const cat = CATEGORIES[t.category] || CATEGORIES.other;

  document.getElementById('modal-tx-title').textContent = t.description;
  document.getElementById('modal-tx-amount').textContent = `${t.amount>=0?'+':'−'}€${Math.abs(t.amount).toFixed(2)}`;
  document.getElementById('modal-tx-amount').style.color = t.amount >= 0 ? 'var(--em)' : 'var(--text)';
  document.getElementById('modal-tx-date').textContent = formatDate(t.date);
  document.getElementById('modal-tx-account').textContent = t.accountLabel || t.account.toUpperCase();
  document.getElementById('modal-tx-cat').textContent = `${cat.emoji} ${cat.label}`;

  // Category selector
  const sel = document.getElementById('modal-cat-select');
  sel.innerHTML = Object.entries(CATEGORIES).map(([k,v]) =>
    `<option value="${k}" ${k===t.category?'selected':''}>${v.emoji} ${v.label}</option>`
  ).join('');
  sel.onchange = () => {
    const updated = txs.map(tx => tx.id === id ? {...tx, category: sel.value} : tx);
    DB.transactions = updated;
    showToast('Category updated ✓', 'success');
    renderPage(currentPage);
  };

  openModal('modal-tx');
}

// ── Budget Modal ──────────────────────────────────────────────
function openBudgetModal(id) {
  const budgets = DB.budgets;
  const b = budgets.find(b => b.id === id);
  if (!b) return;

  document.getElementById('budget-modal-title').textContent = `${b.emoji} ${b.name}`;
  document.getElementById('budget-limit-input').value = b.limit;

  document.getElementById('save-budget-btn').onclick = () => {
    const newLimit = parseFloat(document.getElementById('budget-limit-input').value);
    if (isNaN(newLimit) || newLimit <= 0) { showToast('Enter a valid amount', 'error'); return; }
    DB.budgets = budgets.map(bgt => bgt.id === id ? {...bgt, limit: newLimit} : bgt);
    closeModal('modal-budget');
    showToast('Budget updated ✓', 'success');
    renderSettings();
  };

  openModal('modal-budget');
}

// ── Add Transaction Modal ─────────────────────────────────────
function openAddTxModal() {
  document.getElementById('add-tx-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('add-tx-cat').innerHTML = Object.entries(CATEGORIES).map(([k,v]) =>
    `<option value="${k}">${v.emoji} ${v.label}</option>`
  ).join('');
  openModal('modal-add-tx');
}

function saveManualTx() {
  const desc    = document.getElementById('add-tx-desc').value.trim();
  const amount  = parseFloat(document.getElementById('add-tx-amount').value);
  const date    = document.getElementById('add-tx-date').value;
  const account = document.getElementById('add-tx-account').value;
  const cat     = document.getElementById('add-tx-cat').value;
  const type    = document.getElementById('add-tx-type').value;

  if (!desc || isNaN(amount) || !date) { showToast('Fill in all fields', 'error'); return; }

  const tx = {
    id: `manual_${Date.now()}`,
    date, description: desc,
    amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
    account, accountLabel: account === 'kbc' ? 'KBC' : 'Beobank',
    category: cat, source: 'manual', balance: null
  };

  addTransactions([tx]);
  closeModal('modal-add-tx');
  showToast('Transaction added ✓', 'success');
  renderPage(currentPage);
}

// ── Modal helpers ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ── Seed demo data ────────────────────────────────────────────
function seedDemoData() {
  if (DB.transactions.length > 0) { showToast('Already have data — clear first to re-seed', 'error'); return; }

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const pad = n => String(n).padStart(2,'0');
  const d = (day) => `${y}-${pad(m)}-${pad(day)}`;
  const pm = (day) => { const pm = m === 1 ? 12 : m-1; const py = m === 1 ? y-1 : y; return `${py}-${pad(pm)}-${pad(day)}`; };

  const demo = [
    // This month KBC
    { date:d(1),  description:'Salary ACME Corp',      amount:2850,  account:'kbc', balance:3200 },
    { date:d(2),  description:'Colruyt Groceries',     amount:-78.5, account:'kbc', balance:3121.5 },
    { date:d(3),  description:'NMBS Train ticket',     amount:-24.8, account:'kbc', balance:3096.7 },
    { date:d(5),  description:'Huur appartement',      amount:-850,  account:'kbc', balance:2246.7 },
    { date:d(7),  description:'Delhaize Weekend shop', amount:-65.3, account:'kbc', balance:2181.4 },
    { date:d(9),  description:'Shell fuel',            amount:-58.2, account:'kbc', balance:2123.2 },
    { date:d(10), description:'Restaurant Le Jardin',  amount:-42.5, account:'kbc', balance:2080.7 },
    { date:d(12), description:'Carrefour',             amount:-34.6, account:'kbc', balance:2046.1 },
    { date:d(14), description:'De Lijn monthly pass',  amount:-34,   account:'kbc', balance:2012.1 },
    { date:d(15), description:'Proximus internet',     amount:-45,   account:'kbc', balance:1967.1 },
    { date:d(17), description:'Lidl groceries',        amount:-52.1, account:'kbc', balance:1915 },
    { date:d(20), description:'Apotheek pharmacie',    amount:-18.5, account:'kbc', balance:1896.5 },
    { date:d(22), description:'Bol.com book order',    amount:-29.9, account:'kbc', balance:1866.6 },
    { date:d(25), description:'Fritz & Co lunch',      amount:-16.8, account:'kbc', balance:1849.8 },
    // This month Beobank CC
    { date:d(1),  description:'Netflix subscription',  amount:-17.99, account:'beobank', balance:-17.99 },
    { date:d(3),  description:'Spotify Premium',       amount:-10.99, account:'beobank', balance:-28.98 },
    { date:d(6),  description:'Zara clothing',         amount:-89.5,  account:'beobank', balance:-118.48 },
    { date:d(8),  description:'Amazon.com order',      amount:-45.99, account:'beobank', balance:-164.47 },
    { date:d(11), description:'H&M online',            amount:-38.5,  account:'beobank', balance:-202.97 },
    { date:d(13), description:'Coolblue headphones',   amount:-79.0,  account:'beobank', balance:-281.97 },
    { date:d(18), description:'Decathlon sport',       amount:-34.9,  account:'beobank', balance:-316.87 },
    { date:d(21), description:'Disney+ subscription',  amount:-8.99,  account:'beobank', balance:-325.86 },
    { date:d(24), description:'McDonalds Antwerp',     amount:-14.5,  account:'beobank', balance:-340.36 },
    // Previous month KBC
    { date:pm(1),  description:'Salary ACME Corp',     amount:2850,  account:'kbc', balance:3100 },
    { date:pm(3),  description:'Carrefour Market',     amount:-92.3, account:'kbc', balance:3007.7 },
    { date:pm(5),  description:'Huur appartement',     amount:-850,  account:'kbc', balance:2157.7 },
    { date:pm(8),  description:'Q8 fuel station',      amount:-61.4, account:'kbc', balance:2096.3 },
    { date:pm(10), description:'NMBS Brussels',        amount:-18.4, account:'kbc', balance:2077.9 },
    { date:pm(15), description:'Telenet TV+internet',  amount:-72,   account:'kbc', balance:2005.9 },
    { date:pm(18), description:'Huisarts doctor',      amount:-25,   account:'kbc', balance:1980.9 },
    { date:pm(22), description:'Frituur local',        amount:-12.5, account:'kbc', balance:1968.4 },
    { date:pm(25), description:'Colruyt weekly',       amount:-84.2, account:'kbc', balance:1884.2 },
    // Previous month Beobank
    { date:pm(2),  description:'Netflix subscription', amount:-17.99, account:'beobank', balance:-17.99 },
    { date:pm(4),  description:'Spotify Premium',      amount:-10.99, account:'beobank', balance:-28.98 },
    { date:pm(7),  description:'Zalando shoes',        amount:-120,   account:'beobank', balance:-148.98 },
    { date:pm(12), description:'Apple.com/bill iCloud',amount:-0.99,  account:'beobank', balance:-149.97 },
    { date:pm(16), description:'Ikea home decor',      amount:-156.5, account:'beobank', balance:-306.47 },
    { date:pm(20), description:'Sushi restaurant',     amount:-38,    account:'beobank', balance:-344.47 },
  ];

  const txs = demo.map((t, i) => ({
    id: `demo_${i}`,
    ...t,
    accountLabel: t.account === 'kbc' ? 'KBC' : 'Beobank',
    category: autoCategory(t.description),
    source: 'demo',
  }));

  DB.transactions = txs.sort((a,b) => b.date.localeCompare(a.date));
  showToast(`✅ Loaded ${txs.length} demo transactions!`, 'success');
  renderPage(currentPage);
}

function clearAllData() {
  if (!confirm('Delete ALL transactions and data? This cannot be undone.')) return;
  localStorage.removeItem(DB.KEYS.transactions);
  showToast('All data cleared', 'success');
  renderPage(currentPage);
}

// ── Utilities ─────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initState();
  initImport();

  // Nav clicks
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) closeModal(el.id); });
  });

  // Transaction search
  const searchEl = document.getElementById('tx-search');
  if (searchEl) searchEl.addEventListener('input', () => renderTransactions());

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  navigate('dashboard');
});
