// ── Budget Tracker Data Layer ─────────────────────────────────
// All data lives in localStorage. No server needed.

const DB = {
  KEYS: { transactions: 'gf_txs', budgets: 'gf_budgets', settings: 'gf_settings' },

  get transactions() { return JSON.parse(localStorage.getItem(this.KEYS.transactions) || '[]'); },
  set transactions(v) { localStorage.setItem(this.KEYS.transactions, JSON.stringify(v)); },

  get budgets() {
    const defaults = [
      { id: 'food',      name: 'Groceries',     emoji: '🛒', limit: 400, cat: 'food' },
      { id: 'dining',    name: 'Dining Out',     emoji: '🍽️', limit: 150, cat: 'dining' },
      { id: 'transport', name: 'Transport',      emoji: '🚗', limit: 150, cat: 'transport' },
      { id: 'shopping',  name: 'Shopping',       emoji: '🛍️', limit: 200, cat: 'shopping' },
      { id: 'subs',      name: 'Subscriptions',  emoji: '📱', limit: 60,  cat: 'subs' },
      { id: 'health',    name: 'Health',         emoji: '💊', limit: 80,  cat: 'health' },
    ];
    return JSON.parse(localStorage.getItem(this.KEYS.budgets) || JSON.stringify(defaults));
  },
  set budgets(v) { localStorage.setItem(this.KEYS.budgets, JSON.stringify(v)); },

  get settings() {
    return JSON.parse(localStorage.getItem(this.KEYS.settings) || JSON.stringify({
      currency: '€', name: 'My Finances',
      accounts: {
        kbc:     { name: 'KBC Current Account',   enabled: true },
        beobank: { name: 'Beobank Credit Card',    enabled: true },
      }
    }));
  },
  set settings(v) { localStorage.setItem(this.KEYS.settings, JSON.stringify(v)); },
};

// ── Category helpers ─────────────────────────────────────────
const CATEGORIES = {
  food:      { label: 'Groceries',    emoji: '🛒', color: '#f59e0b', cls: 'cat-food' },
  dining:    { label: 'Dining Out',   emoji: '🍽️', color: '#f97316', cls: 'cat-dining' },
  transport: { label: 'Transport',    emoji: '🚗', color: '#3b82f6', cls: 'cat-transport' },
  shopping:  { label: 'Shopping',     emoji: '🛍️', color: '#ec4899', cls: 'cat-shopping' },
  health:    { label: 'Health',       emoji: '💊', color: '#10b981', cls: 'cat-health' },
  subs:      { label: 'Subscriptions',emoji: '📱', color: '#8b5cf6', cls: 'cat-subs' },
  bills:     { label: 'Bills',        emoji: '🏠', color: '#64748b', cls: 'cat-bills' },
  income:    { label: 'Income',       emoji: '💰', color: '#10b981', cls: 'cat-income' },
  other:     { label: 'Other',        emoji: '📦', color: '#6b7280', cls: 'cat-other' },
};

// Keyword → category mapping
const CAT_RULES = [
  { cat: 'food',      kw: ['carrefour','colruyt','delhaize','lidl','aldi','albert heijn','spar','okay','cru','supermarkt','supermarket','groceri','bioplanet','fresh'] },
  { cat: 'dining',    kw: ['restaurant','mcdonalds','mcdonald','burger king','subway','pizza','kebab','sushi','cafe','kfc','quick','night','bar ','brasserie','frituur'] },
  { cat: 'transport', kw: ['nmbs','sncb','de lijn','stib','mivb','parking','fuel','q8','shell','total','esso','bp ','buurtparkeer','velo','lime','bolt ride','uber','cabify','taxistop'] },
  { cat: 'shopping',  kw: ['amazon','bol.com','zara','h&m','fnac','mediamarkt','coolblue','zalando','primark','ikea','decathlon','jbc','c&a'] },
  { cat: 'health',    kw: ['apotheek','pharmacie','pharmacy','doctor','dokter','medic','dentist','tandarts','ziekenhuis','hospital','gym','fitness','sport'] },
  { cat: 'subs',      kw: ['netflix','spotify','disney','youtube','apple.com/bill','google one','microsoft','adobe','deezer','prime video','hbo','voo ','telenet','proximus','orange','base mobile'] },
  { cat: 'bills',     kw: ['huur','loyer','rent','electricit','water','gas ','versichering','insurance','belast','impot','taxes','syndic'] },
  { cat: 'income',    kw: ['salary','salaire','loon','wedde','interim','payment from','overschrijving van','virement de'] },
];

function autoCategory(description) {
  const d = description.toLowerCase();
  for (const rule of CAT_RULES) {
    if (rule.kw.some(k => d.includes(k))) return rule.cat;
  }
  return 'other';
}

// ── Transaction helpers ───────────────────────────────────────
function addTransactions(newTxs) {
  const existing = DB.transactions;
  // Deduplicate by composite key
  const existingKeys = new Set(existing.map(t => `${t.date}|${t.amount}|${t.description}`));
  const fresh = newTxs.filter(t => !existingKeys.has(`${t.date}|${t.amount}|${t.description}`));
  DB.transactions = [...fresh, ...existing].sort((a, b) => b.date.localeCompare(a.date));
  return fresh.length;
}

function getTransactionsForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return DB.transactions.filter(t => t.date.startsWith(prefix));
}

function getMonthlyStats(year, month) {
  const txs = getTransactionsForMonth(year, month);
  const income   = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = income - expenses;

  const byCategory = {};
  for (const t of txs.filter(t => t.amount < 0)) {
    byCategory[t.category] = (byCategory[t.category] || 0) + Math.abs(t.amount);
  }

  const byAccount = { kbc: 0, beobank: 0 };
  for (const t of txs.filter(t => t.amount < 0)) {
    byAccount[t.account] = (byAccount[t.account] || 0) + Math.abs(t.amount);
  }

  return { income, expenses, net, byCategory, byAccount, count: txs.length };
}

function getAccountBalances() {
  const txs = DB.transactions;
  const balances = { kbc: null, beobank: null };
  // Use the most recent balance snapshot if available, else sum
  const kbcTx = txs.find(t => t.account === 'kbc' && t.balance != null);
  const beobankTx = txs.find(t => t.account === 'beobank' && t.balance != null);
  if (kbcTx) balances.kbc = kbcTx.balance;
  if (beobankTx) balances.beobank = beobankTx.balance;
  return balances;
}

function getLast6MonthsStats() {
  const now = new Date();
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const stats = getMonthlyStats(d.getFullYear(), d.getMonth() + 1);
    result.push({
      label: d.toLocaleString('en', { month: 'short' }),
      ...stats
    });
  }
  return result;
}

function getBudgetProgress(year, month) {
  const budgets = DB.budgets;
  const txs = getTransactionsForMonth(year, month).filter(t => t.amount < 0);
  return budgets.map(b => {
    const spent = txs.filter(t => t.category === b.cat).reduce((s, t) => s + Math.abs(t.amount), 0);
    const pct = Math.min((spent / b.limit) * 100, 999);
    return { ...b, spent, pct };
  });
}

function fmt(amount) {
  const s = DB.settings;
  return `${s.currency}${Math.abs(amount).toFixed(2)}`;
}

function fmtSigned(amount) {
  const s = DB.settings;
  return amount >= 0 ? `+${s.currency}${amount.toFixed(2)}` : `-${s.currency}${Math.abs(amount).toFixed(2)}`;
}
