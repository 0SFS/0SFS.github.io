import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { C172_GROUND_CONTACTS, groundContactBodyPosition } from "./collisionGeometry";
import { groundContactClearanceMeters } from "./groundContactClearance";

describe("shared aircraft collision geometry", () => {
  it("matches every ground contact in the aircraft XML actually loaded by JSBSim", () => {
    const xml = readFileSync("public/jsbsim-data/aircraft/c172p/c172p.xml", "utf8");
    const contacts = [...xml.matchAll(/<contact\b([^>]*)>([\s\S]*?)<\/contact>/g)].map(([, attributes, body]) => {
      const location = body.match(/<location\s+unit="IN">([\s\S]*?)<\/location>/)?.[1];
      expect(location).toBeDefined();
      const coordinate = (axis: string) => Number(location!.match(new RegExp(`<${axis}>([^<]+)</${axis}>`))?.[1]);
      return {
        name: attributes.match(/name="([^"]+)"/)?.[1],
        kind: attributes.match(/type="([^"]+)"/)?.[1] === "BOGEY" ? "wheel" : "structure",
        xIn: coordinate("x"), yIn: coordinate("y"), zIn: coordinate("z"),
      };
    });
    expect(C172_GROUND_CONTACTS).toEqual(contacts);
  });

  it("places a contact ahead, left and below the CG in probe/renderer axes", () => {
    const position = groundContactBodyPosition({ xIn: 60, yIn: -6, zIn: -10 }, { xIn: 100, yIn: 4, zIn: 20 });
    expect(position.left).toBeCloseTo(0.254);
    expect(position.up).toBeCloseTo(-0.762);
    expect(position.forward).toBeCloseTo(1.016);
  });

  it("uses the current payload/fuel CG rather than anchoring contacts to the empty-aircraft CG", () => {
    const contact = C172_GROUND_CONTACTS[1];
    const initial = groundContactBodyPosition(contact, { xIn: 40, yIn: 0, zIn: 20 });
    const changed = groundContactBodyPosition(contact, { xIn: 44, yIn: 2, zIn: 17 });
    expect(changed.forward - initial.forward).toBeCloseTo(0.1016);
    expect(changed.left - initial.left).toBeCloseTo(0.0508);
    expect(changed.up - initial.up).toBeCloseTo(0.0762);
  });

  it.each([{ roll: 0, pitch: 0 }, { roll: Math.PI / 2, pitch: 0 }, { roll: 0, pitch: Math.PI / 2 }])(
    "uses the same contact positions for ground clearance at roll=$roll, pitch=$pitch", ({ roll, pitch }) => {
      const cg = { xIn: 44, yIn: 2, zIn: 17 };
      const values: Record<string, number> = { "inertia/cg-x-in": cg.xIn, "inertia/cg-y-in": cg.yIn, "inertia/cg-z-in": cg.zIn };
      const sdk = { getPropertyValue: vi.fn((name: string) => values[name]) };
      const points = C172_GROUND_CONTACTS.map(contact => groundContactBodyPosition(contact, cg));
      // At level, knife-edge right bank, and vertical nose-up attitudes,
      // the downward extent is respectively -up, -left, and -forward.
      const extent = roll !== 0 ? Math.max(...points.map(point => -point.left))
        : pitch !== 0 ? Math.max(...points.map(point => -point.forward))
          : Math.max(...points.map(point => -point.up));
      expect(groundContactClearanceMeters(sdk as never, roll, pitch)).toBeCloseTo(extent, 12);
      expect(sdk.getPropertyValue).toHaveBeenCalledTimes(3);
    },
  );
});
