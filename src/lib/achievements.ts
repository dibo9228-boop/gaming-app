/** Achievements unlocked by reaching XP (نقاط) milestones - no extra DB table needed */

export type Achievement = {
  id: string;
  nameAr: string;
  descriptionAr: string;
  xpRequired: number;
  icon: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-10", nameAr: "أول خطوة", descriptionAr: "اجمع 10 نقاط", xpRequired: 10, icon: "🌱" },
  { id: "xp-50", nameAr: "جيري الصغير", descriptionAr: "اجمع 50 نقطة", xpRequired: 50, icon: "🐭" },
  { id: "xp-100", nameAr: "هارب محترف", descriptionAr: "اجمع 100 نقطة", xpRequired: 100, icon: "🏃" },
  { id: "xp-200", nameAr: "بطل المتاهة", descriptionAr: "اجمع 200 نقطة", xpRequired: 200, icon: "🧩" },
  { id: "xp-350", nameAr: "ملك المسارات", descriptionAr: "اجمع 350 نقطة", xpRequired: 350, icon: "🛤️" },
  { id: "xp-500", nameAr: "أسطورة توم وجيري", descriptionAr: "اجمع 500 نقطة", xpRequired: 500, icon: "⭐" },
  { id: "xp-750", nameAr: "بطل الهروب", descriptionAr: "اجمع 750 نقطة", xpRequired: 750, icon: "🏆" },
  { id: "xp-1000", nameAr: "ملك الهروب", descriptionAr: "اجمع 1000 نقطة", xpRequired: 1000, icon: "👑" },
  { id: "xp-1500", nameAr: "لا يُمسك", descriptionAr: "اجمع 1500 نقطة", xpRequired: 1500, icon: "💨" },
  { id: "xp-2000", nameAr: "أسطورة الساحة", descriptionAr: "اجمع 2000 نقطة", xpRequired: 2000, icon: "🎖️" },
];

export function getUnlockedCount(totalXp: number): number {
  return ACHIEVEMENTS.filter((a) => totalXp >= a.xpRequired).length;
}

export function isUnlocked(achievement: Achievement, totalXp: number): boolean {
  return totalXp >= achievement.xpRequired;
}
