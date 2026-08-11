"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * キーボードだけで動かせるようにする。Google カレンダーと同じ割り当てにしてある。
 *
 *   t … 今日へ    j / n … 次の月    k / p … 前の月    c … 予定を作る
 *
 * 予定をまとめて入れるとき、月送りのたびにマウスへ手を戻すのが煩わしいため。
 * 入力欄に文字を打っている最中は拾わない（"c" と打てなくなるので）。
 */
export function Shortcuts({
  prevHref,
  nextHref,
  todayHref,
  createHref,
}: {
  prevHref: string;
  nextHref: string;
  todayHref: string;
  createHref: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // 入力中・ダイアログを開いている最中は邪魔をしない
      const el = e.target as HTMLElement | null;
      if (
        el?.closest("input, textarea, select, [contenteditable='true'], dialog")
      ) {
        return;
      }

      const to = {
        t: todayHref,
        j: nextHref,
        n: nextHref,
        k: prevHref,
        p: prevHref,
        c: createHref,
      }[e.key.toLowerCase()];

      if (!to) return;
      e.preventDefault();
      router.push(to, { scroll: false });
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref, todayHref, createHref]);

  return null;
}
