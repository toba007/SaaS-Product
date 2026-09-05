/**
 * 個別指導の「組」。**誰と誰を、同じ講師がまとめて見るか。**
 *
 * ---- 組は科目でまとまらない ----
 * **1人の講師が、違う科目の生徒を同時に見る。** 現物の時間割で確かめた：
 * 1つの列（＝講師1人）に「中3(理) 中3(理) 中1(数) 中3(理)」のように並ぶ。
 * 巡回して1人ずつ見る指導なので、科目が揃っている必要が無い。
 *
 * したがって組の条件は「同じ科目」ではなく、
 *   - 同じ枠にいること
 *   - 人数が上限を超えないこと
 *   - 1対1で取っている生徒を混ぜないこと
 * の3つだけ。**代わりに、その組を持つ講師は組の科目すべてを教えられる必要がある**
 * （その判定は割当側の仕事）。
 *
 * ---- なぜ保存する必要があるのか ----
 * これまで組は画面が毎回その場で作っていた（timetable-view の buildIndivGrid）。
 * 必要人数も `1対1の人数 + ceil(残り ÷ 上限)` という概算で数えていた。
 * どちらも機械が勝手に束ね直すので、**「この3人は同じ講師で見たい」という
 * 人の判断を残す場所が無かった。**
 *
 * 兄弟をまとめたい、相性が悪いので分けたい、去年と同じ組で続けたい。
 * どれも塾が現に持っている判断で、割り振りの良し悪しを決める。
 *
 * ---- 組が決まると、3つとも精度が上がる ----
 * - 開講時間割 … 人が組み替えた結果が次の実行まで残る
 * - 必要人数   … 概算ではなく**組の数**で数えられる
 * - 割当       … 「英語2人ぶん」ではなく「この組を見る人」を探せる
 *
 * ---- 番号の付け方 ----
 * **枠（曜日 or 日付 × コマ）の中で 1 から振る。**
 * 「火曜2限の組3」だけで一意に指せるほうが、現場で口に出しやすい。
 *
 * **0 は「まだ決めていない」。** 既存の行はすべて 0 で、その場合は
 * これまでどおり機械が束ねる。人が決めた組だけが 1 以上を持つ。
 *
 * Prisma に依存しない純粋関数。DB を用意せずにテストできるようにするため。
 */

/** 組に入れる1件。個別は「生徒×科目」が1件。 */
export type Groupable = {
  /** StudentSubject.id。同じ生徒でも科目が違えば別の件 */
  studentSubjectId: number;
  subjectId: number;
  /**
   * 科目の系統（HUMANITIES | SCIENCE | OTHER）。
   *
   * **同じ系統から先に寄せる。** 講師が担当するのは得意な2科目ほどで、
   * その2つは文系どうし・理系どうしになりやすい。英と国の組は持てる人が
   * いるが、英と数の組は持てる人がまずいない。
   *
   * 無ければ OTHER と同じ扱い（どこにでも入れる）。
   */
  stream?: string;
  /** 1対1で取っている生徒か。**他の生徒と同じ組にできない** */
  solo: boolean;
  /** 決まっている組番号。0 なら未定 */
  groupNo: number;
};

/** 組が決まっていない扱いにする番号。 */
export const UNASSIGNED = 0;

/**
 * 系統の並び順。**OTHER は最後**にする。
 *
 * どちらとも言えない科目を先頭に置くと、文系と理系の間に挟まって
 * 両方に橋を架けてしまう（英・小論文・数 が1組になる）。
 * 最後に回せば、埋まっている組の空きに入るだけで済む。
 */
function streamOrder(stream: string | undefined): number {
  if (stream === "HUMANITIES") return 0;
  if (stream === "SCIENCE") return 1;
  return 2;
}

/**
 * 1つの枠の中を、決定的に組へ割る。
 *
 * **人が決めた組（groupNo >= 1）は動かさない。** 未定のものだけを、
 * 空きのある組に入れ、入らなければ新しい組を作る。
 * ここを毎回ゼロから組み直すと、1件足しただけで全員の組が変わってしまう。
 *
 * ---- 混ぜてよいが、混ぜないで済むなら混ぜない ----
 * **系統（文系／理系）→科目→id** の順に詰めるので、まず文系どうし・
 * 理系どうしが同じ組に寄り、その中で同じ科目がまとまる。
 * 組の科目が少ないほど、そして系統が揃っているほど
 * 「全部教えられる講師」が見つかりやすい。混在は許すが、わざわざ作る理由も無い。
 *
 * 系統を見ずに科目の番号順に詰めると、英(1) 数(2) 国(3) 理(4) が
 * 「英数」「国理」に分かれてしまう。どちらも持てる人がいない組み合わせになる。
 *
 * ---- 持てる講師がいない組は作らない ----
 * **講師が担当するのは得意な2科目ほど**（文系／理系で分かれる）。
 * 英・数・理の組を作っても、3つ全部を持てる人がいなければ永久に埋まらない。
 * しかもそれが分かるのは割当まで進んだあとで、原因も見えない。
 *
 * そこで `coverable` を渡せるようにしてある。**一緒にできるかどうかを
 * 講師の担当範囲で確かめてから詰める。** 渡さなければ人数だけで詰める
 * （講師の情報を持たない画面や、組がまだ決まっていない行の表示用）。
 *
 * 並びは科目→ StudentSubject.id の昇順で固定する。乱数を使わないので、
 * 同じ入力なら必ず同じ組になる。
 */
export function packGroups(
  items: Groupable[],
  cap: number,
  /**
   * その顔ぶれを1人で持てる講師がいるか。
   * 渡さなければ「いる」ものとして扱う。
   */
  coverable?: (members: Groupable[]) => boolean,
): Map<number, number> {
  const limit = Math.max(1, Math.trunc(cap) || 1);
  const out = new Map<number, number>();

  const sorted = [...items].sort(
    (a, b) =>
      streamOrder(a.stream) - streamOrder(b.stream) ||
      a.subjectId - b.subjectId ||
      a.studentSubjectId - b.studentSubjectId,
  );

  // 既に決まっている組。中身と、1対1かどうかを覚えておく。
  type Slot = { members: Groupable[]; solo: boolean };
  const groups = new Map<number, Slot>();

  for (const it of sorted) {
    if (it.groupNo < 1) continue;
    out.set(it.studentSubjectId, it.groupNo);
    const g = groups.get(it.groupNo);
    if (g) {
      g.members.push(it);
      g.solo = g.solo || it.solo;
    } else {
      groups.set(it.groupNo, { members: [it], solo: it.solo });
    }
  }

  const nextNo = () => {
    let n = 1;
    while (groups.has(n)) n++;
    return n;
  };

  for (const it of sorted) {
    if (it.groupNo >= 1) continue;

    // 1対1は必ず1人。空きを探さずに新しい組を作る。
    if (it.solo) {
      const no = nextNo();
      groups.set(no, { members: [it], solo: true });
      out.set(it.studentSubjectId, no);
      continue;
    }

    // 1対1でなく、まだ空きがあり、**その顔ぶれを持てる講師がいる**組を、
    // 番号の小さい順に探す。科目が揃っている必要は無いが、
    // 誰も持てない組み合わせを作ってしまうと埋まらない。
    let found = 0;
    for (const no of [...groups.keys()].sort((a, b) => a - b)) {
      const g = groups.get(no)!;
      if (g.solo) continue;
      if (g.members.length >= limit) continue;
      if (coverable && !coverable([...g.members, it])) continue;
      found = no;
      break;
    }

    if (found === 0) {
      found = nextNo();
      groups.set(found, { members: [it], solo: false });
    } else {
      groups.get(found)!.members.push(it);
    }
    out.set(it.studentSubjectId, found);
  }

  return out;
}

export type GroupViolation = {
  code: "G1_OVER_CAP" | "G2_SOLO_SHARED" | "G3_NO_TEACHER";
  groupNo: number;
  message: string;
};

/**
 * 組が成り立っているかを見る。**人が組み替えたあとに呼ぶ。**
 *
 * 機械が作った組は必ず通るが、人は上限を超えて詰めることも、
 * 1対1の生徒を他の生徒と同じ組にすることもできてしまう。
 * 契約と違う授業になるので、確定させる前にここで止める。
 */
export function checkGroups(
  items: Groupable[],
  cap: number,
  /** 番号を人が読める名前にする。無ければ番号だけで出す */
  label?: (studentSubjectId: number) => string,
  /** その顔ぶれを1人で持てる講師がいるか。渡さなければ確かめない */
  coverable?: (members: Groupable[]) => boolean,
): GroupViolation[] {
  const limit = Math.max(1, Math.trunc(cap) || 1);
  const byNo = new Map<number, Groupable[]>();
  for (const it of items) {
    if (it.groupNo < 1) continue;
    byNo.set(it.groupNo, [...(byNo.get(it.groupNo) ?? []), it]);
  }

  const out: GroupViolation[] = [];
  const names = (list: Groupable[]) =>
    list.map((i) => label?.(i.studentSubjectId) ?? `#${i.studentSubjectId}`).join("・");

  for (const no of [...byNo.keys()].sort((a, b) => a - b)) {
    const list = byNo.get(no)!;

    if (list.length > limit) {
      out.push({
        code: "G1_OVER_CAP",
        groupNo: no,
        message: `組${no}に${list.length}人います。1人の講師がみられるのは${limit}人までです（${names(list)}）`,
      });
    }

    const solo = list.filter((i) => i.solo);
    if (solo.length > 0 && list.length > 1) {
      out.push({
        code: "G2_SOLO_SHARED",
        groupNo: no,
        message: `組${no}に1対1で取っている生徒がいます。他の生徒と同じ組にはできません（${names(solo)}）`,
      });
    }

    // 科目が混ざっているのは**正常**。1人の講師が巡回して見るため。
    // ただし**その全部を教えられる人がいなければ、この組は永久に埋まらない。**
    // 講師が持つのは得意な2科目ほどなので、人が組み替えたときに起こりうる。
    if (coverable && !coverable(list)) {
      out.push({
        code: "G3_NO_TEACHER",
        groupNo: no,
        message: `組${no}の顔ぶれを1人で持てる講師がいません。科目の組み合わせを見直してください（${names(list)}）`,
      });
    }
  }

  return out;
}

/**
 * その枠・その科目に、講師が何人要るか。
 *
 * **組が決まっているぶんは組の数を数える。** 決まっていないぶんだけ、
 * これまでどおり `1対1の人数 + ceil(残り ÷ 上限)` で見積もる。
 * 全部 0（未定）なら、これまでとまったく同じ数になる。
 */
export function teachersNeeded(items: Groupable[], cap: number): number {
  const limit = Math.max(1, Math.trunc(cap) || 1);

  const decided = new Set<number>();
  let solo = 0;
  let pooled = 0;

  for (const it of items) {
    if (it.groupNo >= 1) {
      decided.add(it.groupNo);
    } else if (it.solo) {
      solo++;
    } else {
      pooled++;
    }
  }

  return decided.size + solo + Math.ceil(pooled / limit);
}
