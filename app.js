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

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

let records = loadRecords();
let currentFilter = 'all';

/* ---------- DOM ---------- */
const micBtn = document.getElementById('micBtn');
const micLabel = document.getElementById('micLabel');
const transcriptEl = document.getElementById('transcript');
const recordList = document.getElementById('recordList');
const emptyState = document.getElementById('emptyState');
const toast = document.getElementById('toast');

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

// 从语音文本中提取 { type, category, amount }
function parseVoiceInput(raw) {
  const text = raw.replace(/\s+/g, '').replace(/块钱?|元钱?|圆/g, '元');

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

  // 提取项目名称：去掉数字、金额单位、收入关键词后剩余的中文
  let category = text
    .replace(/[\d,]+\.?\d*/g, '')
    .replace(/[零一二两三四五六七八九十百千万亿]+元?/g, '')
    .replace(/元|块|钱|的|了|花|花了|用了|支出|消费|付|付了|给/g, '');
  INCOME_STRIP.forEach((k) => { category = category.replace(k, ''); });
  category = category.trim();

  if (!category) category = isIncome ? '收入' : '其他';

  return { type, category, amount };
}

/* ---------- 记录操作 ---------- */
function addRecord({ type, category, amount }) {
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    category,
    amount: Math.round(amount * 100) / 100,
    time: new Date().toISOString(),
  };
  records.unshift(record);
  saveRecords(records);
  render();
}

function deleteRecord(id) {
  records = records.filter((r) => r.id !== id);
  saveRecords(records);
  render();
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
  const income = records.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expense = records.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  document.getElementById('totalIncome').textContent = fmt(income);
  document.getElementById('totalExpense').textContent = fmt(expense);
  document.getElementById('balance').textContent = fmt(income - expense);

  const visible = records.filter((r) => currentFilter === 'all' || r.type === currentFilter);
  recordList.innerHTML = '';
  emptyState.style.display = visible.length ? 'none' : 'block';

  visible.forEach((r) => {
    const li = document.createElement('li');
    li.className = `record-item ${r.type}`;
    const sign = r.type === 'income' ? '+' : '-';
    li.innerHTML = `
      <div class="info">
        <span class="cat">${escapeHtml(r.category)}</span>
        <span class="time">${fmtTime(r.time)}</span>
      </div>
      <div class="right">
        <span class="amt">${sign}${fmt(r.amount).slice(1)}</span>
        <button class="del-btn" aria-label="删除" data-id="${r.id}">✕</button>
      </div>`;
    recordList.appendChild(li);
  });
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
  showToast(`已记录 ${typeLabel}：${result.category} ${fmt(result.amount)}`);
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

/* ---------- 筛选 & 删除 ---------- */
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

/* ---------- 初始化 ---------- */
render();
