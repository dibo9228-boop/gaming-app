import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Gamepad2, LogIn, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        // Create account without requiring email confirmation.
        // In Supabase Dashboard: Authentication → Providers → Email → turn OFF "Confirm email"
        // so users can log in immediately after sign up.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            // emailRedirectTo only used if you enable email confirmation later
            // emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: "تم إنشاء الحساب!",
          description: "سجّل الدخول الآن بالبريد وكلمة المرور",
        });
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <Gamepad2 className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-lg arcade-text text-primary text-glow-green mb-2">
            ساحة التحدي
          </h1>
          <p className="text-muted-foreground font-body">
            {isLogin ? "سجل دخولك للعب" : "أنشئ حساب جديد"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <Input
              placeholder="اسم العرض"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="bg-card border-border text-foreground"
            />
          )}
          <Input
            type="email"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-card border-border text-foreground"
          />
          <Input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-card border-border text-foreground"
          />
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {loading ? "جاري..." : isLogin ? "تسجيل الدخول" : "إنشاء حساب"}
          </Button>
        </form>

        <p className="text-center mt-6 text-sm text-muted-foreground font-body">
          {isLogin ? "ما عندك حساب؟" : "عندك حساب؟"}{" "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary hover:underline"
          >
            {isLogin ? "أنشئ حساب" : "سجل دخول"}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
