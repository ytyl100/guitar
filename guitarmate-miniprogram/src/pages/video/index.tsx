import { Text, Video, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BottomNav from '../../components/BottomNav';
import {
  fetchCourses,
  fetchTeachingVideos,
  type TeachingVideo,
} from '../../services/api';
import { findPublishedSongForCourseItem, songEvalUrl, songPageUrl } from '../../utils/boundSong';
import { findCourseItem, findScoreItem } from '../../utils/courseLookup';
import { pageClass } from '../../utils/settings';

/**
 * 视频教程播放页（含关键打点跳转）
 * ==============================
 *
 * ## 数据来源（本页已换源，与 Learn 页一致）
 *
 * 读 **`GET /api/courses`** + **`GET /api/videos`** —— 即 `guitar-ai-audio` 学员课纲：
 * 课程 → 章节 → 内容项（`type === 'video'`）→ 项目里的 `videoId` 指向教学视频记录
 * （**讲师 / 时长 / 打点只在视频表里**，课纲里只存一个引用）。
 *
 * 入参三种，按优先级：
 *
 * | query | 含义 |
 * |---|---|
 * | `?itemId=item_xxx` | **课纲里的视频内容项 id**（Learn 页「播放视频教程」按钮用的就是它） |
 * | `?videoId=vid_xxx` | 直接给教学视频记录 id（分享/调试用，没有课程上下文） |
 * | `?id=item_xxx` | 老参数名，等价于 `itemId`（向后兼容） |
 *
 * ## 为什么按 id 重新拉一次课纲，而不是把整包 JSON 塞进 query
 *
 * 视频对象里含若干打点，塞进 query string 很容易超长（且 Taro 的 `useLoad` query **不会自动解码**）。
 * 课纲接口本来就是要给 C 端读的，按 id 找到那条内容项是几行代码的事，比"传一大包 JSON"稳。
 *
 * ## 「能不能播」只信 videoUrl
 *
 * `TeachingVideo` 里曾有个写死的 `transcodeStatus: 'READY'` —— C 端拿它当"已就绪"，
 * 实际点下去什么也放不出来。所以这里**只判断 `videoUrl` 是否为空**：
 * 空就不给播放器（也不摆一个点了没反应的假播放器），并写清怎么补。
 */
export default function LessonVideo() {
  const [itemId, setItemId] = useState('');
  const [videoId, setVideoId] = useState('');
  const [view, setView] = useState<LessonView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [currentSec, setCurrentSec] = useState(0);
  /** 最近一次跳过的打点（让用户看得出"跳到了哪"） */
  const [lastSeek, setLastSeek] = useState<number | null>(null);
  /** 按曲名找曲谱（开练入口用）：正在找的反馈 */
  const [openingSong, setOpeningSong] = useState('');
  const ctxRef = useRef<ReturnType<typeof Taro.createVideoContext> | null>(null);

  useLoad((options: Record<string, string>) => {
    /** ⚠️ Taro 给的 query 是**原始编码值**，中文/特殊字符要自己 decode */
    const decode = (v?: string) => {
      const raw = v || '';
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };
    setItemId(decode(options?.itemId || options?.id));
    setVideoId(decode(options?.videoId));
    Taro.setNavigationBarTitle({ title: '视频教程' });
  });

  const load = useCallback(async () => {
    if (!itemId && !videoId) {
      setError('缺少参数：需要 ?itemId=（课纲视频内容项）或 ?videoId=（教学视频 id）');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      /** 视频记录：直接给了 id 就单查，否则从课纲里跟着 item 走 —— 两种都拉一次课纲拿上下文 */
      const [courses, videos] = await Promise.all([fetchCourses(), fetchTeachingVideos()]);
      const videoById = new Map<string, TeachingVideo>(videos.map((v) => [v.id, v]));

      if (!itemId) {
        const v = videoById.get(videoId);
        if (!v) {
          setError(`教学视频库里找不到 id=${videoId} 的记录（可能已删除）。`);
          setStatus('error');
          return;
        }
        setView({
          itemId: '',
          title: v.title,
          courseId: '',
          courseTitle: v.associatedCourseTitle || '',
          chapterTitle: '',
          teacherName: '',
          video: toVideoView(v, v.videoUrl || ''),
          song: null,
        });
        setStatus('ready');
        return;
      }

      const hit = findCourseItem(courses, itemId);
      if (!hit) {
        setError(
          `课程大纲里找不到这条视频内容项（itemId=${itemId}）—— 可能教师已在课纲里删除或调整。`,
        );
        setStatus('error');
        return;
      }
      const { course, chapter, item } = hit;
      /** 视频记录优先；课纲项里也可能直接写了 videoUrl（没有建视频库记录的情况） */
      const record = item.videoId ? videoById.get(item.videoId) : undefined;
      const url = record?.videoUrl || item.videoUrl || '';
      /**
       * 「看完了，开练」指向同章的第一条乐谱练习项；本章没有就退到整门课的第一条。
       * ⚠️ 这只是**同一节课连着做两件事**的跳转，不是"按视频打点自动跳到曲目时间点"——
       * 视频打点属于**视频**的时间轴，曲目切片属于**音频**的时间轴，两者没有对应关系，
       * 硬把 `timeSeconds` 当曲目时间去 seek 是编出来的映射，宁可不做。
       */
      const scoreItem = findScoreItem(chapter, course);

      setView({
        itemId: item.id,
        title: item.title || record?.title || '视频教程',
        courseId: course.id,
        courseTitle: course.title,
        chapterTitle: chapter.title,
        teacherName: course.teacherName,
        video: record
          ? toVideoView(record, url)
          : {
              url,
              playable: !!url,
              instructor: course.teacherName,
              durationSec: 0,
              resolution: '未标注',
              keyPoints: [],
            },
        song: scoreItem
          ? {
              songName: scoreItem.scoreTitle || scoreItem.title,
              originalArtist: scoreItem.scoreArtist,
              /** ⚠️ 开练靠这个（指向曲库条目），**不是** `scoreItem.title` —— 详见 boundSong.ts */
              scoreId: scoreItem.scoreId,
            }
          : null,
      });
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [itemId, videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const video = view?.video;
  /** 打点按时间升序（人工录入，顺序不保证） */
  const keyPoints = useMemo(
    () => [...(video?.keyPoints || [])].sort((a, b) => a.timeSec - b.timeSec),
    [video],
  );

  const formatSec = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  /** 跳到某个打点：用 videoContext.seek（逻辑层没有 rAF，靠 onTimeUpdate 更新进度） */
  const seekTo = (sec: number) => {
    const ctx = Taro.createVideoContext('gm-lesson-video');
    ctxRef.current = ctx;
    try {
      ctx.seek(sec);
      setLastSeek(sec);
      setCurrentSec(sec);
    } catch {
      Taro.showToast({ title: '当前环境不支持视频跳转', icon: 'none' });
    }
  };

  /** 返回课程页（用户是从课程页点进来的，必须能回去） */
  const backToCourse = () => {
    try {
      Taro.navigateBack();
    } catch {
      Taro.switchTab({ url: '/pages/learn/index' });
    }
  };

  /** 开练：把本章的乐谱项解析成一首**已发布曲目**，然后进练习页或 AI 评测页 */
  const openBoundSong = async (mode: 'practice' | 'eval') => {
    const target = view?.song;
    if (!target) {
      Taro.showToast({ title: '这节课还没有配套的曲谱练习', icon: 'none' });
      return;
    }
    setOpeningSong(mode);
    try {
      const song = await findPublishedSongForCourseItem({
        scoreId: target.scoreId,
        scoreTitle: target.songName,
      });
      if (!song) {
        Taro.showToast({
          title: `曲库里还没有《${target.songName}》，请先发布这首曲目`,
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
      setOpeningSong('');
    }
  };

  return (
    <View className={pageClass()}>
      {status === 'loading' && (
        <View className="gm-learn-state">
          <Text className="gm-meta">正在读取视频教程…</Text>
        </View>
      )}

      {status === 'error' && (
        <View className="gm-learn-error">
          <Text>⚠ {error}</Text>
          <View className="gm-learn-retry" onClick={() => void load()}>
            <Text>重试</Text>
          </View>
          <View className="gm-learn-retry" onClick={backToCourse}>
            <Text>‹ 返回课程</Text>
          </View>
        </View>
      )}

      {status === 'ready' && view && (
        <View>
          {/** 位置感：从哪门课、哪一章点进来的（否则用户不知道自己在课纲的哪里） */}
          {!!view.courseTitle && (
            <View className="gm-learn-back" onClick={backToCourse}>
              <Text>‹ 返回课程 · {view.courseTitle}</Text>
            </View>
          )}

          <View className="gm-video-head">
            <Text className="gm-video-title">{view.title}</Text>
            <Text className="gm-meta" style="display:block;margin-top:6px">
              {video?.instructor || view.teacherName || '讲师未标注'} · 时长{' '}
              {formatSec(video?.durationSec || 0)} · {video?.resolution || '分辨率未标注'}
            </Text>
            {!!view.chapterTitle && (
              <Text className="gm-meta" style="display:block;margin-top:4px">
                所属章节：{view.chapterTitle}
              </Text>
            )}
          </View>

          {video?.playable ? (
            <View className="gm-video-stage">
              <Video
                id="gm-lesson-video"
                className="gm-video-el"
                src={video.url || ''}
                controls
                showFullscreenBtn
                showPlayBtn
                showCenterPlayBtn
                enableProgressGesture
                onTimeUpdate={(e) => setCurrentSec(Number(e.detail.currentTime) || 0)}
              />
            </View>
          ) : (
            /** 没有视频源 → 明确说明，不摆一个点了没反应的播放器 */
            <View className="gm-learn-error">
              <Text>⚠ 这条视频教程还没有可播放的视频源（教学视频库里的 `videoUrl` 为空）。</Text>
              <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.7">
                处理办法：教师在教研侧的「教学视频库」里补上视频地址（OSS/CDN 链接或直传），
                保存后这里刷新即可播放。
              </Text>
            </View>
          )}

          {keyPoints.length > 0 && (
            <View className="gm-card">
              <View style="display:flex;align-items:center;justify-content:space-between">
                <Text className="gm-section-title">🎯 关键打点</Text>
                <Text className="gm-meta">
                  当前 {formatSec(currentSec)}
                  {lastSeek !== null ? ` · 已跳到 ${formatSec(lastSeek)}` : ''}
                </Text>
              </View>

              {keyPoints.map((kp) => (
                <View
                  key={`${kp.timeSec}-${kp.title}`}
                  className="gm-video-kp"
                  onClick={() => seekTo(kp.timeSec)}
                >
                  <Text className="gm-video-kp-time">{formatSec(kp.timeSec)}</Text>
                  <View style="min-width:0;flex:1">
                    <Text className="gm-video-kp-title">{kp.title}</Text>
                    {!!kp.description && (
                      <Text className="gm-meta" style="display:block;margin-top:4px;line-height:1.6">
                        {kp.description}
                      </Text>
                    )}
                  </View>
                </View>
              ))}

              <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
                点任意打点即可跳到该时间点（打点由教师在「教学视频库」里维护）。
              </Text>
            </View>
          )}

          {/**
            * 视频 → 开练：同一章里有乐谱练习项时才给入口（同样的"不给假控件"原则）。
            * 两个动作都是真页面：乐谱练习（看谱跟弹）/ AI 跟弹评测（听音打分）。
            */}
          {!!view.song?.songName && (
            <View className="gm-card">
              <Text className="gm-section-title">🎸 看完了，开练</Text>
              <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.7">
                本章配套曲谱：《{view.song.songName}》
                {view.song.originalArtist ? ` · ${view.song.originalArtist}` : ''}
              </Text>
              <View
                className="gm-learn-jump"
                style="margin-top:16px"
                onClick={() => void openBoundSong('practice')}
              >
                <Text>🎸 打开乐谱练习{openingSong === 'practice' ? ' · 正在找…' : ''}</Text>
              </View>
              <View className="gm-learn-jump" onClick={() => void openBoundSong('eval')}>
                <Text>🎤 AI 跟弹评测（听你弹的音对不对）{openingSong === 'eval' ? ' · 正在找…' : ''}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      <BottomNav active="learn" />
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * 视图模型与查找（把后端两个资源拼成一个页面要用的形状）
 * ══════════════════════════════════════════════════════════════════ */
interface VideoView {
  url: string;
  playable: boolean;
  instructor: string;
  durationSec: number;
  resolution: string;
  keyPoints: Array<{ timeSec: number; title: string; description?: string }>;
}

interface LessonView {
  itemId: string;
  title: string;
  courseId: string;
  courseTitle: string;
  chapterTitle: string;
  teacherName: string;
  video: VideoView | null;
  song: { songName: string; originalArtist?: string; scoreId?: string } | null;
}

/** `'12:34'` → 754。解析不出来就 0（宁可显示 0:00，也不猜时长）。 */
function parseDuration(formatted?: string): number {
  const m = (formatted || '').match(/^(\d+):(\d{1,2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 教学视频记录 → 页面视图（打点字段名做一次归一） */
function toVideoView(v: TeachingVideo, url: string): VideoView {
  return {
    url,
    playable: !!url,
    instructor: '',
    durationSec: parseDuration(v.durationFormatted),
    /** 后端视频表没有分辨率字段 → 如实标注，不编 */
    resolution: '未标注',
    keyPoints: (v.cuePoints || []).map((c) => ({
      timeSec: Number(c.timeSeconds) || 0,
      title: c.label || c.timeFormatted || '打点',
      description: c.description,
    })),
  };
}

/** 查找（`findCourseItem` / `findScoreItem`）已抽到 `utils/courseLookup.ts` —— 微测页共用同一份 */
