export interface ColorSwatch {
  id: string;
  label: string;
  value: string;
  textColor?: string;
}

export const STICKY_PALETTE: readonly ColorSwatch[] = [
  { id: "sunshine", label: "Солнечный", value: "#FEF08A", textColor: "#1E293B" },
  { id: "peach", label: "Персиковый", value: "#FED7AA", textColor: "#1E293B" },
  { id: "coral", label: "Коралловый", value: "#FECDD3", textColor: "#1E293B" },
  { id: "lavender", label: "Лавандовый", value: "#E9D5FF", textColor: "#1E293B" },
  { id: "sky", label: "Небесный", value: "#BAE6FD", textColor: "#0F172A" },
  { id: "mint", label: "Мятный", value: "#BBF7D0", textColor: "#0F172A" },
  { id: "aqua", label: "Аквамарин", value: "#99F6E4", textColor: "#0F172A" },
  { id: "cloud", label: "Облачный", value: "#F1F5F9", textColor: "#1E293B" },
] as const;

export const SHAPE_FILL_PALETTE: readonly ColorSwatch[] = [
  { id: "white", label: "Белый", value: "#FFFFFF" },
  { id: "transparent", label: "Прозрачный", value: "transparent" },
  { id: "indigo-soft", label: "Индиго", value: "#EEF2FF" },
  { id: "sky-soft", label: "Голубой", value: "#E0F2FE" },
  { id: "emerald-soft", label: "Изумрудный", value: "#ECFDF5" },
  { id: "amber-soft", label: "Янтарный", value: "#FFFBEB" },
  { id: "rose-soft", label: "Розовый", value: "#FFF1F2" },
  { id: "violet-soft", label: "Фиолетовый", value: "#F5F3FF" },
] as const;

export const STROKE_AND_TEXT_PALETTE: readonly ColorSwatch[] = [
  { id: "slate-900", label: "Графит", value: "#0F172A" },
  { id: "indigo-600", label: "Индиго", value: "#4F46E5" },
  { id: "blue-600", label: "Синий", value: "#2563EB" },
  { id: "emerald-600", label: "Зелёный", value: "#059669" },
  { id: "amber-600", label: "Янтарный", value: "#D97706" },
  { id: "rose-600", label: "Алый", value: "#E11D48" },
  { id: "violet-600", label: "Фиолетовый", value: "#7C3AED" },
  { id: "slate-500", label: "Серый", value: "#64748B" },
] as const;

export const FONT_SIZE_PRESETS = [14, 18, 24, 32, 44] as const;

export const DEFAULT_STICKY_COLOR = STICKY_PALETTE[0]!.value;
export const DEFAULT_SHAPE_FILL = SHAPE_FILL_PALETTE[0]!.value;
export const DEFAULT_SHAPE_STROKE = STROKE_AND_TEXT_PALETTE[1]!.value;
export const DEFAULT_TEXT_COLOR = STROKE_AND_TEXT_PALETTE[0]!.value;
