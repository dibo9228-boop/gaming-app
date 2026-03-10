import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Copy, Home, Link as LinkIcon, RotateCcw, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useApiAction } from "@/hooks/use-api-action";
import { generateDeck } from "@/lib/memoryMatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Room = Tables<"memory_match_rooms">;
const getErrorMessage = (error: unknown, fallback = "حدث خطأ") =>
  error instanceof Error ? error.message : fallback;

const MemoryMultiplayerGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState("");
  const [copied, setCopied] = useState(false);
  const [resolving, setResolving] = useState(false);

  const deck = (room?.deck as number[]) || [];
  const revealed = (room?.revealed_indices as number[]) || [];
  const matched = (room?.matched_indices as number[]) || [];
  const status = room?.status || "waiting";
  const hostScore = room?.host_score ?? 0;
  const guestScore = room?.guest_score ?? 0;
  const isHost = room?.host_id === user?.id;
  const isGuest = room?.guest_id === user?.id;
  const isMyTurn = room?.current_turn === user?.id && status === "playing";

  const { run: sendInviteAction, loading: sendingInvite } = useApiAction(async () => {
    if (!room || !user || !inviteUsername.trim()) throw new Error("أدخل اسم المستخدم");
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
    const { error } = await supabase
      .from("memory_match_invites")
      .insert({ room_id: room.id, from_user_id: user.id, to_user_id: toUserId });
    if (error) throw error;
    setInviteUsername("");
    toast({ title: "تم إرسال الدعوة!" });
  });

  const { run: updateJoinPolicyAction, loading: updatingJoinPolicy } = useApiAction(async (join_policy: "anyone" | "invite_only") => {
    if (!room || !isHost) return;
    const { error } = await supabase.from("memory_match_rooms").update({ join_policy }).eq("id", room.id);
    if (error) throw error;
    toast({ title: "تم التحديث" });
  });

  const { run: resetRoomAction, loading: resettingRoom } = useApiAction(async () => {
    if (!room || !user || (!isHost && !isGuest)) return;
    const newDeck = generateDeck("medium", Math.floor(Math.random() * 25) + 1);
    const { error } = await supabase
      .from("memory_match_rooms")
      .update({
        deck: newDeck,
        revealed_indices: [],
        matched_indices: [],
        host_score: 0,
        guest_score: 0,
        status: "playing",
        current_turn: room.host_id,
      })
      .eq("id", room.id);
    if (error) throw error;
  });

  useEffect(() => {
    if (!roomId) return;
    const fetchRoom = async () => {
      const { data, error } = await supabase.from("memory_match_rooms").select("*").eq("id", roomId).single();
      setRoom(error ? null : data);
      setLoading(false);
    };
    fetchRoom();
    const ch = supabase
      .channel(`memory-room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "memory_match_rooms", filter: `id=eq.${roomId}` }, (payload) => {
        setRoom(payload.new as Room);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  const copyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const copyLink = () => {
    if (!room) return;
    const link = `${window.location.origin}/game/memory-match/lobby?join=${encodeURIComponent(room.invite_code)}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const finishGameStatus = (nextMatched: number[], nextHost: number, nextGuest: number) => {
    if (nextMatched.length !== deck.length) return null;
    if (nextHost > nextGuest) return "host_wins";
    if (nextGuest > nextHost) return "guest_wins";
    return "draw";
  };

  const flipCard = useCallback(async (index: number) => {
    if (!room || !user || !isMyTurn || resolving) return;
    if (matched.includes(index) || revealed.includes(index)) return;

    if (revealed.length === 0) {
      const { error } = await supabase.from("memory_match_rooms").update({ revealed_indices: [index] }).eq("id", room.id);
      if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }

    const first = revealed[0];
    if (first === index) return;
    const second = index;
    const pair = [first, second];
    const { error: revealErr } = await supabase.from("memory_match_rooms").update({ revealed_indices: pair }).eq("id", room.id);
    if (revealErr) {
      toast({ title: "خطأ", description: revealErr.message, variant: "destructive" });
      return;
    }
    setResolving(true);
    setTimeout(async () => {
      const isMatch = deck[first] === deck[second];
      const nextMatched = isMatch ? Array.from(new Set([...matched, first, second])) : matched;
      const nextHost = isMatch && isHost ? hostScore + 1 : hostScore;
      const nextGuest = isMatch && isGuest ? guestScore + 1 : guestScore;
      const nextStatus = finishGameStatus(nextMatched, nextHost, nextGuest);

      const update: Partial<Room> = {
        revealed_indices: [],
        matched_indices: nextMatched,
        host_score: nextHost,
        guest_score: nextGuest,
      };
      if (nextStatus) {
        update.status = nextStatus;
        update.current_turn = null;
      } else if (!isMatch) {
        update.current_turn = isHost ? room.guest_id : room.host_id;
      }
      const { error } = await supabase.from("memory_match_rooms").update(update).eq("id", room.id);
      if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
      setResolving(false);
    }, 800);
  }, [room, user, isMyTurn, resolving, matched, revealed, deck, isHost, isGuest, hostScore, guestScore, toast]);

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground font-body">جاري التحميل...</p></div>;
  }
  if (!room) {
    return <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4"><p className="text-muted-foreground font-body">الغرفة غير موجودة</p><Button onClick={() => navigate("/game/memory-match/lobby")}>العودة</Button></div>;
  }

  const columns = deck.length <= 12 ? 4 : 5;
  const gameOver = status === "host_wins" || status === "guest_wins" || status === "draw";
  const hostWon = status === "host_wins";
  const guestWon = status === "guest_wins";
  const iWon = (hostWon && isHost) || (guestWon && isGuest);

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/game/memory-match/lobby")} className="text-muted-foreground">
            <Home className="w-4 h-4 ml-1" /> اللوبي
          </Button>
          <h1 className="text-xs arcade-text text-accent">🧠 لعبة الذاكرة</h1>
          <span className="text-xs text-muted-foreground font-body">{isHost ? "أنت: المضيف" : "أنت: الضيف"}</span>
        </div>

        <div className={`mb-4 rounded-full border px-4 py-2 text-center text-sm font-body ${isMyTurn ? "bg-primary/20 text-primary border-primary/40" : "bg-muted text-muted-foreground border-border"}`}>
          {status === "waiting" ? "بانتظار اللاعب التاني..." : gameOver ? "انتهت الجولة" : isMyTurn ? "دورك" : "دور الخصم"}
        </div>

        {status === "waiting" && isHost && (
          <div className="w-full rounded-lg border border-border bg-card p-3 space-y-2 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs text-primary bg-muted px-2 py-1 rounded">{room.invite_code}</code>
              <Button variant="ghost" size="sm" onClick={copyCode}>{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} نسخ الكود</Button>
              <Button variant="ghost" size="sm" onClick={copyLink}>{copied ? <Check className="w-3 h-3" /> : <LinkIcon className="w-3 h-3" />} نسخ الرابط</Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="اسم اللاعب للدعوة" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} className="max-w-[200px] h-8 text-xs" />
              <Button size="sm" className="h-8" disabled={sendingInvite} onClick={() => sendInviteAction().catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))}>
                <Send className="w-3 h-3 ml-1" /> {sendingInvite ? "جاري..." : "إرسال دعوة"}
              </Button>
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground font-body">من يمكنه الانضمام:</span>
              <Select value={room.join_policy} onValueChange={(v) => updateJoinPolicyAction(v as "anyone" | "invite_only").catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))}>
                <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anyone">أي شخص لديه الكود</SelectItem>
                  <SelectItem value="invite_only">المدعوين فقط</SelectItem>
                </SelectContent>
              </Select>
              {updatingJoinPolicy && <span className="text-xs text-muted-foreground">جاري التحديث...</span>}
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-center gap-4 text-sm font-body">
          <span className="text-primary">نقاط المضيف: {hostScore}</span>
          <span className="text-accent">نقاط الضيف: {guestScore}</span>
        </div>

        <div className="grid gap-2 rounded-lg border border-border bg-card p-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {deck.map((value, index) => {
            const isOpen = matched.includes(index) || revealed.includes(index);
            return (
              <button
                key={index}
                onClick={() => flipCard(index)}
                disabled={!isMyTurn || resolving || status !== "playing" || matched.includes(index)}
                className={`aspect-square rounded-md border text-lg ${isOpen ? "bg-primary/20 text-primary border-primary/40" : "bg-game-grid border-border hover:border-primary/40"}`}
              >
                {isOpen ? value : "?"}
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {gameOver && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-4 w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center">
                <div className="text-5xl mb-3">{status === "draw" ? "🤝" : iWon ? "🎉" : "😿"}</div>
                <h2 className="text-sm arcade-text mb-2">{status === "draw" ? "تعادل" : iWon ? "ربحت!" : "خسرت!"}</h2>
                <p className="text-sm text-muted-foreground font-body mb-4">النتيجة: {hostScore} - {guestScore}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => resetRoomAction().catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))} disabled={resettingRoom}>
                    <RotateCcw className="w-4 h-4 ml-1" /> {resettingRoom ? "جاري..." : "العب مرة تانية"}
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/game/memory-match/lobby")}>اللوبي</Button>
                  <Button variant="outline" onClick={() => navigate("/")}><ArrowRight className="w-4 h-4 ml-1" /> الرئيسية</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MemoryMultiplayerGame;

