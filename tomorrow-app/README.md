# Tomorrow

夜のうちに翌日のタスクを整理し、「明日なにから始めるか」で迷わないためのアプリです。

## 機能
- 明日のタスクを追加（タスク名・重要度 高/中/低・締切時間・予想所要時間）
- 明日のタスクだけを一覧表示し、おすすめ順に並べる（締切が近いもの・重要度が高いもの・所要時間が短いものを先に）
- チェックボックスで完了と未完了を切り替え（完了済みは末尾へ）
- タスクの編集と削除
- 進捗表示（`3 / 5 完了` と進捗率）
- localStorage に保存（キーは `tomorrow-tasks:v1`）

## 開発
```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

### スマホなど別の端末から開く場合
`npm run dev` は既定で `localhost` 以外からの開発用通信（HMR）を拒否します。拒否されると React が起動せず、ボタンが反応しない状態になります。
`next.config.ts` で、このマシン自身の IP アドレスは自動的に許可しています（例: `http://192.168.1.10:3000`）。
それ以外のホスト名やトンネル経由で開く場合は、次のように許可してください。

```bash
ALLOWED_DEV_ORIGINS=my-host.local,*.example.dev npm run dev
```

## 構成
```
app/page.tsx          画面全体
components/           Header / SummaryCard / TaskForm / TaskList / TaskItem
hooks/useTasks.ts     タスクの状態管理と localStorage への同期
lib/                  型・日付処理・おすすめ順の計算・保存処理
```

おすすめ順のスコア計算は `lib/sort.ts` を参照してください。
