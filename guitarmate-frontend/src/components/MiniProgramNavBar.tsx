import React from 'react';
import { Wifi, BatteryMedium, MoreHorizontal, CircleDot, Sun, Moon, Languages } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface MiniProgramNavBarProps {
  title: string;
  isMobileFrame: boolean;
  onToggleMobileFrame: () => void;
  onOpenDoc: () => void;
}

export const MiniProgramNavBar: React.FC<MiniProgramNavBarProps> = ({
  title,
  isMobileFrame,
  onToggleMobileFrame,
  onOpenDoc,
}) => {
  const { theme, toggleTheme, isDark } = useTheme();
  const { language, toggleLanguage } = useLanguage();

  return (
    <div
      className={`w-full shrink-0 border-b select-none z-40 transition-colors duration-200 ${
        isDark
          ? 'bg-[#101217] text-white border-zinc-800/80'
          : 'bg-white text-zinc-900 border-zinc-200 shadow-sm'
      }`}
    >
      {/* Mini-Program Phone Status Bar (Time, Battery, Wifi) */}
      <div
        className={`flex items-center justify-between px-6 pt-2 pb-1 text-[11px] font-mono ${
          isDark ? 'text-zinc-400' : 'text-zinc-500'
        }`}
      >
        <span className={`font-semibold ${isDark ? 'text-white' : 'text-zinc-900'}`}>09:41</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-emerald-500 font-bold">5G</span>
          <Wifi size={13} />
          <BatteryMedium size={14} />
        </div>
      </div>

      {/* Mini-Program Navigation Bar with Title, Quick Controls, and WeChat Capsule Button */}
      <div className="relative flex items-center justify-between px-4 py-2">
        {/* Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <h1
            className={`text-sm font-bold truncate max-w-[140px] sm:max-w-[170px] ${
              isDark ? 'text-white' : 'text-zinc-900'
            }`}
          >
            {title}
          </h1>
        </div>

        {/* Action Controls: Theme + Language + WeChat Capsule */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Theme Toggle Button (Light ☀️ / Dark 🌙) */}
          <button
            onClick={toggleTheme}
            title={isDark ? '切换白天浅色模式 (Light mode)' : '切换黑夜深色模式 (Dark mode)'}
            className={`p-1.5 rounded-full transition border flex items-center justify-center ${
              isDark
                ? 'bg-zinc-850 hover:bg-zinc-800 border-zinc-700 text-amber-300'
                : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700'
            }`}
          >
            {isDark ? <Sun size={13} className="animate-spin-slow" /> : <Moon size={13} />}
          </button>

          {/* Language Toggle Button (中 / EN) */}
          <button
            onClick={toggleLanguage}
            title={language === 'zh' ? 'Switch to English' : '切换至中文版'}
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition border flex items-center gap-1 ${
              isDark
                ? 'bg-zinc-850 hover:bg-zinc-800 border-zinc-700 text-emerald-400'
                : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-emerald-600'
            }`}
          >
            <Languages size={12} />
            <span>{language === 'zh' ? '中' : 'EN'}</span>
          </button>

          {/* WeChat Iconic Capsule Button (··· | ⭘) */}
          <div
            className={`flex items-center rounded-full px-2 py-1 gap-2 shadow-inner border ${
              isDark
                ? 'bg-black/60 border-white/20 text-zinc-300'
                : 'bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
          >
            <button
              onClick={onOpenDoc}
              title="查看架构设计与说明"
              className={`px-1 transition ${isDark ? 'hover:text-white' : 'hover:text-zinc-900'}`}
            >
              <MoreHorizontal size={15} />
            </button>
            <div className={`w-[1px] h-3 ${isDark ? 'bg-white/20' : 'bg-zinc-300'}`} />
            <button
              onClick={onToggleMobileFrame}
              title="切换真机框架/大屏预览"
              className="text-zinc-400 hover:text-emerald-500 px-1 transition"
            >
              <CircleDot size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

