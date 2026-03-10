export type QuizDifficulty = "easy" | "medium" | "hard";

export type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  category?: string;
};

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const translationCache = new Map<string, string>();

async function translateToArabic(text: string): Promise<string> {
  if (!text.trim()) return text;
  if (translationCache.has(text)) return translationCache.get(text)!;

  // Public Google translate endpoint (no key) - useful for client-side translation.
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Translation API failed");
  const data = await res.json();
  const translated = (data?.[0] as any[] | undefined)?.map((x) => x?.[0] ?? "").join("")?.trim();
  if (!translated) throw new Error("Empty translation");

  translationCache.set(text, translated);
  return translated;
}

async function toArabicQuestion(input: {
  question: string;
  correct: string;
  incorrect: string[];
  category?: string;
}): Promise<QuizQuestion> {
  const question = decodeHtml(input.question);
  const correct = decodeHtml(input.correct);
  const incorrect = input.incorrect.map((x) => decodeHtml(x));
  const optionsEn = [correct, ...incorrect];
  const options = shuffle(optionsEn);
  const correctIndex = options.findIndex((o) => o === correct);

  const [qAr, catAr, ...optAr] = await Promise.all([
    translateToArabic(question),
    translateToArabic(input.category || "General Knowledge"),
    ...options.map((o) => translateToArabic(o)),
  ]);

  return {
    question: qAr,
    options: optAr,
    correctIndex,
    category: catAr,
  };
}

async function fetchFromOpenTDB(amount: number, difficulty: QuizDifficulty): Promise<QuizQuestion[]> {
  const url = `https://opentdb.com/api.php?amount=${amount}&difficulty=${difficulty}&type=multiple`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("OpenTDB request failed");
  const json = await res.json();
  if (!json?.results?.length) throw new Error("No OpenTDB questions");
  return Promise.all(
    json.results.map((q: any) =>
      toArabicQuestion({
        question: q.question,
        correct: q.correct_answer,
        incorrect: q.incorrect_answers || [],
        category: q.category,
      })
    )
  );
}

async function fetchFromTriviaApi(amount: number): Promise<QuizQuestion[]> {
  const url = `https://the-trivia-api.com/v2/questions?limit=${amount}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("TheTriviaAPI request failed");
  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) throw new Error("No TheTriviaAPI questions");
  return Promise.all(
    json.map((q: any) =>
      toArabicQuestion({
        question: q.question?.text || q.question,
        correct: q.correctAnswer,
        incorrect: q.incorrectAnswers || [],
        category: q.category,
      })
    )
  );
}

export async function fetchQuizQuestions(
  amount: number,
  difficulty: QuizDifficulty
): Promise<QuizQuestion[]> {
  try {
    return await fetchFromOpenTDB(amount, difficulty);
  } catch {
    return await fetchFromTriviaApi(amount);
  }
}

export function getBotAccuracy(difficulty: QuizDifficulty): number {
  if (difficulty === "easy") return 0.45;
  if (difficulty === "medium") return 0.62;
  return 0.78;
}

