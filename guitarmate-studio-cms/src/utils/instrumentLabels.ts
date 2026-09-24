/**
 * 乐器 / 音轨显示名（CMS 侧唯一口径）
 * ==================================
 *
 * 三处需要「把后端的 instrument 变成中文标签」：分轨混音面板、音轨清单、发布预览。
 * 集中在这里，避免每个组件各写一份 map 后出现「吉他 / 木吉他 / 原声吉他」三种叫法。
 *
 * 取值与 `tab-import/tab-project.types.ts` 的 `TabInstrument`、
 * `transcription.types.ts` 的 `StemInstrument`、`MeasureTrack.channel` 对齐。
 */

const INSTRUMENT_LABELS: Record<string, string> = {
  // 分轨（Demucs htdemucs_6s）
  vocals: '人声',
  drums: '鼓',
  bass: '贝斯',
  piano: '电子琴',
  guitar: '吉他',
  other: '其它',
  // 练习声道（MeasureTrack.channel / Track.instrument）
  guitar_acoustic: '木吉他',
  guitar_lead: '主音吉他',
  guitar_rhythm: '节奏吉他',
};

/** 后端 instrument → 中文标签；未知值原样返回（不隐藏信息） */
export function instrumentLabel(instrument?: string | null): string {
  const key = String(instrument || '').trim().toLowerCase();
  if (!key) return '未指定';
  return INSTRUMENT_LABELS[key] || key;
}

/** 分轨清单里带序号的名字（同一乐器多轨时区分用） */
export function stemLabel(instrument?: string | null): string {
  return `${instrumentLabel(instrument)}分轨`;
}

export default instrumentLabel;
