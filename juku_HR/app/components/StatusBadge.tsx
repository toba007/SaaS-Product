import { CARD_STATUS, CARD_STATUS_LABEL } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === CARD_STATUS.DELIVERED
      ? "bg-emerald-50 text-emerald-700"
      : status === CARD_STATUS.READY
        ? "bg-sky-50 text-sky-700"
        : "bg-amber-100 text-amber-800";
  return (
    <span className={`px-2 py-0.5 rounded ${cls}`}>
      {CARD_STATUS_LABEL[status]}
    </span>
  );
}
