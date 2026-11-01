// ── Budget Tracker Charts ─────────────────────────────────────
// Wraps Chart.js with Budget Tracker's design system

const CHART_DEFAULTS = {
  font: { family: 'Inter', size: 11 },
  color: '#8896ab',
};

Chart.defaults.font.family = 'Inter';
Chart.defaults.color = '#8896ab';

const activeCharts = {};

function destroyChart(id) {
  if (activeCharts[id]) { activeCharts[id].destroy(); delete activeCharts[id]; }
}

// ── Donut — spending by category ─────────────────────────────
function renderDonut(canvasId, byCategory) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const cats = Object.entries(byCategory)
    .filter(([,v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!cats.length) {
    canvas.parentElement.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>No expense data yet</p></div>';
    return;
  }

  const labels = cats.map(([k]) => CATEGORIES[k]?.label || k);
  const data   = cats.map(([,v]) => parseFloat(v.toFixed(2)));
  const colors = cats.map(([k]) => CATEGORIES[k]?.color || '#6b7280');

  activeCharts[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#161b27', hoverBorderColor: '#0f1117' }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: €${ctx.parsed.toFixed(2)} (${((ctx.parsed / data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)`
          }
        }
      },
      animation: { animateRotate: true, duration: 600 }
    }
  });

  return cats;
}

// ── Bar — monthly comparison ──────────────────────────────────
function renderMonthlyBar(canvasId, monthlyData) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels   = monthlyData.map(m => m.label);
  const expenses = monthlyData.map(m => parseFloat(m.expenses.toFixed(2)));
  const income   = monthlyData.map(m => parseFloat(m.income.toFixed(2)));

  activeCharts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Expenses',
          data: expenses,
          backgroundColor: 'rgba(139,92,246,0.7)',
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: 'Income',
          data: income,
          backgroundColor: 'rgba(16,185,129,0.7)',
          borderRadius: 5,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 }
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: €${ctx.parsed.y.toFixed(2)}` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' } },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { callback: v => `€${v}` }
        }
      },
      animation: { duration: 500 }
    }
  });
}

// ── Line — balance over time ──────────────────────────────────
function renderBalanceLine(canvasId, txs) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Build running total per day
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const days = {}, runKBC = {}, runBeo = {};
  let cumKBC = 0, cumBeo = 0;
  for (const t of sorted) {
    if (t.account === 'kbc') { cumKBC += t.amount; runKBC[t.date] = cumKBC; }
    else { cumBeo += t.amount; runBeo[t.date] = cumBeo; }
    days[t.date] = true;
  }

  const labels = Object.keys(days).sort();
  // Fill forward
  let lastK = 0, lastB = 0;
  const kbcData = labels.map(d => { if (runKBC[d] !== undefined) lastK = runKBC[d]; return parseFloat(lastK.toFixed(2)); });
  const beoData = labels.map(d => { if (runBeo[d] !== undefined) lastB = runBeo[d]; return parseFloat(lastB.toFixed(2)); });

  activeCharts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'KBC',
          data: kbcData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'Beobank',
          data: beoData,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,0.08)',
          fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: €${ctx.parsed.y.toFixed(2)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => `€${v}` } }
      },
      animation: { duration: 400 }
    }
  });
}
