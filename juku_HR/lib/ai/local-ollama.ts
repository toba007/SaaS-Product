/**
 * ローカルの Ollama を呼ぶ。
 *
 * 追加の依存パッケージは要らない（fetch は Node に入っている）。
 * Ollama が起動していれば http://127.0.0.1:11434 で待ち受けている。
 *
 * このPCは GPU が内蔵(Intel Iris Xe)なので CPU で動く。7B級で毎秒4〜7トークン程度なので、
 * 対話用ではなくまとめて処理する用途を想定してタイムアウトを長めに取っている。
 */

import { LlmClient, LlmError, LlmRequest, LlmResult, LlmUsage } from "./client";

const DEFAULT_URL = "http://127.0.0.1:11434";

/**
 * Gemma 4 の E2B を QAT（量子化を織り込んで学習したもの）で使う。
 *
 * gemma3:4b と比べて、曖昧な言い方のペア（「相性が悪いかも」）を拾えるかどうかが違う。
 * 実測では gemma3 が 1/3 回、gemma4 が 3/3 回（scripts/compare-models.ts）。
 * 現場のメモは曖昧な書き方が多いので、ここを落とすと機能の価値が半減する。
 *
 * 3倍遅い（32秒 → 94秒）が、1日1回まとめて流す使い方なので問題にならない。
 * ライセンスも Gemma 3 の独自ライセンスから Apache 2.0 になっている。
 */
const DEFAULT_MODEL = "gemma4:e2b-it-qat";

/**
 * CPU 実行だと数分かかる。実測で出力2トークン/秒ほどなので、
 * 20件ぶんの時間割（出力1,000トークン超）だと10分近くかかる。
 * 呼ぶ側で伸ばせるようにしてある。
 */
const TIMEOUT_MS = 300_000;

type OllamaChatResponse = {
  message?: { content?: string };
  error?: string;
  /** 読ませたトークン数。Ollama が数えて返す */
  prompt_eval_count?: number;
  /** 読むのにかかった時間（ナノ秒） */
  prompt_eval_duration?: number;
  /** 書かせたトークン数 */
  eval_count?: number;
  /** 書くのにかかった時間（ナノ秒） */
  eval_duration?: number;
};

/** ナノ秒 → ミリ秒。Ollama の時間はすべてナノ秒で返る。 */
const msOf = (ns: number | undefined) => (typeof ns === "number" ? Math.round(ns / 1e6) : 0);

/**
 * 応答から実測値を取り出す。
 *
 * **見積もりではなくモデルが数えた実数。** 「AI にどこまで任せるか」を
 * 決めるのに使うので、文字数から推し量った値を混ぜない。
 * 返ってこないフィールドは 0 のままにして、無かったことが分かるようにする。
 */
function usageOf(body: OllamaChatResponse): LlmUsage {
  return {
    calls: 1,
    promptTokens: body.prompt_eval_count ?? 0,
    outputTokens: body.eval_count ?? 0,
    promptMs: msOf(body.prompt_eval_duration),
    outputMs: msOf(body.eval_duration),
  };
}

export class OllamaClient implements LlmClient {
  readonly name: string;

  constructor(
    private readonly model: string = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
    private readonly baseUrl: string = process.env.OLLAMA_URL ?? DEFAULT_URL,
    /** 待つ上限（ミリ秒）。まとめて流す処理では伸ばす。 */
    private readonly timeoutMs: number = TIMEOUT_MS,
  ) {
    this.name = `ollama/${this.model}`;
  }

  async complete<T>(req: LlmRequest): Promise<LlmResult<T>> {
    const startedAt = Date.now();

    // AbortSignal.timeout だけだと「Ollama が起動していない」場合の
    // 接続拒否と区別が付かないので、エラーを分けて投げ直す。
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          // Ollama は JSON Schema を渡すと出力の形を固定してくれる
          format: req.schema,
          // 同じ入力なら同じ結果に近づける。完全な再現性は保証されない。
          options: { temperature: 0 },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
      });
    } catch (e) {
      // タイムアウトを「接続できません」と報告すると、起動しているのに
      // 起動を疑うことになる。原因が違うので分けて出す。
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new LlmError(
          `Ollama が ${Math.round(this.timeoutMs / 1000)} 秒以内に答えませんでした。` +
            `入力が大きすぎるか、モデルが重すぎます（model=${this.model}）。`,
          e,
        );
      }
      throw new LlmError(
        `Ollama に接続できませんでした（${this.baseUrl}）。起動しているか確認してください。`,
        e,
      );
    }

    if (!res.ok) {
      throw new LlmError(`Ollama がエラーを返しました: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as OllamaChatResponse;
    if (body.error) throw new LlmError(`Ollama: ${body.error}`);

    const content = body.message?.content;
    if (!content) throw new LlmError("Ollama の応答が空でした");

    let data: T;
    try {
      data = JSON.parse(content) as T;
    } catch (e) {
      // format を指定していてもモデルが崩れた JSON を返すことがある。
      // 小さいモデルほど起きやすいので、原因が分かるように中身を添える。
      throw new LlmError(`応答を JSON として読めませんでした: ${content.slice(0, 200)}`, e);
    }

    return {
      data,
      model: this.name,
      elapsedMs: Date.now() - startedAt,
      usage: usageOf(body),
    };
  }
}

/** Ollama が起動していて、指定したモデルが入っているか確かめる */
export async function checkOllama(
  model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
  baseUrl = process.env.OLLAMA_URL ?? DEFAULT_URL,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { ok: false, message: `Ollama の応答が異常です (${res.status})` };

    const body = (await res.json()) as { models?: { name: string }[] };
    const names = (body.models ?? []).map((m) => m.name);
    if (!names.some((n) => n === model || n.startsWith(`${model}:`))) {
      return {
        ok: false,
        message: `モデル ${model} が見つかりません。'ollama pull ${model}' を実行してください。入っているモデル: ${names.join(", ") || "なし"}`,
      };
    }
    return { ok: true, message: `Ollama 起動中・${model} 利用可能` };
  } catch {
    return {
      ok: false,
      message: `Ollama に接続できません（${baseUrl}）。起動しているか確認してください。`,
    };
  }
}
