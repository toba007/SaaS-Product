/**
 * 開講時間割の案を LLM に出させる。
 *
 * ---- LLM は提案するだけ。正しさは決めない ----
 * 返ってきた配置は **必ず lib/timetable.ts の checkPlacements を通す。**
 * 通らなかった配置は落とし、残りを固定してもう一度頼むか、決定的な貪欲で埋める。
 *
 * この形にしているのは、LLM が「出られない講師しかいない枠」を平気で提案するため。
 * 提案をそのまま採用すると、**動けない時間割が「正しい」として確定できてしまう。**
 * 割当エンジンに LLM を使わない理由（docs/AI活用方針 第2節）と同じ話で、
 * 「決めるのは決定的なプログラム」という線はここでも動かさない。
 *
 * ---- では LLM は何のために要るのか ----
 * 貪欲な配置は制約は守るが、**言葉で言われた事情を汲めない。**
 * 「金曜は避けたい」「小学生は早い時間に寄せて」「同じ先生に偏らせない」といった
 * 要望を、重み付けの項目として1つずつ作り込むのは割に合わない。
 * そこを自然文のまま受け取れるのが LLM の役目。
 *
 * ---- 生徒の名前は出さない ----
 * 送る前に仮名（生徒003）へ置き換える。ローカルの Ollama でも通す。
 * 外部 API に切り替えたときに、ここが抜けていることに気づけなくなるため。
 */

import { LlmClient, LlmError } from "./client";
import {
  checkPlacements,
  greedyPlace,
  slotKey,
  sortPlacements,
  type CheckInput,
  type Placement,
  type Slot,
  type Target,
  type Violation,
} from "../timetable";
import { WEEKDAYS } from "../dates";

const NL = String.fromCharCode(10);

/** LLM に返させる形。自由文を後から切り出す作りにしない。 */
const SCHEMA = {
  type: "object",
  properties: {
    placements: {
      type: "array",
      description: "決めた配置。対象ごとに、必要なコマ数ぶんの行を作る",
      items: {
        type: "object",
        properties: {
          target: { type: "string", description: "対象の番号。例: T3" },
          slot: { type: "string", description: "枠の番号。例: S7" },
          reason: { type: "string", description: "その枠にした理由（短く）" },
        },
        required: ["target", "slot", "reason"],
      },
    },
  },
  required: ["placements"],
} as const;

const SYSTEM = `あなたは学習塾の時間割を組む担当者です。
与えられた「対象」を「置ける枠」のどれかに割り当ててください。

# 出力の決まり（ここを外すとその行は捨てられます）
- target は対象の番号だけ。"T1" と書く。"T1 中1英語" のように名前を付けない
- slot は枠の番号を1つだけ。"S7" と書く
  "S1〜S18" や "S1,S2" のように範囲や複数を書かない。必ず1つに決める
- 週2コマの対象は、行を2つ作る。週3コマなら3行。指定されたコマ数ちょうど作る
- reason は10文字以内

# 例
対象が
T1 中1英語 週2 [生徒010] S1,S2,S5
T2 中1数学 週1 [生徒010] S1,S2,S5
のとき、正しい答えは

{"placements":[
{"target":"T1","slot":"S1","reason":"空いている"},
{"target":"T1","slot":"S2","reason":"空いている"},
{"target":"T2","slot":"S5","reason":"生徒が重ならない"}]}

T1 は週2なので2行。T2 は週1なので1行。
生徒010 は T1 と T2 の両方に出るので、同じ枠には置けません。

# 守ること
- 置ける枠として示された枠だけを使う
- 同じ生徒を同じ枠に2つ入れない
- 同じ枠に置ける教室数の上限を超えない
- 同じ対象を同じ枠に2回置かない

# 考えてほしいこと
- 個別は同じ科目の生徒を同じ枠に寄せると、1人の講師でまとめて見られる
- 特定の曜日に偏らせない

JSON だけで答えてください。説明文は入れないでください。`;

export type ProposeInput = {
  check: CheckInput;
  /** 動かさない配置（人が決めた枠、前学期からの引き継ぎ） */
  fixed?: Placement[];
  /** 管理者が日本語で書いた要望。無ければ空 */
  note?: string;
  /** 生徒の実名を出さないための置き換え。studentId -> 仮名 */
  pseudonym?: (studentId: number) => string;
  /**
   * 一度に頼む対象の数。0 や未指定ならまとめて1回で頼む。
   *
   * 小さいモデルは対象が増えると出力が崩れる（20件で空応答になった実測がある）。
   * 分けて頼み、決まったぶんを次の回に「決定済み」として渡すと、
   * 1回あたりの出力が短くなり、前の回との整合も取れる。
   */
  chunkSize?: number;
};

export type ProposeResult = {
  placements: Placement[];
  /** LLM が返した理由。画面で「なぜこの枠か」を出すのに使う */
  reasons: Map<string, string>;
  /** 検証で落とした配置 */
  rejected: { placement: Placement; violations: Violation[] }[];
  /** 落としたぶんを決定的に埋め直したか */
  repaired: boolean;
  /** AI の提案として通った数。機械が埋めたぶんと区別する */
  fromAi: number;
  /** 決定的な配置で埋めた数。**ここが多いほど AI は役に立っていない** */
  fromFallback: number;
  unplaced: { targetKey: string; label: string; reason: string; needed: number }[];
  model: string;
  elapsedMs: number;
};

/**
 * 対象と枠を、LLM が読める形に書き出す。
 *
 * **短さが最優先。** 枠を対象ごとに書き下すと、20件で18,000文字を超えて
 * CPU 実行のローカルモデルでは前処理だけで数分かかる（実測）。
 * そこで枠には S1, S2… の番号を振って一度だけ並べ、対象は使える番号だけを持つ。
 * 返してもらうのも番号なので、出力も短くなり、あり得ない曜日×コマの組み合わせも作れなくなる。
 */
export type PromptCodec = {
  text: string;
  /** "S7" -> 枠 */
  slotOf: Map<string, Slot>;
  /** "T3" -> targetKey */
  targetOf: Map<string, string>;
};

export function buildPrompt(input: ProposeInput): PromptCodec {
  const { check } = input;

  // 使われている枠だけに番号を振る。誰も置けない枠を並べても読ませる意味が無い。
  const used = new Set<string>();
  for (const t of check.targets) {
    for (const [k, set] of check.availability.get(t.key) ?? []) {
      if (set.size > 0) used.add(k);
    }
  }

  const slotOf = new Map<string, Slot>();
  const codeOfSlot = new Map<string, string>();
  const sorted = [...used]
    .map((k) => {
      const [dayOfWeek, periodId] = k.split(":").map(Number);
      return { k, dayOfWeek, periodId };
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodId - b.periodId);
  sorted.forEach((s, i) => {
    const code = `S${i + 1}`;
    slotOf.set(code, { dayOfWeek: s.dayOfWeek, periodId: s.periodId });
    codeOfSlot.set(s.k, code);
  });

  const targetOf = new Map<string, string>();
  const codeOfTarget = new Map<string, string>();
  check.targets.forEach((t, i) => {
    const code = `T${i + 1}`;
    targetOf.set(code, t.key);
    codeOfTarget.set(t.key, code);
  });

  const periodName = (id: number) => {
    const p = check.periods.find((x) => x.id === id);
    return p ? p.name : `コマ${id}`;
  };

  const lines: string[] = [];

  lines.push("# 枠");
  for (const [code, s] of slotOf) {
    lines.push(`${code}=${WEEKDAYS[s.dayOfWeek]}${periodName(s.periodId)}`);
  }

  lines.push("");
  lines.push("# 上限");
  lines.push(`同じ枠の集団クラス ${check.maxGroupRooms} / 個別ブース ${check.maxIndivRooms}`);
  lines.push(`個別は講師1人につき生徒${check.indivMaxStudents}人まで`);

  lines.push("");
  lines.push("# 対象（番号 名前 週コマ数 生徒 置ける枠）");
  for (const t of check.targets) {
    const codes = [...(check.availability.get(t.key) ?? [])]
      .filter(([, set]) => set.size > 0)
      .map(([k]) => codeOfSlot.get(k))
      .filter(Boolean);
    const members = t.studentIds
      .map((id) => (input.pseudonym ? input.pseudonym(id) : `生徒${id}`))
      .join(",");
    lines.push(
      `${codeOfTarget.get(t.key)} ${t.label} 週${t.slots} [${members}] ${
        codes.length > 0 ? codes.join(",") : "なし"
      }`,
    );
  }

  const fixed = input.fixed ?? [];
  if (fixed.length > 0) {
    lines.push("");
    lines.push("# 決定済み（動かさない）");
    for (const f of fixed) {
      const code = codeOfSlot.get(slotKey(f));
      if (code) lines.push(`${codeOfTarget.get(f.targetKey)}=${code}`);
    }
  }

  if (input.note?.trim()) {
    lines.push("");
    lines.push("# 要望");
    lines.push(input.note.trim());
  }

  return { text: lines.join(NL), slotOf, targetOf };
}

/**
 * 返ってきた文字列から番号だけを取り出す。
 *
 * **小さいモデルは表記が揺れる。** 「T1」と指示しても
 * 「T1 中1英語」「S1 (月1限)」のようにラベルを添えて返してくる（実測）。
 * 完全一致で拾うと全部落ちるので、先頭の番号だけを見る。
 * 番号が無い・別の形なら null を返し、その行は捨てる（作り話を通さない）。
 */
const TARGET_CODE = /^T(\d+)/i;
const SLOT_CODE = /^S(\d+)/i;

/** 範囲や列挙。1つに決まっていない印。 */
const AMBIGUOUS = /^\s*[〜~\-,、/／]|^\s*(and|または|and)/i;

export function extractCode(raw: unknown, prefix: "T" | "S"): string | null {
  if (typeof raw !== "string") return null;
  // 正規表現は直に書く。テンプレートリテラルに入れると \s が s になって効かない。
  const re = prefix === "T" ? TARGET_CODE : SLOT_CODE;
  const m = re.exec(raw.trim());
  if (!m) return null;

  // 「S1〜S18」「S1,S2」のように候補をそのまま返してくることがある（実測）。
  // 先頭だけ採ると、モデルがしていない判断を「選んだ」ことにしてしまう。
  // 決めきれていないものは決めていないものとして捨て、決定的な配置に回す。
  const rest = raw.trim().slice(m[0].length);
  if (AMBIGUOUS.test(rest)) return null;
  return `${prefix}${Number(m[1])}`;
}

type RawResult = {
  placements: { target: string; slot: string; reason: string }[];
};

/**
 * 提案させて、検証して、通ったものだけ残す。
 *
 * 落とした配置は捨てるだけにせず、**決定的な貪欲で埋め直す**。
 * 提案の一部が使えなかったからといって、時間割が未完成のままでは業務が止まる。
 */
export async function proposeTimetable(
  llm: LlmClient,
  input: ProposeInput,
): Promise<ProposeResult> {
  const size = Math.max(0, Math.trunc(input.chunkSize ?? 0));
  const chunks =
    size > 0 && input.check.targets.length > size
      ? splitTargets(input.check.targets, size)
      : [input.check.targets];

  const reasons = new Map<string, string>();
  const rejected: ProposeResult["rejected"] = [];
  let accepted: Placement[] = [...(input.fixed ?? [])];
  let model = "";
  let elapsedMs = 0;

  for (const targets of chunks) {
    // 頼むのはこの回のぶんだけ。決まったぶんは「決定済み」として渡す。
    const scoped: ProposeInput = {
      ...input,
      check: { ...input.check, targets },
      fixed: accepted,
    };
    const codec = buildPrompt(scoped);

    const raw = await llm.complete<RawResult>({
      system: SYSTEM,
      user: codec.text,
      schema: SCHEMA,
    });
    model = raw.model;
    elapsedMs += raw.elapsedMs;

    // 番号を実体に戻す。知らない番号はここで落ちるので、
    // あり得ない曜日×コマの組み合わせがそもそも作れない。
    const candidates: Placement[] = [];
    for (const r of raw.data?.placements ?? []) {
      const tCode = extractCode(r?.target, "T");
      const sCode = extractCode(r?.slot, "S");
      const targetKey = tCode ? codec.targetOf.get(tCode) : undefined;
      const slot = sCode ? codec.slotOf.get(sCode) : undefined;
      if (!targetKey || !slot) continue;

      const p: Placement = { targetKey, dayOfWeek: slot.dayOfWeek, periodId: slot.periodId };
      if (candidates.some((c) => c.targetKey === p.targetKey && slotKey(c) === slotKey(p))) {
        continue;
      }
      candidates.push(p);
      if (typeof r.reason === "string") {
        reasons.set(`${p.targetKey}:${slotKey(p)}`, r.reason);
      }
    }

    // 1件ずつ足していき、違反が増える配置は採らない。
    // まとめて検証して全部捨てると、使える提案まで失う。
    // 検証は「全体」で行う。この回の対象だけを見ると、
    // 前の回で置いたものとの生徒の重なりや教室の上限を見落とす。
    const countReal = (list: Placement[]) =>
      checkPlacements(list, input.check).filter((x) => x.code !== "T5_SLOT_COUNT");

    for (const p of sortPlacements(candidates)) {
      if (accepted.some((a) => a.targetKey === p.targetKey && slotKey(a) === slotKey(p))) {
        continue;
      }
      const target = targets.find((t) => t.key === p.targetKey)!;
      const already = accepted.filter((a) => a.targetKey === p.targetKey).length;
      if (already >= target.slots) {
        rejected.push({
          placement: p,
          violations: [
            {
              code: "T5_SLOT_COUNT",
              targetKey: p.targetKey,
              slot: p,
              message: `${target.label}：週${target.slots}コマを超えています`,
            },
          ],
        });
        continue;
      }

      const before = countReal(accepted).length;
      const after = countReal([...accepted, p]);
      if (after.length > before) {
        rejected.push({ placement: p, violations: after.slice(before) });
        continue;
      }
      accepted = [...accepted, p];
    }
  }

  // 足りないぶんを決定的に埋める
  const filled = greedyPlace(input.check, accepted);
  const fromAi = accepted.length - (input.fixed?.length ?? 0);
  const fromFallback = filled.placements.length - accepted.length;

  return {
    placements: filled.placements,
    reasons,
    rejected,
    repaired: fromFallback > 0,
    fromAi,
    fromFallback,
    unplaced: filled.unplaced,
    model,
    elapsedMs,
  };
}

/**
 * 対象を分ける。**置ける枠が少ないものから先に頼む。**
 * 融通の利かないものを後回しにすると、置き場所が埋まってしまう。
 */
function splitTargets(targets: Target[], size: number): Target[][] {
  const sorted = [...targets].sort((a, b) => a.key.localeCompare(b.key));
  const out: Target[][] = [];
  for (let i = 0; i < sorted.length; i += size) out.push(sorted.slice(i, i + size));
  return out;
}

/**
 * LLM が使えないときに、決定的な配置だけを返す。
 *
 * Ollama が起動していない・応答が壊れている場合でも、時間割は出せるようにしておく。
 * 画面はこちらを既定にして、AI 提案は「押したら動く」にとどめる。
 */
export function proposeWithoutLlm(input: ProposeInput): ProposeResult {
  const r = greedyPlace(input.check, input.fixed ?? []);
  return {
    placements: r.placements,
    reasons: new Map(),
    rejected: [],
    repaired: false,
    fromAi: 0,
    fromFallback: r.placements.length - (input.fixed?.length ?? 0),
    unplaced: r.unplaced,
    model: "（AIを使わない配置）",
    elapsedMs: 0,
  };
}

export { LlmError };
export type { Slot, Target };
