export const SWATCHES = [
  { name: "Blue", hex: "#1e6091" },
  { name: "Green", hex: "#4a7c59" },
  { name: "Terracotta", hex: "#c97b63" },
  { name: "Plum", hex: "#8a5a83" },
  { name: "Amber", hex: "#a8762c" },
  { name: "Teal", hex: "#2a7f7f" },
  { name: "Slate", hex: "#566270" },
  { name: "Rust", hex: "#a4553a" },
] as const;

export const DEFAULT_SWATCH = SWATCHES[6].hex;

export function isSwatch(hex: string): boolean {
  return SWATCHES.some((s) => s.hex.toLowerCase() === hex.toLowerCase());
}

export function swatchOr(hex: string | null | undefined): string {
  if (!hex) return DEFAULT_SWATCH;
  return isSwatch(hex) ? hex : DEFAULT_SWATCH;
}
