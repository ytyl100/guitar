import { Text, Video, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BottomNav from '../../components/BottomNav';
import { fetchCurriculumLearn, type LearnLesson } from '../../services/api';
import { findPublishedSongByName, songEvalUrl, songPageUrl } from '../../utils/boundSong';
import { pageClass } from '../../utils/settings';

/**
 * 课时视频播放（含打点跳转）
 * ========================
 *
 * ## 这个页面前面一直做不出来的原因（已解决）
 *
 * 「课时播放」卡在**没有可播的视频地址**：CMS 里 `TeachingVideo` 只存元数据，
 * `transcodeStatus` 甚至写死成 `'READY'`，而 `videoUrl` 通常是空的 —— C 端拿它当"已就绪"，
 * 实际点下去什么也放不出来。所以：
 *
 * 1. 后端新增 `POST /api/curriculum/assets/video`（base64 直传，≤20MB，**不转码**），
 *    大视频仍应放 OSS/CDN 后把地址填进 CMS；
 * 2. `/api/curriculum/learn` 投影里给出 `video.url` 与 **`video.playable`** ——
 *    `playable` 是"真的有地址"，不再相信 CMS 里那个写死的状态值；
 * 3. C 端**只在 playable 时给播放按钮**，否则显示"该课时还没有视频源"（不摆假按钮）。
 *
 * ## 为什么按 `lessonId` 重新拉一次课程文档
 *
 * 视频对象里含若干打点，塞进 query string 很容易超长（且 `useLoad` 的 query 不会自动解码）。
 * 课程文档本来就是要给 C 端读的，按 id 找到那个课时是几行代码的事，比"传一大包 JSON" 稳。
 */
export default function LessonVideo() {
  const [lessonId, setLessonId] = useState('');
  const [lesson, setLesson] = useState<LearnLesson | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [currentSec, setCurrentSec] = useState(0);
  /** 最近一次跳过的打点（让用户看得出"跳到了哪"） */
  const [lastSeek, setLastSeek] = useState<number | null>(null);
  /** 按歌名找曲目（跟弹入口用）：正在找的反馈 */
  const [openingSong, setOpeningSong] = useState('');
  const ctxRef = useRef<ReturnType<typeof Taro.createVideoContext> | null>(null);

  useLoad((options: Record<string, string>) => {
    let id = options?.id || '';
    try {
      id = decodeURIComponent(id);
    } catch {
      /* 已是明文 */
    }
    setLessonId(id);
    Taro.setNavigationBarTitle({ title: '课时视频' });
  });

  const load = useCallback(async (id: string) => {
    if (!id) {
      setError('缺少课时 id');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const doc = await fetchCurriculumLearn();
      const all = (doc.stages || []).flatMap((s) =>
        (s.courses || []).flatMap((c) => (c.chapters || []).flatMap((ch) => ch.lessons || [])),
      );
      const hit = all.find((l) => l.id === id);
      if (!hit) {
        setError(`课程大纲里找不到这个课时（id=${id}）—— 可能已在 CMS 里删除或调整。`);
        setStatus('error');
        return;
      }
      setLesson(hit);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load(lessonId);
  }, [lessonId, load]);

  const video = lesson?.video;
  /** 打点按时间升序（CMS 里是人工录入，顺序不保证） */
  const keyPoints = useMemo(
    () => [...(video?.keyPoints || [])].sort((a, b) => a.timeSec - b.timeSec),
    [video],
  );

  const formatSec = (sec: number) =>    `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

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

  /**
   * 看视频 → 直接开练：课时绑定的曲目按歌名去已发布曲库找，然后进练习页或 AI 评测页。
   *
   * ⚠️ 这里**只是「同一节课连着做两件事」的跳转**，不是"按视频打点自动跳曲目时间点"——
   * 视频打点属于**视频**的时间轴，而曲目切片属于**音频**的时间轴，两者没有对应关系。
   * 硬把 `kp.timeSec` 当曲目时间去 seek 是编出来的映射，宁可不做。
   */
  const openBoundSong = async (mode: 'practice' | 'eval') => {
    const name = (lesson?.song?.songName || '').trim();
    if (!name) {
      Taro.showToast({ title: '该课时还没有绑定曲目', icon: 'none' });
      return;
    }
    setOpeningSong(mode);
    try {
      const song = await findPublishedSongByName(name);
      if (!song) {
        Taro.showToast({ title: `曲库里还没有《${name}》，请先在 CMS 发布`, icon: 'none', duration: 3000 });
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
          <Text className="gm-meta">正在读取课时…</Text>
        </View>
      )}

      {status === 'error' && (
        <View className="gm-learn-error">
          <Text>⚠ {error}</Text>
          <View className="gm-learn-retry" onClick={() => void load(lessonId)}>
            <Text>重试</Text>
          </View>
        </View>
      )}

      {status === 'ready' && lesson && (
        <View>
          <View className="gm-video-head">
            <Text className="gm-video-title">{lesson.title}</Text>
            <Text className="gm-meta" style="display:block;margin-top:6px">
              {video?.instructor || '讲师未标注'} · 时长 {formatSec(video?.durationSec || 0)} ·{' '}
              {video?.resolution || '分辨率未标注'}
            </Text>
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
              <Text>
                ⚠ 该课时还没有可播放的视频源（CMS 里这门课的视频库条目 `videoUrl` 为空）。
              </Text>
              <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.7">
                处理办法（任一）：把视频放到 OSS/CDN 后把地址填进后台「教学视频库」；
                或用后端 `POST /api/curriculum/assets/video` 直传短视频（≤20MB，不转码）。
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
                <View key={`${kp.timeSec}-${kp.title}`} className="gm-video-kp" onClick={() => seekTo(kp.timeSec)}>
                  <Text className="gm-video-kp-time">{formatSec(kp.timeSec)}</Text>
                  <View style="min-width:0;flex:1">
                    <Text className="gm-video-kp-title">{kp.title}</Text>
                    {!!kp.description && (
                      <Text className="gm-meta" style="display:block;margin-top:4px;line-height:1.6">
                        {kp.description}
                      </Text>
                    )}
                  </View>
                  {!!kp.chordName && <Text className="gm-video-kp-chord">{kp.chordName}</Text>}
                </View>
              ))}

              <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
                点任意打点即可跳到该时间点（打点由后台「教学视频库」维护）。
              </Text>
            </View>
          )}

          {/**
            * 视频 → 跟弹：课时绑定了曲目时才给入口（同样的"不给假控件"原则）。
            * 两个动作都是真页面：分段练习（看谱跟弹）/ AI 跟弹评测（听音打分）。
            */}
          {!!lesson.song?.songName && (
            <View className="gm-card">
              <Text className="gm-section-title">🎸 看完了，开练</Text>
              <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.7">
                本课时绑定的曲目：《{lesson.song.songName}》
                {lesson.song.originalArtist ? ` · ${lesson.song.originalArtist}` : ''}
              </Text>
              <View
                className="gm-learn-jump"
                style="margin-top:16px"
                onClick={() => void openBoundSong('practice')}
              >
                <Text>
                  🎸 打开分段练习{openingSong === 'practice' ? ' · 正在找…' : ''}
                </Text>
              </View>
              <View
                className="gm-learn-jump"
                onClick={() => void openBoundSong('eval')}
              >
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
