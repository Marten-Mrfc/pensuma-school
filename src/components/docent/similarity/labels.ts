/** Dutch labels for the similarity check. Pure module. */

/** "Zeer hoog" (≥ 90%), "Hoog" (≥ 80%) or "Opvallend". */
export function similarityLevel(score: number): {
  label: string;
  tone: "destructive" | "warning" | "info";
} {
  if (score >= 0.9) return { label: "Zeer hoog", tone: "destructive" };
  if (score >= 0.8) return { label: "Hoog", tone: "warning" };
  return { label: "Opvallend", tone: "info" };
}

export function similarityPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Feature chips of a pair. */
export function pairFeatures(pair: {
  exact: boolean;
  identicalStructure: boolean;
  pasteCount: number;
  withSolution: boolean;
}): string[] {
  const features: string[] = [];
  if (pair.exact) features.push("Identiek");
  else if (pair.identicalStructure)
    features.push("Zelfde opbouw, andere namen");
  if (pair.pasteCount > 0)
    features.push(`Plakken gelogd (${pair.pasteCount}×)`);
  if (pair.withSolution) features.push("Lijkt op modeloplossing");
  return features;
}
