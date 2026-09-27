import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import {
  ENROLLED_COURSE,
  PAYMENT_RECORDS,
  USER_PROFILE,
  type PaymentRecord,
} from '../../utils/profileSeed';
import BottomNav from '../../components/BottomNav';
import { pageClass, usePreference, useT } from '../../utils/settings';

/**
 * 「我的」（Profile）页
 * =====================
 *
 * 逐块对齐 Web 版 `guitarmate-frontend/src/components/ProfileTab.tsx`：
 *
 * ```
 * 1. 用户卡   头像(+在线点) · 昵称 · 会员徽标 · 有效期
 *             四个练习指标：连续练习 / 练习分钟 / 掌握和弦 / 完成曲目
 * 2. 当前课程 1 / 13 · 封面 · 标题 · 副标题 · 8% 进度条 · 「继续学习」按钮
 * 3. 订单记录 每笔：标题 · 日期 · 渠道 · ¥金额 · 支付成功 → 点开电子账单弹窗
 * 4. 订单弹窗 微信支付电子账单：金额 / 商品名称 / 商户单号 / 支付时间 / 支付方式
 * ```
 *
 * ## 这一轮**故意没做**的两块（都不是「忘了」，是不想做假控件）
 *
 * 1. ~~**「设置」卡（主题切换 + 语言切换）**~~ → **本轮已做**（见下面第 5 块）：
 *    语言真的切（`utils/settings.ts` 的文案表 + 模块级订阅，切换会立刻重渲染），
 *    主题真的切（页面根节点加 `gm-light`，由 `app.scss` 底部的覆盖规则翻色）。
 *    ⚠️ 但**覆盖范围如实写在卡里**：文案目前只覆盖「底部导航 + 本页」，
 *    其它页面的文案还在逐页搬迁；和弦图与谱面图有自己的配色，不跟随主题开关。
 * 2. **「小程序构思方案与技术架构说明」入口卡**：Web 版点开的是 `ArchitectureModal.tsx`
 *    （1318 行的静态文档），单独一轮移植更合适。
 */
export default function Profile() {
  /** 点开的订单（null = 不显示弹窗） */
  const [order, setOrder] = useState<PaymentRecord | null>(null);
  const t = useT();
  const { locale, theme, setLocale, setTheme } = usePreference();

  /** 四个练习指标（Web 版是 `grid-cols-4`；小程序用 flex 等分更稳） */
  const metrics = [
    { value: USER_PROFILE.daysStreak, label: t('profile.metric.streak'), color: '#ffffff' },
    { value: USER_PROFILE.totalPracticeMins, label: t('profile.metric.minutes'), color: '#10b981' },
    { value: USER_PROFILE.masteredChordsCount, label: t('profile.metric.chords'), color: '#3b82f6' },
    { value: USER_PROFILE.completedSongsCount, label: t('profile.metric.songs'), color: '#f59e0b' },
  ];

  const progressPct = Math.max(
    0,
    Math.min(100, Math.round((ENROLLED_COURSE.completedSteps / ENROLLED_COURSE.totalSteps) * 100)),
  );

  /** 切偏好后给一句即时反馈（不弹 toast：只是保存到本机） */
  const [savedAt, setSavedAt] = useState(0);
  const touchSaved = () => setSavedAt(Date.now());

  return (
    <View className={pageClass('gm-page')} style="padding-top:32px;padding-bottom:200px">
      {/** ── 1. 用户卡 ─────────────────────────────────────────────── */}
      <View className="gm-card gm-profile-hero">
        <View style="display:flex;align-items:center">
          <View className="gm-avatar-wrap">
            <Image className="gm-avatar" mode="aspectFill" src={USER_PROFILE.avatar} />
            {/** 右下角在线点（Web: w-4 h-4 emerald + 2px 边框，颜色取卡片底色以形成"挖空"效果） */}
            <View className="gm-avatar-dot" />
          </View>
          <View style="min-width:0;flex:1;margin-left:32px">
            <View style="display:flex;align-items:center;min-width:0">
              <Text className="gm-profile-name">{USER_PROFILE.name}</Text>
              <Text className="gm-profile-vip">{USER_PROFILE.memberStatus}</Text>
            </View>
            <Text className="gm-meta" style="display:block;margin-top:8px">
              {t('profile.validUntil')}
              {USER_PROFILE.vipExpiryDate}
            </Text>
          </View>
        </View>

        <View className="gm-metrics">
          {metrics.map((m) => (
            <View key={m.label} className="gm-metric">
              <Text className="gm-metric-value" style={`color:${m.color}`}>
                {m.value}
              </Text>
              <Text className="gm-metric-label">{m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/** ── 2. 当前课程 ───────────────────────────────────────────── */}
      <View className="gm-card">
        <View style="display:flex;align-items:center;justify-content:space-between">
          <Text className="gm-section-title">📘 {t('profile.currentCourse')}</Text>
          <Text className="gm-progress-num">
            {ENROLLED_COURSE.completedSteps} / {ENROLLED_COURSE.totalSteps}
          </Text>
        </View>

        <View style="display:flex;align-items:center;margin-top:24px">
          <Image className="gm-course-cover" mode="aspectFill" src={ENROLLED_COURSE.coverImage} />
          <View style="min-width:0;flex:1;margin-left:24px">
            <Text className="gm-course-title">{ENROLLED_COURSE.title}</Text>
            <Text className="gm-meta" style="display:block">
              {ENROLLED_COURSE.subtitle}
            </Text>
            <View className="gm-inline-track">
              <View className="gm-inline-fill" style={`width:${progressPct}%`} />
            </View>
          </View>
        </View>

        <View
          className="gm-btn gm-btn--ghost"
          style="margin-top:32px"
          onClick={() => Taro.navigateTo({ url: '/pages/learn/index' })}
        >
          <Text>
            {t('profile.continue')}Tune your guitar ›
          </Text>
        </View>
      </View>

      {/** ── 3. 订单记录 ───────────────────────────────────────────── */}
      <View className="gm-card">
        <View style="display:flex;align-items:center;justify-content:space-between">
          <Text className="gm-section-title">💳 {t('profile.orders')}</Text>
          <Text className="gm-meta">{t('profile.ordersSub')}</Text>
        </View>

        <View style="margin-top:24px">
          {PAYMENT_RECORDS.map((rec) => (
            <View
              key={rec.id}
              className="gm-order-row"
              onClick={() => setOrder(rec)}
            >
              <View style="min-width:0;flex:1">
                <Text className="gm-order-title">{rec.title}</Text>
                <Text className="gm-order-meta">
                  {rec.date} · {rec.channel}
                </Text>
              </View>
              <View style="text-align:right;flex-shrink:0">
                <Text className="gm-order-amount">¥{rec.amount.toFixed(2)}</Text>
                <Text className="gm-order-status">{t('profile.paid')}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/** ── 4. 订单弹窗（微信支付电子账单） ───────────────────────── */}
      {order && (
        <View className="gm-modal-mask" onClick={() => setOrder(null)}>
          {/** 阻止冒泡：点卡片内部不该关闭弹窗 */}
          <View className="gm-modal-card" onClick={(e) => e.stopPropagation()}>
            <View className="gm-modal-head">
              <Text className="gm-modal-title">{t('profile.billTitle')}</Text>
              <Text className="gm-modal-close" onClick={() => setOrder(null)}>
                ✕
              </Text>
            </View>

            <View style="text-align:center;margin:40px 0">
              <Text className="gm-meta">{t('profile.billAmount')}</Text>
              <Text className="gm-modal-amount">¥{order.amount.toFixed(2)}</Text>
              <View className="gm-modal-badge">
                <Text>✓ {t('profile.paid')}</Text>
              </View>
            </View>

            <View className="gm-modal-rows">
              {[
                { k: '商品名称', v: order.title },
                { k: t('profile.billNo'), v: order.orderNumber },
                { k: '支付时间', v: order.date },
                { k: t('profile.billChannel'), v: order.channel },
              ].map((row) => (
                <View key={row.k} className="gm-modal-row">
                  <Text className="gm-meta">{row.k}:</Text>
                  <Text className="gm-modal-value">{row.v}</Text>
                </View>
              ))}
            </View>

            <View
              className="gm-btn gm-btn--ghost"
              style="margin-top:40px"
              onClick={() => setOrder(null)}
            >
              <Text>{t('profile.close')}</Text>
            </View>
          </View>
        </View>
      )}

      {/** ── 5. 设置（语言 / 主题） ───────────────────────────────────
        *
        * ⚠️ 两个开关都是**真生效**的：
        * - 语言：写 `utils/settings.ts` 的模块级 store（持久化到 Taro storage）→ 订阅者重渲染；
        * - 主题：页面根节点加 `gm-light` → `app.scss` 底部的覆盖规则把表面色翻成浅色。
        * 覆盖范围卡里写清楚（不让人误以为"整站都换了"）。
        */}
      <View className="gm-card">
        <Text className="gm-section-title">⚙️ {t('settings.title')}</Text>

        <View className="gm-setting-row">
          <Text className="gm-setting-label">{t('settings.language')}</Text>
          <View style="display:flex">
            <View
              className={`gm-chip${locale === 'zh' ? ' gm-chip--active' : ''}`}
              onClick={() => {
                setLocale('zh');
                touchSaved();
              }}
            >
              <Text>中文</Text>
            </View>
            <View
              className={`gm-chip${locale === 'en' ? ' gm-chip--active' : ''}`}
              style="margin-right:0"
              onClick={() => {
                setLocale('en');
                touchSaved();
              }}
            >
              <Text>English</Text>
            </View>
          </View>
        </View>

        <View className="gm-setting-row">
          <Text className="gm-setting-label">{t('settings.theme')}</Text>
          <View style="display:flex">
            <View
              className={`gm-chip${theme === 'dark' ? ' gm-chip--active' : ''}`}
              onClick={() => {
                setTheme('dark');
                touchSaved();
              }}
            >
              <Text>{t('settings.themeDark')}</Text>
            </View>
            <View
              className={`gm-chip${theme === 'light' ? ' gm-chip--active' : ''}`}
              style="margin-right:0"
              onClick={() => {
                setTheme('light');
                touchSaved();
              }}
            >
              <Text>{t('settings.themeLight')}</Text>
            </View>
          </View>
        </View>

        {!!savedAt && (
          <Text className="gm-meta" style="display:block;color:#34d399">
            ✓ {t('settings.saved')}
          </Text>
        )}
        <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.6;opacity:0.75">
          {t('settings.coverage')}
        </Text>
        <Text className="gm-meta" style="display:block;margin-top:8px;line-height:1.6;opacity:0.75">
          {t('settings.themeNote')}
        </Text>
      </View>

      {/** ── 6. 架构方案入口（Web 版头部那个「架构方案」按钮指向的内容） ──
        *
        * 形态是**独立页**而不是弹窗：方案共 10 章、含多张 5 列表格，
        * 塞进手机居中弹窗没法读（理由写在该页文件头）。
        */}
      <View
        className="gm-card"
        onClick={() => Taro.navigateTo({ url: '/pages/architecture/index' })}
      >
        <View style="display:flex;align-items:center;justify-content:space-between">
          <Text className="gm-section-title">📄 课程体系规划方案</Text>
          <Text className="gm-learn-arrow">›</Text>
        </View>
        <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
          课程编写与教务管理体系全景方案（教研顶层设计 · 5 级树 · 黄金 20 分钟 · 挂进度条）
        </Text>
      </View>

      <BottomNav active="profile" />
    </View>
  );
}

