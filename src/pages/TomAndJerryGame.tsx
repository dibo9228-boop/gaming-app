import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, RotateCcw, Home, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AchievementsDialog } from "@/components/AchievementsDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useApiAction } from "@/hooks/use-api-action";
import { addGameXp, getUserStats, type UserStats } from "@/lib/gameStats";

const STAGES_PER_LEVEL = 25;

type Position = { x: number; y: number };
type CellType = "empty" | "wall";
type GameStatus = "playing" | "jerry_wins" | "tom_wins";
export type Difficulty = "easy" | "medium" | "hard";

/** Per-difficulty ranges: stage 1 = easiest, stage 25 = hardest (more walls, faster Tom) */
const DIFFICULTY_RANGES = {
  easy:   { gridSize: 8,  wallDensityMin: 0.06,  wallDensityMax: 0.18,  tomDelayMin: 300, tomDelayMax: 450 },
  medium: { gridSize: 10, wallDensityMin: 0.10,  wallDensityMax: 0.26,  tomDelayMin: 140, tomDelayMax: 280 },
  hard:   { gridSize: 10, wallDensityMin: 0.18,  wallDensityMax: 0.34,  tomDelayMin: 80,  tomDelayMax: 160 },
} as const;

function getStageConfig(difficulty: Difficulty, stage: number) {
  const r = DIFFICULTY_RANGES[difficulty];
  const t = Math.max(1, Math.min(STAGES_PER_LEVEL, stage));
  const progress = (t - 1) / (STAGES_PER_LEVEL - 1);
  return {
    gridSize: r.gridSize,
    wallDensity: r.wallDensityMin + (r.wallDensityMax - r.wallDensityMin) * progress,
    tomDelayMs: Math.round(r.tomDelayMax - (r.tomDelayMax - r.tomDelayMin) * progress),
  };
}

/** Seeded RNG so the same (difficulty, stage) always gives the same maze */
function createSeededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** Check if there is a path from start to exit. Optionally block a cell (e.g. Tom's start) so path doesn't go through it. */
function hasPath(grid: CellType[][], size: number, blockCell: Position | null = null): boolean {
  const visited = new Set<string>();
  const queue: Position[] = [{ x: 0, y: 0 }];
  visited.add("0,0");

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    if (x === size - 1 && y === size - 1) return true;
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    for (const d of dirs) {
      const nx = x + d.x, ny = y + d.y;
      const key = `${nx},${ny}`;
      const isBlocked = blockCell && blockCell.x === nx && blockCell.y === ny;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && !visited.has(key) && grid[ny][nx] !== "wall" && !isBlocked) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}

/** Single-player: pass seed so maze is static per (difficulty, stage). Multiplayer: no seed = dynamic. */
function generateMaze(gridSize: number, wallDensity: number, seed?: number): CellType[][] {
  const rnd = seed !== undefined ? createSeededRandom(seed) : Math.random;
  const grid: CellType[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => "empty")
  );

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (rnd() < wallDensity) grid[y][x] = "wall";
    }
  }

  // Start (Jerry): keep clear
  grid[0][0] = "empty";
  grid[0][1] = "empty";
  grid[1][0] = "empty";
  // Exit: keep clear
  grid[gridSize - 1][gridSize - 1] = "empty";
  grid[gridSize - 1][gridSize - 2] = "empty";
  grid[gridSize - 2][gridSize - 1] = "empty";
  // Tom's start (top-right): always clear so Tom isn't on a wall
  const tomStart = { x: gridSize - 1, y: 0 };
  grid[tomStart.y][tomStart.x] = "empty";
  if (gridSize > 1) {
    grid[0][gridSize - 2] = "empty";
    grid[1][gridSize - 1] = "empty";
  }

  // Ensure a path exists that does NOT go through Tom's cell
  let attempts = 0;
  const maxAttempts = 100;
  while (!hasPath(grid, gridSize, tomStart) && attempts < maxAttempts) {
    const wy = Math.floor(rnd() * gridSize);
    const wx = Math.floor(rnd() * gridSize);
    if (grid[wy][wx] === "wall") {
      grid[wy][wx] = "empty";
      attempts++;
    }
  }

  return grid;
}

function bfs(
  start: Position,
  end: Position,
  grid: CellType[][],
  gridSize: number,
  blocked: Position | null
): Position | null {
  const visited = new Set<string>();
  const queue: { pos: Position; path: Position[] }[] = [{ pos: start, path: [] }];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.pos.x === end.x && current.pos.y === end.y) {
      return current.path.length > 0 ? current.path[0] : current.pos;
    }
    const dirs = [
      { x: 0, y: -1 }, { x: 0, y: 1 },
      { x: -1, y: 0 }, { x: 1, y: 0 },
    ];
    for (const dir of dirs) {
      const nx = current.pos.x + dir.x;
      const ny = current.pos.y + dir.y;
      const key = `${nx},${ny}`;
      if (
        nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize &&
        !visited.has(key) &&
        grid[ny][nx] !== "wall" &&
        !(blocked && blocked.x === nx && blocked.y === ny)
      ) {
        visited.add(key);
        queue.push({ pos: { x: nx, y: ny }, path: [...current.path, { x: nx, y: ny }] });
      }
    }
  }
  return null;
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
};

/** XP awarded for completing a stage (first time). Base per difficulty + stage number. */
function getXpForStage(difficulty: Difficulty, stage: number): number {
  const base = difficulty === "easy" ? 5 : difficulty === "medium" ? 10 : 15;
  return base + stage;
}

/** Tom (bot) skip chance: easy = often misses, medium = sometimes, hard = never (optimal chase). */
function getTomSkipRatio(difficulty: Difficulty): number {
  return difficulty === "easy" ? 0.28 : difficulty === "medium" ? 0.10 : 0;
}

function getStageSeed(difficulty: Difficulty, stage: number): number {
  const d = difficulty === "easy" ? 0 : difficulty === "medium" ? 1000 : 2000;
  return d + stage;
}

type ProgressByDifficulty = Record<Difficulty, number>;

const TomAndJerryGame = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const levelParam = (searchParams.get("level") || "medium").toLowerCase();
  const difficulty: Difficulty =
    levelParam === "easy" || levelParam === "hard" ? levelParam : "medium";
  const stageRaw = parseInt(searchParams.get("stage") || "1", 10);
  const stageRequested = Math.max(1, Math.min(STAGES_PER_LEVEL, isNaN(stageRaw) ? 1 : stageRaw));

  const [progressByDifficulty, setProgressByDifficulty] = useState<ProgressByDifficulty>({
    easy: 0,
    medium: 0,
    hard: 0,
  });
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({
    totalXp: 0,
    streakCount: 0,
    lastPlayedDate: null,
    streakRewardClaimedToday: false,
    byGame: {},
  });
  const [earnedXpThisWin, setEarnedXpThisWin] = useState(0);
  const [dailyStreakBonus, setDailyStreakBonus] = useState<{ bonus: number; streakCount: number } | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  const maxCompleted = progressByDifficulty[difficulty];
  const allowedMaxStage = user ? maxCompleted + 1 : 1;
  const stage = Math.min(stageRequested, allowedMaxStage);

  const config = getStageConfig(difficulty, stage);
  const gridSize = config.gridSize;
  const tomDelayMs = config.tomDelayMs;
  const mazeSeed = getStageSeed(difficulty, stage);

  const [grid, setGrid] = useState<CellType[][]>(() =>
    generateMaze(gridSize, config.wallDensity, mazeSeed)
  );
  const [jerry, setJerry] = useState<Position>({ x: 0, y: 0 });
  const [tom, setTom] = useState<Position>({ x: gridSize - 1, y: 0 });
  const exit: Position = { x: gridSize - 1, y: gridSize - 1 };
  const [status, setStatus] = useState<GameStatus>("playing");
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { run: fetchProgressAndXpAction, loading: loadingProgress } = useApiAction(async () => {
    if (!user) {
      setProgressByDifficulty({ easy: 0, medium: 0, hard: 0 });
      setUserStats({
        totalXp: 0,
        streakCount: 0,
        lastPlayedDate: null,
        streakRewardClaimedToday: false,
        byGame: {},
      });
      setProgressLoaded(true);
      return;
    }
    const [progressRes, stats] = await Promise.all([
      supabase
        .from("tom_jerry_progress")
        .select("difficulty, max_stage_completed")
        .eq("user_id", user.id),
      getUserStats(user.id),
    ]);
    const next: ProgressByDifficulty = { easy: 0, medium: 0, hard: 0 };
    if (progressRes.data) {
      for (const row of progressRes.data) {
        if (row.difficulty === "easy" || row.difficulty === "medium" || row.difficulty === "hard") {
          next[row.difficulty] = row.max_stage_completed ?? 0;
        }
      }
    }
    setProgressByDifficulty(next);
    setUserStats(stats);
    setProgressLoaded(true);
  });

  useEffect(() => {
    fetchProgressAndXpAction().catch(() => {
      setProgressLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!progressLoaded) return;
    if (stageRequested > allowedMaxStage) {
      navigate(`/game/tom-and-jerry?level=${difficulty}&stage=${allowedMaxStage}`, { replace: true });
      return;
    }
  }, [progressLoaded, stageRequested, allowedMaxStage, difficulty, navigate]);

  const goToStage = useCallback(
    (s: number) => {
      const next = Math.max(1, Math.min(STAGES_PER_LEVEL, s));
      if (user && next <= progressByDifficulty[difficulty] + 1) {
        navigate(`/game/tom-and-jerry?level=${difficulty}&stage=${next}`);
      } else if (!user && next === 1) {
        navigate(`/game/tom-and-jerry?level=${difficulty}&stage=1`);
      }
    },
    [navigate, difficulty, user, progressByDifficulty]
  );

  const { run: saveProgressAction, loading: savingProgress } = useApiAction(
    async (completedStage: number) => {
      if (!user) return;
      const current = progressByDifficulty[difficulty];
      if (completedStage <= current) return;
      const { data: existing } = await supabase
        .from("tom_jerry_progress")
        .select("max_stage_completed")
        .eq("user_id", user.id)
        .eq("difficulty", difficulty)
        .maybeSingle();
      const prevMax = existing?.max_stage_completed ?? 0;
      const newMax = Math.max(prevMax, completedStage);
      if (existing) {
        await supabase
          .from("tom_jerry_progress")
          .update({ max_stage_completed: newMax })
          .eq("user_id", user.id)
          .eq("difficulty", difficulty);
      } else {
        await supabase
          .from("tom_jerry_progress")
          .insert({ user_id: user.id, difficulty, max_stage_completed: newMax });
      }
      setProgressByDifficulty((prev) => ({ ...prev, [difficulty]: newMax }));

      if (newMax > prevMax) {
        const xpEarned = getXpForStage(difficulty, completedStage);
        const streakResult = await addGameXp(user.id, "tom-and-jerry", xpEarned);
        const fresh = await getUserStats(user.id);
        setUserStats(fresh);
        setEarnedXpThisWin(xpEarned);
        if (streakResult?.awarded) {
          setDailyStreakBonus({ bonus: streakResult.bonus, streakCount: streakResult.streakCount });
        }
      }
    }
  );

  const saveProgress = useCallback(
    (completedStage: number) => {
      saveProgressAction(completedStage).catch((err) => console.error("save progress failed:", err));
    },
    []
  );

  useEffect(() => {
    setEarnedXpThisWin(0);
    setDailyStreakBonus(null);
    setGrid(generateMaze(gridSize, config.wallDensity, mazeSeed));
    setJerry({ x: 0, y: 0 });
    setTom({ x: gridSize - 1, y: 0 });
    setStatus("playing");
    setMoves(0);
  }, [difficulty, stage]);

  const savedProgressRef = useRef<{ stage: number; difficulty: Difficulty } | null>(null);
  useEffect(() => {
    if (status === "jerry_wins" && user) {
      const key = `${difficulty}-${stage}`;
      if (savedProgressRef.current?.stage !== stage || savedProgressRef.current?.difficulty !== difficulty) {
        savedProgressRef.current = { stage, difficulty };
        saveProgress(stage);
      }
    }
    if (status === "playing") savedProgressRef.current = null;
  }, [status, user, stage, difficulty, saveProgress]);

  const resetGame = useCallback(() => {
    setEarnedXpThisWin(0);
    setGrid(generateMaze(gridSize, config.wallDensity, mazeSeed));
    setJerry({ x: 0, y: 0 });
    setTom({ x: gridSize - 1, y: 0 });
    setStatus("playing");
    setMoves(0);
  }, [gridSize, config.wallDensity, mazeSeed]);

  const moveTom = useCallback(
    (jerryPos: Position) => {
      const skipRatio = getTomSkipRatio(difficulty);
      setTom((prev) => {
        if (skipRatio > 0 && Math.random() < skipRatio) return prev;
        const next = bfs(prev, jerryPos, grid, gridSize, null);
        if (next && (next.x !== jerryPos.x || next.y !== jerryPos.y)) {
          return next;
        }
        if (next) {
          setTimeout(() => setStatus("tom_wins"), 100);
          return next;
        }
        return prev;
      });
    },
    [grid, gridSize, difficulty]
  );

  const moveJerry = useCallback(
    (dx: number, dy: number) => {
      if (status !== "playing") return;

      setJerry((prev) => {
        const nx = prev.x + dx;
        const ny = prev.y + dy;

        if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) return prev;
        if (grid[ny][nx] === "wall") return prev;

        const newPos = { x: nx, y: ny };

        if (nx === exit.x && ny === exit.y) {
          setStatus("jerry_wins");
          setScore((s) => s + 1);
        } else {
          setTimeout(() => moveTom(newPos), tomDelayMs);
        }

        setTom((tomPos) => {
          if (tomPos.x === nx && tomPos.y === ny) {
            setTimeout(() => setStatus("tom_wins"), 100);
          }
          return tomPos;
        });

        setMoves((m) => m + 1);
        return newPos;
      });
    },
    [status, grid, exit, moveTom, gridSize, tomDelayMs]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp": e.preventDefault(); moveJerry(0, -1); break;
        case "ArrowDown": e.preventDefault(); moveJerry(0, 1); break;
        // عكسنا اتجاه اليمين/اليسار ليتطابق مع ما تراه على الشاشة في الوضع الحالي
        case "ArrowLeft": e.preventDefault(); moveJerry(1, 0); break;
        case "ArrowRight": e.preventDefault(); moveJerry(-1, 0); break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveJerry]);

  // Touch controls
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      moveJerry(dx > 0 ? 1 : -1, 0);
    } else {
      moveJerry(0, dy > 0 ? 1 : -1);
    }
    touchStart.current = null;
  };

  const cellSize = "min(7vw, 48px)";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-6 px-4" dir="rtl">
      {/* Header */}
      <div className="w-full max-w-lg flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground"
        >
          <Home className="w-4 h-4 ml-1" />
          الرئيسية
        </Button>
        <h1 className="text-xs md:text-sm arcade-text text-accent text-glow-yellow">
          🐱 توم وجيري 🐭
        </h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-body flex-wrap justify-end">
          {user && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAchievementsOpen(true)} title="الإنجازات">
              <Trophy className="h-4 w-4" />
            </Button>
          )}
          <span title="النقاط محفوظة بحسابك">نقاط: {user ? userStats.totalXp : "—"}</span>
          <span className="px-1.5 py-0.5 rounded bg-muted">مرحلة {stage} من {STAGES_PER_LEVEL}</span>
          <div className="flex gap-1">
            {(["easy", "medium", "hard"] as const).map((d) => {
              const allowedForDiff = user ? progressByDifficulty[d] + 1 : 1;
              const stageToGo = Math.min(stage, allowedForDiff);
              return (
                <button
                  key={d}
                  onClick={() => navigate(`/game/tom-and-jerry?level=${d}&stage=${stageToGo}`)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    difficulty === d
                      ? "bg-primary/20 text-primary"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stage navigation: only previous (replay); next only after winning */}
      {!user && (
        <p className="text-xs text-amber-600 dark:text-amber-400 font-body mb-2">
          سجّل الدخول لحفظ تقدمك والانتقال للمراحل التالية
        </p>
      )}
      <div className="flex items-center gap-2 mb-2">
        <Button variant="outline" size="sm" onClick={() => goToStage(stage - 1)} disabled={stage <= 1}>
          ← السابقة
        </Button>
        <span className="text-sm font-body text-muted-foreground">
          مرحلة {stage} من {STAGES_PER_LEVEL}
          {user && maxCompleted > 0 && (
            <span className="text-muted-foreground/80 mr-1"> (أكملت حتى {maxCompleted})</span>
          )}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={stage >= allowedMaxStage}
          onClick={() => goToStage(stage + 1)}
          title={stage >= allowedMaxStage ? "أكمل المرحلة الحالية للانتقال للتالية" : "الانتقال للمرحلة التالية"}
        >
          التالية →
        </Button>
      </div>

      {/* Game Info */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm font-body text-muted-foreground items-center justify-center">
        <span>🐭 = أنت (جيري)</span>
        <span>🐱 = توم (بوت)</span>
        <span>🏠 = المخرج</span>
        {loadingProgress && <span className="text-primary">جاري تحميل التقدم...</span>}
        {savingProgress && <span className="text-primary">جاري حفظ التقدم...</span>}
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative bg-game-surface border border-border rounded-lg p-2 box-glow-green"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridSize}, ${cellSize})`,
          gridTemplateRows: `repeat(${gridSize}, ${cellSize})`,
          gap: "2px",
        }}
      >
        {grid.map((row, y) =>
          row.map((cell, x) => {
            const isJerry = jerry.x === x && jerry.y === y;
            const isTom = tom.x === x && tom.y === y;
            const isExit = exit.x === x && exit.y === y;
            const isWall = cell === "wall";

            return (
              <div
                key={`${x}-${y}`}
                className={`
                  rounded-sm flex items-center justify-center text-lg md:text-xl
                  transition-colors duration-150
                  ${isWall ? "bg-destructive/30 border border-destructive/20" : "bg-game-grid"}
                  ${isExit && !isJerry ? "bg-primary/25 border-2 border-primary/50" : ""}
                `}
                style={{ width: cellSize, height: cellSize }}
              >
                {isJerry && (
                  <motion.span
                    key="jerry"
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    🐭
                  </motion.span>
                )}
                {isTom && !isJerry && (
                  <motion.span
                    key="tom"
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    🐱
                  </motion.span>
                )}
                {isExit && !isJerry && !isTom && <span>🏠</span>}
              </div>
            );
          })
        )}
      </div>

      {/* Mobile Controls */}
      <div className="mt-6 grid grid-cols-3 gap-2 md:hidden">
        <div />
        <Button variant="outline" size="sm" onClick={() => moveJerry(0, -1)} className="text-lg">↑</Button>
        <div />
        <Button variant="outline" size="sm" onClick={() => moveJerry(-1, 0)} className="text-lg">→</Button>
        <Button variant="outline" size="sm" onClick={() => moveJerry(0, 1)} className="text-lg">↓</Button>
        <Button variant="outline" size="sm" onClick={() => moveJerry(1, 0)} className="text-lg">←</Button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground font-body hidden md:block">
        استخدم أسهم الكيبورد للتحرك
      </p>

      {/* Game Over Overlay */}
      <AnimatePresence>
        {status !== "playing" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-card border border-border rounded-lg p-8 text-center max-w-sm mx-4"
            >
              <div className="text-5xl mb-4">
                {status === "jerry_wins" ? "🎉" : "😿"}
              </div>
              <h2 className="text-sm arcade-text mb-2 text-foreground">
                {status === "jerry_wins" ? "جيري ربح!" : "توم لقطك!"}
              </h2>
              <p className="text-muted-foreground font-body mb-6">
                {status === "jerry_wins"
                  ? `هربت بـ ${moves} حركة! 🐭✨`
                  : "حاول مرة تانية! 🐱"
                }
                {status === "jerry_wins" && earnedXpThisWin > 0 && (
                  <span className="block mt-2 text-primary font-body">+{earnedXpThisWin} نقطة</span>
                )}
                {status === "jerry_wins" && dailyStreakBonus && (
                  <span className="block mt-2 text-amber-500 font-body">
                    🔥 مكافأة الاستمرارية اليومية +{dailyStreakBonus.bonus}
                    <span className="block text-xs text-muted-foreground">
                      الاستمرارية الحالية: {dailyStreakBonus.streakCount} يوم
                    </span>
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                {status === "jerry_wins" && stage < STAGES_PER_LEVEL && user && (
                  <Button onClick={() => goToStage(stage + 1)} className="gap-2" disabled={savingProgress}>
                    المرحلة التالية ({stage + 1}) →
                  </Button>
                )}
                {status === "jerry_wins" && stage < STAGES_PER_LEVEL && !user && (
                  <p className="text-sm text-muted-foreground font-body w-full">سجّل الدخول لفتح المرحلة التالية</p>
                )}
                {status === "jerry_wins" && stage === STAGES_PER_LEVEL && (
                  <p className="text-sm text-primary font-body w-full mb-2">🎊 أكملت كل مراحل المستوى!</p>
                )}
                <Button
                  onClick={resetGame}
                  variant={status === "jerry_wins" ? "outline" : "default"}
                  className="gap-2"
                  disabled={savingProgress}
                >
                  <RotateCcw className="w-4 h-4" />
                  {status === "jerry_wins" ? "إعادة المرحلة" : "العب مرة تانية"}
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>
                  <ArrowRight className="w-4 h-4 ml-1" />
                  الرئيسية
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
    </div>
  );
};

export default TomAndJerryGame;
