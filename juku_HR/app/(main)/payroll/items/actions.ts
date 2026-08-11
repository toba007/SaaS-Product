"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { PAY_BASIS, PAY_BASIS_ORDER, PAY_SOURCE } from "@/lib/constants";

export type ItemState = { error?: string; savedId?: number };

function refresh() {
  revalidatePath("/payroll/items");
  revalidatePath("/payroll/settings");
  revalidatePath("/payroll");
  revalidatePath("/t/payslip");
}

/**
 * 数量の取り方は、計算方法によって意味があるものと無いものがある。
 * PER_SLOT / MONTHLY で source が残っていると、あとから読む人が混乱するので落とす。
 */
function normalizeSource(basis: string, raw: string): string {
  if (basis === PAY_BASIS.PER_DAY) {
    return raw === PAY_SOURCE.SPOT ? PAY_SOURCE.SPOT : PAY_SOURCE.REGULAR;
  }
  if (basis === PAY_BASIS.PER_HOUR) {
    return raw === PAY_SOURCE.ADMIN ? PAY_SOURCE.ADMIN : "";
  }
  return "";
}

function readForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const basisRaw = String(formData.get("basis") ?? "");
  const basis = PAY_BASIS_ORDER.includes(basisRaw) ? basisRaw : PAY_BASIS.PER_SLOT;
  const order = Number(formData.get("order") ?? 0);
  return {
    name,
    basis,
    source: normalizeSource(basis, String(formData.get("source") ?? "")),
    order: Number.isFinite(order) ? Math.trunc(order) : 0,
  };
}

export async function addPayItem(
  _prev: ItemState,
  formData: FormData,
): Promise<ItemState> {
  await requireAdmin();
  const data = readForm(formData);
  if (!data.name) return { error: "項目名を入れてください" };

  await prisma.payItem.create({ data });
  refresh();
  return {};
}

export async function updatePayItem(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const data = readForm(formData);
  if (!data.name) return;

  await prisma.payItem.update({
    where: { id },
    data: { ...data, active: formData.get("active") === "on" },
  });
  refresh();
}

/**
 * 項目を消す。
 *
 * 過去の明細に出ていた項目を消すと、その月の金額が変わってしまう。
 * 実績や単価が1つでも紐づいているものは消さず、「使わない」に倒す。
 */
export async function deletePayItem(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));

  const [rates, duties, adminWorks] = await Promise.all([
    prisma.teacherPayRate.count({ where: { payItemId: id } }),
    prisma.dutyRecord.count({ where: { payItemId: id } }),
    prisma.adminWork.count({ where: { payItemId: id } }),
  ]);

  if (rates + duties + adminWorks > 0) {
    await prisma.payItem.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.payItem.delete({ where: { id } });
  }
  refresh();
}
