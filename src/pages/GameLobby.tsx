import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Home, Plus, Link2, LogOut, Gamepad2, Copy, Check, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { AchievementsDialog } from "@/components/AchievementsDialog";

const GRID_SIZE = 10;
const WALL_DENSITY = 0.2;

type CellType = "empty" | "wall";

function hasPath(grid: CellType[][], size: number, blockCell: { x: number; y: number } | null = null): boolean {
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [{ x: 0, y: 0 }];
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

/** Carve a guaranteed path from start to exit avoiding Tom's cell (top-right). Fair for both players. */
function carveGuaranteedPath(grid: CellType[][], size: number): void {
  const tomX = size - 1, tomY = 0;
  for (let x = 0; x <= size - 2; x++) grid[0][x] = "empty";
  for (let y = 0; y < size; y++) grid[y][size - 2] = "empty";
  for (let y = 1; y < size; y++) grid[y][size - 1] = "empty";
  grid[size - 1][size - 1] = "empty";
  grid[tomY][tomX] = "empty";
}

/** Multiplayer: dynamic maze each room, always runnable and fair (path exists, avoids Tom's start). */
function generateMaze(): CellType[][] {
  const grid: CellType[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => "empty")
  );
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (Math.random() < WALL_DENSITY) grid[y][x] = "wall";
    }
  }
  grid[0][0] = "empty"; grid[0][1] = "empty"; grid[1][0] = "empty";
  grid[GRID_SIZE - 1][GRID_SIZE - 1] = "empty";
  grid[GRID_SIZE - 1][GRID_SIZE - 2] = "empty";
  grid[GRID_SIZE - 2][GRID_SIZE - 1] = "empty";
  const tomStart = { x: GRID_SIZE - 1, y: 0 };
  grid[tomStart.y][tomStart.x] = "empty";
  grid[0][GRID_SIZE - 2] = "empty";
  grid[1][GRID_SIZE - 1] = "empty";
  let attempts = 0;
  const maxAttempts = 120;
  while (!hasPath(grid, GRID_SIZE, tomStart) && attempts < maxAttempts) {
    const wy = Math.floor(Math.random() * GRID_SIZE);
    const wx = Math.floor(Math.random() * GRID_SIZE);
    if (grid[wy][wx] === "wall") { grid[wy][wx] = "empty"; attempts++; }
  }
  if (!hasPath(grid, GRID_SIZE, tomStart)) carveGuaranteedPath(grid, GRID_SIZE);
  return grid;
}

const GameLobby = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [inviteCode, setInviteCode] = useState("");
  const [myRooms, setMyRooms] = useState<Tables<"game_rooms">[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [totalXp, setTotalXp] = useState<number | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("total_xp").eq("user_id", user.id).single()
      .then(({ data }) => setTotalXp(data?.total_xp ?? 0));
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const fetchRooms = async () => {
      const { data } = await supabase
        .from("game_rooms")
        .select("*")
        .or(`host_id.eq.${user.id},guest_id.eq.${user.id}`)
        .in("status", ["waiting", "playing"])
        .order("created_at", { ascending: false });
      if (data) setMyRooms(data);
    };
    fetchRooms();

    const channel = supabase
      .channel("lobby-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" }, (payload) => {
        fetchRooms();
        // Auto-navigate host when guest joins
        const updated = payload.new as any;
        if (updated && updated.host_id === user.id && updated.status === "playing" && updated.guest_id) {
          navigate(`/game/tom-and-jerry/multi/${updated.id}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const createRoom = async () => {
    if (!user) return;
    const grid = generateMaze();
    const { data, error } = await supabase
      .from("game_rooms")
      .insert({
        host_id: user.id,
        grid: grid as any,
        current_turn: user.id,
        host_role: "jerry",
      })
      .select()
      .single();

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      toast({ title: "تم إنشاء الغرفة!", description: "شارك كود الدعوة مع صاحبك" });
      navigate(`/game/tom-and-jerry/multi/${data.id}`);
    }
  };

  const joinRoom = async () => {
    if (!user || !inviteCode.trim()) return;
    const { data: room, error: findErr } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("invite_code", inviteCode.trim())
      .eq("status", "waiting")
      .single();

    if (findErr || !room) {
      toast({ title: "خطأ", description: "الكود غير صحيح أو الغرفة مش متاحة", variant: "destructive" });
      return;
    }
    if (room.host_id === user.id) {
      toast({ title: "خطأ", description: "ما بتقدر تنضم لغرفتك", variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from("game_rooms")
      .update({
        guest_id: user.id,
        status: "playing",
        current_turn: room.host_id,
      })
      .eq("id", room.id);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    navigate(`/game/tom-and-jerry/multi/${room.id}`);
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground">
            <Home className="w-4 h-4 ml-1" /> الرئيسية
          </Button>
          <h1 className="text-xs arcade-text text-accent text-glow-yellow">🐱 توم وجيري 🐭</h1>
          <div className="flex items-center gap-2">
            {totalXp !== null && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAchievementsOpen(true)} title="الإنجازات">
                  <Trophy className="h-4 w-4" />
                </Button>
                <span className="text-xs text-primary font-body">نقاط: {totalXp}</span>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="w-4 h-4 ml-1" /> خروج
            </Button>
          </div>
        </div>
        {totalXp !== null && (
          <AchievementsDialog open={achievementsOpen} onOpenChange={setAchievementsOpen} totalXp={totalXp} />
        )}

        {/* Mode Selection */}
        <div className="space-y-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-lg p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <Gamepad2 className="w-5 h-5 text-primary" />
              <h2 className="text-sm arcade-text text-foreground">لعب ضد بوت</h2>
            </div>
            <p className="text-sm text-muted-foreground font-body mb-4">العب لحالك ضد الذكاء الاصطناعي. لكل مستوى ٢٥ مرحلة متدرجة. اختر المستوى:</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate("/game/tom-and-jerry?level=easy&stage=1")} variant="outline" size="sm" className="flex-1 min-w-[80px]">
                سهل (٢٥ مرحلة)
              </Button>
              <Button onClick={() => navigate("/game/tom-and-jerry?level=medium&stage=1")} size="sm" className="flex-1 min-w-[80px]">
                متوسط (٢٥ مرحلة)
              </Button>
              <Button onClick={() => navigate("/game/tom-and-jerry?level=hard&stage=1")} variant="secondary" size="sm" className="flex-1 min-w-[80px]">
                صعب (٢٥ مرحلة)
              </Button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-card border border-border rounded-lg p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-5 h-5 text-secondary" />
              <h2 className="text-sm arcade-text text-foreground">إنشاء غرفة</h2>
            </div>
            <p className="text-sm text-muted-foreground font-body mb-4">أنشئ غرفة وادعي صاحبك يلعب معك</p>
            <Button onClick={createRoom} variant="secondary" className="w-full">إنشاء غرفة 🎮</Button>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-lg p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-5 h-5 text-accent" />
              <h2 className="text-sm arcade-text text-foreground">انضم لغرفة</h2>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="أدخل كود الدعوة"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="bg-muted border-border text-foreground"
              />
              <Button onClick={joinRoom} variant="outline">انضم</Button>
            </div>
          </motion.div>
        </div>

        {/* Active Rooms */}
        {myRooms.length > 0 && (
          <div>
            <h2 className="text-xs arcade-text text-foreground mb-4">غرفك النشطة</h2>
            <div className="space-y-3">
              {myRooms.map((room) => (
                <motion.div key={room.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-body ${
                        room.status === "waiting"
                          ? "bg-accent/20 text-accent"
                          : "bg-primary/20 text-primary"
                      }`}>
                        {room.status === "waiting" ? "بانتظار لاعب" : "جارية"}
                      </span>
                      <span className="text-xs text-muted-foreground font-body">
                        أنت: {room.host_id === user?.id
                          ? (room.host_role === "jerry" ? "🐭 جيري" : "🐱 توم")
                          : (room.host_role === "jerry" ? "🐱 توم" : "🐭 جيري")
                        }
                      </span>
                    </div>
                    {room.status === "waiting" && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground font-body">كود:</span>
                        <code className="text-xs text-primary bg-muted px-2 py-1 rounded">{room.invite_code}</code>
                        <button onClick={() => copyCode(room.invite_code, room.id)} className="text-muted-foreground hover:text-foreground">
                          {copiedId === room.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    )}
                  </div>
                  {room.status === "playing" && (
                    <Button size="sm" onClick={() => navigate(`/game/tom-and-jerry/multi/${room.id}`)}>
                      تابع اللعب
                    </Button>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameLobby;
