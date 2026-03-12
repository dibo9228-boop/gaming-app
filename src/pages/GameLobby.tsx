import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Plus, Link2, LogOut, Gamepad2, Copy, Check, Trophy, Link, Send, Info, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { getUserStats, type UserStats } from "@/lib/gameStats";
import { useToast } from "@/hooks/use-toast";
import { useApiAction } from "@/hooks/use-api-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AchievementsDialog } from "@/components/AchievementsDialog";
import { generateMaze, GRID_SIZE } from "@/lib/tomJerryMaze";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InviteWithDetails = Tables<"game_invites"> & {
  room?: { id: string; invite_code: string; status: string };
  from_display_name?: string;
};
type Difficulty = "easy" | "medium" | "hard";

const LOBBY_PATH = "/game/tom-and-jerry/lobby";
const getErrorMessage = (error: unknown, fallback = "حدث خطأ غير متوقع") =>
  error instanceof Error ? error.message : fallback;

const GameLobby = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [inviteCode, setInviteCode] = useState("");
  const [myRooms, setMyRooms] = useState<Tables<"game_rooms">[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [progressByDifficulty, setProgressByDifficulty] = useState<Record<Difficulty, number>>({
    easy: 0,
    medium: 0,
    hard: 0,
  });
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [invites, setInvites] = useState<InviteWithDetails[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRoom, setDetailsRoom] = useState<Tables<"game_rooms"> | null>(null);
  const [detailsHostName, setDetailsHostName] = useState("");
  const [detailsGuestName, setDetailsGuestName] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<Tables<"game_rooms"> | null>(null);

  // --- API actions wrapped with loading ---

  const {
    run: createRoomAction,
    loading: creatingRoom,
  } = useApiAction(async () => {
    if (!user) throw new Error("مطلوب تسجيل الدخول");
    const grid = generateMaze();
    const { data, error } = await supabase
      .from("game_rooms")
      .insert({
        host_id: user.id,
        grid,
        current_turn: user.id,
        host_role: Math.random() < 0.5 ? "jerry" : "tom",
      })
      .select()
      .single();

    if (error) throw error;
    toast({ title: "تم إنشاء الغرفة!", description: "شارك كود الدعوة مع صاحبك" });
    navigate(`/game/tom-and-jerry/multi/${data.id}`);
  });

  const {
    run: joinRoomByCodeAction,
    loading: joiningRoom,
  } = useApiAction(async (code: string) => {
    if (!user || !code.trim()) throw new Error("أدخل الكود أولاً");
    const { data: room, error: findErr } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("invite_code", code.trim())
      .eq("status", "waiting")
      .single();

    if (findErr || !room) throw new Error("الكود غير صحيح أو الغرفة مش متاحة");
    if (room.host_id === user.id) throw new Error("ما بتقدر تنضم لغرفتك");

    if (room.join_policy === "invite_only") {
      const { data: invite } = await supabase
        .from("game_invites")
        .select("id")
        .eq("room_id", room.id)
        .eq("to_user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!invite) {
        throw new Error("هذه الغرفة بالدعوة فقط. اطلب من صاحب الغرفة إرسال دعوة لك.");
      }
    }

    const { error } = await supabase
      .from("game_rooms")
      .update({ guest_id: user.id, status: "playing", current_turn: room.host_id })
      .eq("id", room.id);
    if (error) throw error;
    navigate(`/game/tom-and-jerry/multi/${room.id}`);
  });

  const {
    run: sendInviteAction,
    loading: sendingInvite,
  } = useApiAction(async (roomId: string) => {
    if (!user || !inviteUsername.trim()) throw new Error("أدخل اسم المستخدم أولاً");
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
      room_id: roomId,
      from_user_id: user.id,
      to_user_id: toUserId,
    });
    if (error) throw error;

    setInviteUsername("");
    await fetchInvites();
    toast({ title: "تم إرسال الدعوة!" });
  });

  const {
    run: resetRoomAction,
    loading: resettingRoom,
  } = useApiAction(async (room: Tables<"game_rooms">) => {
    if (!user || (room.host_id !== user.id && room.guest_id !== user.id)) return;
    const grid = generateMaze();
    const { error } = await supabase
      .from("game_rooms")
      .update({
        grid,
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
    toast({ title: "تم إعادة الغرفة!" });
    await fetchRooms();
    navigate(`/game/tom-and-jerry/multi/${room.id}`);
  });

  const {
    run: updateJoinPolicyAction,
    loading: updatingJoinPolicy,
  } = useApiAction(async (roomId: string, join_policy: "anyone" | "invite_only") => {
    if (!user) throw new Error("مطلوب تسجيل الدخول");
    const { error } = await supabase.from("game_rooms").update({ join_policy }).eq("id", roomId).eq("host_id", user.id);
    if (error) throw error;
    toast({ title: "تم التحديث" });
    if (detailsRoom?.id === roomId) setDetailsRoom((r) => (r ? { ...r, join_policy } : null));
    await fetchRooms();
  });

  const {
    run: deleteRoomAction,
    loading: deletingRoom,
  } = useApiAction(async (roomId: string) => {
    if (!user) throw new Error("مطلوب تسجيل الدخول");
    const { error } = await supabase.from("game_rooms").delete().eq("id", roomId).eq("host_id", user.id);
    if (error) throw error;
    toast({ title: "تم حذف الغرفة" });
    await fetchRooms();
  });

  // Pre-fill invite code from link ?join=CODE
  useEffect(() => {
    const join = searchParams.get("join");
    if (join) {
      setInviteCode(join.trim());
      setSearchParams({}, { replace: true });
      toast({ title: "تم تعبئة كود الدعوة", description: "اضغط انضم للدخول للغرفة" });
    }
  }, [searchParams, setSearchParams, toast]);

  useEffect(() => {
    if (!user) return;
    getUserStats(user.id).then(setUserStats).catch(() => {});
  }, [user]);

  const fetchProgress = useCallback(async () => {
    if (!user) {
      setProgressByDifficulty({ easy: 0, medium: 0, hard: 0 });
      return;
    }
    const { data } = await supabase
      .from("tom_jerry_progress")
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
      navigate(`/game/tom-and-jerry?level=${difficulty}&stage=${nextStage}`);
    },
    [navigate, progressByDifficulty]
  );

  const fetchRooms = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("game_rooms")
      .select("*")
      .or(`host_id.eq.${user.id},guest_id.eq.${user.id}`)
      .in("status", ["waiting", "playing", "jerry_wins", "tom_wins"])
      .order("created_at", { ascending: false });
    if (data) setMyRooms(data);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchRooms();
    fetchProgress();

    const channel = supabase
      .channel("lobby-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" }, (payload) => {
        fetchRooms();
        const updated = payload.new as Tables<"game_rooms"> | null;
        if (updated && updated.host_id === user.id && updated.status === "playing" && updated.guest_id) {
          navigate(`/game/tom-and-jerry/multi/${updated.id}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchRooms, fetchProgress, navigate]);

  const fetchInvites = useCallback(async () => {
    if (!user) return;
    const { data: inviteList } = await supabase.from("game_invites").select("*").eq("to_user_id", user.id);
    if (!inviteList?.length) {
      setInvites([]);
      return;
    }
    const roomIds = [...new Set(inviteList.map((i) => i.room_id))];
    const fromIds = [...new Set(inviteList.map((i) => i.from_user_id))];
    const [roomsRes, profilesRes] = await Promise.all([
      supabase.from("game_rooms").select("id, invite_code, status").in("id", roomIds),
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

  useEffect(() => {
    if (!user) return;
    fetchInvites();
    const ch = supabase
      .channel("lobby-invites")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_invites" }, () => fetchInvites())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchInvites]);

  const createRoom = () =>
    createRoomAction().catch((error: unknown) =>
      toast({ title: "خطأ", description: getErrorMessage(error), variant: "destructive" })
    );

  const joinRoom = () =>
    joinRoomByCodeAction(inviteCode).catch((error: unknown) =>
      toast({ title: "خطأ", description: getErrorMessage(error), variant: "destructive" })
    );

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "تم نسخ الكود" });
  };

  const copyLink = (code: string, id: string) => {
    const url = `${window.location.origin}${LOBBY_PATH}?join=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "تم نسخ الرابط", description: "شارك الرابط مع صاحبك" });
  };

  const sendInvite = (roomId: string) =>
    sendInviteAction(roomId).catch((error: unknown) =>
      toast({ title: "خطأ", description: getErrorMessage(error, "فشل إرسال الدعوة"), variant: "destructive" })
    );

  const acceptInvite = async (inv: InviteWithDetails) => {
    if (!user || !inv.room) return;
    await supabase.from("game_invites").delete().eq("id", inv.id);
    fetchInvites();
    if (inv.room.status === "waiting") {
      const { data: room } = await supabase.from("game_rooms").select("id, host_id, guest_id").eq("id", inv.room_id).single();
      if (room && !room.guest_id) {
        const { error } = await supabase.from("game_rooms").update({ guest_id: user.id, status: "playing", current_turn: room.host_id }).eq("id", inv.room_id);
        if (!error) {
          navigate(`/game/tom-and-jerry/multi/${inv.room_id}`);
          return;
        }
      }
    }
    setInviteCode(inv.room.invite_code);
    joinRoomByCode(inv.room.invite_code);
  };

  const joinRoomByCode = (code: string) =>
    joinRoomByCodeAction(code).catch((error: unknown) =>
      toast({ title: "خطأ", description: getErrorMessage(error), variant: "destructive" })
    );

  const dismissInvite = async (inviteId: string) => {
    await supabase.from("game_invites").delete().eq("id", inviteId);
    fetchInvites();
  };

  const openRoomDetails = useCallback(async (room: Tables<"game_rooms">) => {
    setDetailsRoom(room);
    setDetailsOpen(true);
    setDetailsHostName("");
    setDetailsGuestName(null);
    const ids = [room.host_id, room.guest_id].filter(Boolean) as string[];
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
      const map = new Map((data || []).map((p) => [p.user_id, p.display_name]));
      setDetailsHostName(map.get(room.host_id) ?? "—");
      setDetailsGuestName(room.guest_id ? (map.get(room.guest_id) ?? "—") : null);
    } else setDetailsHostName("—");
  }, []);

  const viewDetailsByCode = useCallback(async () => {
    if (!inviteCode.trim()) {
      toast({ title: "أدخل الكود أولاً", variant: "destructive" });
      return;
    }
    setDetailsLoading(true);
    setDetailsOpen(true);
    setDetailsRoom(null);
    setDetailsHostName("");
    setDetailsGuestName(null);
    const { data: room, error } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("invite_code", inviteCode.trim())
      .eq("status", "waiting")
      .single();
    setDetailsLoading(false);
    if (error || !room) {
      toast({ title: "خطأ", description: "الكود غير صحيح أو الغرفة مش متاحة", variant: "destructive" });
      setDetailsOpen(false);
      return;
    }
    setDetailsRoom(room as Tables<"game_rooms">);
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").eq("user_id", room.host_id);
    setDetailsHostName(profiles?.[0]?.display_name ?? "—");
    setDetailsGuestName(null);
  }, [inviteCode, toast]);

  const closeDetails = useCallback(() => {
    setDetailsOpen(false);
    setDetailsRoom(null);
    setDetailsHostName("");
    setDetailsGuestName(null);
  }, []);

  const updateJoinPolicy = useCallback(
    (roomId: string, join_policy: "anyone" | "invite_only") =>
      updateJoinPolicyAction(roomId, join_policy).catch((error: unknown) =>
        toast({ title: "خطأ", description: getErrorMessage(error), variant: "destructive" })
      ),
    []
  );

  const confirmDeleteRoom = useCallback((room: Tables<"game_rooms">) => {
    setRoomToDelete(room);
    setDeleteConfirmOpen(true);
  }, []);

  const deleteRoom = useCallback(() => {
    if (!roomToDelete) return;
    setDeleteConfirmOpen(false);
    deleteRoomAction(roomToDelete.id)
      .catch((error: unknown) =>
        toast({ title: "خطأ", description: getErrorMessage(error), variant: "destructive" })
      )
      .finally(() => {
        setRoomToDelete(null);
        closeDetails();
      });
  }, [roomToDelete]);

  const resetRoom = (room: Tables<"game_rooms">) =>
    resetRoomAction(room).catch((error: unknown) =>
      toast({ title: "خطأ", description: getErrorMessage(error), variant: "destructive" })
    );

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
            {userStats !== null && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAchievementsOpen(true)} title="الإنجازات">
                  <Trophy className="h-4 w-4" />
                </Button>
                <span className="text-xs text-primary font-body">نقاط: {userStats.totalXp}</span>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="w-4 h-4 ml-1" /> خروج
            </Button>
          </div>
        </div>
        {userStats !== null && (
          <AchievementsDialog open={achievementsOpen} onOpenChange={setAchievementsOpen} stats={userStats} />
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
              <Button onClick={() => startSolo("easy")} variant="outline" size="sm" className="flex-1 min-w-[80px]">
                سهل (مرحلة {Math.min(25, (progressByDifficulty.easy ?? 0) + 1)})
              </Button>
              <Button onClick={() => startSolo("medium")} size="sm" className="flex-1 min-w-[80px]">
                متوسط (مرحلة {Math.min(25, (progressByDifficulty.medium ?? 0) + 1)})
              </Button>
              <Button onClick={() => startSolo("hard")} variant="secondary" size="sm" className="flex-1 min-w-[80px]">
                صعب (مرحلة {Math.min(25, (progressByDifficulty.hard ?? 0) + 1)})
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
            <Button onClick={createRoom} variant="secondary" className="w-full" disabled={creatingRoom}>
              {creatingRoom ? "جاري الإنشاء..." : "إنشاء غرفة 🎮"}
            </Button>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-lg p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-5 h-5 text-accent" />
              <h2 className="text-sm arcade-text text-foreground">انضم لغرفة</h2>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                placeholder="أدخل كود الدعوة"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="bg-muted border-border text-foreground flex-1 min-w-[120px]"
              />
              <Button onClick={joinRoom} variant="outline" disabled={joiningRoom}>
                {joiningRoom ? "جاري الانضمام..." : "انضم"}
              </Button>
              <Button onClick={viewDetailsByCode} variant="ghost" size="sm" className="gap-1">
                <Info className="w-4 h-4" /> عرض التفاصيل
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Pending Invitations */}
        {user && invites.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs arcade-text text-foreground mb-4">دعواتك</h2>
            <div className="space-y-2">
              {invites.map((inv) => (
                <motion.div key={inv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-body text-foreground truncate">
                    دعوة من <strong>{inv.from_display_name}</strong> للغرفة
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="default" onClick={() => acceptInvite(inv)}>قبول</Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissInvite(inv.id)}>رفض</Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Active Rooms */}
        {myRooms.length > 0 && (
          <div>
            <h2 className="text-xs arcade-text text-foreground mb-4">غرفك</h2>
            <div className="space-y-3">
              {myRooms.map((room) => (
                <motion.div key={room.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-body ${
                        room.status === "waiting"
                          ? "bg-accent/20 text-accent"
                          : room.status === "playing"
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {room.status === "waiting" ? "بانتظار لاعب" : room.status === "playing" ? "جارية" : "انتهت"}
                      </span>
                      <span className="text-xs text-muted-foreground font-body">
                        أنت: {room.host_id === user?.id
                          ? (room.host_role === "jerry" ? "🐭 جيري" : "🐱 توم")
                          : (room.host_role === "jerry" ? "🐱 توم" : "🐭 جيري")
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openRoomDetails(room)}>
                        <Info className="w-3 h-3" /> تفاصيل
                      </Button>
                      {room.host_id === user?.id && (
                        <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => confirmDeleteRoom(room)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      {room.status === "playing" && (
                        <Button size="sm" onClick={() => navigate(`/game/tom-and-jerry/multi/${room.id}`)}>
                          تابع اللعب
                        </Button>
                      )}
                      {(room.status === "jerry_wins" || room.status === "tom_wins") && (
                        <Button size="sm" onClick={() => resetRoom(room)}>
                          العب مرة تانية
                        </Button>
                      )}
                    </div>
                  </div>
                  {room.status === "waiting" && (
                    <div className="space-y-2 border-t border-border pt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-body">كود:</span>
                        <code className="text-xs text-primary bg-muted px-2 py-1 rounded">{room.invite_code}</code>
                        <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => copyCode(room.invite_code, room.id)}>
                          {copiedId === room.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                          نسخ الكود
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => copyLink(room.invite_code, room.id)}>
                          {copiedId === room.id ? <Check className="w-3 h-3 text-primary" /> : <Link className="w-3 h-3" />}
                          نسخ الرابط
                        </Button>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <Input
                          placeholder="اسم اللاعب للمدعوة"
                          value={inviteUsername}
                          onChange={(e) => setInviteUsername(e.target.value)}
                          className="bg-muted border-border text-foreground max-w-[160px] h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          className="h-8 gap-1"
                          disabled={sendingInvite}
                          onClick={() => sendInvite(room.id)}
                        >
                          <Send className="w-3 h-3" /> {sendingInvite ? "جاري الإرسال..." : "إرسال دعوة"}
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Room details modal */}
        <Dialog open={detailsOpen} onOpenChange={(open) => !open && closeDetails()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>تفاصيل الغرفة</DialogTitle>
              <DialogDescription>معلومات الغرفة قبل الانضمام أو الإعدادات</DialogDescription>
            </DialogHeader>
            {detailsLoading ? (
              <p className="text-sm text-muted-foreground font-body">جاري التحميل...</p>
            ) : detailsRoom ? (
              <div className="space-y-3 text-sm font-body">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">الحالة</span>
                  <span className={detailsRoom.status === "waiting" ? "text-accent" : detailsRoom.status === "playing" ? "text-primary" : "text-muted-foreground"}>
                    {detailsRoom.status === "waiting" ? "بانتظار لاعب" : detailsRoom.status === "playing" ? "جارية" : "انتهت"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">كود الدعوة</span>
                  <code className="text-primary bg-muted px-2 py-0.5 rounded">{detailsRoom.invite_code}</code>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">منشئ الغرفة</span>
                  <span>{detailsHostName}</span>
                </div>
                {detailsGuestName !== null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">الضيف</span>
                    <span>{detailsGuestName}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 items-center">
                  <span className="text-muted-foreground">من يمكنه الانضمام</span>
                  {detailsRoom.host_id === user?.id ? (
                    <Select
                      value={detailsRoom.join_policy ?? "anyone"}
                      onValueChange={(v) => updateJoinPolicy(detailsRoom.id, v as "anyone" | "invite_only")}
                    >
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue />
                      </SelectTrigger>
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
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              {detailsRoom && detailsRoom.host_id !== user?.id && !detailsRoom.guest_id && detailsRoom.status === "waiting" && (
                <Button onClick={() => { joinRoomByCode(detailsRoom.invite_code); closeDetails(); }}>
                  انضم للغرفة
                </Button>
              )}
              {detailsRoom && detailsRoom.host_id === user?.id && (
                <Button variant="destructive" onClick={() => { confirmDeleteRoom(detailsRoom); closeDetails(); }}>
                  <Trash2 className="w-4 h-4 ml-1" /> حذف الغرفة
                </Button>
              )}
              <Button variant="outline" onClick={closeDetails}>إغلاق</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete room confirmation */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف الغرفة؟</AlertDialogTitle>
              <AlertDialogDescription>هذا الإجراء لا يمكن التراجع عنه. سيتم حذف الغرفة نهائياً.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={deleteRoom} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default GameLobby;
