"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { computeAllPayslips, payslipNoticeTitle } from "@/lib/payroll";
import { MESSAGE_KIND } from "@/lib/constants";
import { parseYm } from "@/lib/dates";

/**
 * その月の給与明細ができたことを講師に知らせる。
 *
 * 明細そのものは講師の「給与」画面でいつでも見られるが、**出たことに気づく手段が
 * 無かった**。出るのを待って毎日開く人はいないので、届いていないのと大差ない。
 * 既存の連絡機能に1件流して、未読バッジで気づけるようにする。
 *
 * 金額は本文に入れない。連絡は1件を複数人で共有する作りなので、本文に金額を書くと
 * 全員に同じ額が出る。金額は各自の明細画面で見てもらう。
 */
export async function notifyPayslips(formData: FormData) {
  await requireAdmin();

  const ym = parseYm(String(formData.get("ym") ?? ""));
  const slips = await computeAllPayslips(ym);

  // 支給が発生した人だけに送る。0円の人に「明細ができました」は届けても意味がない。
  const targets = slips.filter((s) => s.total > 0);
  if (targets.length === 0) return;

  await prisma.message.create({
    data: {
      title: payslipNoticeTitle(ym),
      body: [
        `${ym.year}年${ym.month}月分の給与明細ができました。`,
        "下の「給与」から確認できます。",
        "",
        "内容に心当たりのないところがあれば、教室までご連絡ください。",
      ].join("\n"),
      kind: MESSAGE_KIND.NOTICE,
      recipients: { create: targets.map((t) => ({ teacherId: t.teacherId })) },
    },
  });

  revalidatePath("/payroll");
  revalidatePath("/messages");
  revalidatePath("/t");
  revalidatePath("/t/messages");
  revalidatePath("/");
}
