# SaaS-Product

塾運営まわりの SaaS を 2 つのアプリとして開発しているリポジトリです。
利用者も技術スタックも別なので、ディレクトリを分けて管理しています。

| ディレクトリ | アプリ | 対象ユーザー | 技術スタック |
| --- | --- | --- | --- |
| [`juku-app/`](./juku-app) | **LuBo School** — 塾運営支援システム | 生徒・保護者・講師・教室管理者 | Node.js 標準機能のみ（依存パッケージなし・JSON 永続化） |
| [`juku_HR/`](./juku_HR) | **塾HR** — 講師まわりの事務（シフト・勤怠・給与・連絡） | 講師・社員（管理者） | Next.js / TypeScript / Prisma / SQLite |

それぞれの詳細な仕様・起動方法は各ディレクトリの README を参照してください。

- [juku-app/README.md](./juku-app/README.md)
- [juku_HR/README.md](./juku_HR/README.md)

## クイックスタート

### juku-app（LuBo School）

```bash
cd juku-app
node server.js
```

http://localhost:3000 を開きます。ビルドや `npm install` は不要です。

### juku_HR（塾HR）

```bash
cd juku_HR
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

http://localhost:3000 を開きます。

> 2 つとも既定のポートが 3000 なので、同時に起動する場合はどちらかのポートを変えてください。

## リポジトリの方針

- 2 つのアプリは独立していて、コードの共有はしていません。
- ローカルの設定（`.env`）、依存パッケージ（`node_modules`）、データベース実体（`dev.db`）、
  ビルド成果物（`.next`）はコミットしません。各ディレクトリの `.gitignore` を参照してください。
- 現在入っているデータはすべて動作確認用のダミーデータです。実在の生徒・講師の情報は含まれていません。
