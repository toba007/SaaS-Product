/**
 * ミーティングのメモから「同じブースに座らせない方がよい生徒の組み合わせ」を拾う。
 *
 * 生徒の相性や騒音は毎晩の口頭ミーティングで共有されている暗黙知で、
 * フォームに書かせる形にすると埋まらない（試作品 README）。
 * そこでメモを貼るだけで候補が出るようにする。
 *
 * ここが返すのはあくまで「候補」。人が承認したものだけを StudentConflict に保存する。
 * LLM の出力を直接 DB に書かない。
 */

import { LlmClient } from "./client";
import {
  StudentLite,
  anonymize,
  findRemainingNames,
  resolveAlias,
  restoreNames,
} from "./anonymize";

/** LLM に返させる形。自由文を後から切り出す作りにしない。 */
const SCHEMA = {
  type: "object",
  properties: {
    pairs: {
      type: "array",
      description: "同じブースに座らせない方がよい生徒の組み合わせ",
      items: {
        type: "object",
        properties: {
          studentA: { type: "string", description: "仮名ID。例: 生徒003" },
          studentB: { type: "string", description: "仮名ID。例: 生徒007" },
          reason: { type: "string", description: "根拠になったメモの記述" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["studentA", "studentB", "reason", "confidence"],
      },
    },
    notes: {
      type: "array",
      description: "組み合わせではないが、配置のときに気をつけたい個人の特徴",
      items: {
        type: "object",
        properties: {
          student: { type: "string", description: "仮名ID" },
          note: { type: "string" },
        },
        required: ["student", "note"],
      },
    },
  },
  required: ["pairs", "notes"],
} as const;

const SYSTEM = `あなたは学習塾のミーティングメモを読んで、座席配置に関わる情報を整理する担当です。

次の2つを抜き出してください。
1. pairs: 同じブースに座らせない方がよい生徒の組み合わせ
2. notes: 組み合わせではないが、配置のときに気をつけたい個人の特徴

守ること:
- メモに書かれていることだけを根拠にしてください。書かれていない組み合わせを推測で作らないでください。
- 生徒は「生徒003」のような仮名IDで書かれています。そのまま同じIDで出力してください。
- 該当するものが無ければ空の配列を返してください。無理に埋めないでください。

2人の生徒の関係について書かれていたら、必ず pairs に入れてください:
- 「〜かも」「〜な気がする」のように曖昧な書き方でも pairs に入れ、confidence を low または medium にしてください。
  曖昧だからといって notes に回さないでください。判断するのは人です。
- 「一緒でも問題ない」「仲がいいが集中している」のように、離す必要がないと書かれている組み合わせは
  pairs に入れないでください。

notes に入れるのは、相手のいない個人の特徴だけです。`;

type RawExtraction = {
  pairs: {
    studentA: string;
    studentB: string;
    reason: string;
    confidence: "high" | "medium" | "low";
  }[];
  notes: { student: string; note: string }[];
};

export type ConflictCandidate = {
  studentAId: number;
  studentBId: number;
  reason: string;
  confidence: "high" | "medium" | "low";
};

export type StudentNote = {
  studentId: number;
  note: string;
};

export type ExtractionResult = {
  candidates: ConflictCandidate[];
  notes: StudentNote[];
  /** 同姓の生徒がいて取り違えの可能性がある表記。画面で注意書きとして出す。 */
  ambiguous: string[];
  model: string;
  elapsedMs: number;
  /** LLM が返したが、仮名IDが対応表に無く捨てたもの。件数だけ持つ。 */
  discarded: number;
};

export async function extractConflicts(
  llm: LlmClient,
  note: string,
  students: StudentLite[],
): Promise<ExtractionResult> {
  const { text, table, ambiguous } = anonymize(note, students);

  // 仮名化の書き漏らしが1件でもあると意味がなくなるので、送信の直前に必ず確かめる。
  // 見つかったら送らずに落とす。黙って送らない。
  const leaked = findRemainingNames(text, students);
  if (leaked.length > 0) {
    throw new Error(
      `仮名化できていない実名が残っています: ${leaked.join(", ")}。送信を中止しました。`,
    );
  }

  const res = await llm.complete<RawExtraction>({
    system: SYSTEM,
    user: text,
    schema: SCHEMA,
  });

  let discarded = 0;
  const candidates: ConflictCandidate[] = [];
  const notes: StudentNote[] = [];

  for (const p of res.data.pairs ?? []) {
    const a = resolveAlias(p.studentA, table);
    const b = resolveAlias(p.studentB, table);

    // 小さいモデルは「1人だけの特徴」も pairs に入れ、相手を "None" と書いてくる。
    // 片方だけ解決できたなら捨てずに notes へ移す。書かれている情報は残す。
    if (a !== null && b === null) {
      notes.push({ studentId: a, note: restoreNames(p.reason ?? "", table, students) });
      continue;
    }

    // どちらも解決できない、または同一人物。これは捨てる。
    if (a === null || b === null || a === b) {
      discarded++;
      continue;
    }
    // 常に小さいIDを A にする。同じ組を2通りで登録させないため（StudentConflict と同じ規則）。
    candidates.push({
      studentAId: Math.min(a, b),
      studentBId: Math.max(a, b),
      // 理由の文中にも仮名IDが混ざるので、画面に出す前に実名へ戻す
      reason: restoreNames(p.reason ?? "", table, students),
      confidence: p.confidence ?? "low",
    });
  }

  for (const n of res.data.notes ?? []) {
    const id = resolveAlias(n.student, table);
    if (id === null) {
      discarded++;
      continue;
    }
    notes.push({ studentId: id, note: restoreNames(n.note ?? "", table, students) });
  }

  return {
    candidates,
    notes,
    ambiguous,
    model: res.model,
    elapsedMs: res.elapsedMs,
    discarded,
  };
}
