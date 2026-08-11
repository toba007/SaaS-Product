"use client";

import { useOptimistic, useState, useTransition } from "react";
import { moveStudent } from "./actions";

/**
 * 生徒をドラッグしてクラスに振り分ける盤面。
 *
 * ライブラリは使わず HTML5 の drag and drop で書いている。依存を増やさないため。
 * 管理者画面は PC 前提なのでこれで足りる（スマホでは drag イベントが出ないので、
 * 下のセレクトで移動できるようにしてある）。
 *
 * 落とした瞬間に見た目を先に変える（useOptimistic）。サーバーの往復を待つと
 * 何十人も振り分けるときに引っかかって使えない。
 */

export type BoardStudent = { id: number; name: string; grade: string };
export type BoardClass = {
  id: number;
  name: string;
  level: number;
  levelLabel: string;
  /** "月曜 1限・2限" のようにまとめた時間割 */
  schedule: string;
  capacity: number;
};

type Props = {
  subjectId: number;
  subjectName: string;
  students: BoardStudent[];
  classes: BoardClass[];
  /** studentId -> classId（未配属は 0） */
  placement: Record<number, number>;
};

export function AssignBoard({
  subjectId,
  subjectName,
  students,
  classes,
  placement,
}: Props) {
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const [optimistic, applyOptimistic] = useOptimistic(
    placement,
    (state: Record<number, number>, move: { studentId: number; classId: number }) => ({
      ...state,
      [move.studentId]: move.classId,
    }),
  );

  function move(studentId: number, classId: number) {
    if (optimistic[studentId] === classId) return;
    startTransition(async () => {
      applyOptimistic({ studentId, classId });
      const fd = new FormData();
      fd.set("studentId", String(studentId));
      fd.set("toClassId", String(classId));
      fd.set("subjectId", String(subjectId));
      await moveStudent(fd);
    });
  }

  const inBox = (classId: number) =>
    students.filter((s) => (optimistic[s.id] ?? 0) === classId);

  const unassigned = inBox(0);

  const common = {
    classes,
    dragging,
    over,
    setDragging,
    setOver,
    move,
    placement: optimistic,
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Box
          {...common}
          classId={0}
          title="未配属"
          subtitle={`${subjectName}を集団で取っている生徒`}
          capacity={0}
          tone="unassigned"
          members={unassigned}
        />
        {classes.map((c) => (
          <Box
            {...common}
            key={c.id}
            classId={c.id}
            title={`${c.levelLabel} ${c.name}`}
            subtitle={c.schedule}
            capacity={c.capacity}
            tone="class"
            members={inBox(c.id)}
          />
        ))}
      </div>

      {unassigned.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {unassigned.length}人がまだクラスに入っていません。
          このままだと授業に出られないまま気づかれません。
        </p>
      )}
    </div>
  );
}

/** 未配属と各クラスの箱。ドロップ先になる。 */
function Box({
  classId,
  title,
  subtitle,
  capacity,
  tone,
  members,
  classes,
  dragging,
  over,
  setDragging,
  setOver,
  move,
  placement,
}: {
  classId: number;
  title: string;
  subtitle?: string;
  capacity: number;
  tone: "unassigned" | "class";
  members: BoardStudent[];
  classes: BoardClass[];
  dragging: number | null;
  over: number | null;
  setDragging: (v: number | null) => void;
  setOver: (v: number | null) => void;
  move: (studentId: number, classId: number) => void;
  placement: Record<number, number>;
}) {
  const isOver = over === classId;
  const overCap = capacity > 0 && members.length > capacity;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (over !== classId) setOver(classId);
      }}
      onDragLeave={() => setOver(over === classId ? null : over)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(null);
        const id = Number(e.dataTransfer.getData("text/plain"));
        if (Number.isInteger(id) && id > 0) move(id, classId);
        setDragging(null);
      }}
      className={`rounded-lg border p-2 min-h-32 transition-colors ${
        isOver
          ? "border-indigo-400 bg-indigo-50"
          : tone === "unassigned"
            ? "border-amber-200 bg-amber-50/40"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <div
          className={`text-xs tabular-nums ${
            overCap ? "text-rose-600 font-bold" : "text-slate-400"
          }`}
        >
          {members.length}
          {capacity > 0 ? ` / ${capacity}` : "人"}
        </div>
      </div>
      {subtitle && <div className="text-[11px] text-slate-400 mb-1.5">{subtitle}</div>}

      {overCap && <p className="text-[11px] text-rose-700 mb-1.5">定員を超えています</p>}

      <ul className="space-y-1">
        {members.map((s) => (
          <li
            key={s.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", String(s.id));
              e.dataTransfer.effectAllowed = "move";
              setDragging(s.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-sm cursor-grab active:cursor-grabbing ${
              dragging === s.id
                ? "opacity-40 border-slate-200"
                : "bg-white border-slate-200 hover:border-indigo-300"
            }`}
          >
            <span className="text-slate-300 text-xs select-none">⠿</span>
            <span className="text-slate-900 truncate">{s.name}</span>
            {/* スマホや、ドラッグが使えない環境の逃げ道 */}
            <select
              aria-label={`${s.name} の配属先`}
              value={placement[s.id] ?? 0}
              onChange={(e) => move(s.id, Number(e.target.value))}
              className="ml-auto text-[11px] text-slate-400 bg-transparent border-0 focus:text-slate-700"
            >
              <option value={0}>未配属</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.levelLabel}
                </option>
              ))}
            </select>
          </li>
        ))}
        {members.length === 0 && (
          <li className="text-[11px] text-slate-300 py-2 text-center select-none">
            ここにドラッグ
          </li>
        )}
      </ul>
    </div>
  );
}
