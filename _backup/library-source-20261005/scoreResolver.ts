import { ScoreData } from '../types/music';
import { ChapterItem, CourseReturnContext } from '../types/curriculum';
import { 
  INITIAL_LIBRARY_ITEMS, 
  LAID_BACK_GUITARS_SCORE, 
  ISOLATED_SCORE, 
  A_MINOR_ETUDE_SCORE, 
  CANON_IN_D_SCORE 
} from '../data/libraryData';
import { MACAROON_5_SCORE } from '../data/macaroon5Demo';

export type { CourseReturnContext };

/**
 * Resolves the designated Six-line Tab score for a curriculum chapter item.
 * Ensures the student and teacher view the exact practice piece with matching
 * title, tempo, and tablature structure instead of falling back blindly to a sample.
 */
export function resolveScoreForItem(item: ChapterItem): ScoreData {
  // 1. Direct ID matching against library items
  const matchedLibraryItem = INITIAL_LIBRARY_ITEMS.find((s) => s.id === item.scoreId);
  if (matchedLibraryItem) {
    const base = matchedLibraryItem.score;
    return {
      ...base,
      id: `score-${item.id}`,
      title: item.scoreTitle || item.title || base.title,
      subtitle: item.description || base.subtitle || '课程指定六线谱实战跟练',
      tempo: item.bpmTarget || base.tempo,
    };
  }

  // 2. Keyword & chapter based specialized resolution
  const titleLower = (item.title + ' ' + (item.scoreTitle || '') + ' ' + (item.description || '')).toLowerCase();

  // Chapter 1: 空弦 / 拨弦 / 均匀度 / 初始热身 -> Peaceful Canon in D arpeggio style at 60 BPM
  if (titleLower.includes('空弦') || titleLower.includes('拨弦') || item.id === 'item_101_2') {
    return {
      ...CANON_IN_D_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || '实战乐谱：右手空弦拨弦与音色均匀度练习谱',
      subtitle: '慢速空弦交替拨弦 · 60 BPM · 关注右手发力与琴弦共鸣',
      tempo: 60,
    };
  }

  // Chapter 3 & 5: 扫弦 / 四分八分 / F和弦过渡 -> Laid Back Guitars acoustic chords at 72 BPM
  if (titleLower.includes('扫弦') || titleLower.includes('基础扫弦') || item.id === 'item_103_2') {
    return {
      ...LAID_BACK_GUITARS_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || '实战乐谱：四分音符与八分音符基础扫弦跟练谱',
      subtitle: '下扫与上扫手腕放松跟练 · 72 BPM · 双行高精度六线谱',
      tempo: 72,
    };
  }

  // Chapter 4: 分解和弦 / 琶音 -> A minor etude acoustic arpeggio
  if (titleLower.includes('分解') || titleLower.includes('琶音') || item.id === 'item_104_2') {
    return {
      ...A_MINOR_ETUDE_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || '实战乐谱：经典分解和弦慢速伴奏谱',
      subtitle: '经典民谣 8 小节分解琶音循环 · 68 BPM',
      tempo: 68,
    };
  }

  // Chapter 5: F大横按过渡
  if (titleLower.includes('横按') || titleLower.includes('f和弦') || item.id === 'item_105_3') {
    return {
      ...LAID_BACK_GUITARS_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || '实战乐谱：F和弦过渡实战跟练谱',
      subtitle: '攻克实战歌曲中的大横按转换卡顿 · 65 BPM',
      tempo: 65,
    };
  }

  // Chapter 6 & 7: 切音打板 / 附点切分 -> Isolated rhythmic electric/acoustic groove
  if (titleLower.includes('切音') || titleLower.includes('打板') || titleLower.includes('附点') || item.id === 'item_106_2' || item.id === 'item_107_2') {
    return {
      ...ISOLATED_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || (item.id === 'item_106_2' ? '实战乐谱：流行扫弦切音打板实战谱' : '实战乐谱：附点切分与布鲁斯三连音练习谱'),
      subtitle: '吉他律动双轨谱面带切音高低声部标记 · 75~80 BPM',
      tempo: item.id === 'item_106_2' ? 80 : 75,
    };
  }

  // Chapter 10: 经典民谣指弹独奏 -> Laid Back Guitars fingerstyle
  if (titleLower.includes('指弹独奏') || item.id === 'item_110_2') {
    return {
      ...LAID_BACK_GUITARS_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || '实战乐谱：经典民谣简易指弹独奏跟练谱',
      subtitle: '低音弦与高音旋律线交替互动 · 70 BPM',
      tempo: 70,
    };
  }

  // Chapter 11: 击弦勾弦加花小品 -> A minor etude solo + hammer-on/pull-off
  if (titleLower.includes('击弦') || titleLower.includes('勾弦') || item.id === 'item_111_2') {
    return {
      ...A_MINOR_ETUDE_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || '实战乐谱：击弦勾弦加花小品跟练谱',
      subtitle: '双行乐谱高亮展示 H 与 P 连音线 · 85 BPM',
      tempo: 85,
    };
  }

  // Chapter 12: 自然泛音色彩 -> Canon in D harmonics
  if (titleLower.includes('泛音') || item.id === 'item_112_2') {
    return {
      ...CANON_IN_D_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || '实战乐谱：自然泛音色彩尾奏练习谱',
      subtitle: '12品与7品自然泛音与余音延绵练习 · 60 BPM',
      tempo: 60,
    };
  }

  // Chapter 13: Macaroon 5 毕业考核曲目
  if (titleLower.includes('macaroon') || item.id === 'item_113_2') {
    return {
      ...MACAROON_5_SCORE,
      id: `score-${item.id}`,
      title: item.scoreTitle || '实战乐谱：Macaroon 5 交互式双行谱慢速跟练 (毕业考核曲目)',
      subtitle: '系统高精度五线谱与六线 TAB 慢速跟练 · 104 BPM',
      tempo: 104,
    };
  }

  // 3. Fallback: Return Macaroon 5 with custom title
  return {
    ...MACAROON_5_SCORE,
    id: `score-${item.id}`,
    title: item.scoreTitle || item.title || '吉他实战双行谱',
    subtitle: item.description || '课程实战指定六线谱跟练',
    tempo: item.bpmTarget || 90,
  };
}
