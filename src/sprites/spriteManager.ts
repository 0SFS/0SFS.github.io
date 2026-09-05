import { Color4, Sprite, SpriteManager, type DynamicTexture, type Scene, type Vector3 } from "@babylonjs/core";
import { DEFAULT_DOT_TEXTURE_SIZE, DEFAULT_SPRITE_CAPACITY } from "./types";

export function setSpriteOpacity(sprite: Sprite, opacity: number): void {
  sprite.color = new Color4(1, 1, 1, opacity);
}

export interface CreatePointSpriteManagerOptions {
  scene: Scene;
  name: string;
  capacity: number;
  texture: DynamicTexture;
  cellSize?: number;
  renderingGroupId?: number;
  isPickable?: boolean;
}

export function createPointSpriteManager(opts: CreatePointSpriteManagerOptions): SpriteManager {
  const manager = new SpriteManager(
    opts.name,
    "",
    Math.max(DEFAULT_SPRITE_CAPACITY, opts.capacity),
    opts.cellSize ?? DEFAULT_DOT_TEXTURE_SIZE,
    opts.scene,
  );
  manager.texture?.dispose?.();
  manager.texture = opts.texture;
  manager.isPickable = opts.isPickable ?? true;
  manager.renderingGroupId = opts.renderingGroupId ?? 1;
  return manager;
}

export interface CreatePointSpriteOptions {
  manager: SpriteManager;
  name: string;
  position: Vector3;
  size: number;
  cellIndex?: number;
  metadata?: unknown;
  opacity?: number;
  isPickable?: boolean;
}

export function createPointSprite(opts: CreatePointSpriteOptions): Sprite {
  const sprite = new Sprite(opts.name, opts.manager);
  sprite.position.copyFrom(opts.position);
  sprite.size = opts.size;
  sprite.isPickable = opts.isPickable ?? true;
  if (typeof opts.cellIndex === "number") sprite.cellIndex = opts.cellIndex;
  if (opts.metadata !== undefined) {
    (sprite as unknown as { metadata: unknown }).metadata = opts.metadata;
  }
  if (typeof opts.opacity === "number") setSpriteOpacity(sprite, opts.opacity);
  return sprite;
}

/**
 * Disposes the given sprite managers along with all their sprites. Safe to
 * call during teardown — disposal exceptions are swallowed.
 */
export function disposeSpriteManagers(managers: Iterable<SpriteManager>): void {
  for (const manager of managers) {
    try {
      for (const sprite of [...manager.sprites]) sprite.dispose();
      manager.dispose();
    } catch {
      // Ignore disposal races during teardown.
    }
  }
}
