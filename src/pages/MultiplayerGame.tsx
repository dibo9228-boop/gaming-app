import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, RotateCcw, Home, Copy, Link as LinkIcon, Send, Check } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateMaze } from "@/lib/tomJerryMaze";

const GRID_SIZE = 10;

type Position = { x: number; y: number };
type CellType = "empty" | "wall";
type GameRoom = Tables<"game_rooms">;

const MultiplayerGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState("");
  const [copiedForRoomId, setCopiedForRoomId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const grid: CellType[][] = room ? (room.grid as CellType[][]) : [];
  const jerry: Position = room ? (room.jerry_pos as unknown as Position) : { x: 0, y: 0 };
  const tom: Position = room ? (room.tom_pos as unknown as Position) : { x: 9, y: 0 };
  const exit: Position = room ? (room.exit_pos as unknown as Position) : { x: 9, y: 9 };
  const status = room?.status || "waiting";
  const lastJerryDir = room?.last_jerry_direction as { dx: number; dy: number } | null;
  const lastJerryStreak = room?.last_jerry_streak ?? 0;
  const tomMoveCount = room?.tom_move_count ?? 0;
  const TOM_MOVE_LIMIT = 50;

  const myRole = room
    ? room.host_id === user?.id
      ? room.host_role
      : room.host_role === "jerry" ? "tom" : "jerry"
    : null;

  const isMyTurn = room?.current_turn === user?.id && status === "playing";

  // API actions with loading state

  const {
    run: sendInviteAction,
    loading: sendingInvite,
  } = useApiAction(async () => {
    if (!room || !user || !inviteUsername.trim()) return;
    const term = inviteUsername.trim();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .ilike("display_name", `%${term}%`)
      .limit(5);
    const exact = profiles?.find((p) => p.display_name?.toLowerCase() === term.toLowerCase());
    const toUserId = (exact ?? profiles?.[0])?.user_id;
    if (!toUserId) throw new Error("ما في مستخدم بهذا الاسم");
    if (toUserId === user.id) throw new Error("ما تقدر تدعي نفسك");

    const { error } = await supabase.from("game_invites").insert({
      room_id: room.id,
      from_user_id: user.id,
      to_user_id: toUserId,
    });
    if (error) throw error;
    toast({ title: "تم إرسال الدعوة!" });
    setInviteUsername("");
  });

  const {
    run: updateJoinPolicyAction,
    loading: updatingJoinPolicy,
  } = useApiAction(async (join_policy: "anyone" | "invite_only") => {
    if (!room || !roomId || room.host_id !== user?.id) return;
    const { error } = await supabase.from("game_rooms").update({ join_policy }).eq("id", room.id);
    if (error) throw error;
    toast({ title: "تم التحديث" });
  });

  const {
    run: resetRoomAction,
    loading: resetting,
  } = useApiAction(async () => {
    if (!room || !roomId || !user) return;
    if (room.host_id !== user.id && room.guest_id !== user.id) return;
    const grid = generateMaze();
    const { error } = await supabase
      .from("game_rooms")
      .update({
        grid: grid as any,
        jerry_pos: { x: 0, y: 0 },
        tom_pos: { x: GRID_SIZE - 1, y: 0 },
        exit_pos: { x: GRID_SIZE - 1, y: GRID_SIZE - 1 },
        status: "playing",
        current_turn: room.host_id,
        tom_move_count: 0,
        last_jerry_direction: null,
        last_jerry_streak: 0,
      })
      .eq("id", room.id);
    if (error) throw error;
  });

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

  const copyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    if (room) {
      setCopiedForRoomId(room.id);
      setTimeout(() => setCopiedForRoomId(null), 2000);
    }
    toast({ title: "تم نسخ الكود" });
  }, [room, toast]);

  const copyLink = useCallback((code: string) => {
    const url = `${window.location.origin}/game/tom-and-jerry/lobby?join=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    if (room) {
      setCopiedForRoomId(room.id);
      setTimeout(() => setCopiedForRoomId(null), 2000);
    }
    toast({ title: "تم نسخ الرابط", description: "شارك الرابط مع صاحبك" });
  }, [room, toast]);

  const sendInvite = useCallback(() => {
    sendInviteAction().catch((e: any) =>
      toast({ title: "خطأ", description: e.message || "فشل إرسال الدعوة", variant: "destructive" })
    );
  }, []);

  const updateJoinPolicy = useCallback(
    (join_policy: "anyone" | "invite_only") =>
      updateJoinPolicyAction(join_policy).catch((e: any) =>
        toast({ title: "خطأ", description: e.message || "فشل التحديث", variant: "destructive" })
      ),
    []
  );

  const resetRoomAndPlayAgain = useCallback(() => {
    resetRoomAction().catch((e: any) =>
      toast({ title: "خطأ", description: e.message || "فشل إعادة الغرفة", variant: "destructive" })
    );
  }, []);

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
      const sameDir = lastJerryDir && lastJerryDir.dx === dx && lastJerryDir.dy === dy;
      const newStreak = sameDir ? lastJerryStreak + 1 : 1;
      if (sameDir && lastJerryStreak >= 2) return;

      update.jerry_pos = newPos;
      update.last_jerry_direction = { dx, dy };
      update.last_jerry_streak = newStreak;
      if (nx === exit.x && ny === exit.y) {
        update.status = "jerry_wins";
        update.current_turn = null;
      }
      if (nx === tom.x && ny === tom.y) {
        update.status = "tom_wins";
        update.current_turn = null;
      }
    } else {
      update.tom_pos = newPos;
      const newTomMoveCount = tomMoveCount + 1;
      update.tom_move_count = newTomMoveCount;
      if (nx === jerry.x && ny === jerry.y) {
        update.status = "tom_wins";
        update.current_turn = null;
      } else if (newTomMoveCount >= TOM_MOVE_LIMIT) {
        update.status = "jerry_wins";
        update.current_turn = null;
      }
    }

    await supabase.from("game_rooms").update(update).eq("id", room.id);
  }, [isMyTurn, room, user, myRole, jerry, tom, exit, grid, getOtherPlayerId, lastJerryDir, lastJerryStreak, tomMoveCount]);

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

      {/* Invite controls inside room (host only, waiting state) */}
      {status === "waiting" && room && user && room.host_id === user.id && (
        <div className="w-full max-w-lg mb-4 bg-card border border-border rounded-lg p-3 space-y-2">
          <p className="text-xs font-body text-muted-foreground">
            شارك الغرفة مع صاحبك باستخدام الكود أو الرابط أو دعوة باسم المستخدم.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground font-body">كود:</span>
            <code className="text-xs text-primary bg-muted px-2 py-1 rounded">{room.invite_code}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1"
              onClick={() => copyCode(room.invite_code)}
            >
              {copiedForRoomId === room.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
              نسخ الكود
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1"
              onClick={() => copyLink(room.invite_code)}
            >
              {copiedForRoomId === room.id ? <Check className="w-3 h-3 text-primary" /> : <LinkIcon className="w-3 h-3" />}
              نسخ الرابط
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="اسم اللاعب للدعوة"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              className="bg-muted border-border text-foreground max-w-[180px] h-8 text-xs"
            />
            <Button
              size="sm"
              className="h-8 gap-1"
              disabled={sendingInvite}
              onClick={sendInvite}
            >
              <Send className="w-3 h-3" />
              {sendingInvite ? "جاري الإرسال..." : "إرسال دعوة"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <span className="text-xs text-muted-foreground font-body">من يمكنه الانضمام:</span>
            <Select
              value={room.join_policy ?? "anyone"}
              onValueChange={(v) => updateJoinPolicy(v as "anyone" | "invite_only")}
            >
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anyone">أي شخص لديه الكود</SelectItem>
                <SelectItem value="invite_only">المدعوين فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm font-body text-muted-foreground items-center justify-center">
        <span>🐭 = جيري</span>
        <span>🐱 = توم</span>
        <span>🏠 = المخرج</span>
        {status === "playing" && (
          <span className="text-primary">حركات توم: {tomMoveCount}/{TOM_MOVE_LIMIT}</span>
        )}
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
              <div className="flex gap-3 justify-center flex-wrap">
                <Button onClick={resetRoomAndPlayAgain} disabled={resetting} className="gap-2">
                  <RotateCcw className="w-4 h-4" /> {resetting ? "جاري..." : "العب مرة تانية"}
                </Button>
                <Button variant="outline" onClick={() => navigate("/game/tom-and-jerry/lobby")} className="gap-2">
                  <Home className="w-4 h-4" /> اللوبي
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
