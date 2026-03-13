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

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100];

export function getLevelFromXp(xp: number): number {
  if (xp >= 2100) return 7;
  if (xp >= 1500) return 6;
  if (xp >= 1000) return 5;
  if (xp >= 600) return 4;
  if (xp >= 300) return 3;
  if (xp >= 100) return 2;
  return 1;
}

export function getLevelProgress(xp: number) {
  const level = getLevelFromXp(xp);
  const currentMin = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextLevelXp = LEVEL_THRESHOLDS[level] ?? null;
  const progressPercent =
    nextLevelXp == null ? 100 : Math.min(100, ((xp - currentMin) / (nextLevelXp - currentMin)) * 100);
  return {
    level,
    currentXp: xp,
    currentMin,
    nextLevelXp,
    progressPercent,
  };
}
