import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  const label = theme === "dark" ? "لايت مود" : "دارك مود";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-1 rounded-full border border-border bg-card/80 px-3 py-1 text-[11px] font-body text-muted-foreground shadow-sm backdrop-blur-sm hover:border-accent hover:text-accent transition-colors"
    >
      {theme === "dark" ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
      <span>{label}</span>
    </button>
  );
};

export default ThemeToggle;

