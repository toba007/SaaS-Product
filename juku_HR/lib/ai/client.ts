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

/**
 * 1回の呼び出しで、どれだけ読ませて、どれだけ書かせたか。
 *
 * ---- なぜ残すのか ----
 * ローカル実行の重さは **書かせた量でほぼ決まる。** 読む(prefill)は並列に効くが、
 * 書く(decode)は1トークンずつ進むため。「AI にどこまで任せるか」を決めるには、
 * 任せた範囲ごとに書かせた量を並べて比べるしかない。
 *
 * 推測で見積もらないために、モデルが返す実数をそのまま持つ。
 * Ollama は prompt_eval_count / eval_count を応答に入れて返している。
 */
export type LlmUsage = {
  /** 呼んだ回数。分割して頼むと増える */
  calls: number;
  /** 読ませたトークン数 */
  promptTokens: number;
  /** 書かせたトークン数。**ここが対象の数に比例すると重くなる** */
  outputTokens: number;
  /** 読むのにかかった時間（ミリ秒） */
  promptMs: number;
  /** 書くのにかかった時間（ミリ秒） */
  outputMs: number;
};

export const emptyUsage = (): LlmUsage => ({
  calls: 0,
  promptTokens: 0,
  outputTokens: 0,
  promptMs: 0,
  outputMs: 0,
});

/** 分割して頼んだぶんを足し合わせる。 */
export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    calls: a.calls + b.calls,
    promptTokens: a.promptTokens + b.promptTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    promptMs: a.promptMs + b.promptMs,
    outputMs: a.outputMs + b.outputMs,
  };
}

/** 書く速さ（トークン/秒）。0除算を避ける。 */
export function outputTokensPerSec(u: LlmUsage): number {
  if (u.outputMs <= 0) return 0;
  return u.outputTokens / (u.outputMs / 1000);
}

/**
 * 対象が n 件になったら、書くのに何ミリ秒かかるか。
 *
 * **1件あたりの出力量が変わらないと仮定した見込み。** 配置そのものを
 * 書かせている作りではこの仮定が当たり、生徒が増えるほど比例して伸びる。
 * 要望の翻訳のように出力が対象の数に依らない作りに変えれば、
 * 実測が見込みを大きく下回る。**その差が「任せ方を変えた効果」になる。**
 *
 * 測っていない（呼んでいない・件数0）ときは 0 を返す。
 */
export function projectOutputMs(u: LlmUsage, targetCount: number, n: number): number {
  if (targetCount <= 0 || u.outputMs <= 0) return 0;
  return Math.round((u.outputMs / targetCount) * n);
}

export type LlmResult<T> = {
  data: T;
  /** どのモデルが答えたか。結果を人が確認するときに出す。 */
  model: string;
  /** かかった時間（ミリ秒）。ローカルとAPIの比較に使う。 */
  elapsedMs: number;
  /** 読ませた量・書かせた量。モデルが返さなければ 0 が入る */
  usage: LlmUsage;
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
