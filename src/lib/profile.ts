export const PRESET_AVATARS = [
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=PixelFox",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=HappyCat",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=GameHero",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=RocketKid",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=CoolBear",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=NeonPanda",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=QuizOwl",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=MemoryStar",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=TomJerry",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=CyberDuck",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=LuckyLion",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=RainbowBot",
];

export const PROFILE_COLORS = [
  "#22c55e",
  "#06b6d4",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
];

export function getLevelFromXp(totalXp: number): number {
  return Math.max(1, Math.floor(totalXp / 100) + 1);
}
