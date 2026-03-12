import type { UserStats } from "@/lib/gameStats";

export type Achievement = {
  id: string;
  gameId: string;
  nameAr: string;
  descriptionAr: string;
  xpRequired: number;
  icon: string;
};

const GAME_LABELS: Record<string, string> = {
  global: "الحساب العام",
  "tom-and-jerry": "توم وجيري",
  "memory-match": "لعبة الذاكرة",
  "quiz-battle": "معركة الأسئلة",
};

export function getGameLabel(gameId: string): string {
  return GAME_LABELS[gameId] ?? gameId;
}

export const ACHIEVEMENTS: Achievement[] = [
  // عامة
  { id: "global-10",  gameId: "global",        nameAr: "أول خطوة",      descriptionAr: "اجمع 10 نقطة من أي لعبة",                     xpRequired: 10,  icon: "🌱" },
  { id: "global-100", gameId: "global",        nameAr: "لاعب نشيط",     descriptionAr: "اجمع 100 نقطة إجمالية",                       xpRequired: 100, icon: "🎯" },
  { id: "global-500", gameId: "global",        nameAr: "أسطورة الساحة", descriptionAr: "اجمع 500 نقطة إجمالية",                       xpRequired: 500, icon: "🏆" },

  // توم وجيري
  { id: "tj-50",  gameId: "tom-and-jerry",   nameAr: "هارب مبتدئ",    descriptionAr: "اجمع 50 نقطة في توم وجيري",                   xpRequired: 50,  icon: "🐭" },
  { id: "tj-150", gameId: "tom-and-jerry",   nameAr: "هارب محترف",    descriptionAr: "اجمع 150 نقطة في توم وجيري",                  xpRequired: 150, icon: "🏃" },
  { id: "tj-300", gameId: "tom-and-jerry",   nameAr: "أسطورة المتاهة",descriptionAr: "اجمع 300 نقطة في توم وجيري",                  xpRequired: 300, icon: "🧩" },

  // الذاكرة
  { id: "mm-50",  gameId: "memory-match",    nameAr: "ذاكرة حلوة",    descriptionAr: "اجمع 50 نقطة في لعبة الذاكرة",               xpRequired: 50,  icon: "🧠" },
  { id: "mm-150", gameId: "memory-match",    nameAr: "ذاكرة قوية",    descriptionAr: "اجمع 150 نقطة في لعبة الذاكرة",              xpRequired: 150, icon: "🃏" },

  // الأسئلة
  { id: "quiz-50",  gameId: "quiz-battle",   nameAr: "هاوي أسئلة",    descriptionAr: "اجمع 50 نقطة في معركة الأسئلة",              xpRequired: 50,  icon: "❓" },
  { id: "quiz-150", gameId: "quiz-battle",   nameAr: "ملك الأسئلة",   descriptionAr: "اجمع 150 نقطة في معركة الأسئلة",             xpRequired: 150, icon: "📚" },
];

function getXpForGame(gameId: string, stats: UserStats): number {
  if (gameId === "global") return stats.totalXp;
  return stats.byGame[gameId]?.xp ?? 0;
}

export function isUnlocked(achievement: Achievement, stats: UserStats): boolean {
  return getXpForGame(achievement.gameId, stats) >= achievement.xpRequired;
}

export function getUnlockedCount(stats: UserStats): number {
  return ACHIEVEMENTS.filter((a) => isUnlocked(a, stats)).length;
}

export function groupAchievementsByGame(): Record<string, Achievement[]> {
  const byGame: Record<string, Achievement[]> = {};
  for (const a of ACHIEVEMENTS) {
    if (!byGame[a.gameId]) byGame[a.gameId] = [];
    byGame[a.gameId].push(a);
  }
  return byGame;
}
