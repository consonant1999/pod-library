# pod-library

Jason 的私人 podcast feed。書/講義 → AI 雙人對談 → 運動時聽。

Feed URL: https://consonant1999.github.io/pod-library/feed.xml

## 結構

```
pod-library/
├── feed.xml              RSS feed(Apple Podcasts 讀這個)
├── cover.jpg             1400×1400 封面
├── scripts/
│   └── publish-rss.js    發布新集數(用 GitHub Releases 儲存音檔)
└── prompts/
    ├── notebooklm-prompt.md    方案 A:NotebookLM Customize 提示
    ├── prompt-digest.md        方案 B:書籍好理解重寫
    └── prompt-script.md        方案 B:雙人對談腳本
```

**音檔存哪**:直接放 `episodes/` 資料夾,靠 GitHub Pages serve。Apple Podcasts 需要正確的 `Content-Type: audio/mp4` 才能串流,GitHub Releases 會回傳 `attachment` header 導致無法播放。代價是 repo 會長大,~25 集撞到 1GB soft limit,屆時再遷到 R2。

## 產一集的完整流程(方案 A)

1. **準備素材**:PDF(> 200 頁先用 markitdown 抽重點)或 Obsidian 筆記
2. **(推薦)先產 digest**:Claude 跑 `prompts/prompt-digest.md` → 2000 字聚焦版
3. **NotebookLM 生成**:https://notebooklm.google.com/ → 上傳素材 → Studio → Audio Overview → Customize(貼 `prompts/notebooklm-prompt.md`)→ Generate
4. **試聽 + 下載**:check 品質 ≥ 3 項 → 下載 mp3
5. **發布**:

```bash
node ~/pod-library/scripts/publish-rss.js \
  ~/Downloads/audio.m4a \
  --title "原子習慣 - 習慣疊加的關鍵" \
  --desc "James Clear 的 3 個反直覺觀點 + 台灣上班族的實踐路徑"
```

Script 會:用 `gh release create` 建 release + 上傳音檔 → 更新 `feed.xml` → git push。1-2 分鐘後 Apple Podcasts 抓到。支援 `.mp3 .m4a .mp4 .aac`。

## 一次性設定(如果 fresh clone)

1. `brew install ffmpeg`(抓 duration 用)
2. `gh auth login`(發 release 用)
3. 放一張 `cover.jpg`(1400×1400)在 repo root
4. GitHub Pages 要開啟:Settings → Pages → Source: main / root
5. Apple Podcasts → Library → 「⋯」→ Add a Show by URL → 貼 feed URL

## 方案 A vs B

| | A (NotebookLM) | B (OpenAI TTS) |
|---|---|---|
| 成本 | 免費 | ≈ $0.05/集 |
| 工作量 | 上傳 + 點 Generate | Claude 生腳本 + 跑 TTS script |
| 客製化 | 低 | 高 |

先用 A 跑 3-5 集驗證。不滿意再上 B(prompt 已備好,只差 TTS 腳本)。

詳細計畫:`~/.claude/plans/podcast-prompt-generic-axolotl.md`
