/**
 * 塾ごとの設定。
 *
 * **「塾によって違う数字」をコードに埋めないための置き場所。**
 * 個別で1人が何人までみるか、教室がいくつあるか、といった値は塾ごとに違い、
 * ここを間違えると必要人数の計算がそのままずれる。
 *
 * 行は1つだけ（id = 1）。無ければ既定値で作る。
 */

import { prisma } from "./prisma";
import { INDIV_MAX_LIMIT } from "./constants";

export type SchoolSettingLite = {
  /** 個別で講師1人が同時にみてよい生徒の上限 */
  indivMaxStudents: number;
  /** 同時に使える集団教室の数 */
  maxGroupRooms: number;
  /** 同時に使える個別ブースの数 */
  maxIndivRooms: number;
};

/**
 * 未設定のときの値。
 *
 * **わざと小さくしてある。** 大きい既定値を置くと、登録し忘れたまま
 * 「4人みられる前提」で必要人数が少なく出て、当日人が足りなくなる。
 * 小さすぎる値なら「講師が足りません」と先に出るので、間違いに気づける。
 */
export const DEFAULT_SETTING: SchoolSettingLite = {
  indivMaxStudents: 2,
  maxGroupRooms: 1,
  maxIndivRooms: 1,
};

const SETTING_ID = 1;

export async function getSetting(): Promise<SchoolSettingLite> {
  const row = await prisma.schoolSetting.findUnique({ where: { id: SETTING_ID } });
  if (!row) return { ...DEFAULT_SETTING };
  return {
    indivMaxStudents: row.indivMaxStudents,
    maxGroupRooms: row.maxGroupRooms,
    maxIndivRooms: row.maxIndivRooms,
  };
}

/** 入力値を実際に保存できる形に丸める。画面から来た数字をそのまま信用しない。 */
export function normalizeSetting(input: Partial<SchoolSettingLite>): SchoolSettingLite {
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.trunc(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(n, max));
  };
  return {
    indivMaxStudents: clamp(
      input.indivMaxStudents,
      1,
      INDIV_MAX_LIMIT,
      DEFAULT_SETTING.indivMaxStudents,
    ),
    maxGroupRooms: clamp(input.maxGroupRooms, 0, 99, DEFAULT_SETTING.maxGroupRooms),
    maxIndivRooms: clamp(input.maxIndivRooms, 0, 99, DEFAULT_SETTING.maxIndivRooms),
  };
}

export async function saveSetting(
  input: Partial<SchoolSettingLite>,
): Promise<SchoolSettingLite> {
  const data = normalizeSetting(input);
  await prisma.schoolSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...data },
    update: data,
  });
  return data;
}
