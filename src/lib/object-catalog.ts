export type ObjectId = "cube" | "knight" | "football" | "sock";
export const OBJECT_CHOICES = [
  { id: "knight", label: "Chess knight", number: "01" },
  { id: "football", label: "Football", number: "02" },
  { id: "sock", label: "Single sock", number: "03" },
] as const;
export const OBJECT_LABELS: Record<ObjectId, string> = {
  cube: "cube", knight: "chess knight", football: "football", sock: "single sock",
};
