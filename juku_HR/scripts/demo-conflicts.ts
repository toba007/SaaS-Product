/**
 * ローカル LLM で「同席させない組み合わせ」を抽出するデモ。
 *
 *   npm run demo:conflicts
 *
 * DB は使わない。生徒名とメモをこのファイルに直接書いてあるので、
 * Ollama さえ動いていれば単体で試せる。
 */

import { OllamaClient, checkOllama } from "../lib/ai/local-ollama";
import { extractConflicts } from "../lib/ai/extract-conflicts";
import { anonymize, findRemainingNames, StudentLite } from "../lib/ai/anonymize";

// 動作確認用のダミー。実在の生徒ではない。
const STUDENTS: StudentLite[] = [
  { id: 1, name: "田中 太郎", kana: "たなか たろう" },
  { id: 2, name: "佐藤 花子", kana: "さとう はなこ" },
  { id: 3, name: "鈴木 一郎", kana: "すずき いちろう" },
  { id: 4, name: "高橋 美咲", kana: "たかはし みさき" },
  { id: 5, name: "山本 健太", kana: "やまもと けんた" },
  { id: 6, name: "伊藤 さくら", kana: "いとう さくら" },
];

// 毎晩22時ごろのミーティングで実際に出てきそうな内容を想定した文面。
const NOTE = `
8/7 ミーティング

・田中と佐藤を隣のブースにしたら、ずっと喋っていて全然進んでなかった。次から離す。
・鈴木くんは個別だと落ち着いてるけど、集団だと後ろの席で騒ぐ。前の方に座らせたい。
・高橋さん、英語だけ極端に苦手みたい。数学は問題ない。
・山本と伊藤は仲がいいけど、一緒でも普通に集中してるので問題なし。
・田中は鈴木とも相性が悪いかも。先週も注意した気がする。
・来週の模試の監督、誰か1人多めに要る。
`.trim();

async function main() {
  console.log("=== ローカル LLM デモ：同席させない組み合わせの抽出 ===\n");

  // 1. Ollama の確認
  const health = await checkOllama();
  console.log(`[1] ${health.ok ? "OK " : "NG "} ${health.message}`);
  if (!health.ok) {
    console.log("\n先に Ollama を起動し、モデルを取得してください:");
    console.log("  ollama pull gemma3:4b");
    process.exit(1);
  }

  // 2. 仮名化が効いているかを、送信の前に目で見て確かめる
  const { text, ambiguous } = anonymize(NOTE, STUDENTS);
  const leaked = findRemainingNames(text, STUDENTS);

  console.log("\n[2] 仮名化した後の送信データ（これがそのまま LLM に渡る）");
  console.log("----------------------------------------");
  console.log(text);
  console.log("----------------------------------------");
  console.log(`実名の残り: ${leaked.length === 0 ? "なし（OK）" : leaked.join(", ") + " ← NG"}`);
  if (ambiguous.length > 0) {
    console.log(`同姓で取り違えの可能性: ${ambiguous.join(", ")}`);
  }
  if (leaked.length > 0) process.exit(1);

  // 3. 抽出
  console.log("\n[3] 抽出中...（CPU 実行なので1〜3分かかることがあります）");
  const llm = new OllamaClient();

  let result;
  try {
    result = await extractConflicts(llm, NOTE, STUDENTS);
  } catch (e) {
    console.error("\n抽出に失敗しました:", e instanceof Error ? e.message : e);
    console.error("\n※ 失敗しても手入力の画面は使えます。業務は止まりません。");
    process.exit(1);
  }

  const nameOf = (id: number) => STUDENTS.find((s) => s.id === id)?.name ?? `ID:${id}`;

  console.log(`\n[4] 結果（${result.model} / ${(result.elapsedMs / 1000).toFixed(1)}秒）\n`);

  console.log("■ 同席させない組み合わせの候補");
  if (result.candidates.length === 0) {
    console.log("  （候補なし）");
  }
  for (const c of result.candidates) {
    const mark = { high: "◎", medium: "○", low: "△" }[c.confidence];
    console.log(`  ${mark} ${nameOf(c.studentAId)} × ${nameOf(c.studentBId)}`);
    console.log(`     根拠: ${c.reason}`);
  }

  console.log("\n■ 配置のときに気をつけたいこと");
  if (result.notes.length === 0) {
    console.log("  （なし）");
  }
  for (const n of result.notes) {
    console.log(`  ・${nameOf(n.studentId)}: ${n.note}`);
  }

  if (result.discarded > 0) {
    console.log(`\n※ 対応表に無いIDを ${result.discarded} 件捨てました（モデルが作った架空のID）`);
  }

  console.log("\n※ ここに出たものは「候補」です。実際の運用では管理者が承認したものだけを保存します。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
