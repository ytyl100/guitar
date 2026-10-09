import { View, Text, Image } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CURRENT_USER_ID,
  fetchChordDrills,
  fetchCourses,
  fetchTeachingVideos,
  fetchUser,
  fetchUserGroups,
  type ChordDrill,
  type Course,
  type CourseChapter,
  type CourseItem,
  type TeachingVideo,
} from '../../services/api';
import BottomNav from '../../components/BottomNav';
import { findPublishedSongForCourseItem, songEvalUrl, songPageUrl } from '../../utils/boundSong';
import { pageClass } from '../../utils/settings';

/**
 * 课程（Learn tab）
 * ================
 *
 * ## 数据来源（本页已换源）
 *
 * 读 **`GET /api/courses`** —— 也就是 `guitar-ai-audio` **学员端那套课纲**：
 * 教师在教研侧发布 → 落到 `guitarmate-audio-backend` 的 `Course` 表 → 这里读。
 *
 * ⚠️ 与 `GET /api/curriculum/learn`（CMS 课纲工作台那棵「阶段 → 课程 → 章节 → 课时」树）
 * **不是同一套数据**，不要混用：
 *
 * ```
 * /api/curriculum/learn  阶段 → 课程 → 章节 → 课时（黄金 20 分钟五步：调音/视频/微测/转换/跟弹）
 * /api/courses           课程 → 章节 → 内容项（三种：video / chord_drill / transcription_score）
 * ```
 *
 * 需求是「学员在微信小程序上查看教师在 guitar-ai-audio 发布的课纲」，所以用后者。
 * CMS 那套仍然保留（教研侧排课用），只是不再出现在这个页面。
 *
 * ## 顶部课程切换（需求：普通注册用户只见基础课，学员可切换）
 *
 * `Course.isSystemBasic` 把课分成两组：
 *
 * - `true`  = **系统基础课**（平台内置，人人可见）
 * - `false` = **教师/机构发布的课**（学员及以上可见）
 *
 * 「谁是学员」**不看角色名，看用户组等级**（`/api/user-groups` 的 `level`）。
 * 等级是**倒序**的 —— 数字越小权限越高：
 *
 * ```
 * 1 super_admin  2 institution  3 teacher  4 student     ← 学员及以上：可切换
 * 5 plus         6 trial_guest  7 registered  8 anonymous ← 普通注册/试用/游客：只看基础课
 * ```
 *
 * 为什么用 `level` 而不是 `role === 'student'`：角色表是**可配置的**（教研侧能加组），
 * 写死角色名以后加一个「高级学员」组就漏了。等级读不到时按**最小权限**处理。
 *
 * ## 内容项类型 → 中文
 * `CourseItem.type` 只有三种，各自对应一个真页面（见内容项弹层里的按钮）。
 */
const ITEM_TYPE_META: Record<string, { label: string; color: string }> = {
  video: { label: '视频教程', color: '#a78bfa' },
  chord_drill: { label: '和弦微测', color: '#f59e0b' },
  transcription_score: { label: '乐谱练习', color: '#10b981' },
};

/** 学员等级门槛：`level <= 4`（student）即「学员及以上」，可切换教师发布的课 */
const STUDENT_LEVEL = 4;

/**
 * 课程封面兜底渐变。
 *
 * ⚠️ CMS 那套课的 `coverColor` 存的是 **Tailwind 渐变 token**（`'from-amber-600 to-orange-700'`），
 * **不是颜色值** —— 直接写 `background-color:${coverColor}` 会得到非法 CSS，**静默不生效**（透明色块）。
 * 这套课（`/api/courses`）只给 `coverImage`，没有 token，所以这里只用默认渐变兜底：
 * 没封面图时给一块**真渐变**，而不是塞一张占位照片（那是编造内容）。
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

/**
 * 章节标题。
 * ⚠️ 章节标题**自己可能就带「第1章：」前缀**（教研录入习惯），
 * 再无条件加一次就成了「第 1 章：第1章：琴弦发声机理…」（实测踩到）。
 * 已经带序号就不再加，只补个「章」字的排版空格。
 */
function chapterTitle(index: number, title: string): string {
  const t = (title || '').trim();
  return /^第\s*\d+\s*章/.test(t) ? t : `第 ${index + 1} 章：${t}`;
}

export default function Learn() {
  /** 已发布课程（`/api/courses?status=published`） */
  const [courses, setCourses] = useState<Course[]>([]);
  /** 教学视频索引：`item.videoId` → 记录（讲师 / 时长 / 打点只在视频表里） */
  const [videos, setVideos] = useState<Record<string, TeachingVideo>>({});
  /** 和弦微测索引：`item.chordDrillId` → 组合（和弦与 BPM 阶梯只在微测表里） */
  const [drills, setDrills] = useState<Record<string, ChordDrill>>({});
  /** 当前身份（小程序还没有登录，用 `CURRENT_USER_ID` 占位） */
  const [who, setWho] = useState<{ id: string; name: string; role: string } | null>(null);
  /** 用户组等级（`level` **越小权限越高**：1 超管 … 4 学员 … 8 匿名）；null = 没读到 */
  const [groupLevel, setGroupLevel] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  /**
   * 顶部课程分组：
   * `system` = 系统基础课（人人可见）；`teacher` = 教师/机构发布的课（学员及以上可见）。
   * 默认落在 `system` —— 权限不足的人看到的就是这一组。
   */
  const [tab, setTab] = useState<'system' | 'teacher'>('system');
  /** 当前打开的课程（null = 课程列表） */
  const [course, setCourse] = useState<Course | null>(null);
  /** 当前打开的内容项（null = 不看详情） */
  const [item, setItem] = useState<CourseItem | null>(null);
  /** 正在按曲名去曲库找谱（点击反馈用） */
  const [openingSong, setOpeningSong] = useState(false);

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: 'Learn 课程' });
  });

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      /**
       * 五个请求并行。
       *
       * ⚠️ 故意用 `Promise.all` 而不是 `allSettled`：后端挂了就要**明确报错**，
       * 退化成「空课程列表」会被误读成「课程被删了」（/profile 页同样踩过这个坑）。
       */
      const [courseList, videoList, drillList, me, groups] = await Promise.all([
        fetchCourses({ status: 'published' }),
        fetchTeachingVideos(),
        fetchChordDrills(),
        fetchUser(CURRENT_USER_ID),
        fetchUserGroups(),
      ]);
      setCourses(courseList);
      setVideos(Object.fromEntries(videoList.map((v) => [v.id, v])));
      setDrills(Object.fromEntries(drillList.map((d) => [d.id, d])));
      setWho(me ? { id: me.id, name: me.name, role: me.role } : null);
      /** 角色 → 用户组等级（两者用同一个 `code`） */
      setGroupLevel(groups.find((g) => g.code === (me?.role || ''))?.level ?? null);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 能不能切到「教师发布的课」？
   * 等级读不到（后端旧版 / 用户组被删）时按**最小权限**处理 —— 只看基础课。
   */
  const canSwitch = groupLevel !== null && groupLevel <= STUDENT_LEVEL;

  const systemCourses = useMemo(() => courses.filter((c) => c.isSystemBasic === true), [courses]);
  const teacherCourses = useMemo(() => courses.filter((c) => c.isSystemBasic !== true), [courses]);

  /**
   * 当前要展示的课。
   * ⚠️ 无权限时**强制**基础课 —— 不能只靠"不渲染切换条"来挡（`tab` 是 state，不该是权限的唯一闸口）。
   */
  const visibleCourses = canSwitch && tab === 'teacher' ? teacherCourses : systemCourses;

  /** 一门课的内容项总数 */
  const itemCount = useCallback(
    (c: Course) => (c.chapters || []).reduce((n, ch) => n + (ch.items?.length || 0), 0),
    [],
  );

  /** 一门课里某一类内容项的数量 */
  const countByType = useCallback(
    (c: Course, type: CourseItem['type']) =>
      (c.chapters || []).reduce(
        (n, ch) => n + (ch.items || []).filter((i) => i.type === type).length,
        0,
      ),
    [],
  );

  const backToList = () => {
    setCourse(null);
    setItem(null);
  };

  /**
   * 乐谱练习：把课程内容项解析成一首**已发布曲目**，然后跳它的练习页。
   *
   * ⚠️ **不能拿 `item.title` 去曲库找**：那是教研自拟的练习名
   * （如「基础扫弦练习曲 · 72 BPM」），曲库里根本没有这个名字。
   * 真关联是 `item.scoreId`（→ 曲库条目 → 已发布乐谱），解析链路写在
   * `utils/boundSong.ts` 的 `findPublishedSongForCourseItem()` 里。
   */
  const openBoundSong = async (target: CourseItem, mode: 'practice' | 'eval' = 'practice') => {
    setOpeningSong(true);
    try {
      const song = await findPublishedSongForCourseItem(target);
      if (!song) {
        Taro.showToast({
          title: `曲库里还没有《${target.scoreTitle || target.title}》，请先发布这首曲目`,
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

  /** 当前内容项的徽标（type → 中文 + 配色） */
  const itemMeta = item ? ITEM_TYPE_META[item.type] || { label: item.type, color: '#a1a1aa' } : null;
  /** 内容项对应的视频记录（`/api/videos`） */
  const itemVideo = item?.videoId ? videos[item.videoId] : undefined;
  /** 内容项对应的和弦微测组合（`/api/drills`） */
  const itemDrill = item?.chordDrillId ? drills[item.chordDrillId] : undefined;

  return (
    <View className={pageClass('gm-learn-page')}>
      {/** ── 课程列表 ───────────────────────────────────────────── */}
      {!course && (
        <View>
          <View className="gm-learn-head">
            <View style="min-width:0;flex:1">
              <Text className="gm-learn-title">课程体系</Text>
              <Text className="gm-meta" style="display:block;margin-top:4px">
                {who ? `${who.name} · ${who.role}` : '读取身份…'} · 本组 {visibleCourses.length} 门课
              </Text>
            </View>
            <View className="gm-learn-refresh" onClick={() => void load()}>
              <Text>↻</Text>
            </View>
          </View>

          {/**
            * 顶部课程切换。
            * 只在**有权限**时给出两个分组 —— 普通注册/试用用户看不到切换条，
            * 下面那行说明会告诉他们为什么、以及怎么才看得到教师课纲。
            */}
          {status === 'ready' && canSwitch && (
            <View className="gm-learn-filter">
              <Text
                className={`gm-learn-chip${tab === 'system' ? ' gm-learn-chip--on' : ''}`}
                onClick={() => setTab('system')}
              >
                系统基础课
              </Text>
              <Text
                className={`gm-learn-chip${tab === 'teacher' ? ' gm-learn-chip--on' : ''}`}
                onClick={() => setTab('teacher')}
              >
                教师发布的课
              </Text>
            </View>
          )}

          {status === 'ready' && !canSwitch && (
            <Text className="gm-meta" style="display:block;padding:0 32px 16px;line-height:1.7">
              当前身份（{who?.role || '未知'}）只能查看系统基础课。加入教师课程（学员及以上）后，
              这里会出现「系统基础课 / 教师发布的课」切换。
            </Text>
          )}

          {status === 'loading' && (
            <View className="gm-learn-state">
              <Text className="gm-meta">正在读取课程…</Text>
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

          {status === 'ready' && visibleCourses.length === 0 && (
            <View className="gm-learn-state">
              <Text className="gm-meta">
                {canSwitch && tab === 'teacher' ? '还没有教师发布的课程' : '后端还没有已发布的系统基础课'}
              </Text>
              <Text className="gm-meta" style="display:block;opacity:0.7">
                课程由教师在 guitar-ai-audio / 教研后台发布，发布后会出现在这里。
              </Text>
            </View>
          )}

          {/** 一组课程：沿用原来的「分组头 + 课程卡」两段式（原来按阶段分组，现在按来源分组） */}
          {status === 'ready' && visibleCourses.length > 0 && (
            <View className="gm-learn-stage">
              <View className="gm-learn-stage-head">
                <Text className="gm-learn-stage-code">
                  {canSwitch && tab === 'teacher' ? 'TEACHER' : 'BASIC'}
                </Text>
                <View style="min-width:0;flex:1">
                  <Text className="gm-learn-stage-name">
                    {canSwitch && tab === 'teacher' ? '教师发布的课程' : '系统基础课程'}
                  </Text>
                  <Text className="gm-meta" style="display:block;margin-top:4px">
                    {canSwitch && tab === 'teacher'
                      ? '由你的教师/机构发布，跟随教师课纲安排'
                      : '平台内置、人人可学的入门主线'}
                  </Text>
                </View>
              </View>

              {visibleCourses.map((c) => (
                <View
                  key={c.id}
                  className="gm-learn-course"
                  onClick={() => {
                    setCourse(c);
                    setItem(null);
                  }}
                >
                  {/**
                   * 课程卡 = Web 的「封面 Banner」：图 + 自下而上的黑眯 + 右上难度徽标 + 左下标题。
                   * ⚠️ 没封面图时用**渐变**兜底 —— 不塞占位照片（那是编造内容）。
                   */}
                  <View className="gm-learn-cover">
                    {c.coverImage ? (
                      <Image className="gm-learn-cover-img" src={c.coverImage} mode="aspectFill" />
                    ) : (
                      <View
                        className="gm-learn-cover-img"
                        style={`background-image:${gradientFromTokens()}`}
                      />
                    )}
                    <View className="gm-learn-cover-scrim" />
                    <Text className="gm-learn-cover-level">{c.level || '未标注难度'}</Text>
                    <View className="gm-learn-cover-text">
                      <Text className="gm-learn-cover-title">{c.title}</Text>
                      <Text className="gm-learn-cover-sub">{c.subtitle || '（无副标题）'}</Text>
                    </View>
                  </View>

                  <View className="gm-learn-course-foot">
                    <Text className="gm-meta">
                      {c.teacherName || '平台'} · {(c.chapters || []).length} 章 · {itemCount(c)} 项
                      {c.isFree ? ' · 免费' : ''}
                    </Text>
                    <Text className="gm-learn-arrow">›</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/** ── 课程详情：章节 + 内容项 ──────────────────────────────── */}
      {course && (
        <View>
          <View className="gm-learn-back" onClick={backToList}>
            <Text>‹ 返回课程列表</Text>
          </View>

          <View className="gm-learn-head">
            <View style="min-width:0;flex:1">
              <Text className="gm-learn-title">{course.title}</Text>
              <Text className="gm-meta" style="display:block;margin-top:4px">
                {course.subtitle || '（无副标题）'} · {course.level || '未标注难度'}
              </Text>
            </View>
          </View>

          {/** 课程概览：只给能真算出来的数字（小程序没有「学员学到哪」的表，不画假进度条） */}
          <View className="gm-card">
            <Text className="gm-section-title">课程概览</Text>
            <View style="display:flex;margin-top:20px">
              {[
                { v: (course.chapters || []).length, l: '章节' },
                { v: itemCount(course), l: '内容项' },
                { v: countByType(course, 'video'), l: '视频' },
              ].map((m) => (
                <View key={m.l} style="flex:1;display:flex;flex-direction:column;align-items:center">
                  <Text className="gm-metric-value" style="color:#10b981">
                    {m.v}
                  </Text>
                  <Text className="gm-metric-label">{m.l}</Text>
                </View>
              ))}
            </View>

            <View className="gm-modal-row" style="margin-top:20px">
              <Text className="gm-meta">讲师 / 机构</Text>
              <Text className="gm-modal-value">
                {course.teacherName || '未标注'}
                {course.institutionName ? ` · ${course.institutionName}` : ''}
              </Text>
            </View>
            <View className="gm-modal-row">
              <Text className="gm-meta">课程归属</Text>
              <Text className="gm-modal-value">
                {course.isSystemBasic ? '系统基础课' : '教师发布'} · {course.version || '—'}
              </Text>
            </View>
            <View className="gm-modal-row">
              <Text className="gm-meta">内容构成</Text>
              <Text className="gm-modal-value">
                {countByType(course, 'video')} 视频 · {countByType(course, 'chord_drill')} 微测 ·{' '}
                {countByType(course, 'transcription_score')} 乐谱
              </Text>
            </View>

            {!!course.description && (
              <Text className="gm-meta" style="display:block;margin-top:20px;line-height:1.8">
                {course.description}
              </Text>
            )}
          </View>

          {/** 还没有章节（教师刚建的课程常见）→ 明确说明，不留空白区 */}
          {(course.chapters || []).length === 0 && (
            <View className="gm-learn-chapter">
              <Text className="gm-meta">该课程还没有章节（教师在课纲工作台里补充后会出现在这里）。</Text>
            </View>
          )}

          {(course.chapters || []).map((chapter: CourseChapter, chIdx) => (
            <View key={chapter.id} className="gm-learn-chapter">
              <Text className="gm-learn-chapter-title">{chapterTitle(chIdx, chapter.title)}</Text>
              {!!chapter.description && (
                <Text className="gm-meta" style="display:block;margin-top:4px">
                  {chapter.description}
                </Text>
              )}

              <View style="margin-top:16px">
                {(chapter.items || []).map((it: CourseItem) => {
                  const type = ITEM_TYPE_META[it.type] || { label: it.type, color: '#a1a1aa' };
                  const v = it.videoId ? videos[it.videoId] : undefined;
                  const drill = it.chordDrillId ? drills[it.chordDrillId] : undefined;
                  return (
                    <View key={it.id} className="gm-learn-lesson" onClick={() => setItem(it)}>
                      <View style="min-width:0;flex:1">
                        <Text className="gm-learn-lesson-title">{it.title}</Text>
                        <View className="gm-learn-lesson-meta">
                          <Text
                            className="gm-learn-type"
                            style={`color:${type.color};border-color:${type.color}55`}
                          >
                            {type.label}
                          </Text>
                          <Text className="gm-meta" style="margin-left:12px">
                            {it.type === 'video'
                              ? `${v?.durationFormatted || '未标注时长'}${
                                  v?.videoUrl ? ' · ▶ 可播放' : ' · 暂无视频源'
                                }`
                              : it.type === 'chord_drill'
                                ? `${(drill?.chords || it.chords || []).length} 个和弦 · 目标 ${
                                    drill?.bpmTarget || it.bpmTarget || '—'
                                  } BPM`
                                : `${it.scoreTempo || '—'} BPM`}
                          </Text>
                        </View>
                        {it.type === 'chord_drill' && (drill?.chords || it.chords || []).length > 0 && (
                          <Text className="gm-learn-song">
                            ♬ {(drill?.chords || it.chords || []).join(' → ')}
                          </Text>
                        )}
                        {it.type === 'transcription_score' && !!it.scoreTitle && (
                          <Text className="gm-learn-song">
                            ♪ {it.scoreTitle}
                            {it.scoreArtist ? ` — ${it.scoreArtist}` : ''}
                          </Text>
                        )}
                      </View>
                      <Text className="gm-learn-arrow">›</Text>
                    </View>
                  );
                })}
                {(chapter.items || []).length === 0 && (
                  <Text className="gm-meta">本章还没有内容项</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/** ── 内容项详情（点内容项行打开） ─────────────────────────── */}
      {item && itemMeta && (
        <View className="gm-modal-mask" onClick={() => setItem(null)}>
          <View className="gm-modal-card" onClick={(e) => e.stopPropagation()}>
            <View className="gm-modal-head">
              <Text className="gm-modal-title">{item.title}</Text>
              <Text className="gm-modal-close" onClick={() => setItem(null)}>
                ✕
              </Text>
            </View>

            <View style="margin-top:24px">
              <Text className="gm-section-title">内容类型</Text>
              <View style="margin-top:8px">
                <Text
                  className="gm-learn-type"
                  style={`color:${itemMeta.color};border-color:${itemMeta.color}55`}
                >
                  {itemMeta.label}
                </Text>
              </View>
              {!!item.description && (
                <Text className="gm-meta" style="display:block;margin-top:16px;line-height:1.8">
                  {item.description}
                </Text>
              )}

              {/** ── 视频教程 ── */}
              {item.type === 'video' && (
                <View>
                  <Text className="gm-section-title" style="display:block;margin-top:24px">
                    视频信息
                  </Text>
                  <View className="gm-modal-row">
                    <Text className="gm-meta">讲师</Text>
                    <Text className="gm-modal-value">{course?.teacherName || '未标注'}</Text>
                  </View>
                  <View className="gm-modal-row">
                    <Text className="gm-meta">时长</Text>
                    <Text className="gm-modal-value">{itemVideo?.durationFormatted || '未标注'}</Text>
                  </View>
                  <View className="gm-modal-row">
                    <Text className="gm-meta">关键打点</Text>
                    <Text className="gm-modal-value">{itemVideo?.cuePoints?.length || 0} 个</Text>
                  </View>
                  {/**
                    * 视频源状态：弹窗里就写清「能不能播」，不用等点进去才发现没有源。
                    * ⚠️ 只信 `videoUrl` 是否为空，不信任何状态枚举（CMS 里那个状态是写死的）。
                    */}
                  <Text
                    className="gm-meta"
                    style={`display:block;margin-top:8px;color:${
                      itemVideo?.videoUrl ? '#10b981' : '#f59e0b'
                    }`}
                  >
                    {itemVideo?.videoUrl
                      ? `▶ 视频源已就绪（${itemVideo.cuePoints?.length || 0} 个打点，可跳转）`
                      : '⚠ 还没有可播放的视频源'}
                  </Text>
                  {!itemVideo?.videoUrl && (
                    <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.8">
                      教师还没有给这个课时填视频地址，所以不给播放按钮（不摆一个点了没反应的播放器）。
                    </Text>
                  )}
                </View>
              )}

              {/** ── 和弦微测 ── */}
              {item.type === 'chord_drill' && (
                <View>
                  <Text className="gm-section-title" style="display:block;margin-top:24px">
                    微测设定
                  </Text>
                  <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.9">
                    {(itemDrill?.chords || item.chords || []).join('  →  ') || '未配置和弦'}
                  </Text>
                  <View className="gm-modal-row">
                    <Text className="gm-meta">起始速度</Text>
                    <Text className="gm-modal-value">{itemDrill?.bpmStart ?? '—'} BPM</Text>
                  </View>
                  <View className="gm-modal-row">
                    <Text className="gm-meta">目标速度</Text>
                    <Text className="gm-modal-value" style="color:#10b981">
                      {itemDrill?.bpmTarget ?? item.bpmTarget ?? '—'} BPM
                    </Text>
                  </View>
                  {!!itemDrill?.steps?.length && (
                    <Text className="gm-meta" style="display:block;margin-top:8px">
                      速度阶梯：{itemDrill.steps.join(' → ')} BPM
                    </Text>
                  )}
                  {!!itemDrill?.description && (
                    <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.8">
                      {itemDrill.description}
                    </Text>
                  )}
                </View>
              )}

              {/** ── 乐谱练习 ── */}
              {item.type === 'transcription_score' && (
                <View>
                  <Text className="gm-section-title" style="display:block;margin-top:24px">
                    曲谱信息
                  </Text>
                  <View className="gm-modal-row">
                    <Text className="gm-meta">曲名</Text>
                    <Text className="gm-modal-value">{item.scoreTitle || item.title}</Text>
                  </View>
                  <View className="gm-modal-row">
                    <Text className="gm-meta">原唱 / 艺人</Text>
                    <Text className="gm-modal-value">{item.scoreArtist || '—'}</Text>
                  </View>
                  <View className="gm-modal-row">
                    <Text className="gm-meta">速度</Text>
                    <Text className="gm-modal-value">
                      {item.scoreTempo ? `${item.scoreTempo} BPM` : '—'}
                    </Text>
                  </View>
                </View>
              )}

              {/**
                * 内容项动作：按类型跳到**已有的真页面**（都是能用的功能，不是占位按钮）。
                * ```
                * video               → 课时视频页（完整页面：标题 + 播放器 + 打点 + 开练入口）
                * chord_drill         → 和弦库（指法 / 拨弦试听）
                * transcription_score → 乐谱练习页 / AI 跟弹评测（按曲名去曲库找）
                * ```
                */}
              <Text className="gm-section-title" style="display:block;margin-top:24px">
                开始练习
              </Text>
              <View className="gm-learn-actions">
                {item.type === 'video' && !!itemVideo?.videoUrl && (
                  <View
                    className="gm-learn-jump"
                    onClick={() =>
                      Taro.navigateTo({
                        url: `/pages/video/index?itemId=${encodeURIComponent(item.id)}`,
                      })
                    }
                  >
                    <Text>▶ 播放视频教程（{itemVideo.cuePoints?.length || 0} 个打点）</Text>
                  </View>
                )}

                {item.type === 'chord_drill' && (
                  <View
                    className="gm-learn-jump"
                    onClick={() =>
                      Taro.navigateTo({
                        url: `/pages/chord-drill/index?itemId=${encodeURIComponent(item.id)}`,
                      })
                    }
                  >
                    <Text>🎹 进入和弦微测（目标 {itemDrill?.bpmTarget ?? item.bpmTarget ?? '—'} BPM）</Text>
                  </View>
                )}

                {/** 指法不熟时先去和弦库看一眼：这是同一节课的“预习”入口 */}
                {item.type === 'chord_drill' && (
                  <View
                    className="gm-learn-jump"
                    onClick={() => Taro.navigateTo({ url: '/pages/tools/index' })}
                  >
                    <Text>🧰 去和弦库（和弦指法 / 拨弦试听）</Text>
                  </View>
                )}

                {item.type === 'transcription_score' && (
                  <View className="gm-learn-jump" onClick={() => void openBoundSong(item, 'practice')}>
                    <Text>
                      🎸 打开乐谱练习《{item.scoreTitle || item.title}》
                      {openingSong ? ' · 正在找…' : ''}
                    </Text>
                  </View>
                )}

                {item.type === 'transcription_score' && (
                  <View className="gm-learn-jump" onClick={() => void openBoundSong(item, 'eval')}>
                    <Text>🎤 AI 跟弹评测（听你弹的音对不对）</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

      <BottomNav active="learn" />
    </View>
  );
}
