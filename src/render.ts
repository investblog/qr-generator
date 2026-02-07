import type { Preset } from './types';
import type { QrMatrix } from './qr';

export function renderSvg(matrix: QrMatrix, quiet: number, preset: Preset): string {
  const dim = matrix.size + 2 * quiet;
  const d = buildPathData(matrix.data, quiet, matrix.size);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}"` +
    ` width="${preset.width}" height="${preset.height}"` +
    ` shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/>` +
    (d ? `<path fill="#000" d="${d}"/>` : '') +
    `</svg>`
  );
}

function buildPathData(data: boolean[][], quiet: number, size: number): string {
  const parts: string[] = [];

  for (let y = 0; y < size; y++) {
    const row = data[y];
    let x = 0;
    while (x < size) {
      if (row[x]) {
        const startX = x;
        while (x < size && row[x]) x++;
        const w = x - startX;
        const sx = startX + quiet;
        const sy = y + quiet;
        parts.push(`M${sx} ${sy}h${w}v1h-${w}z`);
      } else {
        x++;
      }
    }
  }

  return parts.join('');
}
