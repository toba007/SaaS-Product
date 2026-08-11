/**
 * 同じテストデータを複数のモデルに通して、抽出の精度を比べる。
 *
 *   npm run compare:models
 *   npm run compare:models -- gemma3:4b gemma4:e2b-it-qat
 *
 * ローカルとAPIのどちらを本番で使うかは、この結果で決める。
 * 期待する結果を先に書いておき、機械的に採点する（目視で「良さそう」と言わない）。
 */

import { OllamaClient, checkOllama } from "../lib/ai/local-ollama";
import { extractConflicts } from "../lib/ai/extract-conflicts";
import { StudentLite } from "../lib/ai/anonymize";

const STUDENTS: StudentLite[] = [
  { id: 1, name: "田中 太郎", kana: "たなか たろう" },
  { id: 2, name: "佐藤 花子", kana: "さとう はなこ" },
  { id: 3, name: "鈴木 一郎", kana: "すずき いちろう" },
  { id: 4, name: "高橋 美咲", kana: "たかはし みさき" },
  { id: 5, name: "山本 健太", kana: "やまもと けんた" },
  { id: 6, name: "伊藤 さくら", kana: "いとう さくら" },
];

const NOTE = `
8/7 ミーティング

・田中と佐藤を隣のブースにしたら、ずっと喋っていて全然進んでなかった。次から離す。
・鈴木くんは個別だと落ち着いてるけど、集団だと後ろの席で騒ぐ。前の方に座らせたい。
・高橋さん、英語だけ極端に苦手みたい。数学は問題ない。
・山本と伊藤は仲がいいけど、一緒でも普通に集中してるので問題なし。
・田中は鈴木とも相性が悪いかも。先週も注意した気がする。
・来週の模試の監督、誰か1人多めに要る。
`.trim();

/**
 * 期待する結果。
 * 現場のメモは「〜かも」のような曖昧な書き方が多いので、
 * それを拾えるかどうか（hedged）を独立した項目として見る。ここが実用性の分かれ目。
 */
const EXPECTED = [
  { key: "明示的なペア (田中×佐藤)", pair: [1, 2] as const, want: true },
  { key: "曖昧なペア (田中×鈴木)", pair: [1, 3] as const, want: true },
  { key: "非該当を除外 (山本×伊藤)", pair: [5, 6] as const, want: false },
];

const EXPECTED_NOTES = [
  { key: "個人の特徴 (鈴木・騒ぐ)", studentId: 3 },
  { key: "個人の特徴 (高橋・英語)", studentId: 4 },
];

/** 同じモデルを複数回まわして、結果が安定しているかも見る */
const RUNS = 3;

type Score = {
  model: string;
  /** 期待どおりだった項目数 */
  hit: number;
  total: number;
  detail: string[];
  avgMs: number;
  failed?: string;
};

async function scoreModel(model: string): Promise<Score> {
  const health = await checkOllama(model);
  if (!health.ok) {
    return { model, hit: 0, total: 0, detail: [], avgMs: 0, failed: health.message };
  }

  const llm = new OllamaClient(model);
  const detail: string[] = [];
  let hit = 0;
  let total = 0;
  let totalMs = 0;

  // 各項目について「何回中何回 期待どおりだったか」を数える
  const pairHits = new Map<string, number>();
  const noteHits = new Map<string, number>();

  for (let i = 0; i < RUNS; i++) {
    const r = await extractConflicts(llm, NOTE, STUDENTS);
    totalMs += r.elapsedMs;

    for (const e of EXPECTED) {
      const found = r.candidates.some(
        (c) => c.studentAId === Math.min(...e.pair) && c.studentBId === Math.max(...e.pair),
      );
      if (found === e.want) pairHits.set(e.key, (pairHits.get(e.key) ?? 0) + 1);
    }
    for (const e of EXPECTED_NOTES) {
      const found = r.notes.some((n) => n.studentId === e.studentId);
      if (found) noteHits.set(e.key, (noteHits.get(e.key) ?? 0) + 1);
    }
  }

  for (const e of [...EXPECTED, ...EXPECTED_NOTES]) {
    const n = pairHits.get(e.key) ?? noteHits.get(e.key) ?? 0;
    const mark = n === RUNS ? "OK " : n === 0 ? "NG " : "△  ";
    detail.push(`  ${mark} ${e.key}  (${n}/${RUNS})`);
    total++;
    if (n === RUNS) hit++;
  }

  return { model, hit, total, detail, avgMs: Math.round(totalMs / RUNS) };
}

async function main() {
  const models =
    process.argv.slice(2).length > 0
      ? process.argv.slice(2)
      : ["gemma3:4b", "gemma4:e2b-it-qat"];

  console.log("=== モデル比較：同席ペアの抽出 ===");
  console.log(`各モデル ${RUNS} 回ずつ実行し、毎回同じ判定になるかを見ます。\n`);

  const scores: Score[] = [];
  for (const m of models) {
    console.log(`--- ${m} ---`);
    const s = await scoreModel(m);
    if (s.failed) {
      console.log(`  スキップ: ${s.failed}\n`);
      continue;
    }
    s.detail.forEach((d) => console.log(d));
    console.log(`  正解 ${s.hit}/${s.total}・平均 ${(s.avgMs / 1000).toFixed(1)}秒\n`);
    scores.push(s);
  }

  if (scores.length < 2) {
    console.log("比較には2つ以上のモデルが要ります。");
    return;
  }

  console.log("=== まとめ ===");
  for (const s of [...scores].sort((a, b) => b.hit - a.hit)) {
    console.log(
      `  ${s.model.padEnd(22)} 正解 ${s.hit}/${s.total}  平均 ${(s.avgMs / 1000).toFixed(1)}秒`,
    );
  }
  console.log(
    "\n※ 「曖昧なペア」を落とすモデルは、現場のメモでは実用にならない可能性が高いです。",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
