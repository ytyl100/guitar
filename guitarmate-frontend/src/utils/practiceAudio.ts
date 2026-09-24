/**
 * 小程序音频播放适配层
 *
 * 微信小程序端使用 Taro.createInnerAudioContext()；
 * 在 Web 模拟器 / 浏览器预览环境下自动降级为 HTMLAudioElement，
 * 两者对外暴露完全一致的 API，供 useScrollSync 使用。
 */

export interface PracticeAudioContext {
  src: string;
  loop: boolean;
  playbackRate: number;
  readonly currentTime: number;
  readonly duration: number;
  /** 0=HAVE_NOTHING, 1=HAVE_METADATA, 2+=可播放 */
  readonly readyState: number;
  play(): void;
  pause(): void;
  stop(): void;
  seek(timeSec: number): void;
  /** 强制重新加载当前 src（用于错误后重试） */
  reload(): void;
  destroy(): void;
  onPlay(cb: () => void): void;
  onPause(cb: () => void): void;
  onStop(cb: () => void): void;
  onEnded(cb: () => void): void;
  onTimeUpdate(cb: (currentTime: number) => void): void;
  onLoadedMetadata(cb: () => void): void;
  onCanPlay(cb: () => void): void;
  onError(cb: (err: any) => void): void;
}

const getTaro = (): any => {
  const g = globalThis as any;
  return g.Taro || g.taro || null;
};

/** 基于微信 InnerAudioContext 的实现 */
const createTaroAudio = (taro: any): PracticeAudioContext => {
  const audio = taro.createInnerAudioContext();
  return {
    get src() {
      return audio.src;
    },
    set src(v: string) {
      audio.src = v;
    },
    get loop() {
      return audio.loop;
    },
    set loop(v: boolean) {
      audio.loop = v;
    },
    get playbackRate() {
      return audio.playbackRate ?? 1;
    },
    set playbackRate(v: number) {
      audio.playbackRate = v;
    },
    get currentTime() {
      return audio.currentTime || 0;
    },
    get duration() {
      return audio.duration || 0;
    },
    get readyState() {
      return audio.duration > 0 ? 3 : 0;
    },
    play: () => audio.play(),
    pause: () => audio.pause(),
    stop: () => audio.stop(),
    seek: (t: number) => {
      audio.seek(t);
    },
    reload: () => {
      // InnerAudioContext 通过重设 src 触发重新加载
      const current = audio.src;
      audio.src = current;
    },
    destroy: () => audio.destroy(),
    onPlay: (cb) => audio.onPlay(cb),
    onPause: (cb) => audio.onPause(cb),
    onStop: (cb) => audio.onStop(cb),
    onEnded: (cb) => audio.onEnded(cb),
    onTimeUpdate: (cb) => audio.onTimeUpdate(() => cb(audio.currentTime || 0)),
    onLoadedMetadata: (cb) => audio.onCanplay && audio.onCanplay(cb),
    onCanPlay: (cb) => audio.onCanplay && audio.onCanplay(cb),
    onError: (cb) => audio.onError(cb),
  };
};

/** 基于 HTMLAudioElement 的 Web 降级实现 */
const createHtmlAudio = (): PracticeAudioContext => {
  const audio = new Audio();
  audio.preload = 'auto';
  let timeUpdateTimer: number | null = null;

  const startTimeUpdate = () => {
    if (timeUpdateTimer !== null) return;
    timeUpdateTimer = window.setInterval(() => {
      timeUpdateCbs.forEach((cb) => cb(audio.currentTime || 0));
    }, 250);
  };
  const stopTimeUpdate = () => {
    if (timeUpdateTimer !== null) {
      window.clearInterval(timeUpdateTimer);
      timeUpdateTimer = null;
    }
  };

  const timeUpdateCbs: Array<(t: number) => void> = [];

  return {
    get src() {
      return audio.src;
    },
    set src(v: string) {
      audio.src = v;
    },
    get loop() {
      return audio.loop;
    },
    set loop(v: boolean) {
      audio.loop = v;
    },
    get playbackRate() {
      return audio.playbackRate;
    },
    set playbackRate(v: number) {
      audio.playbackRate = v;
    },
    get currentTime() {
      return audio.currentTime || 0;
    },
    get duration() {
      return Number.isFinite(audio.duration) ? audio.duration : 0;
    },
    get readyState() {
      return audio.readyState ?? 0;
    },
    play: () => {
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          /* 自动播放被浏览器策略拦截时静默处理，用户再次点击即可播放 */
        });
      }
    },
    pause: () => audio.pause(),
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
    },
    seek: (t: number) => {
      try {
        audio.currentTime = Math.max(0, t);
      } catch {
        /* ignore */
      }
    },
    reload: () => {
      try {
        audio.load();
      } catch {
        /* ignore */
      }
    },
    destroy: () => {
      stopTimeUpdate();
      timeUpdateCbs.length = 0;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
    onPlay: (cb) => {
      audio.addEventListener('play', () => {
        startTimeUpdate();
        cb();
      });
    },
    onPause: (cb) => {
      audio.addEventListener('pause', () => {
        stopTimeUpdate();
        cb();
      });
    },
    onStop: (cb) => {
      audio.addEventListener('pause', () => {
        stopTimeUpdate();
        cb();
      });
    },
    onEnded: (cb) => {
      audio.addEventListener('ended', () => {
        stopTimeUpdate();
        cb();
      });
    },
    onTimeUpdate: (cb) => {
      timeUpdateCbs.push(cb);
      audio.addEventListener('timeupdate', () => cb(audio.currentTime || 0));
    },
    onLoadedMetadata: (cb) => {
      audio.addEventListener('loadedmetadata', () => cb());
    },
    onCanPlay: (cb) => {
      audio.addEventListener('canplay', () => cb());
    },
    onError: (cb) => {
      audio.addEventListener('error', (e) => cb(e));
    },
  };
};

/** 创建平台自适应的音频上下文 */
export const createPracticeAudioContext = (): PracticeAudioContext => {
  const taro = getTaro();
  if (taro && typeof taro.createInnerAudioContext === 'function') {
    return createTaroAudio(taro);
  }
  return createHtmlAudio();
};
