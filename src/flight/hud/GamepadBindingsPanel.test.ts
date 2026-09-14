// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BindingRuntime, createProfileStore, parseProfile } from "@felipegalind0/gamepad-tools/core";
import { createBrowserInputSource } from "@felipegalind0/gamepad-tools/browser";
import { mountBindingEditor, type BindingEditorHandle } from "@felipegalind0/gamepad-tools/ui";
import { createFlightInputManager } from "../input/flightInputManager";
import { createFlightGamepadAdapter, createLegacyFlightProfile, createStandardFlightProfile } from "../input/gamepadToolsAdapter";

const viewer = vi.hoisted(() => ({
  create: vi.fn(), dispose: vi.fn(), setSnapshot: vi.fn(),
}));
vi.mock("@felipegalind0/gamepad-tools/viewer", () => ({
  createControllerViewer: viewer.create,
}));

let editor: BindingEditorHandle;
let root: HTMLElement;
let runtime: BindingRuntime;
let source: ReturnType<typeof createBrowserInputSource>;

beforeEach(async () => {
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); },
    removeItem: (key: string) => { saved.delete(key); },
  });
  vi.clearAllMocks();
  viewer.create.mockReturnValue({ dispose: viewer.dispose, setSnapshot: viewer.setSnapshot });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  root = document.createElement("div");
  document.body.append(root);
  source = createBrowserInputSource({ target: window });
  runtime = new BindingRuntime({
    profile: createStandardFlightProfile(),
    adapter: createFlightGamepadAdapter(createFlightInputManager()),
  });
  editor = mountBindingEditor({
    root, source, runtime, store: createProfileStore(),
    builtInProfiles: [
      { id: "xbox", label: "Xbox", create: createStandardFlightProfile },
      { id: "classic", label: "Classic", create: createLegacyFlightProfile },
    ],
  });
  await Promise.resolve();
  await Promise.resolve();
});

afterEach(() => {
  editor?.destroy();
  source?.dispose();
  runtime?.dispose();
  root?.remove();
  vi.unstubAllGlobals();
});

function action(label: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find((entry) => entry.textContent === label);
  if (!button) throw new Error("Missing action: " + label);
  return button;
}

function choose(id: string): void {
  const select = root.querySelector<HTMLSelectElement>('select[aria-label="Profile"]')!;
  select.value = id;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("profile editor", () => {
  it("uses one profile selector and a menu without redundant headings or preset buttons", () => {
    const select = root.querySelector<HTMLSelectElement>('select[aria-label="Profile"]')!;
    expect(Array.from(select.options, (option) => option.text)).toEqual(["Xbox", "Classic"]);
    expect(root.querySelector('input[aria-label="Profile name"]')).toBeNull();
    expect(root.querySelector("h2")).toBeNull();
    expect(root.querySelector(".gt-presets")).toBeNull();
    expect(root.querySelector(".gt-profile-menu")?.contains(action("Duplicate"))).toBe(true);
    expect(root.querySelector(".gt-profile-menu")?.contains(action("Delete"))).toBe(true);
    choose("0sfs-legacy-compatible");
    expect(runtime.getProfile().name).toBe("Classic");
    expect(root.querySelector<HTMLElement>('[role="status"]')!.hidden).toBe(true);
  });

  it("replaces the selector with inline rename and saves the result as a custom profile", () => {
    action("Edit name").click();
    expect(root.querySelector('select[aria-label="Profile"]')).toBeNull();
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Profile name"]')!;
    input.value = "My Xbox";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(runtime.getProfile().name).toBe("My Xbox");
    expect(root.querySelector('input[aria-label="Profile name"]')).toBeNull();
    const select = root.querySelector<HTMLSelectElement>('select[aria-label="Profile"]')!;
    expect(select.selectedOptions[0].text).toBe("My Xbox");
    expect(Array.from(select.options, (option) => option.text)).toContain("Xbox");
  });

  it("cancels rename with Escape without altering the active profile", () => {
    action("Edit name").click();
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Profile name"]')!;
    input.value = "Discard";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(runtime.getProfile().name).toBe("Xbox");
  });

  it("deletes a duplicate from both the selector and saved profiles", async () => {
    action("Duplicate").click();
    const id = runtime.getProfile().profileId;
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Profile name"]')!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(async () => {
      expect(await createProfileStore().loadProfile("0sfs", id)).not.toBeNull();
    });
    action("Delete").click();
    await vi.waitFor(() => {
      expect(root.querySelector('option[value="' + id + '"]')).toBeNull();
    });
    expect(await createProfileStore().loadProfile("0sfs", id)).toBeNull();
  });

  it("keeps the same preview canvas and viewer across profile changes", async () => {
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await vi.waitFor(() => expect(viewer.create).toHaveBeenCalledTimes(1));
    const canvas = root.querySelector("canvas");
    choose("0sfs-legacy-compatible");
    choose("0sfs-standard-flight");
    expect(root.querySelector("canvas")).toBe(canvas);
    expect(viewer.dispose).not.toHaveBeenCalled();
    expect(viewer.create).toHaveBeenCalledTimes(1);
  });

  it("preserves configurations saved over an old built-in profile", async () => {
    editor.destroy();
    const store = createProfileStore();
    const oldProfile = createLegacyFlightProfile();
    const edited = {
      ...oldProfile, name: "Legacy 0sfs compatibility",
      bindings: oldProfile.bindings.filter((binding) => binding.actionId !== "flight.brake"),
    };
    await store.saveProfile("0sfs", edited);
    editor = mountBindingEditor({
      root, source, runtime, store,
      builtInProfiles: [{
        id: "classic", label: "Classic", previousNames: ["Legacy 0sfs compatibility"],
        create: createLegacyFlightProfile,
      }],
    });
    const savedId = oldProfile.profileId + "-saved";
    await vi.waitFor(() => expect(root.querySelector('option[value="' + savedId + '"]')).not.toBeNull());
    choose(savedId);
    expect(runtime.getProfile().name).toBe("Classic (saved)");
    expect(runtime.getProfile().bindings).toEqual(parseProfile(edited).bindings);
    expect((await store.loadProfile("0sfs", savedId))?.bindings).toEqual(edited.bindings);
    action("Delete").click();
    await vi.waitFor(() => expect(root.querySelector('option[value="' + savedId + '"]')).toBeNull());
    expect(await store.loadProfile("0sfs", oldProfile.profileId)).toBeNull();
  });
});
