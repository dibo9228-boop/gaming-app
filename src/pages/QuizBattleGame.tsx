import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Home, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  getCategories,
  getQuestions,
  type QuizCategory,
  type QuizQuestion,
  type QuizDifficulty,
} from "@/lib/quizData";

const QUESTIONS_PER_GAME = 15;
const SECONDS_PER_QUESTION = 15;
const GENERAL_LABEL = "أسئلة عامة";

const QuizBattleGame = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<QuizCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  /** null = أسئلة عامة, otherwise selected category */
  const [selectedCategory, setSelectedCategory] = useState<QuizCategory | null>(null);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [hasChosen, setHasChosen] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<number | null>(null);

  const current = questions[index];
  const showingCategories = !hasChosen && questions.length === 0 && !gameOver;
  const playing = questions.length > 0 && !gameOver;

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((e) => setCategoriesError(e instanceof Error ? e.message : "فشل تحميل الفئات"))
      .finally(() => setCategoriesLoading(false));
  }, []);

  const startGame = useCallback(
    async (cat: QuizCategory | null) => {
      setHasChosen(true);
      setSelectedCategory(cat);
      setQuestionsLoading(true);
      setQuestionsError(null);
      try {
        const q = await getQuestions(cat === null ? null : cat.id, QUESTIONS_PER_GAME, difficulty);
        setQuestions(q);
        setIndex(0);
        setScore(0);
        setSelected(null);
        setGameOver(false);
        setTimeLeft(SECONDS_PER_QUESTION);
        setLocked(false);
      } catch (e) {
        setQuestionsError(e instanceof Error ? e.message : "فشل تحميل الأسئلة");
      } finally {
        setQuestionsLoading(false);
      }
    },
    [difficulty]
  );

  const finishGame = useCallback(() => {
    setGameOver(true);
  }, []);

  const nextQuestion = useCallback(() => {
    setSelected(null);
    setLocked(false);
    setTimeLeft(SECONDS_PER_QUESTION);
    setIndex((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!playing || !questions.length || index >= questions.length) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          setLocked(true);
          setTimeout(() => {
            if (index >= questions.length - 1) finishGame();
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
  }, [playing, questions.length, index, nextQuestion, finishGame]);

  const submitAnswer = (optionIndex: number) => {
    if (!current || locked || gameOver) return;
    setSelected(optionIndex);
    setLocked(true);
    if (optionIndex === current.correctIndex) setScore((s) => s + 1);
    setTimeout(() => {
      if (index >= questions.length - 1) finishGame();
      else nextQuestion();
    }, 900);
  };

  const backToCategories = () => {
    setHasChosen(false);
    setSelectedCategory(null);
    setQuestions([]);
    setQuestionsError(null);
    setIndex(0);
    setScore(0);
    setGameOver(false);
  };

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/game/quiz-battle/lobby")} className="text-muted-foreground">
            <Home className="w-4 h-4 ml-1" /> اللوبي
          </Button>
          <h1 className="text-xs arcade-text text-accent">❓ اختبر نفسك</h1>
          <div className="text-xs text-muted-foreground font-body flex flex-col items-end">
            <span>
              {playing && `السؤال ${index + 1}/${questions.length} · ${timeLeft}s`}
            </span>
            <span>
              الصعوبة:{" "}
              {difficulty === "easy" ? "سهل" : difficulty === "hard" ? "صعب" : "متوسط"}
            </span>
          </div>
        </div>

        {/* شاشة اختيار الفئة أو أسئلة عامة */}
        {showingCategories && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground font-body text-center">
              اختر مستوى الصعوبة ثم أسئلة عامة أو فئة محددة · 15 سؤال، 15 ثانية لكل سؤال
            </p>
            <div className="flex justify-center gap-2">
              <Button
                variant={difficulty === "easy" ? "default" : "outline"}
                size="sm"
                onClick={() => setDifficulty("easy")}
              >
                سهل
              </Button>
              <Button
                variant={difficulty === "medium" ? "default" : "outline"}
                size="sm"
                onClick={() => setDifficulty("medium")}
              >
                متوسط
              </Button>
              <Button
                variant={difficulty === "hard" ? "default" : "outline"}
                size="sm"
                onClick={() => setDifficulty("hard")}
              >
                صعب
              </Button>
            </div>
            {categoriesLoading && <p className="text-center text-muted-foreground font-body">جاري تحميل الفئات...</p>}
            {categoriesError && <p className="text-center text-destructive font-body">{categoriesError}</p>}
            {!categoriesLoading && !categoriesError && (
              <>
                <Button
                  variant="default"
                  className="w-full h-auto py-3 text-base font-body"
                  onClick={() => startGame(null)}
                >
                  {GENERAL_LABEL}
                </Button>
                {categories.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {categories.map((c) => (
                      <Button
                        key={c.id}
                        variant="outline"
                        className="h-auto py-3 text-right font-body"
                        onClick={() => startGame(c)}
                      >
                        {c.name}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* جاري تحميل الأسئلة */}
        {hasChosen && questionsLoading && (
          <p className="text-center text-muted-foreground font-body">جاري تحميل الأسئلة...</p>
        )}
        {hasChosen && questionsError && !questions.length && (
          <div className="space-y-2 text-center">
            <p className="text-destructive font-body">{questionsError}</p>
            <Button variant="outline" onClick={backToCategories}>العودة للفئات</Button>
          </div>
        )}

        {/* اللعب */}
        {current && playing && (
          <>
            <div className="mb-4 rounded-full border border-border bg-muted px-4 py-2 text-center text-sm font-body">
              الوقت: {timeLeft}s
            </div>
            <div className="mb-4 text-center text-sm font-body text-primary">نقاطك: {score}</div>
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
          </>
        )}

        {/* نهاية الجولة */}
        <AnimatePresence>
          {gameOver && questions.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mx-4 w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center"
              >
                <div className="mb-3 text-5xl">🎉</div>
                <h2 className="mb-2 text-sm arcade-text text-foreground">انتهت الجولة</h2>
                <p className="mb-1 text-sm text-muted-foreground font-body">
                  إجابات صحيحة: {score} / {questions.length}
                </p>
                <p className="mb-4 text-sm font-body text-primary">
                  النقاط حسب الصعوبة:{" "}
                  {(() => {
                    const multiplier =
                      difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
                    return score * multiplier;
                  })()}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => startGame(selectedCategory)}>
                    <RotateCcw className="w-4 h-4 ml-1" /> {selectedCategory === null ? GENERAL_LABEL : "نفس الفئة"}
                  </Button>
                  <Button variant="outline" onClick={backToCategories}>فئة أخرى</Button>
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
