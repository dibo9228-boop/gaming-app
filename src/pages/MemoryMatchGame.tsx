import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Home, RotateCcw, Trophy } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { AchievementsDialog } from "@/components/AchievementsDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useApiAction } from "@/hooks/use-api-action";
import { Difficulty, generateDeck } from "@/lib/memoryMatch";
import {
  addGameXp,
  getUserStats,
  updateDailyChallengeProgress,
  type UserStats,
} from "@/lib/gameStats";

const STAGES_PER_LEVEL = 25;

type GameStatus = "playing" | "player_wins" | "bot_wins" | "draw";
type ProgressByDifficulty = Record<Difficulty, number>;

function getXpForStage(difficulty: Difficulty, stage: number): number {
  const base = difficulty === "easy" ? 8 : difficulty === "medium" ? 14 : 20;
  return base + stage;
}

const cardColors = [
  "bg-pink-500/20 text-pink-300",
  "bg-blue-500/20 text-blue-300",
  "bg-green-500/20 text-green-300",
  "bg-yellow-500/20 text-yellow-300",
  "bg-purple-500/20 text-purple-300",
  "bg-cyan-500/20 text-cyan-300",
];

const MemoryMatchGame = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("level") || "medium") as Difficulty;
  const stageRaw = parseInt(searchParams.get("stage") || "1", 10);
  const stageRequested = Math.max(1, Math.min(STAGES_PER_LEVEL, Number.isNaN(stageRaw) ? 1 : stageRaw));

  const [progressByDifficulty, setProgressByDifficulty] = useState<ProgressByDifficulty>({ easy: 0, medium: 0, hard: 0 });
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({
    totalXp: 0,
    xp: 0,
    level: 1,
    streakCount: 0,
    lastPlayedDate: null,
    streakRewardClaimedToday: false,
    byGame: {},
  });
  const [earnedXpThisWin, setEarnedXpThisWin] = useState(0);
  const [dailyStreakBonus, setDailyStreakBonus] = useState<{ bonus: number; streakCount: number } | null>(null);
  const [dailyChallengeBonus, setDailyChallengeBonus] = useState<number | null>(null);
  const [levelUpNotice, setLevelUpNotice] = useState<{ level: number; features: string[] } | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  const maxCompleted = progressByDifficulty[difficulty] ?? 0;
  const allowedMaxStage = user ? maxCompleted + 1 : 1;
  const stage = Math.min(stageRequested, allowedMaxStage);

  const [deck, setDeck] = useState<number[]>(() => generateDeck(difficulty, stage));
  const [revealed, setRevealed] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [turn, setTurn] = useState<"player" | "bot">("player");
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false);

  const { run: fetchProgressAndXp, loading: loadingProgress } = useApiAction(async () => {
    if (!user) {
      setProgressByDifficulty({ easy: 0, medium: 0, hard: 0 });
      setUserStats({
        totalXp: 0,
        xp: 0,
        level: 1,
        streakCount: 0,
        lastPlayedDate: null,
        streakRewardClaimedToday: false,
        byGame: {},
      });
      setProgressLoaded(true);
      return;
    }
    const [progressRes, stats] = await Promise.all([
      supabase.from("memory_match_progress").select("difficulty, max_stage_completed").eq("user_id", user.id),
      getUserStats(user.id),
    ]);
    const next: ProgressByDifficulty = { easy: 0, medium: 0, hard: 0 };
    for (const row of progressRes.data || []) {
      if (row.difficulty === "easy" || row.difficulty === "medium" || row.difficulty === "hard") {
        next[row.difficulty] = row.max_stage_completed ?? 0;
      }
    }
    setProgressByDifficulty(next);
    setUserStats(stats);
    setProgressLoaded(true);
  });

  const { run: saveProgress, loading: savingProgress } = useApiAction(async (completedStage: number) => {
    if (!user) return;
    const prevMax = progressByDifficulty[difficulty] ?? 0;
    if (completedStage <= prevMax) return;
    const { data: existing } = await supabase
      .from("memory_match_progress")
      .select("max_stage_completed")
      .eq("user_id", user.id)
      .eq("difficulty", difficulty)
      .maybeSingle();
    const prevSaved = existing?.max_stage_completed ?? 0;
    const newMax = Math.max(prevSaved, completedStage);
    if (newMax <= prevSaved) return;
    if (existing) {
      await supabase
        .from("memory_match_progress")
        .update({ max_stage_completed: newMax })
        .eq("user_id", user.id)
        .eq("difficulty", difficulty);
    } else {
      await supabase
        .from("memory_match_progress")
        .insert({ user_id: user.id, difficulty, max_stage_completed: newMax });
    }
    setProgressByDifficulty((p) => ({ ...p, [difficulty]: newMax }));
    const xp = getXpForStage(difficulty, newMax);
    const streakResult = await addGameXp(user.id, "memory-match", xp);
    const fresh = await getUserStats(user.id);
    setUserStats(fresh);
    setEarnedXpThisWin(xp);
    if (streakResult?.awarded) {
      setDailyStreakBonus({ bonus: streakResult.bonus, streakCount: streakResult.streakCount });
    }
    if (streakResult?.levelUp) {
      setLevelUpNotice({ level: streakResult.level, features: streakResult.unlockedFeatures });
    }
  });

  useEffect(() => {
    setProgressLoaded(false);
    fetchProgressAndXp().catch(() => setProgressLoaded(true));
  }, [fetchProgressAndXp]);

  useEffect(() => {
    if (!progressLoaded) return;
    if (stageRequested > allowedMaxStage) {
      navigate(`/game/memory-match?level=${difficulty}&stage=${allowedMaxStage}`, { replace: true });
    }
  }, [progressLoaded, stageRequested, allowedMaxStage, navigate, difficulty]);

  const resetGame = useCallback(() => {
    setDeck(generateDeck(difficulty, stage));
    setRevealed([]);
    setMatched([]);
    setPlayerScore(0);
    setBotScore(0);
    setStatus("playing");
    setTurn("player");
    setBusy(false);
    lockRef.current = false;
    setEarnedXpThisWin(0);
    setDailyStreakBonus(null);
    setDailyChallengeBonus(null);
    setLevelUpNotice(null);
  }, [difficulty, stage]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  const endIfFinished = useCallback(
    (nextMatched: number[], nextPlayer: number, nextBot: number) => {
      if (nextMatched.length !== deck.length) return false;
      if (nextPlayer > nextBot) {
        setStatus("player_wins");
        if (user) saveProgress(stage).catch((err) => console.error("save progress failed:", err));
      } else if (nextBot > nextPlayer) setStatus("bot_wins");
      else setStatus("draw");
      return true;
    },
    [deck.length, user, saveProgress, stage]
  );

  const resolvePair = useCallback(
    (a: number, b: number, actor: "player" | "bot") => {
      const isMatch = deck[a] === deck[b];
      if (isMatch) {
        const nextMatched = Array.from(new Set([...matched, a, b]));
        const nextPlayer = actor === "player" ? playerScore + 1 : playerScore;
        const nextBot = actor === "bot" ? botScore + 1 : botScore;
        setMatched(nextMatched);
        setRevealed([]);
        setPlayerScore(nextPlayer);
        setBotScore(nextBot);
        if (!endIfFinished(nextMatched, nextPlayer, nextBot)) {
          setTurn(actor);
        }
      } else {
        setRevealed([]);
        setTurn(actor === "player" ? "bot" : "player");
      }
      setBusy(false);
      lockRef.current = false;
    },
    [deck, matched, playerScore, botScore, endIfFinished]
  );

  const onPlayerFlip = useCallback(
    (index: number) => {
      if (status !== "playing" || turn !== "player" || busy || lockRef.current) return;
      if (matched.includes(index) || revealed.includes(index)) return;
      const next = [...revealed, index];
      setRevealed(next);
      if (next.length === 2) {
        setBusy(true);
        lockRef.current = true;
        setTimeout(() => resolvePair(next[0], next[1], "player"), 700);
      }
    },
    [status, turn, busy, matched, revealed, resolvePair]
  );

  const availableForBot = useMemo(
    () => deck.map((_, i) => i).filter((i) => !matched.includes(i) && !revealed.includes(i)),
    [deck, matched, revealed]
  );

  useEffect(() => {
    if (status !== "playing" || turn !== "bot" || busy || availableForBot.length < 2) return;
    setBusy(true);
    const shuffled = [...availableForBot].sort(() => Math.random() - 0.5);
    const pickA = shuffled[0];
    const pickB = shuffled[1];
    setRevealed([pickA, pickB]);
    // Do not cancel this timeout on rerender; cancelling here can leave `busy=true` forever.
    setTimeout(() => resolvePair(pickA, pickB, "bot"), 800);
  }, [status, turn, busy, availableForBot, resolvePair]);

  const gameOver = status !== "playing";
  const dailyChallengeHandledRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (!gameOver) {
      dailyChallengeHandledRef.current = false;
      return;
    }
    if (dailyChallengeHandledRef.current) return;
    dailyChallengeHandledRef.current = true;

    updateDailyChallengeProgress(user.id, {
      gameType: "memory",
      win: status === "player_wins",
      matchesPlayed: 1,
    })
      .then(async (res) => {
        if (res?.bonusAwarded && res.bonusAwarded > 0) {
          setDailyChallengeBonus(res.bonusAwarded);
        }
        const fresh = await getUserStats(user.id);
        setUserStats(fresh);
      })
      .catch(() => {});
  }, [gameOver, status, user]);

  const columns = deck.length <= 12 ? 4 : 5;

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/game/memory-match/lobby")} className="text-muted-foreground">
            <Home className="w-4 h-4 ml-1" /> اللوبي
          </Button>
          <h1 className="text-xs arcade-text text-accent">🧠 لعبة الذاكرة</h1>
          <div className="text-xs text-muted-foreground font-body">المرحلة {stage}/{STAGES_PER_LEVEL}</div>
        </div>

        <div className="mb-4 rounded-full border border-border bg-muted px-4 py-2 text-sm font-body text-center">
          {gameOver ? "انتهت اللعبة" : turn === "player" ? "دورك" : "دور البوت..."}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-center gap-4 text-sm font-body">
          <span className="text-primary">نقاطك: {playerScore}</span>
          <span className="text-accent">نقاط البوت: {botScore}</span>
          {loadingProgress && <span className="text-muted-foreground">جاري تحميل التقدم...</span>}
          {savingProgress && <span className="text-muted-foreground">جاري حفظ التقدم...</span>}
        </div>

        <div
          className="grid gap-2 rounded-lg border border-border bg-card p-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {deck.map((value, index) => {
            const isOpen = matched.includes(index) || revealed.includes(index);
            const color = cardColors[value % cardColors.length];
            return (
              <button
                key={index}
                onClick={() => onPlayerFlip(index)}
                disabled={!(!gameOver && turn === "player") || matched.includes(index) || busy}
                className={`aspect-square rounded-md border text-lg transition-all ${isOpen ? `${color} border-primary/40` : "bg-game-grid border-border hover:border-primary/40"}`}
              >
                {isOpen ? value : "?"}
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {gameOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            >
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-4 w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center">
                <div className="mb-3 text-5xl">{status === "player_wins" ? "🎉" : status === "bot_wins" ? "😿" : "🤝"}</div>
                <h2 className="mb-2 text-sm arcade-text text-foreground">
                  {status === "player_wins" ? "ربحت!" : status === "bot_wins" ? "البوت ربح" : "تعادل"}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground font-body">
                  النتيجة: {playerScore} - {botScore}
                  {status === "player_wins" && earnedXpThisWin > 0 && <span className="block mt-1 text-primary">+{earnedXpThisWin} نقطة</span>}
                  {status === "player_wins" && dailyStreakBonus && (
                    <span className="block mt-2 text-amber-500">
                      🔥 مكافأة الاستمرارية اليومية +{dailyStreakBonus.bonus}
                      <span className="block text-xs text-muted-foreground">
                        الاستمرارية الحالية: {dailyStreakBonus.streakCount} يوم
                      </span>
                    </span>
                  )}
                  {dailyChallengeBonus && (
                    <span className="block mt-2 text-emerald-500">
                      ✅ اكتمل تحدي اليوم +{dailyChallengeBonus} نقطة
                    </span>
                  )}
                  {levelUpNotice && (
                    <span className="block mt-2 text-fuchsia-500">
                      🎉 مبروك! وصلت للمستوى {levelUpNotice.level}
                      {levelUpNotice.features.length > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          تم فتح: {levelUpNotice.features.join("، ")}
                        </span>
                      )}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {status === "player_wins" && stage < STAGES_PER_LEVEL && (
                    <Button onClick={() => navigate(`/game/memory-match?level=${difficulty}&stage=${stage + 1}`)}>المرحلة التالية</Button>
                  )}
                  <Button variant="outline" onClick={resetGame} disabled={savingProgress}>
                    <RotateCcw className="w-4 h-4 ml-1" /> إعادة
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/")}>
                    <ArrowRight className="w-4 h-4 ml-1" /> الرئيسية
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {user && (
          <AchievementsDialog
            open={achievementsOpen}
            onOpenChange={setAchievementsOpen}
            stats={userStats}
          />
        )}
        {!user && (
          <div className="mt-4 text-center text-xs text-muted-foreground font-body">
            سجّل الدخول لحفظ التقدم وفتح المراحل
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoryMatchGame;

