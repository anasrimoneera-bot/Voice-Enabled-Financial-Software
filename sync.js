'use strict';

/* 云同步：与后端 /sync 接口交换记录。服务器按“同步码”分组存储并合并，返回权威结果。 */

const SYNC_CONFIG_KEY = 'voice-finance-sync';

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)) || { url: '', account: '', auto: false };
  } catch (e) {
    return { url: '', account: '', auto: false };
  }
}

function saveConfig(cfg) {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(cfg));
}

function isConfigured() {
  const c = getConfig();
  return !!(c.url && c.account);
}

// hooks 由 app.js 注入：{ getRecords, setRecords, onStatus }
const hooks = {};

async function syncNow(silent) {
  const cfg = getConfig();
  if (!cfg.url || !cfg.account) {
    if (!silent) hooks.onStatus('未配置', '请先填写服务器地址与同步码', true);
    return;
  }
  hooks.onStatus('同步中…', '');
  try {
    const endpoint = cfg.url.replace(/\/+$/, '') + '/sync';
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: cfg.account, records: hooks.getRecords() }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (!Array.isArray(data.records)) throw new Error('返回数据格式错误');
    hooks.setRecords(data.records);
    const t = new Date();
    hooks.onStatus('已同步 ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'), '同步成功');
  } catch (err) {
    hooks.onStatus('同步失败', '同步失败：' + err.message, true);
  }
}

window.Sync = { getConfig, saveConfig, isConfigured, syncNow, hooks };
