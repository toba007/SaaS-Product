/**
 * 生徒の実名を仮名IDに置き換える。
 *
 * LLM に送るテキストから個人情報を落とすための処理。ここを通していないテキストは
 * 送信してはいけない。ローカルの LLM を使う場合でも通す（本番で API に切り替えた
 * ときに、ここが抜けていることに気づけなくなるため）。
 *
 * Prisma に依存しない純粋関数にしてある。DB を用意せずにテストできるようにするため。
 */

export type StudentLite = {
  id: number;
  /** "田中 太郎" のように姓名が空白で区切られている想定 */
  name: string;
  /** "たなか たろう"。無くてもよい */
  kana?: string;
};

/** 仮名ID("生徒003") から生徒IDを引くための対応表。保存しない。メモリ上だけで使う。 */
export type NameTable = Map<string, number>;

export type AnonymizeResult = {
  /** 実名を仮名IDに置き換えた後のテキスト */
  text: string;
  table: NameTable;
  /**
   * 同じ姓の生徒が複数いて、どちらか判断できなかった表記。
   * 安全側に倒して置換はするが、抽出結果を人が確認するときの注意点として返す。
   */
  ambiguous: string[];
};

/** 生徒IDから仮名IDを作る。桁を揃えるのは、LLM が別人と取り違えにくくするため。 */
export function pseudonym(studentId: number): string {
  return `生徒${String(studentId).padStart(3, "0")}`;
}

/**
 * 1人の生徒について、メモに現れうる表記を列挙する。
 * 現場のメモは「田中」「田中太郎」「たなか」などまちまちなので、姓だけ・名だけも拾う。
 */
function surfaceForms(s: StudentLite): string[] {
  const forms = new Set<string>();
  const add = (v: string | undefined) => {
    const t = v?.trim();
    // 1文字の姓名は誤爆が多すぎる（「林」が「林檎」に当たる等）ので拾わない
    if (t && t.length >= 2) forms.add(t);
  };

  add(s.name);
  add(s.name.replace(/[\s　]+/g, "")); // 「田中 太郎」→「田中太郎」

  const [sei, mei] = s.name.split(/[\s　]+/);
  add(sei);
  add(mei);

  if (s.kana) {
    add(s.kana);
    add(s.kana.replace(/[\s　]+/g, ""));
    const [seiK, meiK] = s.kana.split(/[\s　]+/);
    add(seiK);
    add(meiK);
  }

  return [...forms];
}

/**
 * テキスト中の生徒名を仮名IDに置き換える。
 *
 * 長い表記から先に置換する。「田中太郎」を先に処理しないと、
 * 「田中」だけが置換されて「生徒003太郎」のような中途半端な結果になる。
 */
export function anonymize(
  text: string,
  students: StudentLite[],
): AnonymizeResult {
  // 表記 → その表記を持つ生徒ID（複数なら曖昧）
  const owners = new Map<string, number[]>();
  for (const s of students) {
    for (const form of surfaceForms(s)) {
      const list = owners.get(form) ?? [];
      if (!list.includes(s.id)) list.push(s.id);
      owners.set(form, list);
    }
  }

  const forms = [...owners.keys()].sort((a, b) => b.length - a.length);

  const table: NameTable = new Map();
  const ambiguous: string[] = [];
  let out = text;

  for (const form of forms) {
    const ids = owners.get(form)!;
    if (!out.includes(form)) continue;

    // 曖昧でも置換はする。実名を残すより、取り違えのリスクを人に見せるほうがよい。
    if (ids.length > 1) ambiguous.push(form);

    const id = ids[0];
    const alias = pseudonym(id);
    table.set(alias, id);
    out = out.replaceAll(form, alias);
  }

  return { text: out, table, ambiguous };
}

/**
 * 送信予定のテキストに実名が残っていないか確かめる。
 *
 * 仮名化の書き漏らしが1件でもあると意味がなくなるので、送信の直前に必ず通す。
 * 見つかったら送信せず例外にする（黙って送らない）。
 */
export function findRemainingNames(
  text: string,
  students: StudentLite[],
): string[] {
  const hits: string[] = [];
  for (const s of students) {
    for (const form of surfaceForms(s)) {
      if (text.includes(form)) hits.push(form);
    }
  }
  return [...new Set(hits)];
}

/** 仮名IDを生徒IDに戻す。完全一致のみ。 */
export function toStudentId(alias: string, table: NameTable): number | null {
  return table.get(alias) ?? null;
}

/**
 * LLM が返した仮名IDを生徒IDに解決する。
 *
 * 小さいモデルほど表記が揺れる。実際に観測したもの:
 *   "生徒003" / "生徒 003" / "生徒003さん" / "００３" / "None" / "生徒005 & 生徒006"
 * 完全一致だけで照合すると、正しく読めているのに全部捨ててしまう。
 * そこで数字だけを取り出して照合する。数字が無いもの（"None" など）は null。
 */
export function resolveAlias(raw: string | null | undefined, table: NameTable): number | null {
  if (!raw) return null;

  const direct = table.get(raw.trim());
  if (direct !== undefined) return direct;

  // 全角数字を半角に直してから最初の数字を拾う。
  // 複合表記（"生徒005 & 生徒006"）は先頭だけを採る。捨てるより情報が残る。
  const normalized = raw.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  const m = normalized.match(/\d+/);
  if (!m) return null;

  return table.get(pseudonym(Number(m[0]))) ?? null;
}

/**
 * 自由文の中に残った仮名IDを実名に戻す。画面に出す直前に使う。
 *
 * LLM は理由やメモの文中でも「生徒003」と書いてくるので、
 * ID の項目だけ戻しても「生徒003とも相性が悪い」のような読めない文が残る。
 */
export function restoreNames(
  text: string,
  table: NameTable,
  students: StudentLite[],
): string {
  let out = text;
  for (const [alias, id] of table) {
    const name = students.find((s) => s.id === id)?.name;
    if (name) out = out.replaceAll(alias, name);
  }
  return out;
}
