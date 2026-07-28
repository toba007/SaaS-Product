"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { copyAssignmentsToDuties, cycleDuty, punch } from "@/lib/attendance";

function refresh() {
  revalidatePath("/attendance");
  revalidatePath("/payroll");
  revalidatePath("/");
}

/** 二次元コード or ボタンからの打刻。出勤中なら退勤になる。 */
export async function punchTeacher(formData: FormData) {
  await punch(Number(formData.get("teacherId")), String(formData.get("date")));
  refresh();
}

/**
 * 担当コマの実績を切り替える。
 * 押すたびに 未担当 → 集団 → 1対1 → 1対2 → 未担当 と回る。
 * コマ給は授業形態で変わるので、形態まで記録しないと給与が出せない。
 */
export async function cycleDutyRecord(formData: FormData) {
  await cycleDuty(
    Number(formData.get("teacherId")),
    String(formData.get("date")),
    Number(formData.get("periodId")),
  );
  refresh();
}

/** 確定シフトをその日の実績に写す */
export async function applyAssignments(formData: FormData) {
  await copyAssignmentsToDuties(String(formData.get("date")));
  refresh();
}

/** 事務作業を記録する */
export async function addAdminWork(formData: FormData) {
  const minutes = Number(formData.get("minutes"));
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  await prisma.adminWork.create({
    data: {
      teacherId: Number(formData.get("teacherId")),
      date: String(formData.get("date")),
      minutes: Math.round(minutes),
      note: String(formData.get("note") ?? ""),
    },
  });
  refresh();
}

export async function deleteAdminWork(formData: FormData) {
  await prisma.adminWork.delete({ where: { id: Number(formData.get("id")) } });
  refresh();
}

/** 打刻を手で直す（打ち忘れ・打ち間違いの修正） */
export async function updatePunch(formData: FormData) {
  const id = Number(formData.get("id"));
  const inAt = String(formData.get("inAt") ?? "");
  const outAt = String(formData.get("outAt") ?? "");

  if (!/^\d{2}:\d{2}$/.test(inAt)) return;

  await prisma.punch.update({
    where: { id },
    data: { inAt, outAt: /^\d{2}:\d{2}$/.test(outAt) ? outAt : null },
  });
  refresh();
}

export async function deletePunch(formData: FormData) {
  await prisma.punch.delete({ where: { id: Number(formData.get("id")) } });
  refresh();
}
