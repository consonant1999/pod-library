#!/usr/bin/env node
/**
 * publish-rss.js — 發布音檔到 podcast RSS (GitHub Releases 版)
 *
 * 用法:
 *   node scripts/publish-rss.js <audio-path> --title "集名" --desc "描述" [--duration 秒數]
 *
 * 支援副檔名:.mp3, .m4a, .mp4, .aac
 *
 * 流程:
 *   1. gh release create → 上傳音檔為 release asset(tag = date-slug)
 *   2. 抓 asset 下載 URL
 *   3. 更新 feed.xml(插新 <item>, 正確 mime type)
 *   4. git add feed.xml → commit → push
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const REPO_SLUG = 'consonant1999/pod-library';
const FEED_URL = 'https://consonant1999.github.io/pod-library/feed.xml';
const INSERT_MARKER = '<!-- EPISODES_INSERT_HERE -->';

const MIME_MAP = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
};

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

function probeDuration(audioPath) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration',
       '-of', 'default=noprint_wrappers=1:nokey=1', audioPath],
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

function slugifyAscii(s) {
  // Git tag: ASCII only (Chinese chars cause URL/ref issues)
  return s.toLowerCase()
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function gitRun(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'inherit' });
}

function ghRun(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', ...opts });
}

function main() {
  const args = parseArgs(process.argv);
  const audioInput = args._[0];

  if (!audioInput || !args.title) {
    console.error('用法: node scripts/publish-rss.js <audio-path> --title "集名" --desc "描述" [--duration 秒數]');
    process.exit(1);
  }

  const audioSrc = path.resolve(audioInput);
  if (!fs.existsSync(audioSrc)) {
    console.error(`[error] 找不到音檔:${audioSrc}`);
    process.exit(1);
  }

  const ext = path.extname(audioSrc).toLowerCase();
  const mime = MIME_MAP[ext];
  if (!mime) {
    console.error(`[error] 不支援的副檔名 ${ext}。支援:${Object.keys(MIME_MAP).join(', ')}`);
    process.exit(1);
  }

  const feedPath = path.join(REPO_DIR, 'feed.xml');
  if (!fs.existsSync(feedPath)) {
    console.error(`[error] 找不到 feed.xml:${feedPath}`);
    process.exit(1);
  }

  const title = String(args.title);
  const desc = String(args.desc || title);
  const duration = args.duration ? parseInt(args.duration, 10) : probeDuration(audioSrc);
  if (!duration) {
    console.error('[error] 無法取得 duration,請傳 --duration <秒數>');
    process.exit(1);
  }

  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const asciiSlug = slugifyAscii(title) || 'ep';
  const tag = `${dateStr}-${asciiSlug}`;
  const size = fs.statSync(audioSrc).size;

  console.log(`[1/3] 建 release + 上傳 asset(${(size/1024/1024).toFixed(1)} MB,tag: ${tag})...`);
  ghRun([
    'release', 'create', tag, audioSrc,
    '--repo', REPO_SLUG,
    '--title', title,
    '--notes', desc,
  ], { stdio: 'inherit' });

  console.log('[2/3] 抓 asset 下載 URL...');
  const releaseJson = ghRun([
    'release', 'view', tag,
    '--repo', REPO_SLUG,
    '--json', 'assets',
  ]);
  const { assets } = JSON.parse(releaseJson);
  if (!assets || !assets.length) {
    console.error('[error] release 建立了但找不到 asset');
    process.exit(1);
  }
  const audioUrl = assets[0].url;
  console.log(`      ${audioUrl}`);

  const guid = `${REPO_SLUG}#${tag}`;

  const item = `    <item>
      <title>${escapeXml(title)}</title>
      <description>${escapeXml(desc)}</description>
      <pubDate>${rfc2822(date)}</pubDate>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <enclosure url="${audioUrl}" length="${size}" type="${mime}"/>
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

  console.log('[3/3] commit + push feed.xml...');
  try {
    gitRun(['add', 'feed.xml'], REPO_DIR);
    gitRun(['commit', '-m', `add: ${title}`], REPO_DIR);
    gitRun(['push'], REPO_DIR);
    console.log('\n[ok] 完成。1-2 分鐘後 Apple Podcasts 會抓到。');
    console.log(`[info] feed:    ${FEED_URL}`);
    console.log(`[info] release: https://github.com/${REPO_SLUG}/releases/tag/${encodeURIComponent(tag)}`);
  } catch (e) {
    console.error('[error] git 操作失敗:', e.message);
    process.exit(1);
  }
}

main();
