import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, Home, Medal } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = Tables<"profiles">;

function getDisplayName(p: Pick<Profile, "display_name" | "user_id">): string {
  const raw = (p.display_name ?? "").trim();
  if (!raw) return "لاعب مجهول";
  if (raw.startsWith("player-")) return `لاعب ${p.user_id.slice(0, 6)}`;
  return raw;
}

const Leaderboard = () => {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayers = () =>
      supabase
        .from("profiles")
        .select("user_id, display_name, total_xp, avatar_url")
        .order("total_xp", { ascending: false })
        .limit(50)
        .then(({ data }) => {
          setPlayers(data || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));

    fetchPlayers();
    const channel = supabase
      .channel("leaderboard-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchPlayers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-muted-foreground"
          >
            <Home className="w-4 h-4 ml-1" />
            الرئيسية
          </Button>
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-accent" />
            <h1 className="text-xs arcade-text text-accent">لوحة الصدارة</h1>
          </div>
          <span className="text-xs text-muted-foreground font-body">
            أعلى اللاعبين بالنقاط (XP)
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          {loading ? (
            <p className="text-center text-muted-foreground font-body text-sm">
              جاري تحميل اللاعبين...
            </p>
          ) : players.length === 0 ? (
            <p className="text-center text-muted-foreground font-body text-sm">
              ما في لاعبين بعد.
            </p>
          ) : (
            <div className="space-y-2">
              {players.map((p, index) => {
                const rank = index + 1;
                const isTop3 = rank <= 3;
                const badge =
                  rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

                return (
                  <div
                    key={p.user_id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 font-body text-sm ${
                      isTop3 ? "border-accent/60 bg-accent/5" : "border-border bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 text-center text-xs font-semibold">
                        {badge ?? rank}
                      </span>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={p.avatar_url ?? undefined} alt="avatar" />
                        <AvatarFallback>{getDisplayName(p).slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-foreground truncate max-w-[160px]">
                          {getDisplayName(p)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          XP: {p.total_xp}
                        </span>
                      </div>
                    </div>
                    {isTop3 && (
                      <span className="text-xs text-accent flex items-center gap-1">
                        <Medal className="w-3 h-3" />
                        من النخبة
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;

