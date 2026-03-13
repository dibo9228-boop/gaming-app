import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Save, Upload, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getUnlockedCount } from "@/lib/achievements";
import { getUserStats, getUserUnlockables, type UserStats, type UserUnlockable } from "@/lib/gameStats";
import { PRESET_AVATARS, PROFILE_COLORS, getLevelProgress } from "@/lib/profile";

type ProfileRow = {
  display_name: string;
  avatar_url: string | null;
  profile_color: string | null;
  total_xp: number;
};

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

const Profile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [unlockables, setUnlockables] = useState<UserUnlockable[]>([]);

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileColor, setProfileColor] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [profileRes, userStats] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name, avatar_url, profile_color, total_xp")
            .eq("user_id", user.id)
            .single(),
          getUserStats(user.id),
        ]);
        const unlocked = await getUserUnlockables(user.id);

        const p = profileRes.data;
        if (p) {
          setProfile(p);
          setDisplayName(p.display_name ?? "");
          setAvatarUrl(p.avatar_url ?? null);
          setProfileColor(p.profile_color ?? null);
        }
        setStats(userStats);
        setUnlockables(unlocked);

        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gt("total_xp", userStats.totalXp);
        setRank((count ?? 0) + 1);
      } finally {
        setLoading(false);
      }
    };

    load().catch(() => {
      setLoading(false);
    });

    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        async () => {
          const [profileRes, userStats] = await Promise.all([
            supabase
              .from("profiles")
              .select("display_name, avatar_url, profile_color, total_xp")
              .eq("user_id", user.id)
              .single(),
            getUserStats(user.id),
          ]);
          const unlocked = await getUserUnlockables(user.id);
          if (profileRes.data) {
            setProfile(profileRes.data);
            setDisplayName(profileRes.data.display_name ?? "");
            setAvatarUrl(profileRes.data.avatar_url ?? null);
            setProfileColor(profileRes.data.profile_color ?? null);
          }
          setStats(userStats);
          setUnlockables(unlocked);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const level = useMemo(() => stats?.level ?? 1, [stats?.level]);
  const levelProgress = useMemo(() => getLevelProgress(stats?.xp ?? 0), [stats?.xp]);
  const unlockedAchievements = useMemo(
    () => (stats ? getUnlockedCount(stats) : 0),
    [stats]
  );

  const onAvatarUpload = async (file: File) => {
    if (!user) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "صيغة غير مدعومة", description: "فقط JPG/PNG", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "حجم كبير", description: "الحد الأقصى 2MB", variant: "destructive" });
      return;
    }

    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadErr) {
      toast({ title: "فشل رفع الصورة", description: uploadErr.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    toast({ title: "تم رفع الأفاتار" });
  };

  const saveProfile = async () => {
    if (!user) return;
    const name = displayName.trim();
    if (!name) {
      toast({ title: "اسم المستخدم مطلوب", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name,
        avatar_url: avatarUrl,
        profile_color: profileColor,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "الاسم مستخدم", description: "اختر اسم مستخدم آخر", variant: "destructive" });
      } else {
        toast({ title: "تعذر الحفظ", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: "تم حفظ التعديلات" });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-body">سجّل الدخول لمشاهدة ملفك الشخصي</p>
        <Button onClick={() => navigate("/auth")}>تسجيل الدخول</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <Home className="w-4 h-4 ml-1" /> الرئيسية
          </Button>
          <h1 className="text-sm arcade-text text-accent">الملف الشخصي</h1>
          <div />
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground font-body">جاري تحميل الملف الشخصي...</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <Avatar className="h-20 w-20 ring-2 ring-primary/40">
                  <AvatarImage src={avatarUrl ?? undefined} alt="avatar" />
                  <AvatarFallback>
                    <UserCircle2 className="w-8 h-8" />
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1 font-body text-sm">
                  <p>اسم المستخدم: <span className="text-foreground">{profile?.display_name ?? "—"}</span></p>
                  <p>المستوى: <span className="text-primary">{level}</span></p>
                  <div className="space-y-1">
                    <p>تقدم المستوى: <span className="text-muted-foreground">{levelProgress.currentXp} / {levelProgress.nextLevelXp ?? "MAX"} XP</span></p>
                    <Progress value={levelProgress.progressPercent} className="h-2 w-56" />
                  </div>
                  <p>النقاط الكلية: <span className="text-primary">{stats?.totalXp ?? 0}</span></p>
                  <p>XP اللعب: <span className="text-primary">{stats?.xp ?? 0}</span></p>
                  <p>الاستمرارية: <span className="text-amber-500">🔥 {stats?.streakCount ?? 0} يوم</span></p>
                  <p>الإنجازات المفتوحة: <span className="text-accent">{unlockedAchievements}</span></p>
                  <p>ترتيبك: <span className="text-accent">#{rank ?? "—"}</span></p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm arcade-text text-foreground">الميزات المفتوحة</p>
                {unlockables.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد ميزات إضافية بعد. استمر باللعب لفتحها.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {unlockables.map((u) => (
                      <span key={u.id} className="text-xs rounded-full border border-primary/40 bg-primary/10 px-2 py-1">
                        {u.unlockableCode}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-body">
                  <div className={`rounded border p-2 ${level >= 4 ? "border-primary/40 bg-primary/10" : "border-border opacity-60"}`}>
                    {level >= 4 ? "✅" : "🔒"} تحديات أسرع (المستوى 4)
                  </div>
                  <div className={`rounded border p-2 ${level >= 5 ? "border-primary/40 bg-primary/10" : "border-border opacity-60"}`}>
                    {level >= 5 ? "✅" : "🔒"} بطولات صغيرة (المستوى 5)
                  </div>
                  <div className={`rounded border p-2 ${level >= 6 ? "border-primary/40 bg-primary/10" : "border-border opacity-60"}`}>
                    {level >= 6 ? "✅" : "🔒"} ثيمات إضافية (المستوى 6)
                  </div>
                  <div className={`rounded border p-2 ${level >= 7 ? "border-primary/40 bg-primary/10" : "border-border opacity-60"}`}>
                    {level >= 7 ? "✅" : "🔒"} ميزات مميزة + أفاتار خاص (المستوى 7)
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-border">
                <p className="text-sm arcade-text text-foreground">تعديل الملف</p>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="اسم المستخدم"
                  className="max-w-sm"
                />

                <div>
                  <p className="text-xs text-muted-foreground mb-2">اختر لون الملف (اختياري)</p>
                  <div className="flex gap-2 flex-wrap">
                    {PROFILE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setProfileColor(color)}
                        className={`h-8 w-8 rounded-full border ${
                          profileColor === color ? "border-foreground" : "border-border"
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setProfileColor(null)}>
                      بدون لون
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">أفاتارات جاهزة</p>
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_AVATARS.map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setAvatarUrl(url)}
                        className={`rounded-full p-0.5 border ${
                          avatarUrl === url ? "border-primary" : "border-border"
                        }`}
                      >
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={url} alt="preset-avatar" />
                          <AvatarFallback>🙂</AvatarFallback>
                        </Avatar>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onAvatarUpload(file).catch(() => {});
                      e.currentTarget.value = "";
                    }}
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 ml-1" /> رفع أفاتار (JPG/PNG أقل من 2MB)
                  </Button>
                </div>

                <Button onClick={saveProfile} disabled={saving} className="gap-2">
                  <Save className="w-4 h-4" />
                  {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
