import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROJECT_STATUSES } from '../transcription.types';
import { AUDIO_EXTENSIONS } from '../transcription.types';

/** 上传本地音频创建项目（base64，与 /api/tab-import/parse 的写法保持一致） */
export class CreateUploadProjectDto {
  @ApiPropertyOptional({ description: '曲目名（留空则用文件名）', example: 'Canon in D' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '艺术家', example: 'Johann Pachelbel' })
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiProperty({
    description: `音频文件名（扩展名必须是 ${AUDIO_EXTENSIONS.join(' / ')}）`,
    example: 'my_song.mp3',
  })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({
    description: '音频的 base64（可带 `data:audio/mpeg;base64,` 前缀）。上限约 24MB。',
    example: 'data:audio/mpeg;base64,SUQzBAAAAAA...',
  })
  @IsString()
  @IsNotEmpty()
  base64!: string;

  @ApiPropertyOptional({ description: 'BPM（未提供时先按 100，转录后可用 Basic Pitch 的估计值覆盖）', example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(320)
  bpm?: number;

  @ApiPropertyOptional({ description: '拍号', example: '4/4', default: '4/4' })
  @IsOptional()
  @IsString()
  timeSignature?: string;

  @ApiPropertyOptional({ description: '变调夹品位', example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  capo?: number;

  @ApiPropertyOptional({
    description: '调弦 MIDI 数组（索引 0 = 一弦）。默认标准调弦 [64,59,55,50,45,40]',
    example: [64, 59, 55, 50, 45, 40],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  tuning?: number[];

  @ApiPropertyOptional({
    description: '授权状态：public_domain | cc_by | authorized | user_uploaded',
    example: 'user_uploaded',
  })
  @IsOptional()
  @IsString()
  license?: string;
}

/** 通过 URL 创建项目（yt-dlp 下载；直链音频走 HTTP） */
export class CreateUrlProjectDto {
  @ApiProperty({ description: '音频 / 视频链接', example: 'https://example.com/song.mp3' })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional({ description: '曲目名（留空则用 yt-dlp 标题）' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '艺术家' })
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiPropertyOptional({ description: 'BPM', example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(320)
  bpm?: number;

  @ApiPropertyOptional({ description: '拍号', example: '4/4' })
  @IsOptional()
  @IsString()
  timeSignature?: string;

  @ApiPropertyOptional({ description: '变调夹品位', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  capo?: number;

  @ApiPropertyOptional({ description: '调弦 MIDI 数组（索引 0 = 一弦）', type: [Number] })
  @IsOptional()
  @IsArray()
  tuning?: number[];

  @ApiPropertyOptional({ description: '授权状态', example: 'user_uploaded' })
  @IsOptional()
  @IsString()
  license?: string;

  @ApiPropertyOptional({
    description: '跳过 yt-dlp，直接把 URL 当直链音频下载（仅 .mp3/.wav/.flac 有效）',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  preferDirect?: boolean;
}

/** 启动流水线时可覆盖的元信息 */
export class StartProjectDto {
  @ApiPropertyOptional({ description: '覆盖 BPM（会透传给 Basic Pitch / Tayuya）', example: 96 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(320)
  bpm?: number;

  @ApiPropertyOptional({ description: '覆盖拍号', example: '6/8' })
  @IsOptional()
  @IsString()
  timeSignature?: string;

  @ApiPropertyOptional({ description: '覆盖变调夹', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  capo?: number;

  @ApiPropertyOptional({ description: '覆盖调弦（MIDI 数组，索引 0 = 一弦）', type: [Number] })
  @IsOptional()
  @IsArray()
  tuning?: number[];

  @ApiPropertyOptional({ description: '覆盖标题' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '覆盖艺术家' })
  @IsOptional()
  @IsString()
  artist?: string;
}

/** 人工复核保存（ReviewPage） */
export class UpdateProjectDto extends StartProjectDto {
  @ApiPropertyOptional({
    description: '授权状态：public_domain | cc_by | authorized | user_uploaded',
    example: 'public_domain',
  })
  @IsOptional()
  @IsString()
  license?: string;

  @ApiPropertyOptional({ description: '直接改状态（一般由流水线推进，人工仅在失败重试时使用）', enum: PROJECT_STATUSES })
  @IsOptional()
  @IsIn(PROJECT_STATUSES as string[])
  status?: string;

  @ApiPropertyOptional({
    description:
      '复核后的完整 TabProject（ReviewPage 逐音符编辑弦号/品位/时值/技巧后整体回传）。\n' +
      '⚠️ 结构较大，需要 `@Allow()` 才能绕过全局 ValidationPipe 的 whitelist 剔除。',
  })
  @Allow()
  tabProject?: any;
}

/** 发布 PracticePackage */
export class PublishProjectDto {
  @ApiPropertyOptional({ description: '发布者标识', example: 'cms' })
  @IsOptional()
  @IsString()
  publishedBy?: string;

  @ApiPropertyOptional({
    description:
      '练习声道：guitar / guitar_lead / guitar_rhythm / bass / piano / other。默认 guitar。',
    example: 'guitar',
  })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({
    description:
      '切片失败时的降级策略：source = 原音频 + `#t=start,end`；metronome = 合成节拍器 WAV。默认 source。',
    enum: ['source', 'metronome'],
  })
  @IsOptional()
  @IsIn(['source', 'metronome'])
  audioFallback?: 'source' | 'metronome';

  @ApiPropertyOptional({
    description: '允许无音频发布（只下发谱面 + 节拍器）。转录音频不可达时默认允许。',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowMissingAudio?: boolean;

  @ApiPropertyOptional({
    description:
      '是否把结果镜像写入既有 Score/Track/Measure 发布链路（默认 false）。\n' +
      '开启后旧接口 /api/published/scores/:id/measures 与 CMS 对齐工作台也能看到数据，' +
      '但会先清空该曲目已发布的小节（既有链路是 append-only）。',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  mirrorToScorePipeline?: boolean;

  @ApiPropertyOptional({
    description:
      '镜像到**指定**曲目 id（而不是新建）。重复发布 / 反复演示时用它复用同一条曲目，' +
      '避免攒出一堆同名曲目。不传时依次回退到 `Project.scoreId`、新建。',
    example: 'cmue9kr2w000j8q070cd6gldq',
  })
  @IsOptional()
  @IsString()
  mirrorScoreId?: string;

  @ApiPropertyOptional({
    description: '限制最多发布多少个小节（超长曲目调试用）。0 = 不限制。',
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxMeasures?: number;
}
