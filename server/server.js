'use strict';

/*
 * 语音记账云同步后端（零依赖，仅用 Node 内置模块）。
 *
 * 接口：
 *   GET  /api/health        健康检查
 *   POST /api/sync          { account, records: [...] }  ->  { records: [...] }
 *
 * 数据按“同步码（account）”分组，存于 data/ 目录下的 JSON 文件。
 * 合并策略：按 id 取 updatedAt 较新者（last-write-wins），删除以墓碑（deleted=true）形式同步。
 *
 * 启动：PORT=3001 DATA_DIR=./data node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAX_BODY = 5 * 1024 * 1024; // 5MB
const MAX_RECORDS = 50000;

fs.mkdirSync(DATA_DIR, { recursive: true });

function fileFor(account) {
  const hash = crypto.createHash('sha256').update(account).digest('hex');
  return path.join(DATA_DIR, hash + '.json');
}

function readStore(account) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(account), 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeStore(account, records) {
  const file = fileFor(account);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(records));
  fs.renameSync(tmp, file); // 原子写入，避免写一半损坏
}

// 校验单条记录的最小结构
function validRecord(r) {
  return r && typeof r.id === 'string' && r.id.length <= 64
    && (r.type === 'income' || r.type === 'expense')
    && typeof r.amount === 'number' && isFinite(r.amount)
    && typeof r.time === 'string'
    && typeof r.updatedAt === 'string';
}

// 合并：以 id 为键，保留 updatedAt 较新的版本
function merge(stored, incoming) {
  const map = new Map();
  for (const r of stored) map.set(r.id, r);
  for (const r of incoming) {
    if (!validRecord(r)) continue;
    const existing = map.get(r.id);
    if (!existing || (r.updatedAt || '') >= (existing.updatedAt || '')) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/sync') {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      const account = typeof payload.account === 'string' ? payload.account.trim() : '';
      const incoming = Array.isArray(payload.records) ? payload.records : null;

      if (!account || account.length > 128) {
        return sendJson(res, 400, { error: '无效的同步码' });
      }
      if (!incoming || incoming.length > MAX_RECORDS) {
        return sendJson(res, 400, { error: '无效的记录数据' });
      }

      const stored = readStore(account);
      const merged = merge(stored, incoming);
      writeStore(account, merged);
      return sendJson(res, 200, { records: merged });
    } catch (err) {
      return sendJson(res, 400, { error: '处理失败：' + err.message });
    }
  }

  sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`语音记账同步服务已启动： http://localhost:${PORT}  (数据目录：${DATA_DIR})`);
});
