export type Difficulty = "easy" | "medium" | "hard";

function createSeededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

export function getPairsCount(difficulty: Difficulty): number {
  if (difficulty === "easy") return 6;
  if (difficulty === "medium") return 8;
  return 10;
}

export function generateDeck(difficulty: Difficulty, stage: number): number[] {
  const pairs = getPairsCount(difficulty);
  const values = Array.from({ length: pairs }, (_, i) => i + 1);
  const deck = [...values, ...values];
  const seed = (difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3) * 1000 + stage;
  const rand = createSeededRandom(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

