// CODE39 バーコードを SVG として生成する（依存パッケージなし）。
// 各文字は9モジュール（バー5・スペース4、うち3本が太線）。文字間は細スペースで区切る。
// 一般的なバーコードリーダーで読み取れる規格。開始/終了記号は '*'。
const CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn',
  'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn',
  'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn',
  'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
  '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
};

export function code39Svg(value, opts = {}) {
  const { height = 54, narrow = 2, wide = 5, quiet = 16, showText = true } = opts;
  const data = String(value || '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '');
  const chars = ('*' + data + '*').split('');
  let x = quiet;
  let bars = '';
  chars.forEach((ch) => {
    const pat = CODE39[ch];
    if (!pat) return;
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === 'w' ? wide : narrow;
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
      x += w;
    }
    x += narrow; // 文字間の細スペース
  });
  const totalW = x + quiet;
  const textH = showText ? 17 : 0;
  const svgH = height + textH;
  const text = showText ? `<text x="${totalW / 2}" y="${height + 14}" text-anchor="middle" font-family="monospace" font-size="13" fill="#000">${data}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${svgH}" width="${totalW}" height="${svgH}" role="img" aria-label="バーコード ${data}"><rect width="${totalW}" height="${svgH}" fill="#fff"/>${bars}${text}</svg>`;
}
