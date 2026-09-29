import { View, Text, Image } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCurriculumLearn,
  getPublishedLibrary,
  type LearnChapter,
  type LearnCourse,
  type LearnLesson,
  type LearnStage,
} from '../../services/api';
import BottomNav from '../../components/BottomNav';
import { findPublishedSongByName, songEvalUrl, songPageUrl } from '../../utils/boundSong';
import { pageClass } from '../../utils/settings';

/**
 * 课程（Learn tab）
 * ================
 *
 * ## 与 Web 版的关系
 *
 * **视觉与信息层级**照 Web 版 `CourseTab.tsx`：课程列表 → 点进课程 → 「章节 + 课时行」两段式。
 * 但**数据来源是后端 API**（这是用户明确要求的）：
 *
 * - Web 版用的是自己硬编码的 `INITIAL_COURSES`（假课程、假进度）；
 * - 这里读 `GET /api/curriculum/learn` —— 就是 CMS「课程大纲」工作台里维护的那棵真树
 *   （阶段 → 课程 → 章节 → 课时），所以**CMS 一调整，这里刷新就能看到**。
 *
 * ## 两处必须说明的差异（不是漏做）
 *
 * 1. **没有进度条 / 「已完成 1/13」**：Web 版那份进度是写死的假数据。小程序还没有账号体系，
 *    后端也没有「某学员学到哪」的表 → 与其画一根假进度条，不如换成**课程概览**
 *    （章节数 / 课时数 / 每课时 20 分钟），这些是从课程树里真算出来的。
 * 2. **课时行的第二行是真实内容**：课时类型徽标（调音/视频/微测/转换/跟弹）+ 黄金 20 分钟配比
 *    + 关联视频（讲师 / 时长）+ 关联曲目，全部来自 CMS 的字段。
 *
 * ## 课时类型 → 中文
 * CMS 的 `LessonStep.type` 就是「黄金 20 分钟」五步闭环，所以徽标直接用这五个名字。
 */
const LESSON_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  tuning: { label: '调音热身', color: '#38bdf8' },
  video: { label: '视频新授', color: '#a78bfa' },
  chord_quiz: { label: '和弦微测', color: '#f59e0b' },
  pair_drill: { label: '转换冲刺', color: '#f472b6' },
  song_sync: { label: '曲目跟弹', color: '#10b981' },
};

/**
 * CMS 的 `coverColor` 存的是 **Tailwind 渐变 token**（`'from-amber-600 to-orange-700'`），
 * **不是颜色值**。
 * ⚠️ 实测踩过：直接写 `background-color:${coverColor}` 会得到
 * `background-color:from-amber-600 to-orange-700` —— 非法 CSS，**静默不生效**（色块透明）。
 * 小程序里没有 Tailwind，所以这里把 token 翻成 hex，再拼成 `linear-gradient`
 * （与 Web 版的 `bg-gradient-to-br` 同向，视觉一致）。
 */
const TW_GRADIENT_HEX: Record<string, string> = {
  'amber-600': '#d97706',
  'orange-700': '#c2410c',
  'emerald-600': '#059669',
  'teal-800': '#115e59',
  'indigo-600': '#4f46e5',
  'violet-700': '#6d28d9',
  'sky-600': '#0284c7',
  'blue-700': '#1d4ed8',
  'rose-600': '#e11d48',
  'pink-600': '#db2777',
  'slate-700': '#334155',
  'zinc-700': '#3f3f46',
};

function gradientFromTokens(tokens?: string): string {
  const source = tokens || 'from-emerald-600 to-teal-800';
  const matched = source.match(/(?:from|to)-[a-z]+-\d+/g) || [];
  const hexes = matched.map((t) => TW_GRADIENT_HEX[t.replace(/^(from|to)-/, '')] || '#10b981');
  const first = hexes[0] || '#10b981';
  const last = hexes[hexes.length - 1] || '#0f766e';
  return `linear-gradient(135deg, ${first}, ${last})`;
}

/** 单课时的总分钟数（时间配比求和；用于校验 20 分钟闭环） */
function lessonMinutes(lesson: LearnLesson): number {
  const t = lesson.timeAllocation;
  if (!t) return 0;
  return (
    (t.tuningMin || 0) + (t.videoMin || 0) + (t.quizMin || 0) + (t.drillMin || 0) + (t.songMin || 0)
  );
}

function formatDuration(sec: number): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 章节标题。
 * ⚠️ CMS 里章节标题**自己就带「第1章：」前缀**（教研录入习惯），
 * 再无条件加一次就成了「第 1 章：第1章：琴弦发声机理…」（实测踩到）。
 * 已经带序号就不再加，只补个「章」字的排版空格。
 */
function chapterTitle(index: number, title: string): string {
  const t = (title || '').trim();
  return /^第\s*\d+\s*章/.test(t) ? t : `第 ${index + 1} 章：${t}`;
}

export default function Learn() {
  const [stages, setStages] = useState<LearnStage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState<number | null>(null);
  /** 阶段筛选（'' = 全部） */
  const [stageFilter, setStageFilter] = useState('');
  /** 当前打开的课程（null = 课程列表） */
  const [course, setCourse] = useState<LearnCourse | null>(null);
  /** 当前打开的课时（null = 不看详情） */
  const [lesson, setLesson] = useState<LearnLesson | null>(null);
  /** 正在按歌名去已发布曲库里找曲目（点击反馈用） */
  const [openingSong, setOpeningSong] = useState(false);

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: 'Learn 课程' });
  });

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const data = await fetchCurriculumLearn();
      setStages(data.stages || []);
      setRevision(data.revision);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleStages = useMemo(
    () => (stageFilter ? stages.filter((s) => s.stageCode === stageFilter) : stages),
    [stages, stageFilter],
  );

  const totalCourses = useMemo(
    () => stages.reduce((sum, s) => sum + (s.courses?.length || 0), 0),
    [stages],
  );

  const backToList = () => {
    setCourse(null);
    setLesson(null);
  };

  /**
   * 曲目跟弹：按课时绑定的**歌名**去已发布曲库里找那首曲目，找到就跳到它的分段练习页。
   *
   * ⚠️ 为什么用歌名匹配而不是 id：CMS 的 `songBinding.songId` 指的是 CMS **本地音乐库**的条目
   * （localStorage），跟后端 `Score/Project` 的 id 不是一回事 → 拿它来查后端必然查不到。
   * 歌名对不上时**明确告知**（并在提示里说清下一步去哪发布），不静默失败。
   */
  const openBoundSong = async (target: LearnLesson, mode: 'practice' | 'eval' = 'practice') => {
    const name = (target.song?.songName || '').trim();
    if (!name) {
      Taro.showToast({ title: '该课时还没有绑定曲目', icon: 'none' });
      return;
    }
    setOpeningSong(true);
    try {
      /** 歌名匹配与 URL 拼接都在 `utils/boundSong.ts`（课时弹窗与课时视频页共用同一套） */
      const song = await findPublishedSongByName(name);
      if (!song) {
        Taro.showToast({
          title: `曲库里还没有《${name}》，请先在 CMS 发布这首曲目`,
          icon: 'none',
          duration: 3000,
        });
        return;
      }
      Taro.navigateTo({ url: mode === 'eval' ? songEvalUrl(song) : songPageUrl(song) });
    } catch (err) {
      Taro.showToast({
        title: `读曲库失败：${err instanceof Error ? err.message : String(err)}`,
        icon: 'none',
        duration: 3000,
      });
    } finally {
      setOpeningSong(false);
    }
  };

  return (
    <View className={pageClass('gm-learn-page')}>
      {/** ── 课程列表 ───────────────────────────────────────────── */}
      {!course && (
        <View>
          <View className="gm-learn-head">
            <View style="min-width:0;flex:1">
              <Text className="gm-learn-title">课程体系</Text>
              <Text className="gm-meta" style="display:block;margin-top:4px">
                由教研后台维护 · 共 {stages.length} 个阶段 / {totalCourses} 门课程
              </Text>
            </View>
            <View
              className="gm-learn-refresh"
              onClick={() => void load()}
            >
              <Text>↻</Text>
            </View>
          </View>

          {revision !== null && (
            /** 让"后端唯一数据源"这件事可见：CMS 改完课程后刷新，这里的版本号会变 */
            <Text className="gm-meta" style="display:block;padding:0 32px 16px">
              课程数据同步自后端（revision {revision}）
            </Text>
          )}

          {status === 'loading' && (
            <View className="gm-learn-state">
              <Text className="gm-meta">正在读取课程大纲…</Text>
            </View>
          )}

          {status === 'error' && (
            <View className="gm-learn-error">
              <Text>⚠ {error}</Text>
              <View className="gm-learn-retry" onClick={() => void load()}>
                <Text>重试</Text>
              </View>
            </View>
          )}

          {status === 'ready' && stages.length === 0 && (
            <View className="gm-learn-state">
              <Text className="gm-meta">后端课程大纲为空</Text>
              <Text className="gm-meta" style="display:block;opacity:0.7">
                请在 guitarmate-studio-cms 的「课程大纲」工作台里维护阶段与课程。
              </Text>
            </View>
          )}

          {/** 阶段筛选（对齐 Web 课程列表顶部的分组筛选） */}
          {status === 'ready' && stages.length > 0 && (
            <View className="gm-learn-filter">
              <Text
                className={`gm-learn-chip${!stageFilter ? ' gm-learn-chip--on' : ''}`}
                onClick={() => setStageFilter('')}
              >
                全部
              </Text>
              {stages.map((s) => (
                <Text
                  key={s.id}
                  className={`gm-learn-chip${stageFilter === s.stageCode ? ' gm-learn-chip--on' : ''}`}
                  onClick={() => setStageFilter(s.stageCode)}
                >
                  {s.stageCode}
                </Text>
              ))}
            </View>
          )}

          {visibleStages.map((stage) => (
            <View key={stage.id} className="gm-learn-stage">
              <View className="gm-learn-stage-head">
                <Text className="gm-learn-stage-code">{stage.stageCode}</Text>
                <View style="min-width:0;flex:1">
                  <Text className="gm-learn-stage-name">{stage.name}</Text>
                  {!!stage.focus && (
                    <Text className="gm-meta" style="display:block;margin-top:4px">
                      {stage.focus}
                    </Text>
                  )}
                </View>
              </View>

              {(stage.courses || []).length === 0 && (
                <Text className="gm-meta" style="display:block;padding:0 32px 24px">
                  该阶段下还没有课程（可在 CMS 里「新增专栏课程」）
                </Text>
              )}

              {(stage.courses || []).map((c) => {
                const lessonCount = (c.chapters || []).reduce(
                  (n, ch) => n + (ch.lessons?.length || 0),
                  0,
                );
                return (
                  <View
                    key={c.id}
                    className="gm-learn-course"
                    onClick={() => {
                      setCourse(c);
                      setLesson(null);
                    }}
                  >
                    {/**
                     * 课程卡 = Web 的「封面 Banner」：h-44 图 + 自下而上的黑眯 + 右上难度徽标 + 左下标题。
                     * ⚠️ 没封面图时用 CMS 的 `coverColor` 渐变兜底 —— 不塞占位照片（那是编造内容）。
                     */}
                    <View className="gm-learn-cover">
                      {c.coverImage ? (
                        <Image className="gm-learn-cover-img" src={c.coverImage} mode="aspectFill" />
                      ) : (
                        <View
                          className="gm-learn-cover-img"
                          style={`background-image:${gradientFromTokens(c.coverColor)}`}
                        />
                      )}
                      <View className="gm-learn-cover-scrim" />
                      <Text className="gm-learn-cover-level">{c.targetLevel || '未标注难度'}</Text>
                      <View className="gm-learn-cover-text">
                        <Text className="gm-learn-cover-title">{c.title}</Text>
                        <Text className="gm-learn-cover-sub">{c.subtitle || '（无副标题）'}</Text>
                      </View>
                    </View>

                    <View className="gm-learn-course-foot">
                      <Text className="gm-meta">
                        {(c.chapters || []).length} 章 · {lessonCount} 课时
                      </Text>
                      <Text className="gm-learn-arrow">›</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {/** ── 课程详情：章节 + 课时 ────────────────────────────────── */}
      {course && (
        <View>
          <View className="gm-learn-back" onClick={backToList}>
            <Text>‹ 返回课程列表</Text>
          </View>

          <View className="gm-learn-head">
            <View style="min-width:0;flex:1">
              <Text className="gm-learn-title">{course.title}</Text>
              <Text className="gm-meta" style="display:block;margin-top:4px">
                {course.subtitle || '（无副标题）'} · {course.targetLevel || '未标注难度'}
              </Text>
            </View>
          </View>

          {/**
            * 课程概览（**代替 Web 版的假进度条**）：
            * 小程序没有账号体系、后端也没有「学员学到哪」的表 → 画进度条就是假的。
            * 这里只给能真算出来的数字。
            */}
          <View className="gm-card">
            <Text className="gm-section-title">课程概览</Text>
            <View style="display:flex;margin-top:20px">
              {[
                { v: (course.chapters || []).length, l: '章节' },
                {
                  v: (course.chapters || []).reduce((n, ch) => n + (ch.lessons?.length || 0), 0),
                  l: '课时',
                },
                {
                  v: (course.chapters || []).reduce(
                    (n, ch) => n + ch.lessons.reduce((m, l) => m + lessonMinutes(l), 0),
                    0,
                  ),
                  l: '总分钟',
                },
              ].map((m) => (
                <View key={m.l} style="flex:1;display:flex;flex-direction:column;align-items:center">
                  <Text className="gm-metric-value" style="color:#10b981">
                    {m.v}
                  </Text>
                  <Text className="gm-metric-label">{m.l}</Text>
                </View>
              ))}
            </View>
            <Text className="gm-meta" style="display:block;margin-top:20px;opacity:0.7">
              每个课时按「黄金 20 分钟」闭环编排：调音热身 → 视频新授 → 和弦微测 → 转换冲刺 → 曲目跟弹。
            </Text>
          </View>

          {/** 课程还没有章节（CMS 里刚建的课程常见）→ 明确说明，不要留空白区 */}
          {(course.chapters || []).length === 0 && (
            <View className="gm-learn-chapter">
              <Text className="gm-meta">
                该课程还没有章节（可在 CMS「课程大纲」里选中它 →「新增章节」→「新增课时」）。
              </Text>
            </View>
          )}

          {(course.chapters || []).map((chapter: LearnChapter, chIdx) => (
            <View key={chapter.id} className="gm-learn-chapter">
              <Text className="gm-learn-chapter-title">
                {chapterTitle(chIdx, chapter.title)}
              </Text>
              {!!chapter.description && (
                <Text className="gm-meta" style="display:block;margin-top:4px">
                  {chapter.description}
                </Text>
              )}

              <View style="margin-top:16px">
                {chapter.lessons.map((item: LearnLesson) => {
                  const type = LESSON_TYPE_LABEL[item.type] || {
                    label: item.type,
                    color: '#a1a1aa',
                  };
                  const mins = lessonMinutes(item);
                  return (
                    <View
                      key={item.id}
                      className="gm-learn-lesson"
                      onClick={() => setLesson(item)}
                    >
                      <View style="min-width:0;flex:1">
                        <Text className="gm-learn-lesson-title">{item.title}</Text>
                        <View className="gm-learn-lesson-meta">
                          <Text
                            className="gm-learn-type"
                            style={`color:${type.color};border-color:${type.color}55`}
                          >
                            {type.label}
                          </Text>
                          <Text className="gm-meta" style="margin-left:12px">
                            {mins > 0 ? `${mins} 分钟` : '未配置时长'}
                            {item.video
                              ? ` · 视频 ${formatDuration(item.video.durationSec)}${
                                  item.video.playable ? ' · ▶ 可播放' : ' · 暂无视频源'
                                }`
                              : ''}
                          </Text>
                        </View>
                        {!!item.song?.songName && (
                          <Text className="gm-learn-song">
                            ♪ 跟弹：{item.song.songName}
                            {item.song.originalArtist ? ` — ${item.song.originalArtist}` : ''}
                          </Text>
                        )}
                      </View>
                      <Text className="gm-learn-arrow">›</Text>
                    </View>
                  );
                })}
                {chapter.lessons.length === 0 && (
                  <Text className="gm-meta">本章还没有课时（可在 CMS 里「新增课时」）</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/** ── 课时详情（点课时行打开） ─────────────────────────────── */}
      {lesson && (
        <View className="gm-modal-mask" onClick={() => setLesson(null)}>
          <View className="gm-modal-card" onClick={(e) => e.stopPropagation()}>
            <View className="gm-modal-head">
              <Text className="gm-modal-title">{lesson.title}</Text>
              <Text className="gm-modal-close" onClick={() => setLesson(null)}>
                ✕
              </Text>
            </View>

            <View style="margin-top:24px">
              <Text className="gm-section-title">课时类型</Text>
              <Text className="gm-meta" style="display:block;margin-top:8px">
                {(LESSON_TYPE_LABEL[lesson.type] || { label: lesson.type }).label}
              </Text>

              <Text className="gm-section-title" style="display:block;margin-top:24px">
                黄金 20 分钟配比
              </Text>
              <View style="margin-top:8px">
                {[
                  ['调音热身', lesson.timeAllocation?.tuningMin],
                  ['视频新授', lesson.timeAllocation?.videoMin],
                  ['和弦微测', lesson.timeAllocation?.quizMin],
                  ['转换冲刺', lesson.timeAllocation?.drillMin],
                  ['曲目跟弹', lesson.timeAllocation?.songMin],
                ].map(([label, v]) => (
                  <View key={String(label)} className="gm-modal-row">
                    <Text className="gm-meta">{label}</Text>
                    <Text className="gm-modal-value">{Number(v) || 0} 分钟</Text>
                  </View>
                ))}
                <View className="gm-modal-row">
                  <Text className="gm-meta">合计</Text>
                  <Text className="gm-modal-value" style="color:#10b981">
                    {lessonMinutes(lesson)} 分钟
                  </Text>
                </View>
              </View>

              {lesson.video && (
                <View>
                  <Text className="gm-section-title" style="display:block;margin-top:24px">
                    关联视频
                  </Text>
                  <Text className="gm-meta" style="display:block;margin-top:8px">
                    {lesson.video.title} · {lesson.video.instructor} ·{' '}
                    {formatDuration(lesson.video.durationSec)} · {lesson.video.resolution}
                  </Text>
                  {/**
                    * 视频源状态：弹窗里就写清「能不能播」，不用等点进去才发现没有源。
                    * ⚠️ 只信后端投影的 `playable`（= 真的有 videoUrl），不信 CMS 里那个写死的状态枚举。
                    */}
                  <Text
                    className="gm-meta"
                    style={`display:block;margin-top:6px;color:${
                      lesson.video.playable ? '#10b981' : '#f59e0b'
                    }`}
                  >
                    {lesson.video.playable
                      ? `▶ 视频源已就绪（${lesson.video.keyPoints.length} 个打点，可跳转）`
                      : '⚠ 还没有可播放的视频源（后台视频库的 videoUrl 为空）'}
                  </Text>
                  {lesson.video.keyPoints.length > 0 && (
                    <View style="margin-top:8px">
                      {lesson.video.keyPoints.map((kp) => (
                        <Text key={`${kp.timeSec}-${kp.title}`} className="gm-meta" style="display:block">
                          ▸ {formatDuration(kp.timeSec)} {kp.title}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/**
                * 课时动作：按类型跳到**已有的真页面**（都是能用的功能，不是占位按钮）。
                * ```
                * tuning      → Tune 调音器（麦克风听弦）
                * chord_quiz  → Tools 和弦库（指法 / 试听）
                * pair_drill  → Tools 和弦库（换和弦 = 指法切换）
                * song_sync   → 曲目分段练习（按歌名去已发布曲库里找）
                * video       → 课时视频播放页（**现在有真产物了**：后端直传/转码 + `/learn` 投影）
                * ```
                * 视频入口**不再按 type 卡**，见下面那段注释。
                */}
              <Text className="gm-section-title" style="display:block;margin-top:24px">
                开始练习
              </Text>
              <View className="gm-learn-actions">
                {lesson.type === 'tuning' && (
                  <View
                    className="gm-learn-jump"
                    onClick={() =>
                      Taro.navigateTo({ url: '/pages/tune/index' })
                    }
                  >
                    <Text>🎤 去调音（标准调弦 · 麦克风听弦）</Text>
                  </View>
                )}

                {(lesson.type === 'chord_quiz' || lesson.type === 'pair_drill') && (
                  <View
                    className="gm-learn-jump"
                    onClick={() => Taro.navigateTo({ url: '/pages/tools/index' })}
                  >
                    <Text>
                      {lesson.type === 'pair_drill'
                        ? '🧰 去和弦库（换和弦 = 指法切换）'
                        : '🧰 去和弦库（和弦指法 / 拨弦试听）'}
                    </Text>
                  </View>
                )}

                {lesson.type === 'song_sync' && (
                  <View className="gm-learn-jump" onClick={() => void openBoundSong(lesson)}>
                    <Text>
                      🎸 跟弹《{lesson.song?.songName || '（未绑定曲目）'}》
                      {openingSong ? ' · 正在找…' : '（打开分段练习）'}
                    </Text>
                  </View>
                )}

                {/** 跟弹的第二种入口：直接进 AI 听音评测（同一首歌，选段后开始） */}
                {lesson.type === 'song_sync' && (
                  <View
                    className="gm-learn-jump"
                    onClick={() => void openBoundSong(lesson, 'eval')}
                  >
                    <Text>🎤 AI 跟弹评测（听你弹的音对不对）</Text>
                  </View>
                )}
              </View>

              {/**
                * 播放课时视频。
                *
                * ⚠️ 门槛从「`type === 'video'`」改成「**后端投影说 `playable`**」：
                * 视频是挂在**课时**上的（`videoIds`），而课时 `type` 描述的是「课堂上练什么」——
                * 第01课「名师精讲」的 type 是 `chord_quiz`，按 type 卡就会出现
                * 「明明在 CMS 里绑好了视频、也有打点，C 端却进不去」。
                */}
              {lesson.video?.playable && (
                <View
                  className="gm-learn-jump"
                  onClick={() =>
                    Taro.navigateTo({ url: `/pages/video/index?id=${encodeURIComponent(lesson.id)}` })
                  }
                >
                  <Text>▶ 播放课程视频（{lesson.video.keyPoints.length} 个打点）</Text>
                </View>
              )}
              {lesson.type === 'video' && !lesson.video?.playable && (
                <Text className="gm-meta" style="display:block;margin-top:16px;opacity:0.7;line-height:1.7">
                  这个课时还没有可播放的视频源（后台视频库的 videoUrl 为空），所以不给播放按钮。
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      <BottomNav active="learn" />
    </View>
  );
}
