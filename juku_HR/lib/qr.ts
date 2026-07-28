import QRCode from "qrcode";
import { headers } from "next/headers";

/** 二次元コードを SVG 文字列で返す */
export async function qrSvg(text: string, size = 160): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 0,
    width: size,
    errorCorrectionLevel: "M",
  });
}

/**
 * スマホのカメラから開ける絶対URLを組み立てる。
 * 二次元コードには絶対URLが要るが、試作なので固定のドメインが無い。
 * リクエストのホストから作ることで、localhost でも LAN の IP でもそのまま使える。
 */
export async function absoluteUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}
