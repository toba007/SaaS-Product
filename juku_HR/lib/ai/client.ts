/**
 * LLM の呼び出し口。
 *
 * ローカル(Ollama)と外部API(Claude)を差し替えられるようにインターフェースを挟む。
 * どちらを本番で使うかは、同じテストデータを両方に通して精度を比べてから決める。
 * その比較をやるために、呼び出し側のコードを書き直さずに切り替えられる必要がある。
 *
 * ここは Prisma にも Next.js にも依存しない。検証スクリプトから直接呼べるようにするため。
 */

export type LlmRequest = {
  system: string;
  user: string;
  /** 出力の形を固定する JSON Schema。自由文を正規表現で切り出す作りにしない。 */
  schema: object;
};

export type LlmResult<T> = {
  data: T;
  /** どのモデルが答えたか。結果を人が確認するときに出す。 */
  model: string;
  /** かかった時間（ミリ秒）。ローカルとAPIの比較に使う。 */
  elapsedMs: number;
};

export interface LlmClient {
  readonly name: string;
  complete<T>(req: LlmRequest): Promise<LlmResult<T>>;
}

/** 呼び出しに失敗したときの例外。画面側はこれを捕まえて手入力に誘導する。 */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
