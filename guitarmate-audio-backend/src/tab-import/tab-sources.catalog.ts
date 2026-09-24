/**
 * 谱面数据源目录（含版权等级）
 * =============================
 *
 * ⚠️ 这是产品能不能上线的**前置条件**，不是附属说明。
 *
 * 现实情况：
 * 1. **不存在**「Hotel California 节奏吉他 + SoloTrace 风格六线谱 JSON」这种公开数据集。
 *    网上能搜到的都是**人工制谱**（ASCII tab / Guitar Pro / Songsterr 私有格式），
 *    或者是模型转录的零散 demo，没有名曲级别的公开 JSON 语料。
 * 2. 人工制谱质量远高于「AI 从音频扒节奏吉他」，所以正确做法是
 *    **人工 tab 做 ground truth，Demucs + Basic Pitch 做自动草稿**，再用 TabProject 统一。
 * 3. 但绝大多数流行歌曲的六线谱**仍在版权保护期内**（Hotel California 就是典型）。
 *    直接抓 UG / Songsterr 的整曲谱发布到小程序属于侵权风险。
 *    合规路线只有三条：
 *      a. **公有领域**曲目（古典吉他、传统民谣、巴洛克）
 *      b. **官方授权**渠道（MuseScore 官方合作曲库 / Guitar Pro mySongBook 等）
 *      c. **自有编配**（教研团队自己扒的，版权归自己）
 */

export type SourceTier =
  /** ✅ 可自由抓取与再分发（CC0 / 公有领域） */
  | 'public-domain'
  /** ✅ 有官方授权/订阅渠道，可按许可协议使用 */
  | 'official-licensed'
  /** ⚠️ 用户投稿，仅供内部教研参考 / 校对，不可直接对外发布 */
  | 'reference-only'
  /** ❌ 明确禁止抓取（ToS），或私有格式，仅人工访问 */
  | 'restricted';

export interface TabSourceEntry {
  id: string;
  name: string;
  url: string;
  tier: SourceTier;
  formats: string[];
  access: string;
  howTo: string;
  caution: string;
  importAs?: 'musicxml' | 'gpx' | 'ascii-tab' | 'chord-sheet' | 'solo-trace';
}

export const TAB_SOURCES: TabSourceEntry[] = [
  {
    id: 'openscore',
    name: 'OpenScore / MuseScore 公共领域专区',
    url: 'https://musescore.com/openscore',
    tier: 'public-domain',
    formats: ['MusicXML', 'MSCZ', 'PDF'],
    access: '免费（CC0，无需登录即可下载 MusicXML）',
    howTo:
      '搜索古典吉他曲目（Sor / Carcassi / Tárrega / Bach）→ 下载 .musicxml → 用 format=musicxml 导入。',
    caution: 'CC0 可自由使用，是**最推荐**的曲库来源。',
    importAs: 'musicxml',
  },
  {
    id: 'musescore-official',
    name: 'MuseScore.com 官方授权曲库',
    url: 'https://musescore.com',
    tier: 'official-licensed',
    formats: ['MusicXML', 'MSCZ', 'GP'],
    access: 'Pro 订阅可下载 MusicXML / Guitar Pro',
    howTo:
      'MuseScore 与版权方签有授权协议，带官方标记的曲目可下载 MusicXML。下载后导入并进入后台审核。',
    caution:
      '必须遵守 MuseScore 的许可条款（订阅期内下载、不得再分发原始文件）。发布到小程序前请确认使用范围。',
    importAs: 'musicxml',
  },
  {
    id: 'guitarpro-mysongbook',
    name: 'Guitar Pro / mySongBook 官方曲库',
    url: 'https://www.guitar-pro.com/c/3-mysongbook',
    tier: 'official-licensed',
    formats: ['GP', 'GPX', 'PDF'],
    access: '付费购买单曲 / 订阅',
    howTo: '购买后得到 .gpx → 直接 format=gpx 导入（二进制 .gp5 请先转 MusicXML）。',
    caution: '官方授权曲库，允许个人学习使用；对外发布仍需评估范围。',
    importAs: 'gpx',
  },
  {
    id: 'classical-archives',
    name: '古典吉他公共领域谱库（IMSLP / Delcamp / 8notes 等）',
    url: 'https://imslp.org',
    tier: 'public-domain',
    formats: ['PDF', 'MusicXML（部分）', 'ASCII'],
    access: '免费',
    howTo: '优先找带 MusicXML 的条目；只有 PDF 时用 MuseScore 重新录入（教研成本换版权安全）。',
    caution: '注意「编配版本」也可能有版权 —— 用原始出版物或明确标注 PD 的版本。',
    importAs: 'musicxml',
  },
  {
    id: 'ultimate-guitar',
    name: 'Ultimate Guitar',
    url: 'https://www.ultimate-guitar.com',
    tier: 'reference-only',
    formats: ['ASCII tab', 'GP', '官方 Tab 视图'],
    access: '免费浏览（部分需订阅），**ToS 禁止自动化抓取**',
    howTo:
      '仅人工复制**你自己有合法使用权的**谱面文本到本平台（后台「ASCII tab」导入），用于教研比对 / 内部校准。',
    caution:
      '❌ 不要写爬虫批量抓取（违反 ToS）。❌ 流行歌曲的整曲六线谱受版权保护，不能作为小程序对外内容。',
    importAs: 'ascii-tab',
  },
  {
    id: 'songsterr',
    name: 'Songsterr',
    url: 'https://www.songsterr.com',
    tier: 'restricted',
    formats: ['私有 JSON', '播放器内交互谱'],
    access: '订阅制',
    howTo: '❌ 不抓取、不解析其私有格式。若需要，请人工对照后自制编配（自有编配 = 你自己的版权）。',
    caution: '私有格式 + ToS 禁止抓取 + 曲目多为版权作品，三条都踩线。',
  },
  {
    id: 'guitartabs-archive',
    name: 'GuitarTabArchive（1996 老档案）等历史 ASCII 站点',
    url: 'https://www.guitartabarchive.com',
    tier: 'reference-only',
    formats: ['ASCII tab'],
    access: '免费',
    howTo: '古典/传统曲目部分可直接作为公有领域素材导入；流行曲目仅作参考。',
    caution: '站点本身也声明仅供个人学习。逐曲判断版权。',
    importAs: 'ascii-tab',
  },
  {
    id: 'alphatab-samples',
    name: 'alphaTab 官方示例谱',
    url: 'https://github.com/CoderLine/alphaTab/tree/develop/test-data',
    tier: 'public-domain',
    formats: ['GP', 'GPX', 'MusicXML'],
    access: '免费（仓库内测试数据）',
    howTo: '直接下载 .gpx / .musicxml 做**解析器回归测试**，不要当正式曲库。',
    caution: '测试数据，多为作者自制小曲，可自由用于开发测试。',
    importAs: 'gpx',
  },
  {
    id: 'solo-trace',
    name: 'SoloTrace / Demucs + Basic Pitch（自建转录流水线）',
    url: 'https://github.com/spotify/basic-pitch',
    tier: 'reference-only',
    formats: ['SoloTrace JSON', 'Basic Pitch MIDI/JSON'],
    access: '自建（本地工作站）',
    howTo:
      'Demucs htdemucs_6s 分离 → SoloTrace / Basic Pitch 转录 → format=solo-trace 导入 → 人工复核低置信度音符。',
    caution: '转录结果**不改变原曲版权状态**：仍需要合法来源的音频，且对外发布仍需授权。',
    importAs: 'solo-trace',
  },
];

/** 公有领域曲目建议（可直接上线，零版权风险） */
export interface PublicDomainSuggestion {
  title: string;
  composer: string;
  level: '入门' | '进阶' | '高级';
  focus: string;
  source: string;
  importAs: 'musicxml' | 'gpx' | 'ascii-tab' | 'chord-sheet';
}

export const PUBLIC_DOMAIN_REPERTOIRE: PublicDomainSuggestion[] = [
  {
    title: 'Greensleeves（绿袖子）',
    composer: 'Traditional（16 世纪英格兰）',
    level: '入门',
    focus: 'i–VII–VI 级数进行、三拍子分解和弦、低把位按弦',
    source: 'IMSLP / OpenScore',
    importAs: 'musicxml',
  },
  {
    title: 'Canon in D（卡农）主旋律 + 低音线',
    composer: 'Johann Pachelbel',
    level: '入门',
    focus: 'D–A–Bm–F#m–G–D–G–A 万能和弦进行、右手 p-i-m-a',
    source: 'IMSLP',
    importAs: 'musicxml',
  },
  {
    title: 'Romance（西班牙浪漫曲 / Anonymous Romance）',
    composer: 'Anonymous（Public Domain）',
    level: '进阶',
    focus: '横按转换、三连音琶音、旋律与伴奏声部平衡',
    source: 'IMSLP / Delcamp',
    importAs: 'musicxml',
  },
  {
    title: 'Lágrima（泪）',
    composer: 'Francisco Tárrega',
    level: '进阶',
    focus: '滑音与延音、装饰音、乐句呼吸',
    source: 'IMSLP',
    importAs: 'musicxml',
  },
  {
    title: 'Study in A minor / C major（练习曲 Op.60 选段）',
    composer: 'Matteo Carcassi',
    level: '入门',
    focus: '右手分解型、音阶走句、大横按入门',
    source: 'IMSLP（Op.60 已进入公有领域）',
    importAs: 'musicxml',
  },
  {
    title: 'Bourrée in E minor (BWV 996)',
    composer: 'J. S. Bach',
    level: '高级',
    focus: '对位线条、左手独立性、快速换把',
    source: 'IMSLP / OpenScore',
    importAs: 'musicxml',
  },
  {
    title: 'Malagueña（传统西班牙民谣）',
    composer: 'Traditional',
    level: '进阶',
    focus: 'rasgueado 扫弦节奏、旋律与扫弦叠加',
    source: '传统曲目（注意选用 PD 编配版本）',
    importAs: 'chord-sheet',
  },
  {
    title: 'House of the Rising Sun',
    composer: 'Traditional（编配公有领域）',
    level: '入门',
    focus: 'Am–C–D–F–E 级数、6/8 分解、节奏型稳定',
    source: '传统民谣',
    importAs: 'chord-sheet',
  },
  {
    title: 'Scarborough Fair',
    composer: 'Traditional（英格兰民谣）',
    level: '入门',
    focus: '三拍子、指弹分解、旋律在高音弦上的处理',
    source: '传统民谣',
    importAs: 'chord-sheet',
  },
  {
    title: 'Asturias (Leyenda) 前 8 小节',
    composer: 'Isaac Albéniz',
    level: '高级',
    focus: '轮指 tremolo、快速横按、力度层次',
    source: 'IMSLP（作曲者 1909 年逝世，已进入公有领域）',
    importAs: 'musicxml',
  },
];

export interface CopyrightHint {
  tier: 'public-domain' | 'copyrighted' | 'unknown';
  reason: string;
}

/** 一批「下载量最高、也最容易被误抓」的版权曲目（用于主动拦截提示） */
const KNOWN_COPYRIGHTED = [
  'hotel california',
  'stairway to heaven',
  'wonderwall',
  'nothing else matters',
  'sweet child o mine',
  'smells like teen spirit',
  'knockin on heavens door',
  'wish you were here',
  'tears in heaven',
  'blackbird',
  'classical gas',
  'shape of you',
  'perfect',
  'canon rock',
];

const KNOWN_PUBLIC_DOMAIN = PUBLIC_DOMAIN_REPERTOIRE.map((s) =>
  s.title
    .toLowerCase()
    .replace(/（[^）]*）|\([^)]*\)/g, '')
    .trim(),
);

/** 标题 → 版权提示（导入时给出明确警告，而不是模糊的「注意版权」） */
export function copyrightHint(title?: string): CopyrightHint {
  const t = (title || '').trim().toLowerCase();
  if (!t) {
    return { tier: 'unknown', reason: '未提供曲名，无法判断版权状态，请人工确认。' };
  }
  if (KNOWN_COPYRIGHTED.some((k) => t.includes(k))) {
    return {
      tier: 'copyrighted',
      reason:
        '该曲目仍在版权保护期内。整曲六线谱**不可**直接发布到小程序；' +
        '建议只用「和弦进行 + 段落结构 + 节奏型」做教学演示，或取得版权方授权。',
    };
  }
  if (/traditional|anon|民谣|传统/.test(t) || KNOWN_PUBLIC_DOMAIN.some((k) => k && k.includes(t))) {
    return { tier: 'public-domain', reason: '传统 / 公有领域曲目，可安全使用（注意选用 PD 编配版本）。' };
  }
  return {
    tier: 'unknown',
    reason:
      '版权状态未知。请确认三件事之一：① 作者已故 70 年以上（公有领域）；② 你已获得授权；③ 这是你们自己的编配。',
  };
}
