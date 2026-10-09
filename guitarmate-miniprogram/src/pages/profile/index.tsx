import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useCallback, useEffect, useState } from 'react';
import {
  CURRENT_USER_ID,
  fetchCreditTransactions,
  fetchCurriculumLearn,
  fetchNotifications,
  fetchTaskProgress,
  fetchUser,
  markAllNotificationsRead,
  type ApiCreditTransaction,
  type ApiNotification,
  type ApiUser,
} from '../../services/api';
import {
  NO_DATA,
  notificationIcon,
  toCourseProgress,
  toCreditRows,
  toProfileHero,
  toProfileMetrics,
  type ProfileCourseProgress,
} from '../../utils/profileModel';
import BottomNav from '../../components/BottomNav';
import { pageClass, usePreference, useT } from '../../utils/settings';

/**
 * 「我的」（Profile）页
 * =====================
 *
 * ## 数据来源：**全部来自后端**（本页不再有任何硬编码业务数字）
 *
 * | 区块 | 接口 |
 * |---|---|
 * | 用户卡（昵称/徽标/机构/名师/积分） | `GET /api/users/:id` |
 * | 四个练习指标 | `GET /api/users/:id`（只有「完成课时」有来源，其余显 `—`） |
 * | 当前课程进度 | `GET /api/curriculum/learn` ∩ `GET /api/users/:id/task-progress` |
 * | 积分余额 + 流水明细 | `GET /api/users/:id` + `…/credits/transactions` |
 * | 通知（未读数/列表/一键已读） | `GET /api/notifications` + `POST …/mark-all-read` |
 *
 * ## 三个刻意的取舍（都不是"忘了"）
 *
 * 1. **后端没有的字段显示 `—`，绝不填假数字**：
 *    连续练习天数 / 练习分钟 / 掌握和弦数 / 头像 / 付费会员到期日，后端目前都没有对应字段
 *    （理由与"怎么补"写在 `utils/profileModel.ts` 文件头）。
 *    老版本这里是一整套硬编码演示数据（"连续 16 天 / 385 分钟 / 14 个和弦 / 3 笔订单"），
 *    已整体删除 —— 假的练习天数会让人以为自己在坚持，假的订单会让人以为已经付过钱。
 * 2. **「订单记录」换成「积分明细」**：后端没有订单/支付表，
 *    但**有**真正的积分流水（扣减/发放/超管审批），所以这块展示真流水而不是假账单。
 * 3. **当前用户来自 `CURRENT_USER_ID`**（`services/api.ts`）：小程序还没有登录态
 *    （没有 `wx.login` + openid 绑定），先用**可配置的演示账号**顶着（默认 `usr_student_demo`）。
 *    接真实登录后**只改那一处常量**，本页与所有接口都不用动。
 */

export default function Profile() {
  const t = useT();
  const { locale, theme, setLocale, setTheme } = usePreference();

  /** 后端数据 */
  const [user, setUser] = useState<ApiUser | null>(null);
  const [course, setCourse] = useState<ProfileCourseProgress | null>(null);
  const [notifications, setNotifications] = useState<ApiNotification[] | null>(null);
  const [creditTxs, setCreditTxs] = useState<ApiCreditTransaction[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 点开的积分流水（null = 不显示弹窗） */
  const [txDetail, setTxDetail] = useState<ApiCreditTransaction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /**
       * 五个请求并行。用 `Promise.all` 而**不是** allSettled：
       * 这一页每个区块都依赖后端，"某一块挂了就当作没数据"会掩盖真实故障
       *（旧版就是这个毛病 —— 后端没起照样显示一整套演示资料，用户完全发现不了）。
       */
      const [u, prog, curriculum, notifs, txs] = await Promise.all([
        fetchUser(),
        fetchTaskProgress(),
        fetchCurriculumLearn(),
        fetchNotifications(),
        fetchCreditTransactions(CURRENT_USER_ID, 20),
      ]);
      setUser(u);
      setNotifications(notifs);
      setCreditTxs(txs);

      /**
       * ⚠️ 后端**没有**「学员报名了哪门课」这个关系，
       * 所以取课纲里**第一门有课时的课程**当「当前课程」（确定性选择，不随机、不写死 id）。
       * 接了账号体系后改成按报名记录取，视图层不用动。
       */
      const firstCourse =
        curriculum.stages
          .flatMap((st) => st.courses)
          .map((c) => ({
            title: c.title,
            subtitle: c.subtitle,
            lessonIds: c.chapters.flatMap((ch) => ch.lessons.map((l) => l.id)),
          }))
          .find((c) => c.lessonIds.length > 0) || null;
      setCourse(toCourseProgress(firstCourse, prog));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkAllRead = async () => {
    try {
      const res = await markAllNotificationsRead();
      setNotifications(res.notifications);
    } catch (err) {
      // 失败如实提示：不偷偷把本地状态改成已读（那会让人以为"处理过了"）
      Taro.showToast({ title: err instanceof Error ? err.message : '标记失败', icon: 'none' });
    }
  };

  /** 切偏好后给一句即时反馈（不弹 toast：只是保存到本机） */
  const [savedAt, setSavedAt] = useState(0);
  const touchSaved = () => setSavedAt(Date.now());

  const hero = user ? toProfileHero(user) : null;
  const metrics = toProfileMetrics(user);
  const creditRows = toCreditRows(creditTxs);
  const unread = notifications ? notifications.filter((n) => !n.isRead).length : 0;
  const progressPct = course ? course.percentage : 0;

  /** 占位符：`null` → `—`（后端没有这个数据） */
  const valueOrDash = (v: number | string | null) => (v === null ? NO_DATA : v);

  return (
    <View className={pageClass('gm-page')} style="padding-top:32px;padding-bottom:200px">
      {/** ── 0. 加载 / 失败 ─────────────────────────────────────── */}
      {loading && (
        <View className="gm-card">
          <Text className="gm-meta">{t('profile.loading')}</Text>
        </View>
      )}
      {!loading && error && (
        <View className="gm-card">
          <Text className="gm-section-title">⚠️ {t('profile.loadError')}</Text>
          <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
            {error}
          </Text>
          <View className="gm-btn gm-btn--ghost" style="margin-top:24px" onClick={() => void load()}>
            <Text>{t('profile.retry')}</Text>
          </View>
        </View>
      )}

      {/** ── 1. 用户卡（`GET /api/users/:id`） ─────────────────────── */}
      {hero && (
        <View className="gm-card gm-profile-hero">
          <View style="display:flex;align-items:center">
            <View className="gm-avatar-wrap">
              {/** 后端没有 avatar 字段 → 昵称首字色块（而不是塞一张假头像） */}
              <View
                className="gm-avatar"
                style="display:flex;align-items:center;justify-content:center;background-color:#065f46"
              >
                <Text style="font-size:48px;font-weight:900;color:#d1fae5">{hero.name.slice(0, 1)}</Text>
              </View>
              <View className="gm-avatar-dot" />
            </View>
            <View style="min-width:0;flex:1;margin-left:32px">
              <View style="display:flex;align-items:center;min-width:0">
                <Text className="gm-profile-name">{hero.name}</Text>
                <Text className="gm-profile-vip">{hero.memberStatus}</Text>
              </View>
              <Text className="gm-meta" style="display:block;margin-top:8px">
                {t('profile.validUntil')}
                {hero.validUntil || NO_DATA}
              </Text>
              {/** 机构 / 名师：都是后端字段（游客没有归属 → 占位） */}
              <Text className="gm-meta" style="display:block;margin-top:4px">
                {t('profile.institution')}
                {hero.institutionName || NO_DATA}
                {' · '}
                {t('profile.teacher')}
                {hero.teacherName || NO_DATA}
              </Text>
              {/** 可用积分：后端真实余额（无限额度显示 ∞） */}
              <Text className="gm-meta" style="display:block;margin-top:4px;color:#34d399">
                {t('profile.credits')}
                {hero.credits}
              </Text>
            </View>
          </View>

          <View className="gm-metrics">
            {metrics.map((m) => (
              <View key={m.key} className="gm-metric">
                <Text
                  className="gm-metric-value"
                  style={m.value === null ? 'color:#71717a' : 'color:#ffffff'}
                >
                  {valueOrDash(m.value)}
                </Text>
                <Text className="gm-metric-label">{t(m.labelKey)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/** ── 2. 当前课程（课纲来自后端，进度来自 task-progress） ─────── */}
      {course && (
        <View className="gm-card">
          <View style="display:flex;align-items:center;justify-content:space-between">
            <Text className="gm-section-title">📘 {t('profile.currentCourse')}</Text>
            <Text className="gm-progress-num">
              {course.unavailable ? NO_DATA : `${course.completedSteps} / ${course.totalSteps}`}
            </Text>
          </View>

          <View style="display:flex;align-items:center;margin-top:24px">
            <View
              className="gm-course-cover"
              style="display:flex;align-items:center;justify-content:center;background-color:#065f46"
            >
              <Text style="font-size:40px">📗</Text>
            </View>
            <View style="min-width:0;flex:1;margin-left:24px">
              <Text className="gm-course-title">{course.title}</Text>
              <Text className="gm-meta" style="display:block">
                {course.subtitle}
              </Text>
              <View className="gm-inline-track">
                <View className="gm-inline-fill" style={`width:${progressPct}%`} />
              </View>
            </View>
          </View>

          {course.unavailable && (
            <Text className="gm-meta" style="display:block;margin-top:16px;line-height:1.7;opacity:0.75">
              {t('profile.courseUnavailable')}
            </Text>
          )}

          <View
            className="gm-btn gm-btn--ghost"
            style="margin-top:32px"
            onClick={() => Taro.navigateTo({ url: '/pages/learn/index' })}
          >
            <Text>
              {t('profile.continue')}
              {course.title}
              {' ›'}
            </Text>
          </View>
        </View>
      )}

      {/** ── 3. 积分明细（替代原「订单记录」：后端没有订单表，但有真流水） ── */}
      <View className="gm-card">
        <View style="display:flex;align-items:center;justify-content:space-between">
          <Text className="gm-section-title">💠 {t('profile.creditsCard')}</Text>
          <Text className="gm-meta">{hero ? hero.credits : NO_DATA}</Text>
        </View>

        <View style="margin-top:24px">
          {creditRows === null && <Text className="gm-meta">{t('profile.loading')}</Text>}
          {creditRows !== null && creditRows.length === 0 && (
            <Text className="gm-meta">{t('profile.creditsEmpty')}</Text>
          )}
          {(creditRows || []).map((row) => (
            <View
              key={row.id}
              className="gm-order-row"
              onClick={() => setTxDetail((creditTxs || []).find((x) => x.id === row.id) || null)}
            >
              <View style="min-width:0;flex:1">
                <Text className="gm-order-title">{row.description}</Text>
                <Text className="gm-order-meta">
                  {row.createdAt} · {row.type}
                </Text>
              </View>
              <View style="text-align:right;flex-shrink:0">
                <Text className="gm-order-amount" style={row.amount < 0 ? 'color:#f87171' : 'color:#34d399'}>
                  {row.amountText}
                </Text>
                <Text className="gm-order-status">
                  {t('profile.balanceAfter')} {row.balanceAfter}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/** ── 4. 通知（`/api/notifications`） ────────────────────────── */}
      <View className="gm-card">
        <View style="display:flex;align-items:center;justify-content:space-between">
          <Text className="gm-section-title">🔔 {t('profile.notifications')}</Text>
          <Text className="gm-meta">
            {notifications === null ? NO_DATA : `${unread} ${t('profile.unread')}`}
          </Text>
        </View>

        <View style="margin-top:24px">
          {notifications !== null && notifications.length === 0 && (
            <Text className="gm-meta">{t('profile.notificationsEmpty')}</Text>
          )}
          {(notifications || []).map((n) => (
            <View key={n.id} className="gm-order-row" style={n.isRead ? 'opacity:0.55' : ''}>
              <View style="min-width:0;flex:1">
                <Text className="gm-order-title">
                  {notificationIcon(n.type)} {n.title}
                </Text>
                <Text className="gm-order-meta">
                  {n.timeAgo}
                  {n.author ? ` · ${n.author}` : ''}
                </Text>
              </View>
              {!n.isRead && (
                <View style="flex-shrink:0;width:16px;height:16px;border-radius:999px;background-color:#10b981" />
              )}
            </View>
          ))}
        </View>

        {unread > 0 && (
          <View className="gm-btn gm-btn--ghost" style="margin-top:24px" onClick={() => void handleMarkAllRead()}>
            <Text>{t('profile.markAllRead')}</Text>
          </View>
        )}
      </View>

      {/** ── 5. 积分流水详情弹窗 ─────────────────────────────────── */}
      {txDetail && (
        <View className="gm-modal-mask" onClick={() => setTxDetail(null)}>
          <View className="gm-modal-card" onClick={(e) => e.stopPropagation()}>
            <View className="gm-modal-head">
              <Text className="gm-modal-title">{t('profile.txTitle')}</Text>
              <Text className="gm-modal-close" onClick={() => setTxDetail(null)}>
                ✕
              </Text>
            </View>

            <View style="text-align:center;margin:40px 0">
              <Text className="gm-meta">{t('profile.txAmount')}</Text>
              <Text className="gm-modal-amount" style={txDetail.amount < 0 ? 'color:#f87171' : 'color:#34d399'}>
                {txDetail.amount > 0 ? '+' : ''}
                {txDetail.amount}
              </Text>
              <View className="gm-modal-badge">
                <Text>
                  ✓ {t('profile.balanceAfter')} {txDetail.balanceAfter}
                </Text>
              </View>
            </View>

            <View className="gm-modal-rows">
              {[
                { k: t('profile.txDescription'), v: txDetail.description },
                { k: t('profile.txType'), v: txDetail.type },
                { k: t('profile.txTime'), v: txDetail.createdAt.replace('T', ' ').slice(0, 19) },
                { k: t('profile.txId'), v: txDetail.id },
              ].map((row) => (
                <View key={row.k} className="gm-modal-row">
                  <Text className="gm-meta">{row.k}:</Text>
                  <Text className="gm-modal-value">{row.v}</Text>
                </View>
              ))}
            </View>

            <View className="gm-btn gm-btn--ghost" style="margin-top:40px" onClick={() => setTxDetail(null)}>
              <Text>{t('profile.close')}</Text>
            </View>
          </View>
        </View>
      )}

      {/** ── 6. 设置（语言 / 主题，本机偏好，与后端无关） ─────────────── */}
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

        {/** 「我的」页的数据来源如实写在界面上（省得下一个人还要猜） */}
        <Text className="gm-meta" style="display:block;margin-top:16px;line-height:1.6;opacity:0.6">
          {t('profile.dataSource')}
          {CURRENT_USER_ID}
        </Text>
      </View>

      {/** ── 7. 架构方案入口 ─────────────────────────────────────── */}
      <View className="gm-card" onClick={() => Taro.navigateTo({ url: '/pages/architecture/index' })}>
        <View style="display:flex;align-items:center;justify-content:space-between">
          <Text className="gm-section-title">📄 课程体系规划方案</Text>
          <Text className="gm-learn-arrow">›</Text>
        </View>
        <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
          课程编写与教务管理体系全景方案（教研顶层设计 · 5 级黄金 20 分钟 · 挂进度条）
        </Text>
      </View>

      <BottomNav active="profile" />
    </View>
  );
}
