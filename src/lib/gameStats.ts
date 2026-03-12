import { supabase } from "@/integrations/supabase/client";

export type GameId = "tom-and-jerry" | "memory-match" | "quiz-battle";

export type GameStats = {
  xp: number;
  wins: number;
  plays: number;
};

export type UserStats = {
  totalXp: number;
  byGame: Record<string, GameStats>;
};

async function ensureProfile(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("profiles")
    .select("total_xp")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data.total_xp ?? 0;

  const fallbackName = `player-${userId.slice(0, 8)}`;
  const { data: inserted, error: insertErr } = await supabase
    .from("profiles")
    .insert({ user_id: userId, display_name: fallbackName, total_xp: 0 })
    .select("total_xp")
    .single();

  if (insertErr) throw insertErr;
  return inserted?.total_xp ?? 0;
}

export async function addGameXp(userId: string, gameId: GameId, xpDelta: number) {
  if (!userId || xpDelta <= 0) return;

  // 1. Ensure profile exists then update total_xp
  const currentTotal = await ensureProfile(userId);

  const { error: profileUpdateErr } = await supabase
    .from("profiles")
    .update({ total_xp: currentTotal + xpDelta })
    .eq("user_id", userId);

  if (profileUpdateErr) throw profileUpdateErr;

  // 2. Update per-game XP — explicit select then insert/update (avoids upsert+RLS issues)
  const { data: existing } = await supabase
    .from("user_game_stats")
    .select("xp")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("user_game_stats")
      .update({ xp: existing.xp + xpDelta })
      .eq("user_id", userId)
      .eq("game_id", gameId);
  } else {
    await supabase
      .from("user_game_stats")
      .insert({ user_id: userId, game_id: gameId, xp: xpDelta });
  }
}

export async function getUserStats(userId: string): Promise<UserStats> {
  if (!userId) return { totalXp: 0, byGame: {} };

  const totalXp = await ensureProfile(userId);

  const [profileRes, statsRes] = await Promise.all([
    Promise.resolve({ data: { total_xp: totalXp } }),
    supabase
      .from("user_game_stats")
      .select("game_id, xp, wins, plays")
      .eq("user_id", userId),
  ]);

  const byGame: Record<string, GameStats> = {};
  for (const row of statsRes.data || []) {
    byGame[row.game_id] = { xp: row.xp, wins: row.wins, plays: row.plays };
  }

  return {
    totalXp: profileRes.data?.total_xp ?? 0,
    byGame,
  };
}
