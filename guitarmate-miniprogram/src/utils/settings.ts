import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';

/**
 * 全局偏好：语言（中/英）与主题（深色/浅色）
 * ==========================================
 *
 * ## 为什么要一个"极简 store"而不是 Context
 *
 * 小程序的页面是**互相独立挂载**的（`navigateTo` 后上一页仍在栈里、root 组件树不共享），
 * 所以在 `app.tsx` 里放 React Context 并不能覆盖到每个页面实例。
 * 这里用最小的模块级 store：`Taro.getStorageSync` 持久化 + 订阅表 + 一个 `usePreference()` hook。
 * 任何页面/组件用这个 hook 都能拿到当前值并在切换时重渲染。
 *
 * ## 主题是怎么生效的（重要，别只看这个文件）
 *
 * `app.scss` 里的颜色**全部是硬编码的深色**（这是既定事实，几百处）。
 * 与其逐个改写成变量，这里采用**叠加覆盖**：给页面根节点加 `gm-light` 类，
 * 再由 `app.scss` 底部那段 `.gm-light …` 规则把「表面色 / 文字色 / 描边色」翻成浅色。
 * 这样做的好处是**深色路径一行都没动**（不会把已经验收过的深色界面改坏），
 * 坏处是新增样式时必须同时想想"浅色下长什么样"。
 *
 * ⚠️ 已知未覆盖：和弦图（`ChordFretboard` 的颜色是**行内** SVG 坐标色，见该文件注释）
 * 与谱面 PNG（后端渲染，只有 dark/light 两种主题参数）—— 它们在自己的主题里已经可读，
 * 但不会跟随这里的开关。设置卡里如实写出来，不假装全站都换了。
 */

export type Locale = 'zh' | 'en';
export type ThemeMode = 'dark' | 'light';

const LOCALE_KEY = 'guitarmate_locale';
const THEME_KEY = 'guitarmate_theme';

type Listener = () => void;
const listeners = new Set<Listener>();

let locale: Locale = 'zh';
let theme: ThemeMode = 'dark';
let hydrated = false;

/** 首屏从本地存储读一次（同步 API，无闪烁） */
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const savedLocale = Taro.getStorageSync(LOCALE_KEY) as Locale | '';
    if (savedLocale === 'zh' || savedLocale === 'en') locale = savedLocale;
    const savedTheme = Taro.getStorageSync(THEME_KEY) as ThemeMode | '';
    if (savedTheme === 'dark' || savedTheme === 'light') theme = savedTheme;
  } catch {
    /* 隐私模式/存储不可用时用默认值 */
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

export function getLocale(): Locale {
  hydrate();
  return locale;
}

export function setLocale(next: Locale) {
  locale = next;
  try {
    Taro.setStorageSync(LOCALE_KEY, next);
  } catch {
    /* ignore */
  }
  emit();
}

export function getTheme(): ThemeMode {
  hydrate();
  return theme;
}

export function setTheme(next: ThemeMode) {
  theme = next;
  try {
    Taro.setStorageSync(THEME_KEY, next);
  } catch {
    /* ignore */
  }
  emit();
}

/** 订阅偏好变化；返回取消订阅函数 */
export function subscribePreference(fn: Listener) {
  hydrate();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 页面/组件里用它拿偏好 + 切换方法（切换会触发所有订阅者重渲染） */
export function usePreference() {
  const [, force] = useState(0);
  useEffect(() => subscribePreference(() => force((n) => n + 1)), []);
  return { locale: getLocale(), theme: getTheme(), setLocale, setTheme };
}

/** 页面根节点的类名：`gm-page` + 浅色时的 `gm-light` */
export function pageClass(base = 'gm-page'): string {
  return getTheme() === 'light' ? `${base} gm-light` : base;
}

/* ------------------------------------------------------------------ *
 * 文案表
 *
 * ⚠️ 覆盖范围（设置卡里也如实写着）：**小程序外壳（底部导航）+「我的」页**。
 * 其它页面（曲库/课程/调音/工具）的文案仍是中文硬编码 —— 它们要逐页搬迁，
 * 与其做一半让人以为"切了英文"、实际一半中文，不如把范围写清楚。
 * ------------------------------------------------------------------ */

const DICT = {
  zh: {
    'nav.songs': 'Songs 曲库',
    'nav.learn': 'Learn 课程',
    'nav.tune': 'Tune 调音',
    'nav.tools': 'Tools 工具',
    'nav.profile': 'Profile 我的',

    'profile.title': '我的',
    'profile.vip': 'VIP学员',
    'profile.validUntil': '有效期至：',
    'profile.metric.streak': '连续练习',
    'profile.metric.minutes': '练习分钟',
    'profile.metric.chords': '掌握和弦',
    'profile.metric.songs': '完成曲目',
    'profile.metric.lessons': '完成课时',
    'profile.currentCourse': '当前课程',
    'profile.continue': '继续学习：',
    'profile.orders': '订单记录',
    'profile.ordersSub': '微信支付商户直连',
    'profile.paid': '支付成功',
    'profile.bill': '电子账单',
    'profile.billTitle': '微信支付电子账单',
    'profile.billNo': '交易单号',
    'profile.billAmount': '金额',
    'profile.billStatus': '支付状态',
    'profile.billChannel': '支付方式',
    'profile.close': '关闭',

    /* ── 「我的」页改接后端后新增的文案（后端没有的字段统一显 `—`） ── */
    'profile.institution': '所属机构：',
    'profile.teacher': '指导名师：',
    'profile.credits': '可用积分：',
    'profile.creditsCard': '积分明细',
    'profile.creditsEmpty': '暂无积分流水',
    'profile.balanceAfter': '余额',
    'profile.notifications': '通知',
    'profile.unread': '条未读',
    'profile.markAllRead': '全部已读',
    'profile.notificationsEmpty': '暂无通知',
    'profile.loading': '正在同步后端数据…',
    'profile.loadError': '后端数据加载失败',
    'profile.retry': '重试',
    'profile.courseUnavailable': '课纲后端里还没有课时，无法计算进度。',
    'profile.txTitle': '积分流水详情',
    'profile.txAmount': '变动额度',
    'profile.txDescription': '说明',
    'profile.txType': '类型',
    'profile.txTime': '时间',
    'profile.txId': '流水号',
    'profile.dataSource': '本页数据来自后端接口，当前用户 id：',

    'settings.title': '设置',
    'settings.language': '语言 / Language',
    'settings.theme': '主题',
    'settings.themeDark': '深色',
    'settings.themeLight': '浅色',
    'settings.coverage': '当前已覆盖：底部导航与「我的」页；其它页面的文案与配色还在逐步搬迁。',
    'settings.themeNote': '浅色主题覆盖页面底色、卡片、文字与描边；和弦图与谱面图有各自的配色，不随此开关变化。',
    'settings.saved': '已保存到本机',
  },
  en: {
    'nav.songs': 'Songs',
    'nav.learn': 'Learn',
    'nav.tune': 'Tune',
    'nav.tools': 'Tools',
    'nav.profile': 'Profile',

    'profile.title': 'Profile',
    'profile.vip': 'VIP',
    'profile.validUntil': 'Valid until: ',
    'profile.metric.streak': 'Day streak',
    'profile.metric.minutes': 'Minutes',
    'profile.metric.chords': 'Chords',
    'profile.metric.songs': 'Songs done',
    'profile.metric.lessons': 'Lessons done',
    'profile.currentCourse': 'Current course',
    'profile.continue': 'Continue: ',
    'profile.orders': 'Orders',
    'profile.ordersSub': 'WeChat Pay direct merchant',
    'profile.paid': 'Paid',
    'profile.bill': 'Receipt',
    'profile.billTitle': 'WeChat Pay receipt',
    'profile.billNo': 'Transaction no.',
    'profile.billAmount': 'Amount',
    'profile.billStatus': 'Status',
    'profile.billChannel': 'Channel',
    'profile.close': 'Close',

    /* ── added with the backend-wired profile page ── */
    'profile.institution': 'Academy: ',
    'profile.teacher': 'Teacher: ',
    'profile.credits': 'Credits: ',
    'profile.creditsCard': 'Credit activity',
    'profile.creditsEmpty': 'No credit activity yet',
    'profile.balanceAfter': 'Balance',
    'profile.notifications': 'Notifications',
    'profile.unread': 'unread',
    'profile.markAllRead': 'Mark all read',
    'profile.notificationsEmpty': 'No notifications',
    'profile.loading': 'Syncing from backend…',
    'profile.loadError': 'Failed to load backend data',
    'profile.retry': 'Retry',
    'profile.courseUnavailable': 'The curriculum has no lessons yet, so progress cannot be computed.',
    'profile.txTitle': 'Credit transaction',
    'profile.txAmount': 'Amount',
    'profile.txDescription': 'Description',
    'profile.txType': 'Type',
    'profile.txTime': 'Time',
    'profile.txId': 'Transaction id',
    'profile.dataSource': 'All data on this page comes from the backend API. Current user id: ',

    'settings.title': 'Settings',
    'settings.language': '语言 / Language',
    'settings.theme': 'Theme',
    'settings.themeDark': 'Dark',
    'settings.themeLight': 'Light',
    'settings.coverage': 'Covered so far: bottom nav + Profile. Other pages are being migrated.',
    'settings.themeNote':
      'Light theme repaints page background, cards, text and borders. The chord diagram and tablature images keep their own palettes.',
    'settings.saved': 'Saved on this device',
  },
} as const;

export type I18nKey = keyof (typeof DICT)['zh'];

/** 取文案（缺 key 时回落到中文，再不行回落到 key 本身，便于发现漏翻） */
export function t(key: I18nKey): string {
  const table = DICT[getLocale()] as Record<string, string>;
  return table[key] ?? (DICT.zh as Record<string, string>)[key] ?? String(key);
}

/** 组件里用：跟随语言切换自动重渲染 */
export function useT() {
  const { locale } = usePreference();
  return (key: I18nKey) => {
    const table = DICT[locale] as Record<string, string>;
    return table[key] ?? (DICT.zh as Record<string, string>)[key] ?? String(key);
  };
}
