import { prisma } from "./prisma";
import { TERM_KIND, TERM_KIND_LABEL } from "./constants";
import { withinTerm } from "./dates";

/** 画面のタブに出す順。ComiruHR と同じ並び。 */
export const TERM_KIND_ORDER = [
  TERM_KIND.REGULAR,
  TERM_KIND.SUMMER,
  TERM_KIND.WINTER,
  TERM_KIND.SPRING,
] as const;

export function isTermKind(v: string | undefined): v is string {
  return !!v && (TERM_KIND_ORDER as readonly string[]).includes(v);
}

/** URL の ?kind= を読む。おかしな値ならレギュラー。 */
export function parseTermKind(v: string | undefined): string {
  return isTermKind(v) ? v : TERM_KIND.REGULAR;
}

export type TermKindInfo = {
  kind: string;
  label: string;
  /** その種別の期（夏期講習が複数年ぶんあることもある） */
  terms: { id: number; name: string; startDate: string; endDate: string }[];
  periodCount: number;
};

/** タブに出すコマタイプの一覧。期が登録されていない種別も、タブ自体は出す。 */
export async function termKindTabs(): Promise<TermKindInfo[]> {
  const [terms, periods] = await Promise.all([
    prisma.term.findMany({ orderBy: { startDate: "asc" } }),
    prisma.period.findMany(),
  ]);

  return TERM_KIND_ORDER.map((kind) => ({
    kind,
    label: TERM_KIND_LABEL[kind],
    terms: terms
      .filter((t) => t.kind === kind)
      .map((t) => ({
        id: t.id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
      })),
    periodCount: periods.filter((p) => p.termKind === kind).length,
  }));
}

/** その日が属する期。登録が無ければ null。 */
export async function termForDate(date: string) {
  const terms = await prisma.term.findMany({ orderBy: { startDate: "asc" } });
  return terms.find((t) => withinTerm(date, t)) ?? null;
}

/**
 * その日のコマタイプ。期の登録が無い日はレギュラー扱い。
 * 「今日はレギュラーなのか講習なのか」は日付から決まるので、講師に選ばせない。
 */
export function termKindOfDate(
  date: string,
  terms: { kind: string; startDate: string; endDate: string }[],
): string {
  return terms.find((t) => withinTerm(date, t))?.kind ?? TERM_KIND.REGULAR;
}

/** そのコマタイプのコマ一覧 */
export async function periodsOfKind(termKind: string) {
  return prisma.period.findMany({
    where: { termKind },
    orderBy: { order: "asc" },
  });
}
