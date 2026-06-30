'use strict';

/* ---------- 存储 ---------- */
const STORAGE_KEY = 'voice-finance-records';

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveRecords(recs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recs));
}

let records = loadRecords();
let currentFilter = 'all';

// 仅未删除的记录（墓碑记录用于跨设备同步，不参与展示/统计）
function activeRecords() {
  return records.filter((r) => !r.deleted);
}

/* ---------- DOM ---------- */
const micBtn = document.getElementById('micBtn');
const micLabel = document.getElementById('micLabel');
const transcriptEl = document.getElementById('transcript');
const recordList = document.getElementById('recordList');
const emptyState = document.getElementById('emptyState');
const toast = document.getElementById('toast');
const chartMonth = document.getElementById('chartMonth');

/* ---------- 中文金额解析 ---------- */
const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000 };

// 将中文数字转换为阿拉伯数字，支持口语省略（“一千二”=1200，“两万三”=23000，“三十五”=35）
function parseChineseNumber(text) {
  let total = 0;
  let section = 0;
  let current = 0;
  let lastUnit = 0; // 最近一次出现的乘数单位（十/百/千/万/亿）
  let sawZero = false; // 上一个单位之后是否出现过“零”

  for (const ch of text) {
    if (ch === '零') { sawZero = true; continue; }
    if (CN_DIGITS[ch] !== undefined) {
      current = CN_DIGITS[ch];
    } else if (ch === '十' || ch === '百' || ch === '千') {
      const unit = CN_UNITS[ch];
      section += (current === 0 ? 1 : current) * unit;
      current = 0;
      lastUnit = unit;
      sawZero = false;
    } else if (ch === '万' || ch === '亿') {
      section += current;
      total += section * CN_UNITS[ch];
      section = 0;
      current = 0;
      lastUnit = CN_UNITS[ch];
      sawZero = false;
    }
  }

  // 处理结尾的口语省略：如“一千二”的“二”代表下一级单位
  if (current !== 0 && lastUnit >= 10 && !sawZero) {
    return total + section + current * (lastUnit / 10);
  }
  return total + section + current;
}

// 用于判定是否为收入
const INCOME_KEYWORDS = ['收入', '工资', '薪水', '进账', '收到', '报销', '红包', '退款', '奖金', '利息', '分红', '收款', '入账'];
// 仅用于从项目名称中剔除的通用动词（保留“工资/报销”等名词作为项目名）
const INCOME_STRIP = ['收入', '收到', '进账', '入账', '收款'];

// 将数字字符串（阿拉伯或中文）转为整数
function numFrom(s) {
  return /^\d+$/.test(s) ? parseInt(s, 10) : parseChineseNumber(s);
}

// 以某天为基准并保留当前时分秒，返回 ISO 时间
function dayWithNowTime(base) {
  const now = new Date();
  base.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return base;
}

// 从文本中识别日期，返回 { date, rest }；rest 为剔除日期词后的文本。未识别到则 date 为当天。
function parseDate(text) {
  const now = new Date();
  let rest = text;

  // 相对日期
  const rel = { 大前天: -3, 前天: -2, 昨天: -1, 今天: 0, 明天: 1 };
  for (const word in rel) {
    if (rest.includes(word)) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + rel[word]);
      return { date: dayWithNowTime(d), rest: rest.replace(word, '') };
    }
  }

  // 绝对日期：可选“X月” + “X号/X日”
  let month = now.getMonth() + 1;
  let day = null;
  const mMatch = rest.match(/(\d{1,2}|[一二两三四五六七八九十]+)月/);
  if (mMatch) {
    const mv = numFrom(mMatch[1]);
    if (mv >= 1 && mv <= 12) { month = mv; rest = rest.replace(mMatch[0], ''); }
  }
  const dMatch = rest.match(/(\d{1,2}|[一二两三四五六七八九十]+)[号日]/);
  if (dMatch) {
    const dv = numFrom(dMatch[1]);
    if (dv >= 1 && dv <= 31) { day = dv; rest = rest.replace(dMatch[0], ''); }
  }

  if (day === null && !mMatch) {
    return { date: now, rest }; // 未提及日期，默认当天
  }
  if (day === null) day = now.getDate();
  // 若指定月份晚于当前月份，视为去年（如年底录入“明年”不在此处理范围）
  let year = now.getFullYear();
  if (month > now.getMonth() + 1) year -= 1;
  return { date: dayWithNowTime(new Date(year, month - 1, day)), rest };
}

// 从语音文本中提取 { type, category, amount, group, time }
function parseVoiceInput(raw) {
  let text = raw.replace(/\s+/g, '').replace(/块钱?|元钱?|圆/g, '元');

  // 先识别并剔除日期词，避免“15号…35元”把日期当成金额
  const { date, rest } = parseDate(text);
  const fullText = text; // 保留原文用于分类
  text = rest;

  // 判定收入 / 支出
  const isIncome = INCOME_KEYWORDS.some((k) => text.includes(k));
  const type = isIncome ? 'income' : 'expense';

  // 1) 优先匹配阿拉伯数字金额：123、12.5、1,000
  let amount = null;
  const arabic = text.match(/(\d[\d,]*\.?\d*)\s*(万|千)?/);
  if (arabic && parseFloat(arabic[1].replace(/,/g, '')) > 0) {
    amount = parseFloat(arabic[1].replace(/,/g, ''));
    if (arabic[2] === '万') amount *= 10000;
    else if (arabic[2] === '千') amount *= 1000;
  } else {
    // 2) 匹配中文数字金额
    const cn = text.match(/[零一二两三四五六七八九十百千万亿]+/);
    if (cn) {
      const val = parseChineseNumber(cn[0]);
      if (val > 0) amount = val;
    }
  }

  // 提取项目名称：去掉数字、金额单位、日期残留词、收入关键词后剩余的中文
  let category = text
    .replace(/[\d,]+\.?\d*/g, '')
    .replace(/[零一二两三四五六七八九十百千万亿]+元?/g, '')
    .replace(/元|块|钱|号|日|月|的|了|花|花了|用了|支出|消费|付|付了|给/g, '');
  INCOME_STRIP.forEach((k) => { category = category.replace(k, ''); });
  category = category.trim();

  if (!category) category = isIncome ? '收入' : '其他';

  // 智能分类：依据原始文本归入分类组
  const group = window.Categories.classify(fullText).group;

  return { type, category, amount, group, time: date.toISOString() };
}

/* ---------- 记录操作 ---------- */
function addRecord({ type, category, amount, group, time }) {
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    category,
    group: group || window.Categories.classify(category).group,
    amount: Math.round(amount * 100) / 100,
    time: time || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deleted: false,
  };
  records.unshift(record);
  saveRecords(records);
  render();
  maybeAutoSync();
}

function deleteRecord(id) {
  // 软删除：保留墓碑记录以便跨设备同步删除
  const r = records.find((x) => x.id === id);
  if (!r) return;
  r.deleted = true;
  r.updatedAt = new Date().toISOString();
  saveRecords(records);
  render();
  maybeAutoSync();
}

/* ---------- 渲染 ---------- */
function fmt(n) {
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(iso) {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function render() {
  const active = activeRecords();
  const income = active.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expense = active.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  document.getElementById('totalIncome').textContent = fmt(income);
  document.getElementById('totalExpense').textContent = fmt(expense);
  document.getElementById('balance').textContent = fmt(income - expense);

  // 按日期升序排列（同月内 1→30 日依次排列；同一日的多笔分别单独显示，不去重）
  const visible = active
    .filter((r) => currentFilter === 'all' || r.type === currentFilter)
    .sort((a, b) => a.time.localeCompare(b.time));
  recordList.innerHTML = '';
  emptyState.style.display = visible.length ? 'none' : 'block';

  visible.forEach((r) => {
    const li = document.createElement('li');
    li.className = `record-item ${r.type}`;
    const sign = r.type === 'income' ? '+' : '-';
    const meta = window.Categories.groupMeta(r.group || '其他');
    li.innerHTML = `
      <div class="info">
        <span class="cat"><span class="cat-icon">${meta.icon}</span>${escapeHtml(r.category)}</span>
        <span class="time">${escapeHtml(r.group || '其他')} · ${fmtTime(r.time)}</span>
      </div>
      <div class="right">
        <span class="amt">${sign}${fmt(r.amount).slice(1)}</span>
        <button class="del-btn" aria-label="删除" data-id="${r.id}">✕</button>
      </div>`;
    recordList.appendChild(li);
  });

  // 更新统计图表
  const month = window.Charts.populateMonths(active, chartMonth);
  window.Charts.render(active, month);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showToast(msg, isError) {
  toast.textContent = msg;
  toast.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.className = 'toast'; }, 2600);
}

/* ---------- 导出 CSV ---------- */
function exportCsv() {
  const rows = activeRecords();
  if (!rows.length) {
    showToast('暂无记录可导出', true);
    return;
  }
  const header = ['日期时间', '类型', '分类', '项目', '金额'];
  const lines = rows
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => [
      new Date(r.time).toLocaleString('zh-CN'),
      r.type === 'income' ? '收入' : '支出',
      r.group || '其他',
      r.category,
      r.amount.toFixed(2),
    ]);
  const csv = [header, ...lines]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  // 加 BOM 以便 Excel 正确识别中文
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `语音记账_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('已导出 CSV');
}

/* ---------- 语音识别 ---------- */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    let finalText = '';
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += t;
      else interim += t;
    }
    transcriptEl.textContent = finalText || interim;
    if (finalText) handleVoiceResult(finalText);
  };

  recognition.onerror = (event) => {
    listening = false;
    setMicState(false);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      showToast('麦克风未授权，请在浏览器设置中允许使用麦克风', true);
    } else if (event.error === 'no-speech') {
      showToast('没有听到声音，请再试一次', true);
    } else {
      showToast('语音识别出错：' + event.error, true);
    }
  };

  recognition.onend = () => {
    listening = false;
    setMicState(false);
  };
} else {
  micBtn.disabled = true;
  micLabel.textContent = '当前浏览器不支持语音';
  showToast('此浏览器不支持语音识别，请使用 Chrome / Edge，或手动录入', true);
}

function handleVoiceResult(text) {
  const result = parseVoiceInput(text);
  if (!result.amount || result.amount <= 0) {
    showToast(`未识别到金额：“${text}”，请重试或手动录入`, true);
    return;
  }
  addRecord(result);
  const typeLabel = result.type === 'income' ? '收入' : '支出';
  const d = new Date(result.time);
  showToast(`已记录 ${d.getMonth() + 1}月${d.getDate()}日 ${typeLabel}·${result.group}：${result.category} ${fmt(result.amount)}`);
}

function setMicState(on) {
  micBtn.classList.toggle('listening', on);
  micLabel.textContent = on ? '正在聆听…' : '按住或点击说话';
  if (!on) setTimeout(() => { transcriptEl.textContent = ''; }, 1500);
}

function toggleListen() {
  if (!recognition) return;
  if (listening) {
    recognition.stop();
    return;
  }
  try {
    transcriptEl.textContent = '';
    recognition.start();
    listening = true;
    setMicState(true);
  } catch (e) {
    // start() 在已运行时会抛错，忽略即可
  }
}

micBtn.addEventListener('click', toggleListen);

/* ---------- 手动录入 ---------- */
document.getElementById('manualForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const type = document.querySelector('input[name="type"]:checked').value;
  const category = document.getElementById('category').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  if (!category || !(amount > 0)) {
    showToast('请填写有效的项目和金额', true);
    return;
  }
  addRecord({ type, category, amount });
  e.target.reset();
  showToast('已添加记录');
});

/* ---------- 筛选 / 删除 / 导出 / 月份切换 ---------- */
document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

recordList.addEventListener('click', (e) => {
  const btn = e.target.closest('.del-btn');
  if (btn) deleteRecord(btn.dataset.id);
});

document.getElementById('exportBtn').addEventListener('click', exportCsv);

chartMonth.addEventListener('change', () => {
  window.Charts.render(activeRecords(), chartMonth.value);
});

/* ---------- 云同步 ---------- */
const syncStatusEl = document.getElementById('syncStatus');

function setSyncStatus(short, toastMsg, isError) {
  syncStatusEl.textContent = short ? '· ' + short : '';
  if (toastMsg) showToast(toastMsg, isError);
}

// 注入 sync.js 所需的回调
window.Sync.hooks.getRecords = () => records;
window.Sync.hooks.setRecords = (merged) => {
  records = merged;
  saveRecords(records);
  render();
};
window.Sync.hooks.onStatus = setSyncStatus;

let autoSyncTimer = null;
function maybeAutoSync() {
  const cfg = window.Sync.getConfig();
  if (!cfg.auto || !window.Sync.isConfigured()) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => window.Sync.syncNow(true), 1200);
}

function loadSyncSettings() {
  const cfg = window.Sync.getConfig();
  document.getElementById('syncUrl').value = cfg.url || '';
  document.getElementById('syncAccount').value = cfg.account || '';
  document.getElementById('autoSync').checked = !!cfg.auto;
  if (window.Sync.isConfigured()) setSyncStatus('已配置');
}

document.getElementById('saveSyncBtn').addEventListener('click', () => {
  window.Sync.saveConfig({
    url: document.getElementById('syncUrl').value.trim(),
    account: document.getElementById('syncAccount').value.trim(),
    auto: document.getElementById('autoSync').checked,
  });
  setSyncStatus(window.Sync.isConfigured() ? '已配置' : '', '已保存同步设置');
});

document.getElementById('syncNowBtn').addEventListener('click', () => window.Sync.syncNow(false));

/* ---------- 初始化 ---------- */
loadSyncSettings();
render();
// 启动时若已配置同步，自动拉取一次
if (window.Sync.isConfigured()) window.Sync.syncNow(true);
