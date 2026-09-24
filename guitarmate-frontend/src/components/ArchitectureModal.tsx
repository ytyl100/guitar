import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  FileText,
  Sliders,
  Database,
  Layers,
  Video,
  Clock,
  Music,
  Sparkles,
  CheckCircle2,
  Lock,
  Unlock,
  Play,
  Pause,
  UploadCloud,
  Volume2,
  Mic,
  Plus,
  ArrowRight,
  HelpCircle,
  BarChart3,
  ExternalLink,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import { MASTER_CURRICULUM_BLUEPRINT } from '../data/curriculumPlanData';
import { useTheme } from '../contexts/ThemeContext';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalTab = 'blueprint' | 'studio' | 'audio-sync' | 'schema';

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<ModalTab>('blueprint');
  const [copied, setCopied] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('overview');

  // -------------------------------------------------------------
  // Interactive Studio Mock State (for demonstration)
  // -------------------------------------------------------------
  const [studioActiveStepId, setStudioActiveStepId] = useState('step-5');
  const [studioStartBpm, setStudioStartBpm] = useState(40);
  const [studioTargetBpm, setStudioTargetBpm] = useState(70);
  const [studioPassScore, setStudioPassScore] = useState(80);
  const [studioUnlockMode, setStudioUnlockMode] = useState<'strict' | 'score' | 'free'>('score');
  const [studioKeyPoints, setStudioKeyPoints] = useState([
    { time: '00:35', title: '左手食指与中指下弦顺序', chord: 'Em' },
    { time: '01:20', title: '手腕自然旋转，防触第1弦', chord: 'Em' },
    { time: '02:15', title: '常见哑音自查方法', chord: 'Em' },
  ]);
  const [newPointTime, setNewPointTime] = useState('03:10');
  const [newPointTitle, setNewPointTitle] = useState('双手对拍节拍器试练');

  const [timeSliceWarmup, setTimeSliceWarmup] = useState(3);
  const [timeSliceVideo, setTimeSliceVideo] = useState(6);
  const [timeSliceChord, setTimeSliceChord] = useState(4);
  const [timeSliceSwitch, setTimeSliceSwitch] = useState(4);
  const [timeSliceJam, setTimeSliceJam] = useState(3);

  // -------------------------------------------------------------
  // Audio Upload & Tab Progress Bar Sync Module Interactive State
  // -------------------------------------------------------------
  const [mockAudioName, setMockAudioName] = useState('Ed_Sheeran_Perfect_Original_Acoustic.mp3');
  const [mockAudioDuration, setMockAudioDuration] = useState(180); // 3 mins
  const [mockCurrentSec, setMockCurrentSec] = useState(14.5);
  const [mockIsPlaying, setMockIsPlaying] = useState(false);
  const [mockBpmDetect, setMockBpmDetect] = useState(63);
  const [mockLatencyOffset, setMockLatencyOffset] = useState(0); // ms
  const [mockSyncGridMode, setMockSyncGridMode] = useState<'measure' | 'note'>('note');
  const [mockMeasures] = useState([
    { bar: 1, start: 0, end: 4.2, chord: 'G' },
    { bar: 2, start: 4.2, end: 8.5, chord: 'Em' },
    { bar: 3, start: 8.5, end: 12.8, chord: 'C' },
    { bar: 4, start: 12.8, end: 17.0, chord: 'D' },
    { bar: 5, start: 17.0, end: 21.2, chord: 'G' },
  ]);

  const totalAllocatedMins =
    timeSliceWarmup + timeSliceVideo + timeSliceChord + timeSliceSwitch + timeSliceJam;

  if (!isOpen) return null;

  // Handle copy complete plan
  const handleCopyPlan = () => {
    let text = `# 《GuitarMate 弦音伴侣》吉他课程编写与教务管理体系全景规划方案\n\n`;
    MASTER_CURRICULUM_BLUEPRINT.forEach((sec) => {
      text += `## ${sec.title} [${sec.badge}]\n${sec.summary}\n\n`;
      sec.content.forEach((p) => {
        text += `${p}\n\n`;
      });
      sec.subsections?.forEach((sub) => {
        text += `### ${sub.subtitle}\n`;
        sub.items.forEach((item) => {
          text += `- ${item}\n`;
        });
        if (sub.table) {
          text += `\n| ${sub.table.headers.join(' | ')} |\n`;
          text += `| ${sub.table.headers.map(() => '---').join(' | ')} |\n`;
          sub.table.rows.forEach((row) => {
            text += `| ${row.join(' | ')} |\n`;
          });
          text += `\n`;
        }
        if (sub.codeBlock) {
          text += `\`\`\`typescript\n${sub.codeBlock}\n\`\`\`\n\n`;
        }
      });
      text += `\n---\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleAddKeyPoint = () => {
    if (!newPointTitle.trim()) return;
    setStudioKeyPoints((prev) => [
      ...prev,
      { time: newPointTime, title: newPointTitle, chord: 'Em' },
    ]);
    setNewPointTitle('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className={`border rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors duration-200 ${
          isDark
            ? 'bg-zinc-900 border-zinc-750 text-zinc-100'
            : 'bg-white border-zinc-300 text-zinc-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-slate-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <span>吉他课程体系编排与教务管理方案</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono font-bold border border-emerald-500/30">
                  V2.0 工业教研版
                </span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                涵盖视频资产上传、知识点打点、前后模块依赖卡点、和弦BPM微练习与20分钟时间切片
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyPlan}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                copied
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : isDark
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200'
              }`}
              title="复制完整 Markdown 规划方案"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? '已复制全案' : '复制全案'}</span>
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-full transition ${
                isDark
                  ? 'bg-zinc-800 text-zinc-400 hover:text-white'
                  : 'bg-zinc-100 text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className={`flex items-center gap-2 px-6 py-2.5 border-b text-xs font-bold overflow-x-auto ${
            isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-zinc-100/70 border-zinc-200'
          }`}
        >
          <button
            onClick={() => setActiveTab('blueprint')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'blueprint'
                ? 'bg-emerald-500 text-black shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Layers size={14} />
            <span>规划方案全景文档</span>
          </button>
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'studio'
                ? 'bg-emerald-500 text-black shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Sliders size={14} />
            <span>课程编排后台 (CMS Studio)</span>
          </button>
          <button
            onClick={() => setActiveTab('audio-sync')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'audio-sync'
                ? 'bg-emerald-500 text-black shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Radio size={14} />
            <span>音频上传与六线谱挂进度条工作台</span>
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'schema'
                ? 'bg-emerald-500 text-black shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Database size={14} />
            <span>数据模型与数据库规范</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 text-sm leading-relaxed">
          {/* ------------------------------------------------------------- */}
          {/* TAB 1: MASTER BLUEPRINT                                      */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'blueprint' && (
            <div className="space-y-6">
              {/* Quick Index Anchors */}
              <div
                className={`p-3 rounded-2xl border ${
                  isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50 border-zinc-200'
                }`}
              >
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                  快速章节导航 (点击直达)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {MASTER_CURRICULUM_BLUEPRINT.map((sec, idx) => (
                    <button
                      key={sec.id}
                      onClick={() => {
                        setSelectedSectionId(sec.id);
                        document.getElementById(`sec-${sec.id}`)?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                        selectedSectionId === sec.id
                          ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50 font-bold'
                          : isDark
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                          : 'bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {idx + 1}. {sec.badge}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sections List */}
              <div className="space-y-8">
                {MASTER_CURRICULUM_BLUEPRINT.map((section) => (
                  <section
                    key={section.id}
                    id={`sec-${section.id}`}
                    className={`p-5 rounded-3xl border transition-colors ${
                      isDark
                        ? 'bg-zinc-950/50 border-zinc-800/80 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 shadow-xs'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                          {section.badge}
                        </span>
                        <h4 className="text-base font-extrabold mt-1.5 text-emerald-500 dark:text-emerald-400">
                          {section.title}
                        </h4>
                      </div>
                    </div>

                    <p
                      className={`text-xs mb-4 leading-relaxed ${
                        isDark ? 'text-zinc-300' : 'text-zinc-700'
                      }`}
                    >
                      {section.summary}
                    </p>

                    {section.content.map((para, pIdx) => (
                      <p
                        key={pIdx}
                        className={`text-xs leading-relaxed mb-3 ${
                          isDark ? 'text-zinc-400' : 'text-zinc-600'
                        }`}
                      >
                        {para}
                      </p>
                    ))}

                    {/* Subsections */}
                    {section.subsections && (
                      <div className="space-y-5 mt-4 pt-3 border-t border-zinc-800/60 dark:border-zinc-800/60 border-zinc-200">
                        {section.subsections.map((sub, sIdx) => (
                          <div key={sIdx} className="space-y-2">
                            <h5
                              className={`text-xs font-bold flex items-center gap-1.5 ${
                                isDark ? 'text-zinc-200' : 'text-zinc-900'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>{sub.subtitle}</span>
                            </h5>

                            <ul className="space-y-1.5 text-xs">
                              {sub.items.map((item, iIdx) => (
                                <li
                                  key={iIdx}
                                  className={`pl-3 border-l-2 leading-relaxed ${
                                    isDark
                                      ? 'border-zinc-800 text-zinc-400'
                                      : 'border-zinc-300 text-zinc-600'
                                  }`}
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>

                            {/* Optional Table */}
                            {sub.table && (
                              <div className="overflow-x-auto mt-3 rounded-2xl border border-zinc-800/80 dark:border-zinc-800/80 border-zinc-200">
                                <table className="w-full text-left text-xs">
                                  <thead
                                    className={
                                      isDark
                                        ? 'bg-zinc-900/90 text-zinc-300'
                                        : 'bg-zinc-100 text-zinc-700'
                                    }
                                  >
                                    <tr>
                                      {sub.table.headers.map((h, hIdx) => (
                                        <th key={hIdx} className="p-2.5 font-bold">
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-800/50 dark:divide-zinc-800/50 divide-zinc-200">
                                    {sub.table.rows.map((row, rIdx) => (
                                      <tr
                                        key={rIdx}
                                        className={
                                          isDark
                                            ? 'hover:bg-zinc-900/50'
                                            : 'hover:bg-zinc-50'
                                        }
                                      >
                                        {row.map((cell, cIdx) => (
                                          <td
                                            key={cIdx}
                                            className={`p-2.5 ${
                                              cIdx === 0 ? 'font-bold text-emerald-500' : ''
                                            }`}
                                          >
                                            {cell}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Optional Code Block */}
                            {sub.codeBlock && (
                              <pre
                                className={`p-3 rounded-2xl text-[11px] font-mono overflow-x-auto border mt-2 leading-relaxed ${
                                  isDark
                                    ? 'bg-zinc-950 text-emerald-300 border-zinc-850'
                                    : 'bg-zinc-900 text-emerald-400 border-zinc-700'
                                }`}
                              >
                                {sub.codeBlock}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* TAB 2: INTERACTIVE COURSE STUDIO                              */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'studio' && (
            <div className="space-y-6">
              <div
                className={`p-4 rounded-3xl border flex items-center justify-between ${
                  isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-slate-50 border-zinc-200'
                }`}
              >
                <div>
                  <h4 className="text-sm font-extrabold text-emerald-500 flex items-center gap-2">
                    <Sliders size={16} />
                    <span>课程教务工作台 (Course Studio CMS 原型演示)</span>
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    实时模拟吉他教研团队对视频打点、前后依赖规则、和弦练习参数与时间切片的配置
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                  已连接教研云存储
                </span>
              </div>

              {/* Main 2-Column Studio Layout */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Left Column: Chapters & Steps Selector */}
                <div
                  className={`md:col-span-4 p-4 rounded-3xl border space-y-3 ${
                    isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      课程课时结构树
                    </span>
                    <button className="text-[10px] text-emerald-500 hover:underline flex items-center gap-1 font-bold">
                      <Plus size={12} /> 添加课时
                    </button>
                  </div>

                  {/* Chapter 1 */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-zinc-400 px-1">
                      CH 1: 破冰入门 (持琴与调音)
                    </div>
                    <div
                      onClick={() => setStudioActiveStepId('step-1')}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${
                        studioActiveStepId === 'step-1'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500 font-bold'
                          : isDark
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Video size={13} />
                        <span className="truncate">How to hold & tune</span>
                      </div>
                      <span className="text-[10px] opacity-70">5 min</span>
                    </div>
                  </div>

                  {/* Chapter 2 */}
                  <div className="space-y-1.5 pt-2">
                    <div className="text-[11px] font-bold text-zinc-400 px-1">
                      CH 2: 首批和弦 (Em 与 D6/9)
                    </div>
                    <div
                      onClick={() => setStudioActiveStepId('step-5')}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${
                        studioActiveStepId === 'step-5'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500 font-bold'
                          : isDark
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Play size={13} />
                        <span className="truncate">How to play Em</span>
                      </div>
                      <span className="text-[10px] opacity-70 font-mono">6 min</span>
                    </div>

                    <div
                      onClick={() => setStudioActiveStepId('step-6')}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${
                        studioActiveStepId === 'step-6'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500 font-bold'
                          : isDark
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Mic size={13} />
                        <span className="truncate">Em ⇄ D6/9 转换测试</span>
                      </div>
                      <span className="text-[10px] opacity-70 font-mono">4 min</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Step Configuration Inspector */}
                <div
                  className={`md:col-span-8 p-5 rounded-3xl border space-y-5 ${
                    isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between border-b pb-3 border-zinc-800/80 dark:border-zinc-800/80 border-zinc-200">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-500">
                        正在编排课时 ID: {studioActiveStepId}
                      </span>
                      <h4 className="text-base font-extrabold text-white dark:text-white text-zinc-900">
                        {studioActiveStepId === 'step-5'
                          ? 'How to play Em (单和弦突破与转换冲刺)'
                          : 'How to hold and tune your guitar'}
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-blue-500/20 text-blue-500 border border-blue-500/30">
                      类型: VIDEO + TRAINER
                    </span>
                  </div>

                  {/* Section A: 教学视频与关键打点 */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold flex items-center gap-1.5 text-zinc-300 dark:text-zinc-300 text-zinc-800">
                      <Video size={14} className="text-blue-500" />
                      <span>1. 教学视频绑定与时间戳关键打点 (Timestamp Key-Points)</span>
                    </h5>
                    <div
                      className={`p-3 rounded-2xl border text-xs space-y-2 ${
                        isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>主讲老师: Mark Robertson (伯克利吉他客座讲师)</span>
                        <span className="font-mono text-emerald-500">CDN: 1080P 自适应就绪</span>
                      </div>

                      {/* Key points list */}
                      <div className="space-y-1.5 pt-1">
                        {studioKeyPoints.map((kp, kIdx) => (
                          <div
                            key={kIdx}
                            className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs ${
                              isDark
                                ? 'bg-zinc-950 border-zinc-800/80 text-zinc-300'
                                : 'bg-white border-zinc-200 text-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-emerald-500">
                                {kp.time}
                              </span>
                              <span>{kp.title}</span>
                            </div>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">
                              高亮和弦: {kp.chord}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Add new keypoint row */}
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          value={newPointTime}
                          onChange={(e) => setNewPointTime(e.target.value)}
                          placeholder="00:00"
                          className={`w-16 px-2 py-1 rounded-lg text-xs font-mono border ${
                            isDark
                              ? 'bg-zinc-950 border-zinc-800 text-white'
                              : 'bg-white border-zinc-300 text-zinc-900'
                          }`}
                        />
                        <input
                          type="text"
                          value={newPointTitle}
                          onChange={(e) => setNewPointTitle(e.target.value)}
                          placeholder="输入关键动作知识点描述..."
                          className={`flex-1 px-2.5 py-1 rounded-lg text-xs border ${
                            isDark
                              ? 'bg-zinc-950 border-zinc-800 text-white'
                              : 'bg-white border-zinc-300 text-zinc-900'
                          }`}
                        />
                        <button
                          onClick={handleAddKeyPoint}
                          className="px-3 py-1 rounded-lg bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 transition shrink-0"
                        >
                          添加打点
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section B: 前后模块依赖与解锁规则 */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold flex items-center gap-1.5 text-zinc-300 dark:text-zinc-300 text-zinc-800">
                      <Lock size={14} className="text-amber-500" />
                      <span>2. 模块依赖流转与通关卡点设置 (Prerequisite & Unlock Gating)</span>
                    </h5>
                    <div
                      className={`p-3 rounded-2xl border text-xs space-y-3 ${
                        isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">解锁策略选择:</span>
                        <div className="flex gap-1.5">
                          {(['score', 'strict', 'free'] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setStudioUnlockMode(mode)}
                              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                                studioUnlockMode === mode
                                  ? 'bg-amber-500 text-black'
                                  : isDark
                                  ? 'bg-zinc-800 text-zinc-400'
                                  : 'bg-zinc-200 text-zinc-600'
                              }`}
                            >
                              {mode === 'score'
                                ? 'AI评分卡点 (推荐)'
                                : mode === 'strict'
                                ? '严格线性顺序'
                                : '全免免试解锁'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {studioUnlockMode === 'score' && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-zinc-400">
                            麦克风 AI 听音达标门槛: <strong>{studioPassScore} 分</strong>
                          </span>
                          <input
                            type="range"
                            min={60}
                            max={100}
                            step={5}
                            value={studioPassScore}
                            onChange={(e) => setStudioPassScore(Number(e.target.value))}
                            className="w-40 accent-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section C: 和弦练习微观设置 */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold flex items-center gap-1.5 text-zinc-300 dark:text-zinc-300 text-zinc-800">
                      <Music size={14} className="text-emerald-500" />
                      <span>3. 和弦练习模块与节拍器 BPM 阶梯配置</span>
                    </h5>
                    <div
                      className={`p-3 rounded-2xl border text-xs space-y-3 ${
                        isDark ? 'bg-zinc-900/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">目标转换对:</span>
                        <div className="flex items-center gap-1.5 font-mono font-bold">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                            Em
                          </span>
                          <span>⇄</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                            D6/9
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex justify-between text-zinc-400 mb-1">
                            <span>起始速度:</span>
                            <span className="font-mono font-bold text-white dark:text-white text-zinc-900">
                              {studioStartBpm} BPM
                            </span>
                          </div>
                          <input
                            type="range"
                            min={30}
                            max={80}
                            step={5}
                            value={studioStartBpm}
                            onChange={(e) => setStudioStartBpm(Number(e.target.value))}
                            className="w-full accent-emerald-500"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-zinc-400 mb-1">
                            <span>通关目标速度:</span>
                            <span className="font-mono font-bold text-white dark:text-white text-zinc-900">
                              {studioTargetBpm} BPM
                            </span>
                          </div>
                          <input
                            type="range"
                            min={50}
                            max={120}
                            step={5}
                            value={studioTargetBpm}
                            onChange={(e) => setStudioTargetBpm(Number(e.target.value))}
                            className="w-full accent-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section D: 黄金 20 分钟时间切片分配 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold flex items-center gap-1.5 text-zinc-300 dark:text-zinc-300 text-zinc-800">
                        <Clock size={14} className="text-purple-400" />
                        <span>4. 单课 20 分钟时间进度切片分配 (Time Allocation)</span>
                      </h5>
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg ${
                          totalAllocatedMins === 20
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        合计: {totalAllocatedMins} / 20 分钟
                      </span>
                    </div>

                    {/* Proportional bar */}
                    <div className="h-3 w-full rounded-full overflow-hidden flex bg-zinc-800">
                      <div
                        style={{ width: `${(timeSliceWarmup / totalAllocatedMins) * 100}%` }}
                        className="bg-amber-400"
                        title={`热身校音: ${timeSliceWarmup}m`}
                      />
                      <div
                        style={{ width: `${(timeSliceVideo / totalAllocatedMins) * 100}%` }}
                        className="bg-blue-500"
                        title={`视频精讲: ${timeSliceVideo}m`}
                      />
                      <div
                        style={{ width: `${(timeSliceChord / totalAllocatedMins) * 100}%` }}
                        className="bg-emerald-500"
                        title={`单和弦微测: ${timeSliceChord}m`}
                      />
                      <div
                        style={{ width: `${(timeSliceSwitch / totalAllocatedMins) * 100}%` }}
                        className="bg-purple-500"
                        title={`转换冲刺: ${timeSliceSwitch}m`}
                      />
                      <div
                        style={{ width: `${(timeSliceJam / totalAllocatedMins) * 100}%` }}
                        className="bg-rose-500"
                        title={`曲目弹唱: ${timeSliceJam}m`}
                      />
                    </div>

                    {/* Sliders grid */}
                    <div className="grid grid-cols-5 gap-2 text-[10px] text-center">
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <span className="text-amber-500 font-bold block">校音热身</span>
                        <span className="font-mono">{timeSliceWarmup} min</span>
                      </div>
                      <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30">
                        <span className="text-blue-500 font-bold block">名师视频</span>
                        <span className="font-mono">{timeSliceVideo} min</span>
                      </div>
                      <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                        <span className="text-emerald-500 font-bold block">和弦微测</span>
                        <span className="font-mono">{timeSliceChord} min</span>
                      </div>
                      <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30">
                        <span className="text-purple-400 font-bold block">转换冲刺</span>
                        <span className="font-mono">{timeSliceSwitch} min</span>
                      </div>
                      <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30">
                        <span className="text-rose-400 font-bold block">曲目对拍</span>
                        <span className="font-mono">{timeSliceJam} min</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* TAB 3: AUDIO UPLOAD & TAB PROGRESS BAR SYNC WORKSTATION       */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'audio-sync' && (
            <div className="space-y-6">
              {/* Header Box */}
              <div
                className={`p-4 rounded-3xl border ${
                  isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-slate-50 border-zinc-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-emerald-500 flex items-center gap-2">
                      <Radio size={16} />
                      <span>音频上传与六线谱挂音乐进度条工作台 (Audio Upload & Tab Sync Studio)</span>
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      管理音频资产上传、声学波形解析、六线谱小节/音符毫秒级对齐与双向进度条挂载
                    </p>
                  </div>
                  <span className="self-start sm:self-auto text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-500 font-mono font-bold border border-emerald-500/30">
                    60 FPS 游标时钟联动
                  </span>
                </div>
              </div>

              {/* 1. Audio Upload & Ingestion Simulator Panel */}
              <div
                className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <UploadCloud size={16} className="text-emerald-500" />
                    <span className="text-xs font-extrabold">1. 伴奏音频直传与解析引擎</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">支持 MP3 / WAV / FLAC / AAC</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Upload Dropzone Preview */}
                  <div
                    className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center transition ${
                      isDark ? 'border-zinc-750 bg-zinc-900/40 hover:border-emerald-500/50' : 'border-zinc-300 bg-zinc-50/70 hover:border-emerald-500/50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2">
                      <Music size={20} />
                    </div>
                    <span className="text-xs font-bold text-zinc-200 dark:text-zinc-100">
                      {mockAudioName}
                    </span>
                    <span className="text-[10px] text-zinc-400 mt-0.5">
                      44.1kHz / 320kbps / 3分00秒 (180s)
                    </span>
                    <label className="mt-3 px-3 py-1 rounded-lg bg-emerald-500 text-black text-[11px] font-bold cursor-pointer hover:bg-emerald-400 transition">
                      重新选择音频
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setMockAudioName(e.target.files[0].name);
                          }
                        }}
                      />
                    </label>
                  </div>

                  {/* Audio Specs & AI Detection */}
                  <div className="md:col-span-2 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                        <span className="text-[10px] text-zinc-400 block">自动探测 BPM</span>
                        <span className="text-sm font-extrabold font-mono text-emerald-500">{mockBpmDetect} BPM</span>
                        <span className="text-[9px] text-zinc-500 block mt-0.5">4/4 拍民谣节拍</span>
                      </div>
                      <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                        <span className="text-[10px] text-zinc-400 block">小节打点总数</span>
                        <span className="text-sm font-extrabold font-mono text-cyan-400">42 小节</span>
                        <span className="text-[9px] text-zinc-500 block mt-0.5">平均 4.25s / 小节</span>
                      </div>
                      <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                        <span className="text-[10px] text-zinc-400 block">蓝牙延迟微调</span>
                        <span className="text-sm font-extrabold font-mono text-amber-400">{mockLatencyOffset} ms</span>
                        <span className="text-[9px] text-zinc-500 block mt-0.5">耳麦时钟补偿</span>
                      </div>
                    </div>

                    {/* Latency slider */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-400 text-[11px] whitespace-nowrap">时钟补偿:</span>
                      <input
                        type="range"
                        min="-200"
                        max="200"
                        step="10"
                        value={mockLatencyOffset}
                        onChange={(e) => setMockLatencyOffset(Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-zinc-700 rounded-lg cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-zinc-300 w-12 text-right">
                        {mockLatencyOffset}ms
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Interactive Waveform & Tab Progress Bar Live Playhead Canvas */}
              <div
                className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={16} className="text-emerald-500" />
                    <span className="text-xs font-extrabold">2. 六线谱挂音乐总进度条 (双向 Seek 联动模拟器)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400">对齐模式:</span>
                    <button
                      onClick={() => setMockSyncGridMode('note')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        mockSyncGridMode === 'note' ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      音符级毫秒
                    </button>
                    <button
                      onClick={() => setMockSyncGridMode('measure')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        mockSyncGridMode === 'measure' ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      小节级
                    </button>
                  </div>
                </div>

                {/* Simulated Audio Waveform Bar */}
                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Volume2 size={12} className="text-emerald-400" />
                      <span>音频声学振幅 (Waveform Peaks) 与游标</span>
                    </span>
                    <span>
                      {Math.floor(mockCurrentSec / 60)}:
                      {String(Math.floor(mockCurrentSec % 60)).padStart(2, '0')} / 03:00
                    </span>
                  </div>

                  {/* Waveform graphic clickable */}
                  <div
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickPct = (e.clientX - rect.left) / rect.width;
                      setMockCurrentSec(clickPct * mockAudioDuration);
                    }}
                    className="relative w-full h-16 bg-zinc-900 rounded-xl overflow-hidden cursor-pointer border border-zinc-800 flex items-center px-1"
                  >
                    {/* Simulated Waveform Bars */}
                    <div className="w-full h-full flex items-center justify-between gap-[2px]">
                      {Array.from({ length: 64 }).map((_, i) => {
                        const h = 20 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.8) * 20;
                        const isPast = (i / 64) * mockAudioDuration <= mockCurrentSec;
                        return (
                          <div
                            key={i}
                            style={{ height: `${Math.max(8, Math.min(56, h))}px` }}
                            className={`w-full rounded-full transition-colors ${
                              isPast ? 'bg-emerald-400' : 'bg-zinc-700/60'
                            }`}
                          />
                        );
                      })}
                    </div>

                    {/* Red/Emerald Playhead indicator line */}
                    <div
                      style={{ left: `${(mockCurrentSec / mockAudioDuration) * 100}%` }}
                      className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_#10b981] z-20 pointer-events-none"
                    >
                      <div className="w-2.5 h-2.5 -ml-1 rounded-full bg-emerald-400 border border-white -mt-0.5 shadow-xs" />
                    </div>

                    {/* Measure markers on waveform */}
                    {mockMeasures.map((m) => (
                      <div
                        key={m.bar}
                        style={{ left: `${(m.start / mockAudioDuration) * 100}%` }}
                        className="absolute top-0 bottom-0 border-l border-zinc-600/40 pointer-events-none z-10"
                      >
                        <span className="text-[8px] font-mono text-zinc-400 bg-zinc-950/80 px-1 rounded ml-0.5">
                          M{m.bar}:{m.chord}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Simulated 6-Line Tablature Staff Segment Linked to Playhead */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                        当前小节挂载: Measure 4 (D Chord)
                      </span>
                      <span className="text-zinc-400 text-[10px]">
                        六线谱游标根据音频当前秒数毫秒级推进
                      </span>
                    </div>
                    <span className="text-amber-400 font-mono text-[10px]">
                      Playhead X: {Math.round(((mockCurrentSec % 4.2) / 4.2) * 100)}%
                    </span>
                  </div>

                  {/* SVG 6-line Tablature with sync playhead */}
                  <div className="relative w-full h-24 bg-zinc-900/80 rounded-lg overflow-hidden border border-zinc-800/80">
                    <svg viewBox="0 0 500 80" className="w-full h-full">
                      {/* 6 strings */}
                      {[15, 25, 35, 45, 55, 65].map((y, idx) => (
                        <line
                          key={idx}
                          x1="30"
                          y1={y}
                          x2="480"
                          y2={y}
                          stroke="#52525b"
                          strokeWidth="1"
                        />
                      ))}
                      {/* String labels */}
                      {['1E', '2B', '3G', '4D', '5A', '6E'].map((lbl, idx) => (
                        <text
                          key={idx}
                          x="10"
                          y={18 + idx * 10}
                          fill="#a1a1aa"
                          fontSize="8"
                          fontFamily="monospace"
                        >
                          {lbl}
                        </text>
                      ))}

                      {/* Mock notes */}
                      <circle cx="80" cy="45" r="5" fill="#10b981" />
                      <text x="77" y="48" fill="#000" fontSize="9" fontWeight="bold">0</text>

                      <circle cx="160" cy="35" r="5" fill="#10b981" />
                      <text x="157" y="38" fill="#000" fontSize="9" fontWeight="bold">2</text>

                      <circle cx="240" cy="25" r="5" fill="#10b981" />
                      <text x="237" y="28" fill="#000" fontSize="9" fontWeight="bold">3</text>

                      <circle cx="320" cy="15" r="5" fill="#10b981" />
                      <text x="317" y="18" fill="#000" fontSize="9" fontWeight="bold">2</text>

                      <circle cx="400" cy="25" r="5" fill="#10b981" />
                      <text x="397" y="28" fill="#000" fontSize="9" fontWeight="bold">3</text>

                      {/* Animated synced playhead line on tab */}
                      <line
                        x1={30 + (((mockCurrentSec % 4.2) / 4.2) * 450)}
                        y1="8"
                        x2={30 + (((mockCurrentSec % 4.2) / 4.2) * 450)}
                        y2="72"
                        stroke="#10b981"
                        strokeWidth="2.5"
                      />
                    </svg>
                  </div>
                </div>

                {/* Play / Pause / Seek Controls */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMockIsPlaying(!mockIsPlaying)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-extrabold flex items-center gap-1.5 hover:bg-emerald-400 transition"
                    >
                      {mockIsPlaying ? <Pause size={14} /> : <Play size={14} className="fill-current" />}
                      <span>{mockIsPlaying ? '暂停音频' : '试听音频对拍'}</span>
                    </button>
                    <button
                      onClick={() => setMockCurrentSec(0)}
                      className="px-2.5 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-[11px] hover:text-white"
                    >
                      重置到开头
                    </button>
                  </div>

                  <span className="text-[11px] text-zinc-400">
                    点击波形图或六线谱任意小节即可立即双向 Seek 跳转
                  </span>
                </div>
              </div>

              {/* 3. CMS Audio-Tab Sync Workflow Architecture Diagram */}
              <div
                className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <h5 className="text-xs font-extrabold text-zinc-200 mb-3 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span>3. 音频上传挂载进度条核心实现四步闭环</span>
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className={`p-3 rounded-xl border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                    <span className="font-bold text-emerald-400 block mb-1">Step 1: 直传与提取</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      前端上传 MP3 到云存储，Web Audio API 即刻解码采样提取 128 点波形峰值，计算音频时长。
                    </p>
                  </div>

                  <div className={`p-3 rounded-xl border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                    <span className="font-bold text-cyan-400 block mb-1">Step 2: 小节/音符对齐</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      后台打点器通过 Spacebar 节拍探测或拖拽小节线，将六线谱的每个小节与音符分配绝对时间秒数。
                    </p>
                  </div>

                  <div className={`p-3 rounded-xl border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                    <span className="font-bold text-purple-400 block mb-1">Step 3: 双向时钟挂载</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      音频播放主时钟驱动六线谱红线游标平滑滑动；点击六线谱小节反向快进/快退音频进度。
                    </p>
                  </div>

                  <div className={`p-3 rounded-xl border ${isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                    <span className="font-bold text-amber-400 block mb-1">Step 4: 小程序端秒开</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      使用微信 InnerAudioContext 边下边播，配备虚拟化六线谱渲染与蓝牙耳麦延迟补偿。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* TAB 4: SCHEMA SPECS                                          */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'schema' && (
            <div className="space-y-6">
              <div
                className={`p-4 rounded-3xl border ${
                  isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-slate-50 border-zinc-200'
                }`}
              >
                <h4 className="text-sm font-extrabold text-emerald-500 flex items-center gap-2">
                  <Database size={16} />
                  <span>核心数据模型定义 (TypeScript & Database Entity Specs)</span>
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  前后端统一类型定义，全面覆盖教学视频资产、时间戳知识点打点、模块前置依赖与课时时间切片
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl border bg-zinc-950 border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      // 1. 课时教学步骤与模块依赖 (LessonStep & TimeAllocation)
                    </span>
                    <span className="text-[10px] text-zinc-400">/src/types.ts</span>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
{`export interface LessonStep {
  id: string;
  title: string;
  type: 'video' | 'trainer' | 'tuner' | 'practice';
  durationMin: number;
  completed: boolean;

  // 依赖与解锁卡点
  prerequisite?: {
    requiredStepId?: string; // 前置课时 ID
    minScore?: number;        // AI 听音达标分 (例如 80)
    isUnlockedByDefault?: boolean;
  };

  // 20 分钟时间切片模型
  timeAllocation?: {
    warmupMins: number;      // 琴头校音 (3min)
    videoLectureMins: number;// 名师微课 (6min)
    chordDrillMins: number;  // 和弦微测 (4min)
    switchingMins: number;   // 转换冲刺 (4min)
    songJamMins: number;     // 曲目对拍 (3min)
    totalMins: number;       // 20min
  };

  // 视频资产与打点联动
  videoData?: {
    teacherName: string;
    teacherTitle: string;
    description: string;
    videoUrl?: string;
    videoPoster: string;
    category?: 'posture' | 'rhythm' | 'chord' | 'theory' | 'song_breakdown';
    keyPoints: string[];
    detailedKeyPoints?: {
      timeSec: number;
      label: string;
      chordHighlight?: string; // 联动显示和弦卡
    }[];
  };

  // 和弦微练习
  trainerData?: {
    targetChords: string[];
    tempoBpm: number;
    description: string;
    exerciseConfig?: {
      switchPairs: [string, string][];
      startBpm: number;
      targetBpm: number;
      durationSec: number;
      passStreakCount: number;
    };
  };

  // 教学曲目切片绑定
  songBinding?: {
    songId: string;
    title: string;
    artist: string;
    sectionSnippet?: string;
    suggestedCapo?: string;
    tabMode?: 'CRD' | 'TAB';
  };
}`}
                  </pre>
                </div>

                <div className="p-4 rounded-2xl border bg-zinc-950 border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      // 2. 数据库关系表与集合规划 (Cloud Database Schema)
                    </span>
                    <span className="text-[10px] text-zinc-400">WeChat Cloud / MySQL</span>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
{`-- 1. 课程大纲表
CREATE TABLE courses (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  stage_id VARCHAR(32) NOT NULL, -- 所属成长阶段
  level VARCHAR(64) NOT NULL,
  total_steps INT DEFAULT 0,
  recommended_daily_mins INT DEFAULT 20,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 课时表与依赖
CREATE TABLE lesson_steps (
  id VARCHAR(64) PRIMARY KEY,
  chapter_id VARCHAR(64) NOT NULL,
  title VARCHAR(128) NOT NULL,
  type ENUM('video', 'trainer', 'tuner', 'practice') NOT NULL,
  duration_min INT DEFAULT 20,
  prerequisite_step_id VARCHAR(64),
  passing_score INT DEFAULT 80,
  time_allocation_json JSON,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id)
);

-- 3. 视频资产与打点表
CREATE TABLE video_assets (
  id VARCHAR(64) PRIMARY KEY,
  lesson_step_id VARCHAR(64) NOT NULL,
  source_url VARCHAR(512) NOT NULL,
  transcoded_1080p VARCHAR(512),
  transcoded_720p VARCHAR(512),
  key_points_json JSON -- 存储 [{timeSec: 35, label: "...", chord: "Em"}]
);

-- 4. 学员学习进度与 AI 评测记录
CREATE TABLE user_learning_progress (
  user_id VARCHAR(64) NOT NULL,
  step_id VARCHAR(64) NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  best_score INT DEFAULT 0,
  last_practice_date DATE,
  streak_count INT DEFAULT 0,
  PRIMARY KEY (user_id, step_id)
);

-- 5. 音频资产与吉他六线谱挂进度条对齐表 (Audio-Tab Sync Table)
CREATE TABLE audio_tab_sync_assets (
  id VARCHAR(64) PRIMARY KEY,
  song_id VARCHAR(64) NOT NULL,
  audio_url VARCHAR(512) NOT NULL,
  duration_sec FLOAT NOT NULL,
  bpm INT DEFAULT 60,
  waveform_peaks_json JSON,       -- 存储 128 点归一化声学振幅数组
  measure_timestamps_json JSON,   -- 存储小节绝对毫秒起止 [{measure: 1, startSec: 0, endSec: 4.2}]
  note_timestamps_json JSON,      -- 存储六线谱逐音符对拍秒数 [{string: 1, fret: 2, timeSec: 1.05}]
  latency_offset_ms INT DEFAULT 0, -- 蓝牙耳机延迟补偿 (ms)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id)
);`}
                  </pre>
                </div>

                <div className="p-4 rounded-2xl border bg-zinc-950 border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      // 3. 六线谱音符挂音乐进度条类型定义 (AudioTabSyncConfig)
                    </span>
                    <span className="text-[10px] text-zinc-400">/src/types.ts</span>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
{`export interface AudioTabSyncConfig {
  audioId: string;
  audioFileName: string;
  audioDurationSec: number;        // 音频总时长 (秒)
  waveformPeaks: number[];         // 声学波形峰值采样 (0~1 归一化)
  playbackOffsetMs: number;        // 延迟补偿偏移量 (±ms)
  
  // 小节级别时间戳网格 (驱动六线谱按小节滚动)
  measureTimestamps: {
    measureIndex: number;
    startSec: number;
    endSec: number;
    chord?: string;
  }[];
  
  // 逐音符精确时序打点 (驱动六线谱游标毫秒级推进与音符发光)
  noteTimestamps?: {
    lineIndex: number;
    noteIndex: number;
    timeSec: number;               // 触发音频对拍秒数
    fret: number | string;         // 品位 (例如 2, 7, '2^')
    string: number;                // 弦号 (1~6 弦)
  }[];
}`}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-3.5 border-t flex items-center justify-between text-xs ${
            isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>已深度融合至现有伴奏库、吉他大厅、和弦库与调音器体系中</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyPlan}
              className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 border ${
                copied
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : isDark
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                  : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-100 shadow-xs'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? '已复制全案' : '复制完整 Markdown 全案'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-emerald-500 text-black font-extrabold hover:bg-emerald-400 transition"
            >
              返回体验小程序
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
