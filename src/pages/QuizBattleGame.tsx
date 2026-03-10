import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Home, RotateCcw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useApiAction } from "@/hooks/use-api-action";
import { QuizDifficulty, QuizQuestion, fetchQuizQuestions, getBotAccuracy } from "@/lib/quizData";

const STAGES_PER_LEVEL = 25;
const QUESTION_TIME_MS = 10_000;
const QUESTIONS_PER_STAGE = 10;

type Status = "playing" | "player_wins" | "bot_wins" | "draw";
type ProgressByDifficulty = Record<QuizDifficulty, number>;

const QuizBattleGame = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const levelParam = (searchParams.get("level") || "medium").toLowerCase();
  const difficulty: QuizDifficulty =
    levelParam === "easy" || levelParam === "hard" ? (levelParam as QuizDifficulty) : "medium";
  const stageRaw = parseInt(searchParams.get("stage") || "1", 10);
  const stageRequested = Math.max(1, Math.min(STAGES_PER_LEVEL, Number.isNaN(stageRaw) ? 1 : stageRaw));

  const [progressByDifficulty, setProgressByDifficulty] = useState<ProgressByDifficulty>({ easy: 0, medium: 0, hard: 0 });
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("playing");
  const [timeLeft, setTimeLeft] = useState(10);
  const [locked, setLocked] = useState(false);
  const [botPending, setBotPending] = useState(false);
  const timerRef = useRef<number | null>(null);
  const [earnedXpThisWin, setEarnedXpThisWin] = useState(0);

  const maxCompleted = progressByDifficulty[difficulty] ?? 0;
  const allowedMaxStage = user ? maxCompleted + 1 : 1;
  const stage = Math.min(stageRequested, allowedMaxStage);

  const current = questions[index];

  const { run: fetchProgressAndQuestions, loading: loadingQuestions } = useApiAction(async () => {
    if (!user) {
      setProgressByDifficulty({ easy: 0, medium: 0, hard: 0 });
      setProgressLoaded(true);
    } else {
      const { data } = await supabase
        .from("quiz_battle_progress")
        .select("difficulty, max_stage_completed")
        .eq("user_id", user.id);
      const next: ProgressByDifficulty = { easy: 0, medium: 0, hard: 0 };
      for (const row of data || []) {
        if (row.difficulty === "easy" || row.difficulty === "medium" || row.difficulty === "hard") {
          next[row.difficulty] = row.max_stage_completed ?? 0;
        }
      }
      setProgressByDifficulty(next);
      setProgressLoaded(true);
    }

    const fetched = await fetchQuizQuestions(QUESTIONS_PER_STAGE, difficulty);
    setQuestions(fetched);
    setIndex(0);
    setPlayerScore(0);
    setBotScore(0);
    setSelected(null);
    setStatus("playing");
    setTimeLeft(10);
    setLocked(false);
    setBotPending(false);
    setEarnedXpThisWin(0);
  });

  const { run: saveProgress, loading: savingProgress } = useApiAction(async (completedStage: number) => {
    if (!user) return;
    const prev = progressByDifficulty[difficulty] ?? 0;
    if (completedStage <= prev) return;
    await supabase
      .from("quiz_battle_progress")
      .upsert({ user_id: user.id, difficulty, max_stage_completed: completedStage }, { onConflict: "user_id,difficulty" });
    setProgressByDifficulty((p) => ({ ...p, [difficulty]: completedStage }));
    const xp = (difficulty === "easy" ? 10 : difficulty === "medium" ? 16 : 24) + completedStage;
    const { data: profile } = await supabase.from("profiles").select("total_xp").eq("user_id", user.id).single();
    const total = (profile?.total_xp ?? 0) + xp;
    await supabase.from("profiles").update({ total_xp: total }).eq("user_id", user.id);
    setEarnedXpThisWin(xp);
  });

  useEffect(() => {
    fetchProgressAndQuestions().catch(() => setProgressLoaded(true));
  }, []);

  useEffect(() => {
    if (!progressLoaded) return;
    if (stageRequested > allowedMaxStage) {
      navigate(`/game/quiz-battle?level=${difficulty}&stage=${allowedMaxStage}`, { replace: true });
    }
  }, [progressLoaded, stageRequested, allowedMaxStage, difficulty, navigate]);

  const finishGame = useCallback(
    (p: number, b: number) => {
      if (p > b) {
        setStatus("player_wins");
        if (user) saveProgress(stage).catch(() => {});
      } else if (b > p) setStatus("bot_wins");
      else setStatus("draw");
    },
    [saveProgress, stage, user]
  );

  const nextQuestion = useCallback(() => {
    setSelected(null);
    setLocked(false);
    setBotPending(false);
    setTimeLeft(10);
    setIndex((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (status !== "playing" || !questions.length || index >= questions.length) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(timerRef.current!);
          setLocked(true);
          setTimeout(() => {
            if (index >= questions.length - 1) finishGame(playerScore, botScore);
            else nextQuestion();
          }, 600);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [status, questions.length, index, nextQuestion, finishGame, playerScore, botScore]);

  useEffect(() => {
    if (!current || status !== "playing" || botPending || locked) return;
    setBotPending(true);
    const delay = Math.floor(Math.random() * 4500) + 1500;
    const timer = window.setTimeout(() => {
      if (locked) return;
      const correct = Math.random() < getBotAccuracy(difficulty);
      if (correct) setBotScore((s) => s + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [current, difficulty, status, botPending, locked]);

  const submitAnswer = (optionIndex: number) => {
    if (!current || locked || status !== "playing") return;
    setSelected(optionIndex);
    setLocked(true);
    if (optionIndex === current.correctIndex) {
      setPlayerScore((s) => s + 1);
    }
    setTimeout(() => {
      if (index >= questions.length - 1) {
        const nextPlayer = optionIndex === current.correctIndex ? playerScore + 1 : playerScore;
        finishGame(nextPlayer, botScore);
      } else {
        nextQuestion();
      }
    }, 900);
  };

  const resetGame = () => {
    fetchProgressAndQuestions().catch(() => {});
  };

  const questionNumber = index + 1;
  const gameOver = status !== "playing";

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/game/quiz-battle/lobby")} className="text-muted-foreground">
            <Home className="w-4 h-4 ml-1" /> اللوبي
          </Button>
          <h1 className="text-xs arcade-text text-accent">❓⚡ لعبة الأسئلة</h1>
          <div className="text-xs text-muted-foreground font-body">المرحلة {stage}/{STAGES_PER_LEVEL}</div>
        </div>

        <div className="mb-4 rounded-full border border-border bg-muted px-4 py-2 text-center text-sm font-body">
          {loadingQuestions ? "جاري تحميل الأسئلة..." : `السؤال ${questionNumber}/${questions.length || QUESTIONS_PER_STAGE} - الوقت: ${timeLeft}s`}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-center gap-4 text-sm font-body">
          <span className="text-primary">نقاطك: {playerScore}</span>
          <span className="text-accent">نقاط البوت: {botScore}</span>
          {savingProgress && <span className="text-muted-foreground">جاري حفظ التقدم...</span>}
        </div>

        {current && !gameOver && (
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="mb-4 text-base font-body text-foreground">{current.question}</p>
            <div className="grid grid-cols-1 gap-2">
              {current.options.map((opt, i) => {
                const isCorrect = locked && i === current.correctIndex;
                const isWrong = locked && selected === i && i !== current.correctIndex;
                return (
                  <button
                    key={i}
                    disabled={locked}
                    onClick={() => submitAnswer(i)}
                    className={`rounded-md border px-3 py-2 text-right text-sm transition-all ${
                      isCorrect
                        ? "border-primary bg-primary/20 text-primary"
                        : isWrong
                          ? "border-destructive bg-destructive/20 text-destructive"
                          : "border-border bg-game-grid hover:border-primary/40"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {status === "player_wins" && stage < STAGES_PER_LEVEL && (
                    <Button onClick={() => navigate(`/game/quiz-battle?level=${difficulty}&stage=${stage + 1}`)}>المرحلة التالية</Button>
                  )}
                  <Button variant="outline" onClick={resetGame}>
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
      </div>
    </div>
  );
};

export default QuizBattleGame;

