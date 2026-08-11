"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { saveSetting } from "@/lib/settings";

/**
 * 塾の設定を保存する。
 *
 * ここの数字は必要人数の計算にそのまま効く。
 * 個別の上限を実際より大きくすると、必要な講師数が少なく出て当日足りなくなるので、
 * 分からないうちは小さいままにしておくほうが安全。
 */
export async function updateSchoolSetting(formData: FormData) {
  await requireAdmin();

  await saveSetting({
    indivMaxStudents: Number(formData.get("indivMaxStudents")),
    maxGroupRooms: Number(formData.get("maxGroupRooms")),
    maxIndivRooms: Number(formData.get("maxIndivRooms")),
  });

  revalidatePath("/settings");
  // 選べる授業形態が変わるので、形態を出している画面も作り直させる
  revalidatePath("/students/subjects");
  revalidatePath("/payroll/settings");
  revalidatePath("/attendance");
}
