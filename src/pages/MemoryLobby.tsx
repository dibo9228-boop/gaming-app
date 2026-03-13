import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Copy, Home, Info, Link, Link2, LogOut, Plus, Send, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { getUserStats, type UserStats } from "@/lib/gameStats";
import { useToast } from "@/hooks/use-toast";
import { useApiAction } from "@/hooks/use-api-action";
import { generateDeck } from "@/lib/memoryMatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type InviteWithDetails = Tables<"memory_match_invites"> & {
  room?: { id: string; invite_code: string; status: string };
  from_display_name?: string;
};
type Difficulty = "easy" | "medium" | "hard";

const LOBBY_PATH = "/game/memory-match/lobby";
const getErrorMessage = (error: unknown, fallback = "حدث خطأ") =>
  error instanceof Error ? error.message : fallback;

const MemoryLobby = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [inviteCode, setInviteCode] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [myRooms, setMyRooms] = useState<Tables<"memory_match_rooms">[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [invites, setInvites] = useState<InviteWithDetails[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [progressByDifficulty, setProgressByDifficulty] = useState<Record<Difficulty, number>>({
    easy: 0,
    medium: 0,
    hard: 0,
  });

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRoom, setDetailsRoom] = useState<Tables<"memory_match_rooms"> | null>(null);
  const [detailsHostName, setDetailsHostName] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<Tables<"memory_match_rooms"> | null>(null);

  const fetchRooms = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("memory_match_rooms")
      .select("*")
      .or(`host_id.eq.${user.id},guest_id.eq.${user.id}`)
      .in("status", ["waiting", "playing", "host_wins", "guest_wins", "draw"])
      .order("created_at", { ascending: false });
    if (data) setMyRooms(data);
  }, [user]);

  const fetchInvites = useCallback(async () => {
    if (!user) return;
    const { data: inviteList } = await supabase.from("memory_match_invites").select("*").eq("to_user_id", user.id);
    if (!inviteList?.length) {
      setInvites([]);
      return;
    }
    const roomIds = [...new Set(inviteList.map((i) => i.room_id))];
    const fromIds = [...new Set(inviteList.map((i) => i.from_user_id))];
    const [roomsRes, profilesRes] = await Promise.all([
      supabase.from("memory_match_rooms").select("id, invite_code, status").in("id", roomIds),
      supabase.from("profiles").select("user_id, display_name").in("user_id", fromIds),
    ]);
    const rooms = new Map((roomsRes.data || []).map((r) => [r.id, r]));
    const profiles = new Map((profilesRes.data || []).map((p) => [p.user_id, p.display_name]));
    setInvites(
      inviteList.map((inv) => ({
        ...inv,
        room: rooms.get(inv.room_id),
        from_display_name: profiles.get(inv.from_user_id) || "?",
      }))
    );
  }, [user]);

  const fetchProgress = useCallback(async () => {
    if (!user) {
      setProgressByDifficulty({ easy: 0, medium: 0, hard: 0 });
      return;
    }
    const { data } = await supabase
      .from("memory_match_progress")
      .select("difficulty, max_stage_completed")
      .eq("user_id", user.id);
    const next: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const row of data || []) {
      if (row.difficulty === "easy" || row.difficulty === "medium" || row.difficulty === "hard") {
        next[row.difficulty] = row.max_stage_completed ?? 0;
      }
    }
    setProgressByDifficulty(next);
  }, [user]);

  const startSolo = useCallback(
    (difficulty: Difficulty) => {
      const nextStage = Math.min(25, (progressByDifficulty[difficulty] ?? 0) + 1);
      navigate(`/game/memory-match?level=${difficulty}&stage=${nextStage}`);
    },
    [navigate, progressByDifficulty]
  );

  const { run: createRoomAction, loading: creatingRoom } = useApiAction(async () => {
    if (!user) throw new Error("مطلوب تسجيل الدخول");
    const deck = generateDeck("medium", Math.floor(Math.random() * 25) + 1);
    const { data, error } = await supabase
      .from("memory_match_rooms")
      .insert({ host_id: user.id, deck, current_turn: user.id })
      .select()
      .single();
    if (error) throw error;
    toast({ title: "تم إنشاء الغرفة!" });
    navigate(`/game/memory-match/multi/${data.id}`);
  });

  const { run: joinByCodeAction, loading: joiningRoom } = useApiAction(async (code: string) => {
    if (!user || !code.trim()) throw new Error("أدخل الكود أولاً");
    const { data: room, error } = await supabase
      .from("memory_match_rooms")
      .select("*")
      .eq("invite_code", code.trim())
      .eq("status", "waiting")
      .single();
    if (error || !room) throw new Error("الكود غير صحيح أو الغرفة غير متاحة");
    if (room.host_id === user.id) throw new Error("ما بتقدر تنضم لغرفتك");
    if (room.join_policy === "invite_only") {
      const { data: invite } = await supabase
        .from("memory_match_invites")
        .select("id")
        .eq("room_id", room.id)
        .eq("to_user_id", user.id)
        .maybeSingle();
      if (!invite) throw new Error("الغرفة بالدعوة فقط");
    }
    const { error: upErr } = await supabase
      .from("memory_match_rooms")
      .update({ guest_id: user.id, status: "playing", current_turn: room.host_id })
      .eq("id", room.id);
    if (upErr) throw upErr;
    navigate(`/game/memory-match/multi/${room.id}`);
  });

  const { run: sendInviteAction, loading: sendingInvite } = useApiAction(async (roomId: string) => {
    if (!user || !inviteUsername.trim()) throw new Error("أدخل اسم المستخدم");
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
      .insert({ room_id: roomId, from_user_id: user.id, to_user_id: toUserId });
    if (error) throw error;
    setInviteUsername("");
    toast({ title: "تم إرسال الدعوة!" });
  });

  const { run: resetRoomAction, loading: resettingRoom } = useApiAction(async (room: Tables<"memory_match_rooms">) => {
    if (!user || (room.host_id !== user.id && room.guest_id !== user.id)) return;
    const deck = generateDeck("medium", Math.floor(Math.random() * 25) + 1);
    const { error } = await supabase
      .from("memory_match_rooms")
      .update({
        deck,
        revealed_indices: [],
        matched_indices: [],
        host_score: 0,
        guest_score: 0,
        status: "playing",
        current_turn: room.host_id,
      })
      .eq("id", room.id);
    if (error) throw error;
    navigate(`/game/memory-match/multi/${room.id}`);
  });

  const { run: deleteRoomAction, loading: deletingRoom } = useApiAction(async (roomId: string) => {
    if (!user) return;
    const { error } = await supabase.from("memory_match_rooms").delete().eq("id", roomId).eq("host_id", user.id);
    if (error) throw error;
    await fetchRooms();
  });

  const { run: updateJoinPolicyAction } = useApiAction(async (roomId: string, join_policy: "anyone" | "invite_only") => {
    if (!user) return;
    const { error } = await supabase
      .from("memory_match_rooms")
      .update({ join_policy })
      .eq("id", roomId)
      .eq("host_id", user.id);
    if (error) throw error;
    setDetailsRoom((r) => (r ? { ...r, join_policy } : null));
    await fetchRooms();
  });

  useEffect(() => {
    if (!user) return;
    fetchRooms();
    fetchInvites();
    fetchProgress();
    getUserStats(user.id).then(setUserStats).catch(() => {});
    const ch1 = supabase
      .channel("memory-lobby-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "memory_match_rooms" }, () => fetchRooms())
      .subscribe();
    const ch2 = supabase
      .channel("memory-lobby-invites")
      .on("postgres_changes", { event: "*", schema: "public", table: "memory_match_invites" }, () => fetchInvites())
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [user, fetchRooms, fetchInvites, fetchProgress]);

  useEffect(() => {
    const join = searchParams.get("join");
    if (join) {
      setInviteCode(join.trim());
      setSearchParams({}, { replace: true });
      toast({ title: "تم تعبئة كود الدعوة" });
    }
  }, [searchParams, setSearchParams, toast]);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyLink = (code: string, id: string) => {
    const url = `${window.location.origin}${LOBBY_PATH}?join=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openDetails = async (room: Tables<"memory_match_rooms">) => {
    setDetailsRoom(room);
    setDetailsOpen(true);
    const { data } = await supabase.from("profiles").select("display_name").eq("user_id", room.host_id).maybeSingle();
    setDetailsHostName(data?.display_name ?? "—");
  };

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-lg mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground">
            <Home className="w-4 h-4 ml-1" /> الرئيسية
          </Button>
          <h1 className="text-xs arcade-text text-accent">🧠 لعبة الذاكرة</h1>
          <div className="flex items-center gap-2">
            {userStats && <span className="text-xs text-accent font-body">المستوى: {userStats.level}</span>}
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="w-4 h-4 ml-1" /> خروج
            </Button>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground font-body mb-3">العب ضد البوت بمراحل متدرجة</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => startSolo("easy")} variant="outline" size="sm">
                سهل (مرحلة {(progressByDifficulty.easy ?? 0) + 1})
              </Button>
              <Button onClick={() => startSolo("medium")} size="sm">
                متوسط (مرحلة {(progressByDifficulty.medium ?? 0) + 1})
              </Button>
              <Button onClick={() => startSolo("hard")} variant="secondary" size="sm">
                صعب (مرحلة {(progressByDifficulty.hard ?? 0) + 1})
              </Button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3"><Plus className="w-5 h-5 text-secondary" /><h2 className="text-sm arcade-text">إنشاء غرفة</h2></div>
            <Button onClick={() => createRoomAction().catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))} disabled={creatingRoom} className="w-full">
              {creatingRoom ? "جاري الإنشاء..." : "إنشاء غرفة 🎮"}
            </Button>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3"><Link2 className="w-5 h-5 text-accent" /><h2 className="text-sm arcade-text">انضم لغرفة</h2></div>
            <div className="flex gap-2">
              <Input placeholder="أدخل كود الدعوة" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
              <Button onClick={() => joinByCodeAction(inviteCode).catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))} disabled={joiningRoom}>
                {joiningRoom ? "جاري..." : "انضم"}
              </Button>
            </div>
          </motion.div>
        </div>

        {invites.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs arcade-text mb-3">دعواتك</h2>
            <div className="space-y-2">
              {invites.map((inv) => (
                <div key={inv.id} className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-xs font-body">دعوة من <strong>{inv.from_display_name}</strong></span>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => inv.room && joinByCodeAction(inv.room.invite_code).catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))}>قبول</Button>
                    <Button size="sm" variant="ghost" onClick={() => supabase.from("memory_match_invites").delete().eq("id", inv.id).then(fetchInvites)}>رفض</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {myRooms.length > 0 && (
          <div>
            <h2 className="text-xs arcade-text mb-4">غرفك</h2>
            <div className="space-y-3">
              {myRooms.map((room) => (
                <div key={room.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${room.status === "waiting" ? "bg-accent/20 text-accent" : room.status === "playing" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {room.status === "waiting" ? "بانتظار لاعب" : room.status === "playing" ? "جارية" : "انتهت"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openDetails(room)}><Info className="w-3 h-3" /></Button>
                      {room.host_id === user?.id && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setRoomToDelete(room); setDeleteConfirmOpen(true); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      {room.status === "playing" && <Button size="sm" onClick={() => navigate(`/game/memory-match/multi/${room.id}`)}>تابع اللعب</Button>}
                      {(room.status === "host_wins" || room.status === "guest_wins" || room.status === "draw") && (
                        <Button size="sm" disabled={resettingRoom} onClick={() => resetRoomAction(room).catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))}>
                          {resettingRoom ? "جاري..." : "العب مرة تانية"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {room.status === "waiting" && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs text-primary bg-muted px-2 py-1 rounded">{room.invite_code}</code>
                        <Button variant="ghost" size="sm" onClick={() => copyCode(room.invite_code, room.id)}>
                          {copiedId === room.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />} نسخ الكود
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => copyLink(room.invite_code, room.id)}>
                          {copiedId === room.id ? <Check className="w-3 h-3 text-primary" /> : <Link className="w-3 h-3" />} نسخ الرابط
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input placeholder="اسم اللاعب للدعوة" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} />
                        <Button onClick={() => sendInviteAction(room.id).catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))} disabled={sendingInvite}>
                          <Send className="w-3 h-3" /> {sendingInvite ? "جاري..." : "إرسال"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تفاصيل الغرفة</DialogTitle>
              <DialogDescription>قبل الانضمام أو الإعدادات</DialogDescription>
            </DialogHeader>
            {detailsRoom && (
              <div className="space-y-3 text-sm font-body">
                <div className="flex justify-between"><span className="text-muted-foreground">الكود</span><code>{detailsRoom.invite_code}</code></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المنشئ</span><span>{detailsHostName}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">من يمكنه الانضمام</span>
                  {detailsRoom.host_id === user?.id ? (
                    <Select value={detailsRoom.join_policy} onValueChange={(v) => updateJoinPolicyAction(detailsRoom.id, v as "anyone" | "invite_only").catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))}>
                      <SelectTrigger className="w-[170px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anyone">أي شخص لديه الكود</SelectItem>
                        <SelectItem value="invite_only">المدعوين فقط</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span>{detailsRoom.join_policy === "invite_only" ? "المدعوين فقط" : "أي شخص لديه الكود"}</span>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              {detailsRoom && detailsRoom.host_id !== user?.id && detailsRoom.status === "waiting" && (
                <Button onClick={() => joinByCodeAction(detailsRoom.invite_code).catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))}>انضم</Button>
              )}
              <Button variant="outline" onClick={() => setDetailsOpen(false)}>إغلاق</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف الغرفة؟</AlertDialogTitle>
              <AlertDialogDescription>هذا الإجراء لا يمكن التراجع عنه.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!roomToDelete) return;
                  deleteRoomAction(roomToDelete.id)
                    .catch((e) => toast({ title: "خطأ", description: getErrorMessage(e), variant: "destructive" }))
                    .finally(() => setRoomToDelete(null));
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletingRoom}
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default MemoryLobby;

