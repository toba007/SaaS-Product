/**
 * 給与設定の列組み。ヘッダ（サーバー部品）と各行（クライアント部品）の両方から使うので、
 * "use client" の付いていないここに置く。クライアント側の関数はサーバーから呼べない。
 *
 * 列は賃金項目の数だけ増える。項目は塾ごとに違うため、Tailwind のクラス名では表せない
 * （クラス名は書いた時点で決まっている必要がある）。style で組む。
 */
export function gridStyle(columns: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `10rem repeat(${columns}, minmax(6rem, 1fr)) 6rem`,
    gap: "0.5rem",
    alignItems: "center",
  };
}
