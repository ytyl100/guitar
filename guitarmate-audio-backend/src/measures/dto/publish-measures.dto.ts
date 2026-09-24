import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NoteInputDto {
  @ApiPropertyOptional({ description: '音符唯一标识', example: 'n_1_0' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: '绝对音频时间（秒）', example: 1.25 })
  @IsNumber()
  @IsNotEmpty()
  audioTime!: number;

  @ApiProperty({ description: '琴弦编号 (1-6，1为最细弦)', example: 1 })
  @IsInt()
  string!: number;

  @ApiProperty({ description: '品位 (0-24)', example: 3 })
  @IsInt()
  fret!: number;

  @ApiProperty({ description: 'MIDI 音高', example: 67 })
  @IsInt()
  pitch!: number;

  @ApiProperty({ description: '持续时间（秒）', example: 0.5 })
  @IsNumber()
  duration!: number;

  @ApiPropertyOptional({ description: '识别置信度 (0-1)', example: 0.98 })
  @IsOptional()
  @IsNumber()
  confidence?: number;

  @ApiPropertyOptional({ description: '归一化横坐标 (0-1)', example: 0.25 })
  @IsOptional()
  @IsNumber()
  x?: number;

  @ApiPropertyOptional({ description: '归一化纵坐标 (0-1)', example: 0.15 })
  @IsOptional()
  @IsNumber()
  y?: number;

  @ApiPropertyOptional({
    description:
      '左手指法：0 = 空弦（不按左手），1 = 食指，2 = 中指，3 = 无名指，4 = 小指。' +
      '留空表示未指定（C 端不画手指标记）。',
    example: 1,
    minimum: 0,
    maximum: 4,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  finger?: number;

  @ApiPropertyOptional({
    description:
      '该音符生效的手位（= 食指按第几品）。与小节把位不同时表示**小节内换把**：' +
      '谱面会在该处多印一个小号「N把位」标记。因为弦线上的数字是手指号，' +
      '必须靠它反推品位：`fret = position + finger − 1`。',
    example: 5,
    minimum: 1,
    maximum: 24,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  position?: number;
}

export interface BarreInputDto {
  instrument?: string;
  fret: number;
  fromString: number;
  toString: number;
  startTime: number;
  duration: number;
  x: number;
  y: number;
}

export class ChordMarkerInputDto {
  @ApiPropertyOptional({ description: '所属乐器', example: 'guitar' })
  @IsOptional()
  @IsString()
  instrument?: string;

  @ApiProperty({ description: '和弦名称', example: 'Bm' })
  @IsString()
  @IsNotEmpty()
  chordName!: string;

  @ApiProperty({ description: '和弦起始时间（秒）', example: 0.0 })
  @IsNumber()
  startTime!: number;

  @ApiProperty({ description: '持续时间（秒）', example: 2.0 })
  @IsNumber()
  duration!: number;

  @ApiProperty({ description: '归一化横坐标 X', example: 0.15 })
  @IsNumber()
  x!: number;

  @ApiProperty({ description: '归一化纵坐标 Y', example: 0.05 })
  @IsNumber()
  y!: number;

  @ApiPropertyOptional({
    description:
      '指法图：6 个元素（索引 0 = 六弦，-1 = 闷弦）。可为空 —— 单音分解旋律推出的和弦没有实际把位。',
    example: [0, 2, 2, 1, 0, 0],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  voicing?: number[];
}

export class MeasureItemDto {
  @ApiProperty({ description: '小节序号 (1-indexed)', example: 1 })
  @IsInt()
  index!: number;

  @ApiProperty({ description: '小节标签', example: '前奏 第1小节' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ description: '小节在全曲的起始时间（秒）', example: 0.0 })
  @IsNumber()
  startTime!: number;

  @ApiProperty({ description: '小节在全曲的结束时间（秒）', example: 3.2 })
  @IsNumber()
  endTime!: number;

  @ApiPropertyOptional({
    description:
      '本小节把位：P = 第 P 把位（食指按第 P 品）。C 端在谱面开头渲染罗马数字标记（Ⅰ/Ⅱ/Ⅲ…）。',
    example: 2,
    minimum: 1,
    maximum: 24,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  position?: number;

  @ApiProperty({
    description: '当前小节的音符列表',
    type: [NoteInputDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteInputDto)
  notes!: NoteInputDto[];

  @ApiPropertyOptional({
    description: '横按标记列表',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        instrument: { type: 'string', example: 'guitar' },
        fret: { type: 'number', example: 1 },
        fromString: { type: 'number', example: 1 },
        toString: { type: 'number', example: 6 },
        startTime: { type: 'number', example: 0.0 },
        duration: { type: 'number', example: 2.0 },
        x: { type: 'number', example: 0.1 },
        y: { type: 'number', example: 0.2 },
      },
    },
  })
  @IsOptional()
  @IsArray()
  barres?: BarreInputDto[];

  @ApiPropertyOptional({
    description: '和弦标记列表',
    type: [ChordMarkerInputDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChordMarkerInputDto)
  chords?: ChordMarkerInputDto[];

  @ApiProperty({
    description: '六线谱切片图片 URL',
    example: 'https://cdn.example.com/tabs/measure_1.png',
  })
  @IsString()
  tabImageUrl!: string;
}

export class PublishMeasuresDto {
  @ApiProperty({ description: '所属曲目 ID', example: 'cmu8g2bpf0000i5aqfe8asyf3' })
  @IsString()
  @IsNotEmpty()
  scoreId!: string;

  @ApiProperty({ description: '所属分轨 ID', example: 'cmu8g2bpg0001i5aqq2s0a1b2' })
  @IsString()
  @IsNotEmpty()
  trackId!: string;

  @ApiProperty({
    description: '分轨原始音频路径或URL',
    example: 'https://cdn.example.com/hotel_california_lead.mp3',
  })
  @IsString()
  @IsNotEmpty()
  trackAudioPath!: string;

  @ApiPropertyOptional({
    description:
      '练习声道标识。C 端 Simplified 模式播放该声道。可选：guitar(木吉他)/guitar_lead(主音吉他)/guitar_rhythm(节奏吉他)/bass(贝斯)/piano(钢琴)/other(其他)。默认 guitar。',
    example: 'guitar',
    default: 'guitar',
  })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({
    description:
      '原声（含鼓 / 贝斯 / 电琴等全轨混音）音频路径或URL。用于 C 端 Original 模式播放。留空时自动回退到 Score.originalAudio。',
    example: 'uploads/demo/demo_original.wav',
  })
  @IsOptional()
  @IsString()
  originalAudioPath?: string;

  @ApiPropertyOptional({
    description:
      '音频切片失败（或压根没有音频）时的降级策略：\n' +
      '- `source`（默认）：沿用旧行为 —— 返回「原始音频 + #t=start,end 时间片段」，需要该来源本身可访问；\n' +
      '- `metronome`：为每个小节**现场合成一段「节拍器 + 鼓」占位音频**（纯 Node WAV 合成，无需 ffmpeg），' +
      'C 端仍能正常播放、高亮六线谱节点，做无声练习。纯谱面导入（没有音频）时请用这一项。',
    enum: ['source', 'metronome'],
    example: 'metronome',
  })
  @IsOptional()
  @IsString()
  audioFallback?: 'source' | 'metronome';

  @ApiPropertyOptional({
    description:
      '允许在分轨音频不可访问时仍然发布（仅入库谱面标注，C 端将无法播放）。默认 false，即发布前会校验音频来源并在不可访问时直接报错。',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  allowMissingAudio?: boolean;

  @ApiProperty({ description: '速度 BPM', example: 75 })
  @IsInt()
  bpm!: number;

  @ApiProperty({ description: '拍号', example: '4/4' })
  @IsString()
  timeSignature!: string;

  @ApiProperty({
    description: '发布的小节列表',
    type: [MeasureItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasureItemDto)
  measures!: MeasureItemDto[];
}
