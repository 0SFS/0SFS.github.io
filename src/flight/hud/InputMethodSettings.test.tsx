// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { InputMethodSettings } from "./FlightControlPanel";

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("gives the Controls tab an Input method section filled by the shared component", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const unmount = vi.fn();
  const attach = vi.fn((element: HTMLElement) => {
    element.append(Object.assign(document.createElement("p"), { textContent: "Touch" }));
    return unmount;
  });

  await act(async () => root.render(<InputMethodSettings attach={attach} />));
  expect(host.querySelector("legend")?.textContent).toBe("Input method");
  expect(attach).toHaveBeenCalledOnce();
  expect(host.querySelector("fieldset")?.textContent).toContain("Touch");

  await act(async () => root.unmount());
  expect(unmount).toHaveBeenCalledOnce();
});
