import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import BottomNav from '../../components/BottomNav';
import ArchitectureStudio from '../../components/ArchitectureStudio';
import ArchitectureAudioSync from '../../components/ArchitectureAudioSync';
import ArchitectureSchema from '../../components/ArchitectureSchema';
import { buildArchitectureMarkdown } from '../../utils/architectureMarkdown';
import { MASTER_CURRICULUM_BLUEPRINT } from '../../data/curriculumPlanData';
import { pageClass } from '../../utils/settings';

/**
 * 课程编写与教务管理体系规划方案（「架构说明」）
 * ===============================================
 *
 * ## 内容来源（重要：一个字都没重写）
 *
 * 正文直接来自 **`src/data/curriculumPlanData.ts`** —— 这份文件是从
 * `guitarmate-frontend/src/data/curriculumPlanData.ts` **逐字节复制**过来的
 * （与和弦库 `chordLibraryData.ts` 同一套做法：该文件零 import，可 1:1 搬运）。
 * 好处是**文案只有一份**，Web 版改方案、这边同步复制即可，不会出现"两端说法不一样"。
 *
 * ## 与 Web 版的差异（都是平台适配，不是漏做）
 *
 * Web 版 `ArchitectureModal` 是一个**四页签弹窗**：
 * ```
 * blueprint  规划方案（本次移植的就是这一页，也是内容主体）
 * studio     教学工作室的交互演示（调 BPM / 关键点增删 / 解锁策略开关…）
 * audio-sync 音频上传与"挂进度条"的交互演示（波形点击、小节网格）
 * schema     数据契约 / 表结构摘录
 * ```
 * 后三页是**纯前端 mock 的交互演示**（点一下看效果，不写库），搬运它们等于把三个演示面板重做一遍。
 * 这一轮先把**方案正文**落地（学员/教研真正要看的内容），并在页尾把这件事写清楚 ——
 * 而不是摆三个点了没反应的页签。
 *
 * 形态上从「弹窗」改成「独立页」：这份方案有 10 个章节、含多张表格，
 * 塞进手机上的居中弹窗里几乎没法读；独立页有原生导航栏返回键，也更符合小程序的阅读习惯。
 */
/**
 * 页签（与 Web 版 `ArchitectureModal` 的四个页签同名，**四个都做完了**）：
 * 1. 规划方案全景文档（`data/curriculumPlanData.ts` 逐字节复制）
 * 2. 课程编排后台 (CMS Studio)（`ArchitectureStudio`）
 * 3. 音频上传与六线谱挂进度条工作台（`ArchitectureAudioSync`）
 * 4. 数据模型与数据库规范（`ArchitectureSchema`）
 */
const TABS = [
  { key: 'blueprint' as const, label: '规划方案全景文档', icon: '🗂' },
  { key: 'studio' as const, label: '课程编排后台 (CMS Studio)', icon: '🎛' },
  { key: 'audio-sync' as const, label: '音频上传与六线谱挂进度条工作台', icon: '📻' },
  { key: 'schema' as const, label: '数据模型与数据库规范', icon: '🗄' },
];

export default function Architecture() {
  const [tab, setTab] = useState<'blueprint' | 'studio' | 'audio-sync' | 'schema'>('blueprint');
  /** 「复制完整 Markdown 全案」的完成反馈（Web 版是 2.5s 后复位） */
  const [copied, setCopied] = useState(false);
  const [sectionId, setSectionId] = useState(MASTER_CURRICULUM_BLUEPRINT[0]?.id || '');

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: '课程体系规划方案' });
  });

  const section = useMemo(
    () => MASTER_CURRICULUM_BLUEPRINT.find((s) => s.id === sectionId) || MASTER_CURRICULUM_BLUEPRINT[0],
    [sectionId],
  );

  return (
    <View className={pageClass()}>
      <View className="gm-arch-head">
        <Text className="gm-arch-title">《GuitarMate 弦音伴侣》课程编写与教务管理全景方案</Text>
        <Text className="gm-meta" style="display:block;margin-top:8px">
          {tab === 'blueprint'
            ? `共 ${MASTER_CURRICULUM_BLUEPRINT.length} 章 · 与 Web 版同一份文案（逐字节同源）`
            : tab === 'studio'
              ? '课程教务工作台原型演示 · 数据仅存在内存里（不写库）'
              : tab === 'audio-sync'
                ? '音频上传与挂进度条原型演示 · 波形/游标会真的动（音频是 mock）'
                : '核心数据模型规划稿 · 与现有实现有差异，正文不修（见页尾说明）'}
        </Text>
      </View>

      {/** 顶层页签（与 Web 版同名；未移植的两个不摆） */}
      <ScrollView scrollX className="gm-arch-tabs">
        {TABS.map((t) => (
          <Text
            key={t.key}
            className={`gm-arch-tab${t.key === tab ? ' gm-arch-tab--on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.icon} {t.label}
          </Text>
        ))}
      </ScrollView>

      {tab === 'studio' && <ArchitectureStudio />}
      {tab === 'audio-sync' && <ArchitectureAudioSync />}
      {tab === 'schema' && <ArchitectureSchema />}

      {tab === 'blueprint' && (
        <View>
      <ScrollView scrollX className="gm-arch-tabs">
        {MASTER_CURRICULUM_BLUEPRINT.map((s) => (
          <Text
            key={s.id}
            className={`gm-arch-tab${s.id === section?.id ? ' gm-arch-tab--on' : ''}`}
            onClick={() => setSectionId(s.id)}
          >
            {s.title}
          </Text>
        ))}
      </ScrollView>

      {section && (
        <View className="gm-card">
          <View className="gm-arch-badge">
            <Text>{section.badge}</Text>
          </View>
          <Text className="gm-arch-section-title">{section.title}</Text>
          <Text className="gm-arch-summary">{section.summary}</Text>

          {section.content.map((p) => (
            <Text key={p.slice(0, 24)} className="gm-arch-p">
              {p}
            </Text>
          ))}

          {(section.subsections || []).map((sub) => (
            <View key={sub.subtitle} className="gm-arch-sub">
              <Text className="gm-arch-sub-title">{sub.subtitle}</Text>

              {sub.items.map((item) => (
                <View key={item.slice(0, 24)} className="gm-arch-item">
                  <Text className="gm-arch-dot">•</Text>
                  <Text className="gm-arch-item-text">{item}</Text>
                </View>
              ))}

              {sub.table && (
                /** 5 列的表格必须能横滑，否则手机上会被压成竖排 */
                <ScrollView scrollX className="gm-arch-table-wrap">
                  <View className="gm-arch-table">
                    <View className="gm-arch-tr gm-arch-tr--head">
                      {sub.table.headers.map((h) => (
                        <Text key={h} className="gm-arch-th">
                          {h}
                        </Text>
                      ))}
                    </View>
                    {sub.table.rows.map((row) => (
                      <View key={row.join('|')} className="gm-arch-tr">
                        {row.map((cell, i) => (
                          <Text key={`${row[0]}-${i}`} className="gm-arch-td">
                            {cell}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}

              {sub.codeBlock && (
                <ScrollView scrollX className="gm-arch-code-wrap">
                  <Text className="gm-arch-code">{sub.codeBlock}</Text>
                </ScrollView>
              )}
            </View>
          ))}
        </View>
      )}

        </View>
      )}

      <View className="gm-card">
        <Text className="gm-section-title">📄 关于这份方案</Text>
        <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
          Web 版的四个页签现在已经全部移植（规划方案 / 课程编排后台 / 音频挂进度条 / 数据模型）。
          弹窗页脚原来的「返回体验小程序」按钮在这里不需要 —— 小程序有原生返回键。
        </Text>
        <Text className="gm-meta" style="display:block;margin-top:12px;line-height:1.7">
          正文与 Web 版同源（小程序里的 data/curriculumPlanData.ts 是从 Web 版逐字节复制过来的）；
          小程序端只做了排版与配色适配。
        </Text>

        {/**
          * 「复制完整 Markdown 全案」：Web 版在弹窗页脚，这里放在页面里。
          * 拼接逻辑与 Web 的 `handleCopyPlan()` 逐行一致（见 `utils/architectureMarkdown.ts`），
          * 剪贴板用 `Taro.setClipboardData`（两端都有）。
          */}
        <View
          className={`gm-arch-copy${copied ? ' gm-arch-copy--done' : ''}`}
          onClick={() => {
            Taro.setClipboardData({ data: buildArchitectureMarkdown() })
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              })
              .catch(() => Taro.showToast({ title: '当前环境不允许写剪贴板', icon: 'none' }));
          }}
        >
          <Text>{copied ? '✓ 已复制全案（Markdown）' : '📋 复制完整 Markdown 全案'}</Text>
        </View>
      </View>

      <BottomNav active="profile" />
    </View>
  );
}
