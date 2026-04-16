#!/usr/bin/env node
/**
 * publish-rss.js - 把 mp3 發布到私人 podcast RSS
 *
 * 用法:
 *   node scripts/publish-rss.js <mp3-path> --title "集名" --desc "一句描述" [--duration 1200]
 *
 *   可在任何目錄跑,script 自己會定位到 pod-library repo root。
 *   --duration 單位:秒。省略會用 ffprobe 自動抓(需 brew install ffmpeg)
 *
 * 流程:
 *   1. 複製 mp3 到 episodes/(如果還沒在裡面)
 *   2. 讀 feed.xml,插新 <item>
 *   3. git add + commit + push
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'https://consonant1999.github.io/pod-library';
const INSERT_MARKER = '<!-- EPISODES_INSERT_HERE -->';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function probeDuration(mp3Path) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration',
       '-of', 'default=noprint_wrappers=1:nokey=1', mp3Path],
      { encoding: 'utf8' }
    );
    return Math.round(parseFloat(out.trim()));
  } catch (e) {
    console.warn('[warn] ffprobe 失敗,請傳 --duration 或裝 ffmpeg:', e.message);
    return null;
  }
}

function secondsToHMS(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function rfc2822(d = new Date()) {
  return d.toUTCString();
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function gitRun(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'inherit' });
}

function main() {
  const args = parseArgs(process.argv);
  const mp3Input = args._[0];

  if (!mp3Input || !args.title) {
    console.error('用法: node scripts/publish-rss.js <mp3-path> --title "集名" --desc "描述" [--duration 秒數]');
    process.exit(1);
  }

  const mp3Src = path.resolve(mp3Input);
  if (!fs.existsSync(mp3Src)) {
    console.error(`[error] 找不到 mp3:${mp3Src}`);
    process.exit(1);
  }

  const feedPath = path.join(REPO_DIR, 'feed.xml');
  if (!fs.existsSync(feedPath)) {
    console.error(`[error] 找不到 feed.xml:${feedPath}`);
    process.exit(1);
  }

  const title = String(args.title);
  const desc = String(args.desc || title);
  const duration = args.duration ? parseInt(args.duration, 10) : probeDuration(mp3Src);
  if (!duration) {
    console.error('[error] 無法取得 duration,請傳 --duration <秒數>');
    process.exit(1);
  }

  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const filename = `${dateStr}-${slugify(title)}.mp3`;
  const episodesDir = path.join(REPO_DIR, 'episodes');
  const mp3Dst = path.join(episodesDir, filename);

  fs.mkdirSync(episodesDir, { recursive: true });

  // 如果 mp3 不在 repo/episodes/ 裡 → 複製進去
  if (path.resolve(mp3Src) !== path.resolve(mp3Dst)) {
    fs.copyFileSync(mp3Src, mp3Dst);
    console.log(`[ok] 複製 mp3 → episodes/${filename}`);
  } else {
    console.log(`[ok] mp3 已在 episodes/${filename}`);
  }
  const size = fs.statSync(mp3Dst).size;
  console.log(`      大小:${(size/1024/1024).toFixed(1)} MB`);

  const mp3Url = `${BASE_URL}/episodes/${encodeURIComponent(filename)}`;
  const guid = `${BASE_URL}/${dateStr}-${slugify(title)}`;

  const item = `    <item>
      <title>${escapeXml(title)}</title>
      <description>${escapeXml(desc)}</description>
      <pubDate>${rfc2822(date)}</pubDate>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <enclosure url="${mp3Url}" length="${size}" type="audio/mpeg"/>
      <itunes:duration>${secondsToHMS(duration)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>
    </item>
    ${INSERT_MARKER}`;

  let feed = fs.readFileSync(feedPath, 'utf8');
  if (!feed.includes(INSERT_MARKER)) {
    console.error(`[error] feed.xml 裡找不到 ${INSERT_MARKER}`);
    process.exit(1);
  }
  feed = feed.replace(INSERT_MARKER, item);
  fs.writeFileSync(feedPath, feed);
  console.log('[ok] 更新 feed.xml');

  try {
    gitRun(['add', '.'], REPO_DIR);
    gitRun(['commit', '-m', `add: ${title}`], REPO_DIR);
    gitRun(['push'], REPO_DIR);
    console.log('[ok] 已 push。1-2 分鐘後 Apple Podcasts 會抓到。');
    console.log(`[info] feed URL: ${BASE_URL}/feed.xml`);
  } catch (e) {
    console.error('[error] git 操作失敗:', e.message);
    process.exit(1);
  }
}

main();
