import { MASTER_CURRICULUM_BLUEPRINT } from '../data/curriculumPlanData';

/**
 * 把规划方案导成 Markdown（「复制完整 Markdown 全案」按钮用）
 * ============================================================
 *
 * 逐行照搬 Web 版 `ArchitectureModal.handleCopyPlan()` 的拼法：
 * ```
 * # 《GuitarMate 弦音伴侣》…全景规划方案
 * ## {章节标题} [{徽标}]
 * {摘要}
 * {段落…}
 * ### {子节标题}
 * - {条目…}
 * | 表头 | … |
 * | --- | … |
 * | 单元格 | … |
 * ```typescript
 * {代码块}
 * ```
 * ---
 * ```
 * 抽成**纯函数**的原因：剪贴板那一段没法在 Node 里测，而"拼出来的 Markdown 对不对"可以。
 * 两端文案同源（都来自 `curriculumPlanData.ts`），所以导出的 Markdown 也应当一致。
 */
export function buildArchitectureMarkdown(): string {
  let text = `# 《GuitarMate 弦音伴侣》吉他课程编写与教务管理体系全景规划方案\n\n`;

  MASTER_CURRICULUM_BLUEPRINT.forEach((sec) => {
    text += `## ${sec.title} [${sec.badge}]\n${sec.summary}\n\n`;

    sec.content.forEach((p) => {
      text += `${p}\n\n`;
    });

    (sec.subsections || []).forEach((sub) => {
      text += `### ${sub.subtitle}\n`;
      sub.items.forEach((item) => {
        text += `- ${item}\n`;
      });
      if (sub.table) {
        text += `\n| ${sub.table.headers.join(' | ')} |\n`;
        text += `| ${sub.table.headers.map(() => '---').join(' | ')} |\n`;
        sub.table.rows.forEach((row) => {
          text += `| ${row.join(' | ')} |\n`;
        });
        text += `\n`;
      }
      if (sub.codeBlock) {
        text += '```typescript\n' + sub.codeBlock + '\n```\n\n';
      }
    });

    text += `\n---\n\n`;
  });

  return text;
}
