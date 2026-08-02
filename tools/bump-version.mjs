#!/usr/bin/env node
/**
 * LIMU 版本號同步工具
 * ---------------------------------------------------------------------------
 * 版本識別散在 9 個地方（index.html 5 處、sw.js 3 處、version.json 4 欄）。
 * 手動同步至少出過兩次事：
 *   - 有一版 sw.js 被一行有副作用的批次指令清成 0 byte，
 *     是碰巧 grep 沒輸出才發現；
 *   - 有一版開場控制器與 APP_VERSION 各存一份版本字串，差點不同步。
 *
 * 這支腳本把「改版」變成單一指令，並在寫檔前後各驗證一次。
 *
 * 用法：
 *   node tools/bump-version.mjs patch        # 20.57.0 → 20.58.0
 *   node tools/bump-version.mjs 20.60.0      # 指定版本
 *   node tools/bump-version.mjs --check      # 只檢查一致性，不改任何檔案
 *
 * 註：LIMU 的慣例是次版號進位（20.57 → 20.58），patch 即為此意。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = {
  index: join(ROOT, 'index.html'),
  sw: join(ROOT, 'sw.js'),
  version: join(ROOT, 'version.json'),
  readme: join(ROOT, 'README-部署說明.md'),
};

// ── 版本識別的所有出處 ─────────────────────────────────────────────────────
// 每一項：檔案、正規式（含一個擷取群組 = 要替換的值）、該值的產生方式
const FIELDS = [
  { file: 'index', re: /(window\.__LIMU_VERSION = ')([\d.]+)(')/,        make: v => v.version },
  { file: 'index', re: /(\|\| ")([\d.]+)(";)/,                            make: v => v.version },
  { file: 'index', re: /(APP_BUILD_ID = ")([^"]+)(")/,                    make: v => v.buildId },
  { file: 'index', re: /(APP_CACHE_NAME = ")([^"]+)(")/,                  make: v => v.cacheName },
  { file: 'index', re: /(SW_BUILD_ID = ')([^']+)(')/,                     make: v => v.buildId },
  { file: 'index', re: /(SW_CACHE_NAME = ')([^']+)(')/,                   make: v => v.cacheName },
  { file: 'sw',    re: /(const CACHE_NAME = ')([^']+)(')/,                make: v => v.cacheName },
  { file: 'sw',    re: /(const BUILD_ID = ')([^']+)(')/,                  make: v => v.buildId },
  { file: 'sw',    re: /(const DEPLOYMENT_MARKER = ')([^']+)(')/,         make: v => `${v.buildId}|${v.cacheName}` },
];

function readAll() {
  const out = {};
  for (const [key, path] of Object.entries(F)) {
    if (!existsSync(path)) throw new Error(`找不到檔案：${path}`);
    const text = readFileSync(path, 'utf8');
    if (!text.length) throw new Error(`${path} 是空的——請先還原，不要在這個狀態改版`);
    out[key] = text;
  }
  return out;
}

function derive(version) {
  const short = 'v' + version.split('.').slice(0, 2).join('-').replace('.', '-');
  const date = JSON.parse(readFileSync(F.version, 'utf8')).buildDate || todayStamp();
  return {
    version,
    short,
    buildId: `limu-teacher-${short}-${date.replace(/-/g, '')}`,
    cacheName: `hw-tracker-${short}`,
    buildDate: date,
  };
}

function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function bumpMinor(version) {
  const [maj, min] = version.split('.');
  return `${maj}.${Number(min) + 1}.0`;
}

/** 逐項比對；回傳不一致的清單 */
function check(files, expect) {
  const problems = [];
  for (const f of FIELDS) {
    const m = files[f.file].match(f.re);
    if (!m) { problems.push(`${f.file}：找不到 ${f.re}`); continue; }
    const want = f.make(expect);
    if (m[2] !== want) problems.push(`${f.file}：${m[2]} ≠ ${want}`);
  }
  const vj = JSON.parse(files.version);
  for (const k of ['version', 'buildId', 'cacheName']) {
    if (vj[k] !== expect[k]) problems.push(`version.json.${k}：${vj[k]} ≠ ${expect[k]}`);
  }
  return problems;
}

function apply(files, next) {
  const out = { ...files };
  for (const f of FIELDS) {
    const before = out[f.file];
    out[f.file] = before.replace(f.re, (_, a, __, c) => a + f.make(next) + c);
    if (out[f.file] === before && !f.re.test(before)) throw new Error(`${f.file}：套用失敗 ${f.re}`);
  }
  const vj = JSON.parse(files.version);
  vj.version = next.version;
  vj.buildId = next.buildId;
  vj.cacheName = next.cacheName;
  out.version = JSON.stringify(vj, null, 2) + '\n';

  // README 的版本識別區塊
  out.readme = files.readme
    .replace(/# LIMU 教師專用小工具 v[\d.]+/, `# LIMU 教師專用小工具 v${next.version.split('.').slice(0,2).join('.')}`)
    .replace(/- App：`[\d.]+`/, `- App：\`${next.version}\``)
    .replace(/- 建置：`[^`]+`/, `- 建置：\`${next.buildId}\``)
    .replace(/- 快取：`[^`]+`/, `- 快取：\`${next.cacheName}\``)
    .replace(/CHANGELOG-v[\d.]+\.md/g, `CHANGELOG-v${next.version.split('.').slice(0,2).join('.')}.md`);
  return out;
}

// ── 主流程 ────────────────────────────────────────────────────────────────
const arg = process.argv[2];
const files = readAll();
const current = JSON.parse(files.version).version;

if (arg === '--check' || !arg) {
  const problems = check(files, derive(current));
  if (problems.length) {
    console.error(`✗ 版本識別不一致（目前 ${current}）：`);
    problems.forEach(p => console.error('  -', p));
    process.exit(1);
  }
  console.log(`✓ 版本識別一致：${current}`);
  process.exit(0);
}

const target = arg === 'patch' || arg === 'minor' ? bumpMinor(current) : arg;
if (!/^\d+\.\d+\.\d+$/.test(target)) {
  console.error(`✗ 版本格式應為 x.y.z，收到：${target}`);
  process.exit(1);
}

const next = derive(target);
const updated = apply(files, next);

// 寫檔前先驗證：每個檔案都不得為空、且新版本字串確實已出現
for (const [key, text] of Object.entries(updated)) {
  if (!text || !text.length) { console.error(`✗ ${key} 產生了空內容，已中止，未寫入任何檔案`); process.exit(1); }
}
if (!updated.index.includes(next.buildId) || !updated.sw.includes(next.cacheName)) {
  console.error('✗ 替換後找不到新的版本識別，已中止，未寫入任何檔案');
  process.exit(1);
}

for (const [key, path] of Object.entries(F)) writeFileSync(path, updated[key]);

// 寫檔後再驗證一次
const after = readAll();
const problems = check(after, next);
if (problems.length) {
  console.error('✗ 寫入後仍不一致：');
  problems.forEach(p => console.error('  -', p));
  process.exit(1);
}

console.log(`✓ ${current} → ${next.version}`);
console.log(`  建置 ${next.buildId}`);
console.log(`  快取 ${next.cacheName}`);
console.log(`  已同步 index.html（6 處）、sw.js（3 處）、version.json、README`);
