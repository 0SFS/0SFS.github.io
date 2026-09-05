import { describe, expect, it, vi } from "vitest";
import { createInertialCameraController } from "./inertialCameraController";

describe("createInertialCameraController", () => {
  it("applies queued pan, orbit, and zoom on update", () => {
    const target = {
      panBy: vi.fn(),
      orbitBy: vi.fn(),
      zoomBy: vi.fn(),
    };
    const controller = createInertialCameraController(target);

    controller.panBy(12, -6, 800);
    controller.orbitBy(2, -3);
    controller.zoomBy(0.92);
    controller.update(1000);

    expect(target.panBy).toHaveBeenCalledWith(12, -6, 800);
    expect(target.orbitBy).toHaveBeenCalledWith(2, -3);
    expect(target.zoomBy).toHaveBeenCalledWith(expect.closeTo(0.92, 6));
  });

  it("decays motion after each update", () => {
    const target = {
      panBy: vi.fn(),
      orbitBy: vi.fn(),
      zoomBy: vi.fn(),
    };
    const controller = createInertialCameraController(target);

    controller.panBy(10, 0, 800);
    controller.update(1000);
    controller.update(1000 + 1000 / 60);

    expect(target.panBy).toHaveBeenNthCalledWith(1, 10, 0, 800);
    expect(target.panBy).toHaveBeenNthCalledWith(2, expect.closeTo(8.2, 1), 0, 800);
  });

  it("cancels queued motion", () => {
    const target = {
      panBy: vi.fn(),
      orbitBy: vi.fn(),
      zoomBy: vi.fn(),
    };
    const controller = createInertialCameraController(target);

    controller.panBy(10, 0, 800);
    controller.orbitBy(5, 5);
    controller.zoomBy(1.08);
    controller.cancel();
    controller.update(1000);

    expect(target.panBy).not.toHaveBeenCalled();
    expect(target.orbitBy).not.toHaveBeenCalled();
    expect(target.zoomBy).not.toHaveBeenCalled();
  });

  it("reports isActive() while velocity exceeds stop thresholds", () => {
    const target = {
      panBy: vi.fn(),
      orbitBy: vi.fn(),
      zoomBy: vi.fn(),
    };
    const controller = createInertialCameraController(target);
    expect(controller.isActive()).toBe(false);

    controller.panBy(10, 0, 800);
    expect(controller.isActive()).toBe(true);

    controller.cancel();
    expect(controller.isActive()).toBe(false);
  });
});