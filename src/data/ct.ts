import type { CtManifest, CtSlice, CtSliceEntry, CtWindow, StructureRecord } from "../types";

export interface CtContext {
  index: number;
  total: number;
  window: string;
  windowName: string;
  structures: CtSliceEntry[];
  selected?: CtSliceEntry;
}

const PLACEHOLDER = /\{(\w+)(?::0(\d+)d)?\}/g;

export function fillCtPattern(pattern: string, values: Record<string, string | number>): string {
  return pattern.replace(PLACEHOLDER, (match, key: string, width?: string) => {
    const value = values[key];
    if (value === undefined) return match;
    return typeof value === "number" && width
      ? String(value).padStart(Number(width), "0")
      : String(value);
  });
}

export function ctAssetUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function ctBaseUrl(ct: CtManifest, index: number, windowId: string): string {
  return ctAssetUrl(fillCtPattern(ct.base_pattern, { index, window: windowId }));
}

export function ctOverlayUrl(ct: CtManifest, id: string, index: number): string {
  return ctAssetUrl(fillCtPattern(ct.overlay_pattern, { id, index }));
}

export function ctWindow(ct: CtManifest, id: string): CtWindow | undefined {
  return ct.windows.find((window) => window.id === id) ?? ct.windows[0];
}

export function ctSlice(ct: CtManifest, index: number): CtSlice | undefined {
  return ct.slices.find((slice) => slice.index === index);
}

export function ctEntry(
  ct: CtManifest,
  index: number,
  id: string | undefined,
): CtSliceEntry | undefined {
  if (!id) return undefined;
  return ctSlice(ct, index)?.structures.find((entry) => entry.id === id);
}

export function ctVisibleNames(ct: CtManifest, index: number): string {
  return (ctSlice(ct, index)?.structures ?? []).map((entry) => entry.name).join("、");
}

export function buildCtContext(
  ct: CtManifest,
  index: number,
  windowId: string,
  structure: Pick<StructureRecord, "id" | "name"> | null,
): CtContext | null {
  const slice = ctSlice(ct, index);
  const window = ctWindow(ct, windowId);
  if (!slice || !window) return null;
  const current = structure ? { id: structure.id, name: structure.name, voxels: 0 } : undefined;
  const selected = current
    ? (slice.structures.find((entry) => entry.id === current.id) ?? current)
    : undefined;
  return {
    index,
    total: ct.slice_count,
    window: window.id,
    windowName: window.name,
    structures: slice.structures,
    ...(selected ? { selected } : {}),
  };
}
