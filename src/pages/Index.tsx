import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Gamepad2, Zap, Trophy, LogIn, LogOut, Crown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { AchievementsDialog } from "@/components/AchievementsDialog";
import { getUserStats, type UserStats } from "@/lib/gameStats";

const games = [
  {
    id: "tom-and-jerry",
    title: "توم وجيري",
    titleEn: "Tom & Jerry",
    description: "ساعد جيري يهرب من توم! العب ضد بوت أو ادعي صاحبك يلعب معك.",
    icon: "🐱",
    icon2: "🐭",
    color: "neon-yellow",
    players: "1-2 لاعبين",
    difficulty: "سهل • متوسط • صعب",
    available: true,
  },
  {
    id: "memory-match",
    title: "لعبة الذاكرة",
    titleEn: "Memory Match",
    description: "افتح الكروت المتشابهة! العب ضد بوت أو ادعي صاحبك للعبة جماعية.",
    icon: "🧠",
    icon2: "🃏",
    color: "neon-purple",
    players: "1-2 لاعبين",
    difficulty: "سهل • متوسط • صعب",
    available: true,
  },
  {
    id: "quiz-battle",
    title: "معركة الأسئلة",
    titleEn: "Quiz Battle",
    description: "جاوب أسرع من خصمك! 10 ثواني لكل سؤال مع أسئلة متنوعة من dataset على الإنترنت.",
    icon: "❓",
    icon2: "⚡",
    color: "neon-blue",
    players: "1-2 لاعبين",
    difficulty: "سهل • متوسط • صعب",
    available: true,
  },
];

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setUserStats(null);
      return;
    }
    getUserStats(user.id).then(setUserStats).catch(() => {});
  }, [user]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Auth Bar */}
      <div className="flex justify-between items-center p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/leaderboard")}
          className="text-muted-foreground gap-1"
        >
          <Crown className="w-4 h-4" />
          <span className="hidden sm:inline">لوحة الصدارة</span>
        </Button>
        {user ? (
          <div className="flex items-center gap-3">
            {userStats !== null && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAchievementsOpen(true)} title="الإنجازات">
                  <Trophy className="h-4 w-4" />
                </Button>
                <span className="text-sm text-primary font-body">نقاط: {userStats.totalXp}</span>
              </>
            )}
            <span className="text-sm text-muted-foreground font-body">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="w-4 h-4 ml-1" /> خروج
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-primary">
            <LogIn className="w-4 h-4 ml-1" /> تسجيل الدخول
          </Button>
        )}
      </div>
      {user && userStats !== null && (
        <AchievementsDialog
          open={achievementsOpen}
          onOpenChange={setAchievementsOpen}
          stats={userStats}
        />
      )}
      {/* Hero */}
      <section className="relative overflow-hidden py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-neon-green/5 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <Gamepad2 className="w-10 h-10 text-primary" />
              <Zap className="w-6 h-6 text-accent animate-pulse-neon" />
            </div>
            <h1 className="text-2xl md:text-4xl text-primary text-glow-green mb-4 leading-relaxed">
              ساحة التحدي
            </h1>
             <p className="text-lg md:text-xl text-muted-foreground font-body max-w-2xl mx-auto">
               ألعاب تحدي ممتعة! العب ضد البوت أو تحدى أصحابك
             </p>
           </motion.div>
        </div>
      </section>

      {/* Games Grid */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="flex items-center gap-3 mb-8">
          <Trophy className="w-6 h-6 text-accent" />
          <h2 className="text-sm md:text-base text-accent arcade-text">الألعاب</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
              onClick={() => game.available && navigate(user ? `/game/${game.id}/lobby` : `/game/${game.id}`)}
              className={`
                group relative bg-card border border-border rounded-lg p-6 
                transition-all duration-300
                ${game.available 
                  ? "cursor-pointer hover:border-primary/50 hover:box-glow-green" 
                  : "opacity-50 cursor-not-allowed"
                }
              `}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="text-4xl flex gap-2">
                  <span>{game.icon}</span>
                  <span>{game.icon2}</span>
                </div>
                {game.available && (
                  <span className="px-2 py-1 text-[10px] arcade-text bg-primary/10 text-primary rounded-full">
                    متاح
                  </span>
                )}
              </div>

              <h3 className="text-xs arcade-text text-foreground mb-1">{game.title}</h3>
              <p className="text-sm text-muted-foreground font-body mb-4">{game.description}</p>

              <div className="flex items-center gap-4 text-xs text-muted-foreground font-body">
                <span>👥 {game.players}</span>
                <span>⚡ {game.difficulty}</span>
              </div>

              {game.available && (
                <div className="absolute inset-0 rounded-lg border-2 border-primary/0 group-hover:border-primary/30 transition-all duration-300" />
              )}
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Index;
