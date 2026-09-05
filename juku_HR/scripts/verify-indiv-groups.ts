/**
 * 個別の「組」を確かめる。
 *   npm run verify
 *
 * ---- ここが現物と食い違っていた ----
 * 実際の時間割（1つの列＝講師1人）には **違う科目の生徒が並ぶ。**
 * 「理・理・数・理」のように。巡回して1人ずつ見る指導なので、
 * 科目を揃える必要が無い。科目で分けると、1人で足りるところを
 * 2人3人必要ということにしてしまう。
 *
 * その代わり「その組の科目を全部教えられる人」でなければ持てない。
 * 境界を固定しておかないと、どちらかに寄って壊れる。
 *
 * DB を使わない純粋関数なので、まとめてテストできる。
 */
import { packGroups, checkGroups, teachersNeeded, type Groupable } from "../lib/indiv-groups";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? "  OK " : "  NG "} ${label}` +
      (ok
        ? ""
        : `\n       期待: ${JSON.stringify(expected)}\n       実際: ${JSON.stringify(actual)}`),
  );
}

const ENG = 1;
const MATH = 2;
const SCI = 3;
const JPN = 4;
const ESSAY = 5;

/** 生徒×科目1件。id は StudentSubject.id のつもり */
const it = (id: number, subjectId: number, solo = false, groupNo = 0): Groupable => ({
  studentSubjectId: id,
  subjectId,
  solo,
  groupNo,
});

/** 割り当て結果を "id=組" の並びで見る */
const shape = (m: Map<number, number>) =>
  [...m.entries()].sort((a, b) => a[0] - b[0]).map(([id, no]) => `${id}=${no}`);

console.log("\n[組を作る] 科目では分けない");
{
  // 現物どおり：理・理・数・理 が1人の講師の列に並ぶ
  const list = [it(1, SCI), it(2, SCI), it(3, MATH), it(4, SCI)];
  check("科目が混ざっても1組にまとまる", shape(packGroups(list, 4)), [
    "1=1",
    "2=1",
    "3=1",
    "4=1",
  ]);
  // 上限を超えたら次の組へ。
  //
  // **同じ科目をなるべく同じ組に寄せる**（科目の昇順に詰める）。
  // 混ざってよいが、混ぜないで済むなら混ぜない方がよい。組の科目が少ないほど
  // 「全部教えられる講師」の条件が緩くなり、割当が埋まりやすくなるため。
  // ここでは 英(5) 数(3) 理(1,2) で1組が埋まり、あふれた理(4)が2組目になる。
  check(
    "上限を超えたら次の組へ",
    shape(packGroups([...list, it(5, ENG)], 4)),
    ["1=1", "2=1", "3=1", "4=2", "5=1"],
  );
  check(
    "同じ科目が先にまとまる",
    shape(packGroups([it(1, ENG), it(2, MATH), it(3, ENG), it(4, MATH)], 2)),
    ["1=1", "2=2", "3=1", "4=2"],
  );
}

console.log("\n[組を作る] 1対1は1人で1組");
{
  const list = [it(1, ENG), it(2, ENG, true), it(3, ENG)];
  const m = packGroups(list, 4);
  check("1対1は他の生徒と混ざらない", m.get(2) !== m.get(1) && m.get(2) !== m.get(3), true);
  check("残りは同じ組にまとまる", m.get(1) === m.get(3), true);
}

console.log("\n[組を作る] 決めた組は動かさない");
{
  // **人が決めた組を壊さないこと。** ここが崩れると、組み替えても
  // 開き直すたびに元に戻り、「決めた」ことにならない。
  const list = [it(1, ENG, false, 5), it(2, MATH), it(3, SCI)];
  const m = packGroups(list, 4);
  check("決まっている番号はそのまま", m.get(1), 5);
  check("未定は空きのある組に入る", m.get(2), 5);
  check("同じ組に続けて入る", m.get(3), 5);

  // 決まっている組が埋まっていれば、別の番号を作る
  const full = [
    it(1, ENG, false, 2),
    it(2, ENG, false, 2),
    it(3, ENG),
  ];
  check("埋まっていれば新しい組", packGroups(full, 2).get(3), 1);
}

console.log("\n[組を作る] 実行のたびに変わらない");
{
  const list = [it(3, SCI), it(1, ENG), it(2, MATH)];
  const a = shape(packGroups(list, 2));
  const b = shape(packGroups([...list].reverse(), 2));
  check("並び順を変えても同じ結果", a, b);
}

console.log("\n[組を作る] 同じ系統から寄せる");
{
  // **講師が持つのは得意な2科目ほどで、その2つは文系どうし・理系どうし。**
  // 系統を見ずに科目の番号順に詰めると、英(1) 数(2) 国(3) 理(4) が
  // 「英数」「国理」に分かれ、どちらも持てる人がいない組になる。
  const H = "HUMANITIES";
  const S = "SCIENCE";
  const withStream = (id: number, subjectId: number, stream: string): Groupable => ({
    studentSubjectId: id,
    subjectId,
    stream,
    solo: false,
    groupNo: 0,
  });

  const list = [
    withStream(1, ENG, H),
    withStream(2, MATH, S),
    withStream(3, JPN, H),
    withStream(4, SCI, S),
  ];
  check("文系どうし・理系どうしでまとまる", shape(packGroups(list, 2)), [
    "1=1",
    "2=2",
    "3=1",
    "4=2",
  ]);

  // 系統が無ければ番号順。英と数が同じ組になってしまう（従来の動き）
  check(
    "系統が無ければ番号順のまま",
    shape(packGroups([it(1, ENG), it(2, MATH), it(3, JPN), it(4, SCI)], 2)),
    ["1=1", "2=1", "3=2", "4=2"],
  );

  // どちらでもない科目は最後に回す。
  // 先頭に置くと文系と理系の間に挟まって、両方に橋を架けてしまう
  // （小論文・英 が1組、国 が別、のように文系が割れる）。
  const mixed = [
    withStream(1, ENG, H),
    withStream(2, JPN, H),
    withStream(3, ESSAY, "OTHER"),
  ];
  const m = packGroups(mixed, 2);
  check("どちらでもより先に、同じ系統がまとまる", m.get(1) === m.get(2), true);
  check("どちらでもはあふれて別の組へ", m.get(3) !== m.get(1), true);

  // **系統は寄せる順序であって、相性の判定ではない。**
  // 文系と理系しかいなければ同じ組になる。それでよいかどうかは
  // 「その2つを持てる講師がいるか」で決まるので、coverable の仕事。
  check(
    "系統が違っても、他にいなければ同じ組になる",
    (() => {
      const two = packGroups([withStream(1, ENG, H), withStream(2, MATH, S)], 2);
      return two.get(1) === two.get(2);
    })(),
    true,
  );
}

console.log("\n[組を作る] 持てる講師がいない組は作らない");
{
  // **講師が担当するのは得意な2科目ほど**（文系／理系で分かれる）。
  // 英と数を両方持てる人がいなければ、その2人を同じ組にしてはいけない。
  // 一緒にすると、割当まで進んでから「埋まらない」と分かる。
  const canTeach = new Map<number, Set<number>>([
    [10, new Set([ENG])], // 文系の講師
    [11, new Set([MATH, SCI])], // 理系の講師
  ]);
  const coverable = (members: Groupable[]) =>
    [...canTeach.values()].some((subjects) =>
      members.every((m) => subjects.has(m.subjectId)),
    );

  const list = [it(1, ENG), it(2, MATH)];
  const m = packGroups(list, 4, coverable);
  check("持てる人がいなければ分ける", m.get(1) !== m.get(2), true);

  // 数と理は同じ講師が持てるので、まとめてよい
  const ok = packGroups([it(1, MATH), it(2, SCI)], 4, coverable);
  check("持てる人がいればまとめる", ok.get(1) === ok.get(2), true);

  // 渡さなければ人数だけで詰める（講師の情報を持たない画面用）
  const plain = packGroups(list, 4);
  check("渡さなければ人数だけで詰める", plain.get(1) === plain.get(2), true);
}

console.log("\n[組の検証] 人が壊したものを見つける");
{
  check(
    "上限を超えている",
    checkGroups([it(1, ENG, false, 1), it(2, ENG, false, 1), it(3, ENG, false, 1)], 2).map(
      (v) => v.code,
    ),
    ["G1_OVER_CAP"],
  );
  check(
    "1対1を他の生徒と同じ組にした",
    checkGroups([it(1, ENG, true, 1), it(2, ENG, false, 1)], 4).map((v) => v.code),
    ["G2_SOLO_SHARED"],
  );
  // **科目が混ざっているのは正常。** ここを違反にすると現物が組めない。
  check(
    "科目が混ざっていても違反ではない",
    checkGroups([it(1, ENG, false, 1), it(2, MATH, false, 1)], 4),
    [],
  );
  check("組が未定なら何も言わない", checkGroups([it(1, ENG), it(2, MATH)], 1), []);

  // 人が組み替えて、誰も持てない顔ぶれにしてしまった場合
  const onlyEnglish = (members: Groupable[]) => members.every((m) => m.subjectId === ENG);
  check(
    "持てる講師がいない",
    checkGroups([it(1, ENG, false, 1), it(2, MATH, false, 1)], 4, undefined, onlyEnglish).map(
      (v) => v.code,
    ),
    ["G3_NO_TEACHER"],
  );
  check(
    "持てる講師がいれば言わない",
    checkGroups([it(1, ENG, false, 1), it(2, ENG, false, 1)], 4, undefined, onlyEnglish),
    [],
  );
}

console.log("\n[必要人数] 組が決まっていれば数えるだけ");
{
  check(
    "組の数がそのまま人数",
    teachersNeeded([it(1, ENG, false, 1), it(2, MATH, false, 1), it(3, SCI, false, 2)], 4),
    2,
  );
  // 決まっていないぶんは、これまでどおりの概算
  check("未定は上限で割る", teachersNeeded([it(1, ENG), it(2, MATH), it(3, SCI)], 2), 2);
  check(
    "未定の1対1は1人ずつ",
    teachersNeeded([it(1, ENG, true), it(2, MATH), it(3, SCI)], 4),
    2,
  );
  check(
    "決まっているぶんと未定が混ざっても足せる",
    teachersNeeded([it(1, ENG, false, 1), it(2, MATH), it(3, SCI)], 2),
    2,
  );
}

console.log(failed === 0 ? "\n[OK] すべて期待どおり\n" : `\n[NG] ${failed} 件失敗\n`);
process.exit(failed === 0 ? 0 : 1);
