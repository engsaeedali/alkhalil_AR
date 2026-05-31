"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_LABELS } from "@/lib/theme";
import { useKhalilTheme } from "@/components/ThemeProvider";
import { themeClasses } from "@/lib/themeClasses";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useKhalilTheme();
  const tc = themeClasses(theme);
  const isLight = theme === "oatmeal";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`الثيم الحالي: ${THEME_LABELS[theme]} — اضغط للتبديل`}
      className={cn(
        "flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all duration-300 cursor-pointer hover:scale-[1.02]",
        tc.btnGhost,
      )}
      aria-pressed={isLight}
    >
      {isLight ? <Sun size={12} className="text-amber-700" /> : <Moon size={12} />}
      <span>{isLight ? "فاتح" : "داكن"}</span>
    </button>
  );
}
