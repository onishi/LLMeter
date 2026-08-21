# LLMeter

Claude、Codex、GitHub Copilotの利用枠をターミナルで確認するCLIです。認証済みの公式CLIと公式APIから取得した実データだけを表示し、デモ値や推測値は使いません。

```text
$ llmeter
LLMeter                                                               UPDATED 8/18 09:37
────────────────────────────────────────────────────────────────────────────────────────
● Claude                                                           接続済み · 観測 09:37
  5時間         ████████████████░░  87%    ↻ 4時間13分後
  7日間         █████████░░░░░░░░░  51%    ↻ 8/20 01:00

● Codex · Plus                                                                  接続済み
  7日間         ████████████░░░░░░  67%    ↻ 8/20 12:35

● Copilot                                                                       接続済み
  今月 AI       ██████████████████  98%    ↻ 9/1 09:00

────────────────────────────────────────────────────────────────────────────────────────
接続 3/3                                                             --json で詳細を表示
```

## 必要環境

- Node.js 20以上
- Claude Code CLI
- Codex CLI
- GitHub CLI
- macOS（GitHubトークンのKeychain保存とClaudeの自動更新に使用）

## インストール

```bash
npm install
npm link
llmeter
```

グローバルリンクを作らずに試す場合は、`npm run cli`または`node bin/llmeter.mjs`を使えます。

## コマンド

```bash
llmeter                  # 利用枠をターミナル表示
llmeter --json           # 正規化済みJSONを出力
llmeter --watch 60       # 60秒ごとに再取得
llmeter --no-color       # ANSIカラーを無効化
llmeter refresh claude   # Claudeの5時間・7日間枠を再取得
llmeter auth github      # GitHub Copilotの利用量を接続
llmeter --help
```

`--json --watch 60`を組み合わせると、1行につき1スナップショットのNDJSONを出力します。

## データソース

| サービス | 取得元 | 表示内容 |
|---|---|---|
| Claude | Claude Code status lineの`rate_limits` | 5時間枠、7日間枠、リセット時刻 |
| Codex | Codex App Serverの`account/rateLimits/read` | プラン、利用枠、リセット時刻 |
| GitHub Copilot | GitHub Billing APIのAI credit usage | 月1,500 creditsを上限とした残量 |

取得できないサービスには理由を表示し、代替の数値は生成しません。

## Claudeを接続する

Claude Codeへログインします。

```bash
claude auth login
```

Claude Codeのstatus lineへ次を設定すると、応答後に5時間・7日間の利用枠が`~/.local/state/llmeter/claude-usage.json`へ保存されます。

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/LLMeter/scripts/claude-statusline.mjs",
    "padding": 0
  }
}
```

既存のstatus lineを残す場合は`scripts/claude-statusline-wrapper.mjs`を使えます。既存スクリプトのパスは`LLMETER_EXISTING_STATUSLINE`環境変数で指定してください（未設定時はllmeterの出力のみになります）。保存先は`LLMETER_STATE_DIR`環境変数で変更できます。

キャッシュを明示的に更新する場合は次を実行します。

```bash
llmeter refresh claude
```

このコマンドは公式Claude CLIの`/usage`を短時間だけ実行します。モデルへプロンプトを送らず、Claudeの認証情報を直接読み取りません。

## GitHub Copilotを接続する

GitHub CLIへログインした後、LLMeter専用のfine-grained personal access tokenを接続します。

```bash
gh auth login
llmeter auth github
```

トークンに必要なユーザー権限は`Plan: Read`だけです。トークンはmacOS Keychainの`dev.llmeter.github.plan`へ保存され、リポジトリやCLI出力には書き出されません。

ブラウザーを自動で開きたくない場合は`llmeter auth github --no-open`を使います。macOS以外では`LLMETER_GITHUB_TOKEN`環境変数を利用できます。

Copilotの利用量はBilling APIの`grossQuantity`を集計し、月間1,500 AI creditsから差し引いて残量を表示します。

## Codexを接続する

```bash
codex login
```

LLMeterはローカルのCodex App Serverを短時間だけ起動し、`account/rateLimits/read`から利用枠を取得します。

## 開発

```bash
npm run check
npm test
npm run cli -- --json
```

主な構成は次のとおりです。

```text
bin/llmeter.mjs                  CLIエントリポイント
src/cli.mjs                      引数解析とwatch実行
src/collect.mjs                  収集パイプライン
src/providers/*.mjs              サービス別アダプター
src/format.mjs                   ターミナル表示
src/claude-refresh.mjs           Claudeキャッシュ更新
src/github-auth.mjs              Copilot認証
scripts/claude-statusline.mjs     Claudeクォータ保存
```
