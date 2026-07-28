"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MESSAGE_KIND } from "@/lib/constants";

function refresh(id?: number) {
  if (id) revalidatePath(`/messages/${id}`);
  revalidatePath("/messages");
  revalidatePath("/");
}

/**
 * 連絡・アンケートを送る。
 * 宛先を選ばなければ全員（一斉連絡）。選べば個別連絡。
 */
export async function createMessage(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const kind = String(formData.get("kind") ?? MESSAGE_KIND.NOTICE);
  const options = String(formData.get("options") ?? "").trim();
  const teacherIds = formData.getAll("teacherIds").map(Number).filter(Boolean);

  if (!title) return;

  // 宛先未選択は全員宛て。「送ったつもりで誰にも届いていない」を防ぐ。
  const recipients =
    teacherIds.length > 0
      ? teacherIds
      : (await prisma.teacher.findMany({ where: { active: true } })).map((t) => t.id);
  if (recipients.length === 0) return;

  const message = await prisma.message.create({
    data: {
      title,
      body,
      kind,
      options: kind === MESSAGE_KIND.SURVEY ? options : "",
      recipients: { create: recipients.map((teacherId) => ({ teacherId })) },
    },
  });

  refresh();
  redirect(`/messages/${message.id}`);
}

export async function deleteMessage(formData: FormData) {
  await prisma.message.delete({ where: { id: Number(formData.get("id")) } });
  revalidatePath("/messages");
  revalidatePath("/");
  redirect("/messages");
}

/** 講師が読んだ／読んでいないを切り替える（試作なので手で切り替えられる） */
export async function toggleRead(formData: FormData) {
  const id = Number(formData.get("recipientId"));
  const r = await prisma.messageRecipient.findUnique({ where: { id } });
  if (!r) return;

  await prisma.messageRecipient.update({
    where: { id },
    data: { readAt: r.readAt ? null : new Date() },
  });
  refresh(r.messageId);
}

/** アンケートに答える */
export async function answerSurvey(formData: FormData) {
  const id = Number(formData.get("recipientId"));
  const answer = String(formData.get("answer") ?? "").trim();
  const r = await prisma.messageRecipient.findUnique({ where: { id } });
  if (!r) return;

  await prisma.messageRecipient.update({
    where: { id },
    data: {
      answer: answer || null,
      answeredAt: answer ? new Date() : null,
      // 答えたなら読んでいる
      readAt: r.readAt ?? (answer ? new Date() : null),
    },
  });
  refresh(r.messageId);
}
