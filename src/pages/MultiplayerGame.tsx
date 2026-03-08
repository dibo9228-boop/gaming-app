import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

const GRID_SIZE = 10;

type Position = { x: number; y: number };
type CellType = "empty" | "wall";
type GameRoom = Tables<"game_rooms">;

const MultiplayerGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const grid: CellType[][] = room ? (room.grid as CellType[][]) : [];
  const jerry: Position = room ? (room.jerry_pos as unknown as Position) : { x: 0, y: 0 };
  const tom: Position = room ? (room.tom_pos as unknown as Position) : { x: 9, y: 0 };
  const exit: Position = room ? (room.exit_pos as unknown as Position) : { x: 9, y: 9 };
  const status = room?.status || "waiting";

  const myRole = room
    ? room.host_id === user?.id
      ? room.host_role
      : room.host_role === "jerry" ? "tom" : "jerry"
    : null;

  const isMyTurn = room?.current_turn === user?.id && status === "playing";

  // Fetch room
  useEffect(() => {
    if (!roomId) return;
    const fetchRoom = async () => {
      const { data, error } = await supabase.from("game_rooms").select("*").eq("id", roomId).single();
      setRoom(error ? null : data);
      setLoading(false);
    };
    fetchRoom();

    const channel = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "game_rooms",
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        setRoom(payload.new as GameRoom);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const getOtherPlayerId = useCallback(() => {
    if (!room || !user) return null;
    return room.host_id === user.id ? room.guest_id : room.host_id;
  }, [room, user]);

  const move = useCallback(async (dx: number, dy: number) => {
    if (!isMyTurn || !room || !user) return;

    const myPos = myRole === "jerry" ? jerry : tom;
    const nx = myPos.x + dx;
    const ny = myPos.y + dy;

    if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) return;
    if (grid[ny]?.[nx] === "wall") return;

    const newPos = { x: nx, y: ny };
    const otherPlayerId = getOtherPlayerId();

    const update: Record<string, any> = {
      current_turn: otherPlayerId,
    };

    if (myRole === "jerry") {
      update.jerry_pos = newPos;
      // Check if Jerry reached exit
      if (nx === exit.x && ny === exit.y) {
        update.status = "jerry_wins";
        update.current_turn = null;
      }
      // Check if Jerry walked into Tom
      if (nx === tom.x && ny === tom.y) {
        update.status = "tom_wins";
        update.current_turn = null;
      }
    } else {
      update.tom_pos = newPos;
      // Check if Tom caught Jerry
      if (nx === jerry.x && ny === jerry.y) {
        update.status = "tom_wins";
        update.current_turn = null;
      }
    }

    await supabase.from("game_rooms").update(update).eq("id", room.id);
  }, [isMyTurn, room, user, myRole, jerry, tom, exit, grid, getOtherPlayerId]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp": e.preventDefault(); move(0, -1); break;
        case "ArrowDown": e.preventDefault(); move(0, 1); break;
        case "ArrowLeft": e.preventDefault(); move(-1, 0); break;
        case "ArrowRight": e.preventDefault(); move(1, 0); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

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
      move(dx > 0 ? 1 : -1, 0);
    } else {
      move(0, dy > 0 ? 1 : -1);
    }
    touchStart.current = null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">جاري التحميل...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted-foreground font-body">الغرفة غير موجودة</p>
        <Button variant="outline" onClick={() => navigate("/game/tom-and-jerry/lobby")}>العودة للوبي</Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4" dir="rtl">
        <p className="text-muted-foreground font-body text-center">سجّل الدخول للانضمام للغرفة أو إنشاء غرفة.</p>
        <Button variant="outline" onClick={() => navigate("/auth")}>تسجيل الدخول</Button>
      </div>
    );
  }

  const cellSize = "min(7vw, 48px)";
  const gameOver = status === "jerry_wins" || status === "tom_wins";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-6 px-4" dir="rtl">
      {/* Header */}
      <div className="w-full max-w-lg flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/game/tom-and-jerry/lobby")} className="text-muted-foreground">
          <Home className="w-4 h-4 ml-1" /> اللوبي
        </Button>
        <h1 className="text-xs arcade-text text-accent text-glow-yellow">🐱 توم وجيري 🐭</h1>
        <span className="text-xs text-muted-foreground font-body">
          أنت: {myRole === "jerry" ? "🐭" : "🐱"}
        </span>
      </div>

      {/* Turn indicator */}
      <div className={`mb-4 px-4 py-2 rounded-full text-sm font-body ${
        isMyTurn
          ? "bg-primary/20 text-primary border border-primary/40"
          : "bg-muted text-muted-foreground border border-border"
      }`}>
        {status === "waiting" ? "بانتظار اللاعب التاني..." :
         gameOver ? (status === "jerry_wins" ? "🐭 جيري ربح!" : "🐱 توم ربح!") :
         isMyTurn ? "⚡ دورك!" : "⏳ دور الخصم..."}
      </div>

      {/* Info */}
      <div className="flex gap-6 mb-4 text-sm font-body text-muted-foreground">
        <span>🐭 = جيري</span>
        <span>🐱 = توم</span>
        <span>🏠 = المخرج</span>
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative bg-game-surface border border-border rounded-lg p-2 box-glow-green"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_SIZE}, ${cellSize})`,
          gridTemplateRows: `repeat(${GRID_SIZE}, ${cellSize})`,
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
                  <motion.span key="jerry" initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}>🐭</motion.span>
                )}
                {isTom && !isJerry && (
                  <motion.span key="tom" initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}>🐱</motion.span>
                )}
                {isExit && !isJerry && !isTom && <span>🏠</span>}
              </div>
            );
          })
        )}
      </div>

      {/* Mobile Controls */}
      {isMyTurn && (
        <div className="mt-6 grid grid-cols-3 gap-2 md:hidden">
          <div />
          <Button variant="outline" size="sm" onClick={() => move(0, -1)} className="text-lg">↑</Button>
          <div />
          <Button variant="outline" size="sm" onClick={() => move(-1, 0)} className="text-lg">→</Button>
          <Button variant="outline" size="sm" onClick={() => move(0, 1)} className="text-lg">↓</Button>
          <Button variant="outline" size="sm" onClick={() => move(1, 0)} className="text-lg">←</Button>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground font-body hidden md:block">
        استخدم أسهم الكيبورد للتحرك
      </p>

      {/* Game Over Overlay */}
      <AnimatePresence>
        {gameOver && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="bg-card border border-border rounded-lg p-8 text-center max-w-sm mx-4"
            >
              <div className="text-5xl mb-4">
                {(status === "jerry_wins" && myRole === "jerry") || (status === "tom_wins" && myRole === "tom")
                  ? "🎉" : "😿"}
              </div>
              <h2 className="text-sm arcade-text mb-2 text-foreground">
                {(status === "jerry_wins" && myRole === "jerry") || (status === "tom_wins" && myRole === "tom")
                  ? "ربحت!" : "خسرت!"}
              </h2>
              <p className="text-muted-foreground font-body mb-6">
                {status === "jerry_wins" ? "جيري هرب بنجاح! 🐭✨" : "توم لقط جيري! 🐱"}
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => navigate("/game/tom-and-jerry/lobby")} className="gap-2">
                  <RotateCcw className="w-4 h-4" /> العب مرة تانية
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
  );
};

export default MultiplayerGame;
