'use strict';

/* 统计图表：纯 DOM/CSS 实现，无第三方依赖。 */

function ym(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMoney(n) {
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 填充月份下拉框（含“全部”及有数据的月份），返回应选中的值
function populateMonths(records, selectEl) {
  const months = [...new Set(records.map((r) => r.time.slice(0, 7)))].sort().reverse();
  const current = ym(new Date());
  if (!months.includes(current)) months.unshift(current);
  const prev = selectEl.value;
  selectEl.innerHTML = months
    .map((m) => `<option value="${m}">${m.replace('-', '年') + '月'}</option>`)
    .join('');
  selectEl.value = months.includes(prev) ? prev : current;
  return selectEl.value;
}

// 近 6 个月收支柱状图
function renderMonthly(records, container) {
  const now = new Date();
  const buckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: ym(d), label: `${d.getMonth() + 1}月`, income: 0, expense: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  records.forEach((r) => {
    const b = byKey[r.time.slice(0, 7)];
    if (b) b[r.type] += r.amount;
  });

  const max = Math.max(1, ...buckets.flatMap((b) => [b.income, b.expense]));
  container.innerHTML = buckets
    .map((b) => `
      <div class="bar-col" title="收入 ${fmtMoney(b.income)} / 支出 ${fmtMoney(b.expense)}">
        <div class="bars">
          <div class="bar income" style="height:${(b.income / max) * 100}%"></div>
          <div class="bar expense" style="height:${(b.expense / max) * 100}%"></div>
        </div>
        <span class="bar-label">${b.label}</span>
      </div>`)
    .join('');
}

// 指定月份的支出分类占比
function renderCategory(records, month, container) {
  const rows = records.filter((r) => r.type === 'expense' && r.time.slice(0, 7) === month);
  if (!rows.length) {
    container.innerHTML = '<p class="chart-empty">本月暂无支出记录</p>';
    return;
  }
  const totals = {};
  rows.forEach((r) => {
    const g = r.group || '其他';
    totals[g] = (totals[g] || 0) + r.amount;
  });
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  container.innerHTML = sorted
    .map(([group, amount]) => {
      const meta = window.Categories.groupMeta(group);
      const pct = (amount / sum) * 100;
      return `
        <div class="cat-row">
          <span class="cat-name">${meta.icon} ${group}</span>
          <div class="cat-bar-wrap">
            <div class="cat-bar" style="width:${pct}%;background:${meta.color}"></div>
          </div>
          <span class="cat-amt">${fmtMoney(amount)} · ${pct.toFixed(0)}%</span>
        </div>`;
    })
    .join('');
}

function render(records, month) {
  renderMonthly(records, document.getElementById('monthlyChart'));
  renderCategory(records, month, document.getElementById('categoryChart'));
}

window.Charts = { render, populateMonths };
