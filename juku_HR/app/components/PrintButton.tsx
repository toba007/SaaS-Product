"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print border border-slate-300 bg-white text-slate-700 text-sm font-medium px-4 py-2 rounded hover:bg-slate-50"
    >
      印刷
    </button>
  );
}
