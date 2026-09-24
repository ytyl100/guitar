import React, { useEffect, useMemo, useState } from 'react';
import { Clock, History, Redo2, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react';
import type { ApiTabProject } from '../../services/api';
import {
  loadSnapshots,
  removeSnapshot,
  summarizeTabProject,
  upsertSnapshot,
  type DraftSnapshot,
} from './revisionStore';

/**
 * 修订点面板（RevisionPanel）
 * ==========================
 *
 * 六线谱校正的「后悔药」（需求 2.3），三层一起给：
 *
 * | 区域 | 能力 | 数据来源 |
 * |---|---|---|
 * | 撤销 / 重做 | 上一步 / 下一步编辑（Ctrl+Z / Ctrl+Shift+Z） | 内存快照栈 |
 * | 本地存点 | 手动里程碑，可命名、可恢复、可删除 | localStorage（按项目隔离） |
 * | 发布历史 | 回到任意一次已发布版本 | `GET /projects/:id/revisions` |
 */

export interface PublishedRevision {
  revision: number;
  createdAt?: string;
  measureCount?: number;
  noteCount?: number;
  publishedBy?: string;
}

export interface RevisionPanelProps {
  projectId: string;
  isDark?: boolean;
  draft: ApiTabProject | null;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  onUndo: () => void;
  onRedo: () => void;
  /** 恢复某份快照到草稿 */
  onRestore: (tabProject: ApiTabProject, label: string) => void;
  /** 回滚到某个已发布版本（父组件负责拉 package 并反解） */
  onRollbackToRevision: (revision: number) => void;
  publishedRevisions: PublishedRevision[];
  /** 正在处理的动作标识（用于禁用按钮） */
  busy?: string;
}

export const RevisionPanel: React.FC<RevisionPanelProps> = ({
  projectId,
  isDark = true,
  draft,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  onUndo,
  onRedo,
  onRestore,
  onRollbackToRevision,
  publishedRevisions,
  busy,
}) => {
  const [snapshots, setSnapshots] = useState<DraftSnapshot[]>([]);
  const [label, setLabel] = useState('');

  useEffect(() => {
    setSnapshots(projectId ? loadSnapshots(projectId) : []);
  }, [projectId]);

  const draftStats = useMemo(() => (draft ? summarizeTabProject(draft) : { measureCount: 0, noteCount: 0 }), [draft]);

  const handleSave = () => {
    if (!projectId || !draft) return;
    const snapshot: DraftSnapshot = {
      id: `snap_${Date.now().toString(36)}`,
      label: label.trim() || `存点（${draftStats.measureCount} 小节 / ${draftStats.noteCount} 音符）`,
      createdAt: new Date().toISOString(),
      measureCount: draftStats.measureCount,
      noteCount: draftStats.noteCount,
      tabProject: draft,
    };
    setSnapshots(upsertSnapshot(projectId, snapshot));
    setLabel('');
  };

  const handleDelete = (id: string) => {
    setSnapshots(removeSnapshot(projectId, id));
  };

  const surface = isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200';
  const subtle = isDark ? 'bg-slate-950/60 text-slate-300' : 'bg-slate-50 text-slate-700';
  const dim = isDark ? 'text-slate-500' : 'text-slate-500';
  const field = isDark
    ? 'bg-slate-950/70 border-slate-700 text-slate-100'
    : 'bg-white border-slate-300 text-slate-800';

  const btn = `inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed ${
    isDark ? 'border-slate-700 text-slate-300 hover:border-slate-500' : 'border-slate-300 text-slate-600 hover:border-slate-400'
  }`;

  return (
    <div className={`rounded-2xl border p-3 space-y-3 ${surface}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <History size={13} className="text-amber-400" />
          修订点
        </div>
        <span className={`text-[10px] font-mono ${dim}`}>
          撤销 {undoCount} · 重做 {redoCount}
        </span>
      </div>

      {/* ① 撤销 / 重做 */}
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={11} /> 撤销
        </button>
        <button type="button" className={btn} onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={11} /> 重做
        </button>
        <span className={`text-[10px] ${dim}`}>Ctrl+Z / Ctrl+Shift+Z</span>
      </div>

      {/* ② 本地存点 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="存点备注（可空）"
            className={`flex-1 rounded-lg border px-2 py-1 text-[11px] ${field}`}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-40"
          >
            <Save size={11} /> 存点
          </button>
        </div>

        {snapshots.length === 0 ? (
          <div className={`text-[10px] ${dim}`}>还没有存点。改动较大前先存一个，随时可以一键恢复。</div>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className={`rounded-lg border px-2 py-1.5 text-[11px] ${isDark ? 'border-slate-800' : 'border-slate-200'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{snap.label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="恢复到这份快照"
                      onClick={() => onRestore(snap.tabProject, snap.label)}
                      className="p-0.5 text-emerald-400 hover:text-emerald-300"
                    >
                      <RotateCcw size={11} />
                    </button>
                    <button
                      type="button"
                      title="删除这份快照"
                      onClick={() => handleDelete(snap.id)}
                      className="p-0.5 text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                </div>
                <div className={`mt-0.5 text-[10px] font-mono ${dim}`}>
                  {new Date(snap.createdAt).toLocaleString()} · {snap.measureCount} 小节 / {snap.noteCount} 音符
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ③ 已发布版本 */}
      <div className="space-y-1.5">
        <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${subtle} rounded px-1.5 py-1`}>
          <Clock size={11} /> 已发布版本（回滚后会覆盖当前草稿）
        </div>
        {publishedRevisions.length === 0 ? (
          <div className={`text-[10px] ${dim}`}>还没有发布记录。</div>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-1">
            {publishedRevisions.map((rev) => (
              <div
                key={rev.revision}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
                  isDark ? 'border-slate-800' : 'border-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-mono">r{rev.revision}</div>
                  <div className={`text-[10px] font-mono ${dim}`}>
                    {rev.createdAt ? new Date(rev.createdAt).toLocaleString() : ''} · {rev.measureCount ?? '—'} 小节
                  </div>
                </div>
                <button
                  type="button"
                  className={btn}
                  disabled={busy === `rollback-${rev.revision}`}
                  onClick={() => onRollbackToRevision(rev.revision)}
                >
                  <RotateCcw size={11} />
                  {busy === `rollback-${rev.revision}` ? '回滚中…' : '回滚'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RevisionPanel;
