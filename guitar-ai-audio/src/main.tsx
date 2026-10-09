import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { backendService } from './utils/backendService';

/**
 * 应用启动引导
 * ============
 *
 * ⚠️ 这里**先等后端数据到位再首次渲染**，而不是「先渲染再异步补」。
 *
 * 原因：`App.tsx` 里大量状态是**同步初始化**的，例如
 * `useState(...backendService.getUsers()...)` —— 这些调用发生在首屏渲染期间，
 * 如果那时缓存还是空的，界面会先拿演示数据画一遍，而 `useState` 的初值
 * **之后不会再刷新**，于是「后端有数据但界面显示演示数据」，
 * 看起来像同步根本没生效。等数据回来再补，就得把每个调用点改成 effect，
 * 那才是真正的大改。
 *
 * 代价是首屏多等一次网络往返（本地几十毫秒）。为避免后端没起时白等，
 * 这里给一个 **3 秒上限**：超时就先用兜底数据渲染，页面照常可用，
 * 并在控制台留下同步失败原因（`backendService.getSyncState()`）。
 */
const HYDRATE_TIMEOUT_MS = 3000;

async function bootstrap() {
  const hydration = backendService.hydrate().catch(() => ({
    ok: false as const,
    users: 0,
    groups: 0,
    courses: 0,
    videos: 0,
    drills: 0,
    library: 0,
    creditRequests: 0,
    leads: 0,
    notifications: 0,
    plans: 0,
  }));
  const timeout = new Promise<{ ok: false; timeout: true }>((resolve) =>
    setTimeout(() => resolve({ ok: false, timeout: true }), HYDRATE_TIMEOUT_MS),
  );

  const result = (await Promise.race([hydration, timeout])) as {
    ok: boolean;
    users?: number;
    groups?: number;
    courses?: number;
    videos?: number;
    drills?: number;
    library?: number;
    creditRequests?: number;
    leads?: number;
    notifications?: number;
    plans?: number;
    timeout?: boolean;
  };

  if (result.timeout) {
    // eslint-disable-next-line no-console
    console.warn(
      `[bootstrap] 后端 ${HYDRATE_TIMEOUT_MS}ms 内未返回，先用本地兜底数据渲染；` +
        `请确认 guitarmate-audio-backend 已在 3000 端口启动。`,
    );
  } else if (result.ok) {
    // eslint-disable-next-line no-console
    console.info(
      `[bootstrap] 已从后端载入 ${result.users} 个用户 / ${result.groups} 个用户组 / ` +
        `${result.courses} 门课程 / ${result.videos} 个教学视频 / ${result.drills} 个和弦组合 / ` +
        `${result.library} 条曲库 / ${result.notifications} 条通知 / ${result.creditRequests} 条积分工单 / ` +
        `${result.leads} 条企业线索 / ${result.plans} 个定价方案`,
    );
  } else {
    /**
     * `ok=false` = 至少有一个域拉取失败（`hydrate` 里每个域各自 catch，
     * 不会抛到这里）。**必须显式告警**：这是「部分迁移完成」的现场，
     * 界面看起来正常但在用兜底数据 —— 静默失败是最难查的一类问题。
     */
    const s = backendService.getSyncState();
    // eslint-disable-next-line no-console
    console.warn(`[bootstrap] 部分数据未能从后端载入：${s.message}（界面将使用兜底数据）`);
  }

  createRoot(document.getElementById('root')!).render(<App />);
}

void bootstrap();
