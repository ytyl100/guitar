import React from 'react';
import {
  Music,
  Library,
  GitFork,
  Video,
  Layers,
  BarChart3,
  FileCode2,
  HelpCircle,
  Headphones,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  FileInput,
  Waves,
  Hand,
} from 'lucide-react';

export type StudioTab =
  | 'music-library'
  | 'audio-tab-sync'
  | 'tab-import'
  | 'tab-layout-preview'
  | 'song-preview'
  | 'transcription-review'
  | 'curriculum'
  | 'video-cms'
  | 'chord-drill'
  | 'analytics'
  | 'data-contract';

interface SidebarNavProps {
  activeTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
  darkMode: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  darkMode,
  collapsed,
  onToggleCollapsed,
}) => {
  const navItems = [
    {
      id: 'transcription-review' as StudioTab,
      name: '① 音频导入与六线谱校正',
      enName: 'Audio Import & Tab Correction',
      badge: '主入口',
      badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
      icon: Waves,
      desc: '上传音频 / 音频 URL → AI 转录 → 多音轨对照校正 → 预览 → 发布',
    },
    {
      id: 'music-library' as StudioTab,
      name: '音乐库工程列表',
      enName: 'Music Library CMS',
      badge: '发布归档',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      icon: Library,
      desc: '已发布曲目 / 草稿·存档 / 点「编辑六线谱」回到校正工作台',
    },
    {
      id: 'tab-import' as StudioTab,
      name: '④ 数据契约核准与发布',
      enName: 'Tab Import & Contract',
      badge: '统一 JSON',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      icon: FileInput,
      desc: '承接转录项目 / ASCII·MusicXML·GPX 导入 → 校对统一 TabProject → 发布',
    },
    {
      id: 'tab-layout-preview' as StudioTab,
      name: '六线谱排版规范自检',
      enName: 'Tab Layout Preview',
      badge: '排版基线',
      badgeColor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      icon: Hand,
      desc: '卡农样例（无音频）：把位 / 推荐和弦 / 节奏线排版基线。曲目预览请从校正工作台点「预览」',
    },
    {
      id: 'audio-tab-sync' as StudioTab,
      name: '音频与六线谱对齐（兼容）',
      enName: 'Audio-Tab Sync Studio',
      badge: '高级',
      badgeColor: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      icon: Music,
      desc: '仅用于**已发布**曲目的毫秒级音频切片对齐（回流链路）；新建曲目请走 ①',
    },
    {
      id: 'curriculum' as StudioTab,
      name: '课程大纲与20m切片',
      enName: 'Curriculum Outline',
      badge: '5级拓扑',
      badgeColor: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      icon: GitFork,
      desc: '黄金20分钟分配 / 严格解锁卡点规则',
    },
    {
      id: 'video-cms' as StudioTab,
      name: '教学视频与关键打点',
      enName: 'Video & Keypoint CMS',
      badge: '4K/1080P',
      badgeColor: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
      icon: Video,
      desc: '时间戳手型要领打点 / 联动和弦卡',
    },
    {
      id: 'chord-drill' as StudioTab,
      name: '和弦微测与BPM阶梯',
      enName: 'Chord Drill & BPM',
      badge: '±15 Cents',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      icon: Layers,
      desc: '6弦5品按指录入 / 换把阶梯配速',
    },
    {
      id: 'analytics' as StudioTab,
      name: '教研学情分析看板',
      enName: 'Learning Analytics',
      badge: '漏斗分析',
      badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      icon: BarChart3,
      desc: '大横按F卡点分析 / 各环节流失率',
    },
  ];

  return (
    <aside
      id="sidebar-nav"
      className={`relative flex flex-col border-r transition-all duration-200 select-none z-10 shrink-0 ${
        collapsed ? 'w-18' : 'w-72'
      } ${
        darkMode
          ? 'bg-slate-900/90 border-slate-800 text-slate-200'
          : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}
    >
      {/* Top category label */}
      <div className="p-3.5 border-b border-inherit flex items-center justify-between">
        {!collapsed && (
          <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
            教研运营工作台
          </div>
        )}
        <button
          id="btn-collapse-sidebar"
          onClick={onToggleCollapsed}
          className={`p-1.5 rounded-lg border transition-colors ${
            darkMode
              ? 'border-slate-800 hover:bg-slate-800 text-slate-400'
              : 'border-slate-200 hover:bg-slate-200 text-slate-600'
          } ${collapsed ? 'mx-auto' : ''}`}
          title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav List */}
      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              onClick={() => onSelectTab(item.id)}
              className={`w-full text-left rounded-xl p-2.5 transition-all flex items-center gap-3 relative group ${
                isActive
                  ? darkMode
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 shadow-sm'
                    : 'bg-amber-500/10 border border-amber-500/30 text-amber-900 font-medium shadow-sm'
                  : darkMode
                  ? 'hover:bg-slate-800/70 border border-transparent text-slate-300'
                  : 'hover:bg-slate-200/70 border border-transparent text-slate-700'
              }`}
              title={collapsed ? `${item.name} (${item.enName})` : undefined}
            >
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-amber-500" />
              )}
              <div
                className={`p-2 rounded-lg shrink-0 transition-colors ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/30'
                    : darkMode
                    ? 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                    : 'bg-slate-200 text-slate-600 group-hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>

              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold truncate">{item.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {item.desc}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer shortcut helper & C-end indicator */}
      {!collapsed ? (
        <div className="p-3 m-2 rounded-xl border border-inherit bg-slate-800/30 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-medium text-[11px]">
            <Keyboard className="w-3.5 h-3.5 text-amber-400" />
            <span>专业打点工作台快捷键</span>
          </div>
          <div className="space-y-1 text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span className="font-mono text-slate-300">Spacebar</span>
              <span>播放 / 跟敲打点</span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-slate-300">A / B</span>
              <span>设置A-B片段循环</span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-slate-300">鼠标拖拽</span>
              <span>对齐微调小节线</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-2 flex justify-center text-slate-500">
          <Keyboard className="w-4 h-4" />
        </div>
      )}
    </aside>
  );
};
