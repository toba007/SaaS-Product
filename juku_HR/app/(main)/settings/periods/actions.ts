"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import {
  GRADE_BAND,
  GRADE_BAND_ORDER,
  TERM_KIND,
  TERM_KIND_ORDER,
} from "@/lib/constants";
import { minutesOf } from "@/lib/periods";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function readKind(v: FormDataEntryValue | null): string {
  const s = String(v ?? "");
  return TERM_KIND_ORDER.includes(s) ? s : TERM_KIND.REGULAR;
}

function readBand(v: FormDataEntryValue | null): string {
  const s = String(v ?? "");
  return GRADE_BAND_ORDER.includes(s) ? s : GRADE_BAND.ALL;
}

/** コマが変わると、希望の入力欄も盤面もクラスの時間割も並びが変わる */
function refresh(): void {
  revalidatePath("/settings/periods");
  revalidatePath("/shifts");
  revalidatePath("/shifts/board");
  revalidatePath("/classes");
}

/**
 * コマを1つ足す。
 *
 * **時刻の逆転と重複だけは通さない。** 終わりが始まりより前のコマがあると、
 * 連続コマの判定も同時刻の判定も静かに壊れる。
 * 時間帯の「重なり」は塾によっては正しい（小と中を並行して開ける）ので、
 * ここでは止めず、画面で知らせるだけにする。
 */
export async function addPeriod(formData: FormData) {
  await requireAdmin();

  const termKind = readKind(formData.get("termKind"));
  const gradeBand = readBand(formData.get("gradeBand"));
  const name = String(formData.get("name") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();

  if (!name || name.length > 20) return refresh();
  if (!HHMM.test(startTime) || !HHMM.test(endTime)) return refresh();
  if (minutesOf(endTime) <= minutesOf(startTime)) return refresh();

  const dup = await prisma.period.findUnique({
    where: { termKind_gradeBand_name: { termKind, gradeBand, name } },
    select: { id: true },
  });
  if (dup) return refresh();

  const last = await prisma.period.findFirst({
    where: { termKind, gradeBand },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.period.create({
    data: {
      termKind,
      gradeBand,
      name,
      startTime,
      endTime,
      order: (last?.order ?? -1) + 1,
    },
  });

  return refresh();
}

/** 時刻と名前を直す。並び順は時刻から付け直す。 */
export async function updatePeriod(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const period = await prisma.period.findUnique({ where: { id } });
  if (!period) return;

  const name = String(formData.get("name") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();

  if (!name || name.length > 20) return refresh();
  if (!HHMM.test(startTime) || !HHMM.test(endTime)) return refresh();
  if (minutesOf(endTime) <= minutesOf(startTime)) return refresh();

  await prisma.period.update({
    where: { id },
    data: { name, startTime, endTime },
  });

  await renumber(period.termKind, period.gradeBand);
  return refresh();
}

/**
 * コマを消す。
 *
 * **使われているコマは消さない。** 希望・割当・授業・クラスの時間割が
 * ぶら下がっているコマを消すと、そこにあった予定が黙って消える。
 * 時間帯を変えたいだけなら、消さずに時刻を直せば済む。
 */
export async function deletePeriod(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const period = await prisma.period.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          lessons: true,
          requests: true,
          assignments: true,
          duties: true,
          demands: true,
          classSessions: true,
        },
      },
    },
  });
  if (!period) return;

  const used = Object.values(period._count).reduce((a, b) => a + b, 0);
  if (used > 0) return refresh();

  await prisma.period.delete({ where: { id } });
  await renumber(period.termKind, period.gradeBand);
  return refresh();
}

/** 並び順を開始時刻の順に振り直す。画面の並びと order をずらさないため。 */
async function renumber(termKind: string, gradeBand: string) {
  const list = await prisma.period.findMany({
    where: { termKind, gradeBand },
    orderBy: { startTime: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    list.map((p, i) =>
      prisma.period.update({ where: { id: p.id }, data: { order: i } }),
    ),
  );
}

/**
 * ある学年帯のコマを、別の学年帯へまるごと写す。
 *
 * 「中学生と同じ時間割を高校生にも」を手入力させないため。
 * 既にある名前は飛ばすので、二重に押しても増えない。
 */
export async function copyBand(formData: FormData) {
  await requireAdmin();

  const termKind = readKind(formData.get("termKind"));
  const from = readBand(formData.get("from"));
  const to = readBand(formData.get("to"));
  if (from === to) return refresh();

  const [src, existing] = await Promise.all([
    prisma.period.findMany({
      where: { termKind, gradeBand: from },
      orderBy: { startTime: "asc" },
    }),
    prisma.period.findMany({
      where: { termKind, gradeBand: to },
      select: { name: true },
    }),
  ]);

  const taken = new Set(existing.map((p) => p.name));
  const rows = src.filter((p) => !taken.has(p.name));
  if (rows.length === 0) return refresh();

  const base = await prisma.period.count({ where: { termKind, gradeBand: to } });
  await prisma.period.createMany({
    data: rows.map((p, i) => ({
      termKind,
      gradeBand: to,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      order: base + i,
    })),
  });

  await renumber(termKind, to);
  return refresh();
}
