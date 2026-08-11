"use client";

/**
 * 押す前に確認を出す送信ボタン。
 * 連絡の削除は既読・回答の記録ごと消えるなど、取り返しがつかない操作に使う。
 */
export function ConfirmSubmit({
  message,
  className,
  formAction,
  children,
}: {
  message: string;
  className?: string;
  /** 同じ form に別の送信先を持たせたいときに使う（削除ボタンなど） */
  formAction?: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
