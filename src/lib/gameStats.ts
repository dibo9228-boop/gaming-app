import { supabase } from "@/integrations/supabase/client";

export type GameId = "tom-and-jerry" | "memory-match" | "quiz-battle";

export type GameStats = {
  xp: number;
  wins: number;
  plays: number;
};

export type UserStats = {
  totalXp: number;
  streakCount: number;
  lastPlayedDate: string | null;
  streakRewardClaimedToday: boolean;
  byGame: Record<string, GameStats>;
};

export type DailyStreakResult = {
  awarded: boolean;
  bonus: number;
  streakCount: number;
};

async function ensureProfile(userId: string): Promise<{
  totalXp: number;
  streakCount: number;
  lastPlayedDate: string | null;
  streakRewardClaimedToday: boolean;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select("total_xp, streak_count, last_played_date, streak_reward_claimed_today")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    return {
      totalXp: data.total_xp ?? 0,
      streakCount: data.streak_count ?? 0,
      lastPlayedDate: data.last_played_date ?? null,
      streakRewardClaimedToday: data.streak_reward_claimed_today ?? false,
    };
  }

  const fallbackName = `player-${userId.slice(0, 8)}`;
  const { data: inserted, error: insertErr } = await supabase
    .from("profiles")
    .insert({ user_id: userId, display_name: fallbackName, total_xp: 0, streak_count: 0 })
    .select("total_xp, streak_count")
    .single();

  if (insertErr) throw insertErr;
  return {
    totalXp: inserted?.total_xp ?? 0,
    streakCount: inserted?.streak_count ?? 0,
    lastPlayedDate: null,
    streakRewardClaimedToday: false,
  };
}

export async function addGameXp(
  userId: string,
  gameId: GameId,
  xpDelta: number
): Promise<DailyStreakResult | null> {
  if (!userId || xpDelta <= 0) return null;

  // Ensure profile row exists before calling RPC.
  await ensureProfile(userId);

  const { data, error } = await supabase.rpc("apply_game_rewards", {
    p_user_id: userId,
    p_game_id: gameId,
    p_xp_delta: xpDelta,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    awarded: Boolean(row.streak_awarded),
    bonus: Number(row.streak_bonus ?? 0),
    streakCount: Number(row.streak_count ?? 0),
  };
}

export async function getUserStats(userId: string): Promise<UserStats> {
  if (!userId) {
    return {
      totalXp: 0,
      streakCount: 0,
      lastPlayedDate: null,
      streakRewardClaimedToday: false,
      byGame: {},
    };
  }

  const profile = await ensureProfile(userId);

  const [, statsRes] = await Promise.all([
    Promise.resolve({
      data: {
        total_xp: profile.totalXp,
        streak_count: profile.streakCount,
        last_played_date: profile.lastPlayedDate,
        streak_reward_claimed_today: profile.streakRewardClaimedToday,
      },
    }),
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
    totalXp: profile.totalXp,
    streakCount: profile.streakCount,
    lastPlayedDate: profile.lastPlayedDate,
    streakRewardClaimedToday: profile.streakRewardClaimedToday,
    byGame,
  };
}
