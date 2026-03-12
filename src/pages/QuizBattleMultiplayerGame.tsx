import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Copy, Home, Link as LinkIcon, RotateCcw, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useApiAction } from "@/hooks/use-api-action";
import { getQuestions, QuizQuestion } from "@/lib/quizData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Room = Tables<"quiz_battle_rooms">;
const QUESTION_TIME_MS = 15_000;
const SECONDS_PER_QUESTION = 15;
const getErrorMessage = (error: unknown, fallback = "حدث خطأ") =>
  error instanceof Error ? error.message : fallback;

const QuizBattleMultiplayerGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);

  const questions = (room?.questions as QuizQuestion[]) || [];
  const qIndex = room?.current_question_index ?? 0;
  const current = questions[qIndex];
  const status = room?.status || "waiting";
  const isHost = room?.host_id === user?.id;
  const isGuest = room?.guest_id === user?.id;
  const hostScore = room?.host_score ?? 0;
  const guestScore = room?.guest_score ?? 0;
  const hostAnswered = room?.host_answer_index !== null && room?.host_answer_index !== undefined;
  const guestAnswered = room?.guest_answer_index !== null && room?.guest_answer_index !== undefined;
  const iAnswered = isHost ? hostAnswered : isGuest ? guestAnswered : false;

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
      .from("quiz_battle_invites")
      .insert({ room_id: room.id, from_user_id: user.id, to_user_id: toUserId });
    if (error) throw error;
    setInviteUsername("");
    toast({ title: "تم إرسال الدعوة!" });
  });

  const { run: updateJoinPolicyAction, loading: updatingJoinPolicy } = useApiAction(async (join_policy: "anyone" | "invite_only") => {
    if (!room || !isHost) return;
    const { error } = await supabase.from("quiz_battle_rooms").update({ join_policy }).eq("id", room.id);
    if (error) throw error;
    toast({ title: "تم التحديث" });
  });

  const { run: resetRoomAction, loading: resettingRoom } = useApiAction(async () => {
    if (!room || !user || (!isHost && !isGuest)) return;
    const categoryId = room.category_id ?? null;
    const questions = await getQuestions(categoryId, 15);
    const { error } = await supabase
      .from("quiz_battle_rooms")
      .update({
        questions,
        current_question_index: 0,
        host_score: 0,
        guest_score: 0,
        host_answer_index: null,
        guest_answer_index: null,
        host_answered_at: null,
        guest_answered_at: null,
        question_started_at: new Date().toISOString(),
        status: "playing",
      })
      .eq("id", room.id);
    if (error) throw error;
  });

  useEffect(() => {
    if (!roomId) return;
    const fetchRoom = async () => {
      const { data, error } = await supabase.from("quiz_battle_rooms").select("*").eq("id", roomId).single();
      setRoom(error ? null : data);
      setLoading(false);
    };
    fetchRoom();
    const ch = supabase
      .channel(`quiz-room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_battle_rooms", filter: `id=eq.${roomId}` }, (payload) => {
        setRoom(payload.new as Room);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  const evaluateQuestion = useCallback(async () => {
    if (!room || !current || status !== "playing") return;
    const now = Date.now();
    const started = new Date(room.question_started_at).getTime();
    const timedOut = now - started >= QUESTION_TIME_MS;
    if (!timedOut && !(hostAnswered && guestAnswered)) return;

    const hostCorrect = room.host_answer_index === current.correctIndex;
    const guestCorrect = room.guest_answer_index === current.correctIndex;
    let hostDelta = 0;
    let guestDelta = 0;

    if (hostCorrect && guestCorrect) {
      const hAt = room.host_answered_at ? new Date(room.host_answered_at).getTime() : Number.MAX_SAFE_INTEGER;
      const gAt = room.guest_answered_at ? new Date(room.guest_answered_at).getTime() : Number.MAX_SAFE_INTEGER;
      if (hAt <= gAt) hostDelta = 1;
      else guestDelta = 1;
    } else if (hostCorrect) hostDelta = 1;
    else if (guestCorrect) guestDelta = 1;

    const nextHost = hostScore + hostDelta;
    const nextGuest = guestScore + guestDelta;
    const nextIndex = qIndex + 1;
    const end = nextIndex >= questions.length;

    let nextStatus: Room["status"] = "playing";
    if (end) {
      if (nextHost > nextGuest) nextStatus = "host_wins";
      else if (nextGuest > nextHost) nextStatus = "guest_wins";
      else nextStatus = "draw";
    }

    const update: Partial<Room> = {
      host_score: nextHost,
      guest_score: nextGuest,
      host_answer_index: null,
      guest_answer_index: null,
      host_answered_at: null,
      guest_answered_at: null,
      status: nextStatus,
    };
    if (!end) {
      update.current_question_index = nextIndex;
      update.question_started_at = new Date().toISOString();
    }
    const { error } = await supabase.from("quiz_battle_rooms").update(update).eq("id", room.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
  }, [room, current, status, hostAnswered, guestAnswered, hostScore, guestScore, qIndex, questions.length, toast]);

  useEffect(() => {
    if (!room || status !== "playing") return;
    const id = window.setInterval(() => {
      const started = new Date(room.question_started_at).getTime();
      const left = Math.max(0, SECONDS_PER_QUESTION - Math.floor((Date.now() - started) / 1000));
      setTimeLeft(left);
      evaluateQuestion().catch(() => {});
    }, 300);
    return () => window.clearInterval(id);
  }, [room, status, evaluateQuestion]);

  const answerQuestion = async (optionIndex: number) => {
    if (!room || !user || !current || status !== "playing" || iAnswered) return;
    const field = isHost ? "host_answer_index" : "guest_answer_index";
    const timeField = isHost ? "host_answered_at" : "guest_answered_at";
    const { error } = await supabase
      .from("quiz_battle_rooms")
      .update({ [field]: optionIndex, [timeField]: new Date().toISOString() })
      .eq("id", room.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground font-body">جاري التحميل...</p></div>;
  }
  if (!room) {
    return <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4"><p className="text-muted-foreground font-body">الغرفة غير موجودة</p><Button onClick={() => navigate("/game/quiz-battle/lobby")}>العودة</Button></div>;
  }

  const gameOver = status === "host_wins" || status === "guest_wins" || status === "draw";
  const iWon = (status === "host_wins" && isHost) || (status === "guest_wins" && isGuest);

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/game/quiz-battle/lobby")} className="text-muted-foreground">
            <Home className="w-4 h-4 ml-1" /> اللوبي
          </Button>
          <h1 className="text-xs arcade-text text-accent">❓⚡ لعبة الأسئلة</h1>
          <span className="text-xs text-muted-foreground font-body">{isHost ? "أنت: المضيف" : "أنت: الضيف"}</span>
        </div>

        <div className={`mb-4 rounded-full border px-4 py-2 text-center text-sm font-body ${iAnswered ? "bg-muted text-muted-foreground border-border" : "bg-primary/20 text-primary border-primary/40"}`}>
          {status === "waiting" ? "بانتظار اللاعب التاني..." : gameOver ? "انتهت الجولة" : iAnswered ? "تم إرسال إجابتك" : `الوقت: ${timeLeft}s`}
        </div>

        {status === "waiting" && isHost && (
          <div className="w-full rounded-lg border border-border bg-card p-3 space-y-2 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs text-primary bg-muted px-2 py-1 rounded">{room.invite_code}</code>
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(room.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} نسخ الكود
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { const link = `${window.location.origin}/game/quiz-battle/lobby?join=${encodeURIComponent(room.invite_code)}`; navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
                {copied ? <Check className="w-3 h-3" /> : <LinkIcon className="w-3 h-3" />} نسخ الرابط
              </Button>
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

        {current && status === "playing" && (
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="mb-4 text-base font-body text-foreground">{current.question}</p>
            <div className="grid grid-cols-1 gap-2">
              {current.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => answerQuestion(i)}
                  disabled={iAnswered}
                  className={`rounded-md border px-3 py-2 text-right text-sm transition-all ${iAnswered ? "border-border bg-muted text-muted-foreground" : "border-border bg-game-grid hover:border-primary/40"}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

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
                  <Button variant="outline" onClick={() => navigate("/game/quiz-battle/lobby")}>اللوبي</Button>
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

export default QuizBattleMultiplayerGame;

