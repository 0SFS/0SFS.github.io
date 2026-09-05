import { DynamicTexture, type Scene } from "@babylonjs/core";
import { DEFAULT_DOT_TEXTURE_SIZE, type MarkerStyle, rgbToCss } from "./types";

export function drawCircleAtlasCell(
  ctx: CanvasRenderingContext2D,
  style: MarkerStyle,
  originX: number,
  originY: number,
  cellSize: number = DEFAULT_DOT_TEXTURE_SIZE,
): void {
  const r = cellSize / 2;
  ctx.save();
  ctx.translate(originX, originY);
  ctx.clearRect(0, 0, cellSize, cellSize);
  ctx.beginPath();
  ctx.arc(r, r, r - 5, 0, Math.PI * 2);
  ctx.fillStyle = rgbToCss(style.fill);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = rgbToCss(style.stroke);
  ctx.stroke();
  ctx.restore();
}

/**
 * Build a horizontal dynamic-texture atlas of circular markers. Each style in
 * `styles` becomes one cell; the index of a style in the array is the
 * `sprite.cellIndex` to use when rendering that marker.
 */
export function makeCircularMarkerAtlas(
  scene: Scene,
  name: string,
  styles: MarkerStyle[],
  cellSize: number = DEFAULT_DOT_TEXTURE_SIZE,
): DynamicTexture {
  const width = cellSize * Math.max(1, styles.length);
  const tex = new DynamicTexture(name, { width, height: cellSize }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, width, cellSize);
  styles.forEach((style, idx) => {
    drawCircleAtlasCell(ctx, style, idx * cellSize, 0, cellSize);
  });
  tex.hasAlpha = true;
  tex.update(false);
  return tex;
}
