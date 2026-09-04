"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 実行中のあいだ、ページを定期的に取り直す。
 *
 * ローカルの AI に頼むと18分かかる。押したまま待たせるとブラウザが固まるので、
 * 記録だけ作って戻し、進み具合はここで見に行く。
 * 途中でページを閉じても実行は続くので、あとで開き直せば結果が出ている。
 */
export function AutoRefresh({
  startedAt,
  intervalMs = 5000,
}: {
  /** 実行を始めた時刻（ISO文字列）。経過時間の表示に使う */
  startedAt: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const began = new Date(startedAt).getTime();
    const tick = setInterval(() => setElapsed(Date.now() - began), 1000);
    const refresh = setInterval(() => router.refresh(), intervalMs);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router, startedAt, intervalMs]);

  const min = Math.floor(elapsed / 60000);
  const sec = Math.floor((elapsed % 60000) / 1000);

  return (
    <span className="tabular-nums">
      {min}分{String(sec).padStart(2, "0")}秒
    </span>
  );
}
