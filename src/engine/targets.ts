import type { TargetPalette, TargetShape } from './palette';

export interface TargetStyle extends TargetPalette {
  shape: TargetShape;
}

export function drawTarget(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  style: TargetStyle,
): void {
  switch (style.shape) {
    case 'ring': {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = Math.max(3, r * 0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = style.target;
      ctx.fill();
      return;
    }
    case 'square': {
      const s = r * 1.78;
      ctx.fillStyle = style.target;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = Math.max(2, r * 0.13);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      const inner = s * 0.42;
      ctx.fillStyle = style.inner;
      ctx.fillRect(x - inner / 2, y - inner / 2, inner, inner);
      return;
    }
    default: {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = style.target;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = style.inner;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.6, r * 0.09), 0, Math.PI * 2);
      ctx.fillStyle = style.ring;
      ctx.fill();
    }
  }
}

export function hitTarget(
  x: number,
  y: number,
  r: number,
  px: number,
  py: number,
  slack = 0,
): boolean {
  const dx = x - px;
  const dy = y - py;
  const reach = r + slack;
  return dx * dx + dy * dy <= reach * reach;
}

/** Draws the field backdrop and a centred square grid used by the aim modes. */
export function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  field: string,
  grid: string,
  gridStrong: string,
): void {
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = gridStrong;
  ctx.lineWidth = 1;
  const inset = Math.min(w, h) * 0.04;
  const tick = Math.min(14, inset * 0.9);
  ctx.beginPath();
  for (const [cx, cy] of [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ] as const) {
    const sx = cx < w / 2 ? 1 : -1;
    const sy = cy < h / 2 ? 1 : -1;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + tick * sx, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + tick * sy);
  }
  ctx.stroke();
  ctx.strokeStyle = grid;
  ctx.beginPath();
  ctx.moveTo(w / 2, inset);
  ctx.lineTo(w / 2, h - inset);
  ctx.moveTo(inset, h / 2);
  ctx.lineTo(w - inset, h / 2);
  ctx.stroke();
}
