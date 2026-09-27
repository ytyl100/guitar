/**
 * `ffprobe-static` 没有自带类型声明（它是 CJS：`module.exports = { path, version }`）。
 *
 * 为什么需要它：demucs 4.x 的 `demucs/audio.py::_read_info()` 会直接
 * `subprocess.check_output(['ffprobe', ...])` 读取音频流信息。
 * `ffmpeg-static` **只带 ffmpeg.exe，不带 ffprobe.exe**，
 * 于是「分离阶段」会报一个极具误导性的错误：
 *
 * ```
 * 读取音频失败（请确认是有效的 mp3/wav/flac）：[WinError 2] 系统找不到指定的文件。
 * ```
 *
 * 看着像音频坏了，其实只是找不到 ffprobe。这里把 ffprobe 的目录一并加进
 * Python worker 的 PATH（见 `python-runner.service.ts#workerEnv`）。
 */
declare module 'ffprobe-static' {
  /** 内置 ffprobe 可执行文件路径 */
  const ffprobeStatic: { path: string; version: string };
  export default ffprobeStatic;
}
