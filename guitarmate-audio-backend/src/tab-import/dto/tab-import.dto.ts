import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

/**
 * 解析请求 —— 支持三种投喂方式：
 * 1. `content`：文本（ASCII tab / 和弦表 / MusicXML / JSON 字符串）
 * 2. `data`：已解析的 JSON 对象（SoloTrace / TabProject）
 * 3. `base64`：二进制的 base64（.gpx）
 */
export class ParseTabDto {
  @ApiPropertyOptional({
    description: '文本内容（ASCII tab / 和弦表 / MusicXML / JSON 字符串）',
    example: 'e|-------0--------|\nB|-----1----------|\nG|---2------------|',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '已解析的 JSON 对象（SoloTrace / Basic Pitch / TabProject）' })
  @IsOptional()
  @IsObject()
  data?: any;

  @ApiPropertyOptional({ description: '二进制文件的 base64（.gpx）' })
  @IsOptional()
  @IsString()
  base64?: string;

  @ApiPropertyOptional({
    description: '指定源格式；省略时自动识别',
    enum: ['ascii-tab', 'chord-sheet', 'musicxml', 'gpx', 'gp5', 'solo-trace', 'tab-project'],
    example: 'ascii-tab',
  })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ description: '原始文件名（用于生成标题与溯源）', example: 'greensleeves.txt' })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ description: '原始下载地址（溯源用）' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: '来源站点名', example: 'Ultimate Guitar' })
  @IsOptional()
  @IsString()
  site?: string;

  @ApiPropertyOptional({ description: '覆盖曲名（文件头缺失时使用）', example: 'Canon in D' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '覆盖作者' })
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiPropertyOptional({ description: '覆盖 BPM（ASCII 谱常缺速度）', example: 90 })
  @IsOptional()
  @IsNumber()
  bpm?: number;

  @ApiPropertyOptional({ description: '覆盖拍号', example: '4/4' })
  @IsOptional()
  @IsString()
  timeSignature?: string;

  @ApiPropertyOptional({ description: '覆盖变调夹品位', example: 0 })
  @IsOptional()
  @IsInt()
  capo?: number;

  @ApiPropertyOptional({
    description: '乐器 / 声道',
    enum: ['guitar', 'guitar_lead', 'guitar_rhythm', 'bass', 'piano', 'other'],
    example: 'guitar_rhythm',
  })
  @IsOptional()
  @IsString()
  instrument?: any;

  @ApiPropertyOptional({
    description:
      '版权状态（决定能否对外发布）：public-domain / original-arrangement / licensed / user-submission / copyrighted / unknown',
    example: 'public-domain',
  })
  @IsOptional()
  @IsString()
  rights?: any;

  @ApiPropertyOptional({ description: '版权备注', example: '传统民谣，公有领域' })
  @IsOptional()
  @IsString()
  rightsNote?: string;

  @ApiPropertyOptional({ description: '和弦表：每小节和弦数（默认 1）', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  chordsPerBar?: number;

  @ApiPropertyOptional({ description: '和弦表：扫弦模式覆盖', example: 'D D U U D U' })
  @IsOptional()
  @IsString()
  strumPattern?: string;

  @ApiPropertyOptional({ description: 'GPX：选择第几个可弹奏声部（0 起）', example: 0 })
  @IsOptional()
  @IsInt()
  trackIndex?: number;
}

export class NewScoreDto {
  @ApiProperty({ description: '曲名', example: 'Canon in D' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: '作者', example: 'Johann Pachelbel' })
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiPropertyOptional({ description: 'BPM', example: 72 })
  @IsOptional()
  @IsNumber()
  bpm?: number;

  @ApiPropertyOptional({ description: '拍号', example: '4/4' })
  @IsOptional()
  @IsString()
  timeSignature?: string;

  @ApiPropertyOptional({ description: '原曲音频路径或 URL（可留空，发布时再填）' })
  @IsOptional()
  @IsString()
  originalAudio?: string;

  @ApiPropertyOptional({ description: '封面图 URL' })
  @IsOptional()
  @IsString()
  coverUrl?: string;
}

export class SaveTabProjectDto {
  @ApiPropertyOptional({
    description: '目标曲目 ID；留空时会用 newScore 自动创建一首 draft 曲目',
    example: 'cmu8g2bpf0000i5aqfe8asyf3',
  })
  @IsOptional()
  @IsString()
  scoreId?: string;

  @ApiPropertyOptional({ description: '自动创建曲目时的元信息', type: NewScoreDto })
  @IsOptional()
  @IsObject()
  newScore?: NewScoreDto;

  @ApiProperty({ description: '要保存的 TabProject（来自 /api/tab-import/parse 的 project 字段）' })
  @IsObject()
  project!: any;

  @ApiPropertyOptional({ description: '文件名（用于落盘命名）', example: 'canon-in-d.tabproject' })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ description: '复用指定 Track（不传则按 instrument 自动匹配/创建）' })
  @IsOptional()
  @IsString()
  updateTrackId?: string;
}
