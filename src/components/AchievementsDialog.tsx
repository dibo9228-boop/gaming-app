import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  ACHIEVEMENTS,
  groupAchievementsByGame,
  isUnlocked,
  getUnlockedCount,
  getGameLabel,
} from "@/lib/achievements";
import type { UserStats } from "@/lib/gameStats";
import { Trophy } from "lucide-react";

type AchievementsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: UserStats;
};

export function AchievementsDialog({
  open,
  onOpenChange,
  stats,
}: AchievementsDialogProps) {
  const unlockedCount = getUnlockedCount(stats);
  const nextAchievement = ACHIEVEMENTS.find((a) => !isUnlocked(a, stats));
  const progressToNext = nextAchievement
    ? Math.min(100, (stats.totalXp / nextAchievement.xpRequired) * 100)
    : 100;

  const grouped = groupAchievementsByGame();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-accent">
            <Trophy className="h-5 w-5" />
            الإنجازات
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground font-body">
            {unlockedCount} من {ACHIEVEMENTS.length} مُفتوح — نقاطك الكلية: {stats.totalXp}
          </p>
          {nextAchievement && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-body text-muted-foreground mb-1">
                التالي: {nextAchievement.nameAr} ({nextAchievement.xpRequired} نقطة)
              </p>
              <Progress value={progressToNext} className="h-2" />
            </div>
          )}

          <div className="max-h-72 overflow-y-auto space-y-4 pr-1">
            {Object.entries(grouped).map(([gameId, list]) => {
              if (!list.length) return null;
              return (
                <div key={gameId} className="space-y-2">
                  <h3 className="text-xs arcade-text text-accent">
                    {getGameLabel(gameId)}
                  </h3>
                  {list.map((a) => {
                    const unlocked = isUnlocked(a, stats);
                    return (
                      <div
                        key={a.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 font-body text-sm transition-colors ${
                          unlocked
                            ? "border-primary/30 bg-primary/5"
                            : "border-border bg-muted/20 opacity-75"
                        }`}
                      >
                        <span className="text-2xl">{a.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium ${
                              unlocked ? "text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {a.nameAr}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {a.descriptionAr}
                          </p>
                        </div>
                        {unlocked ? (
                          <span className="text-xs text-primary shrink-0">✓</span>
                        ) : (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {a.xpRequired} نقطة
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
