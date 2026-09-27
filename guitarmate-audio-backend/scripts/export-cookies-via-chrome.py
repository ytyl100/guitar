#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从「真实浏览器 profile」自动导出 cookies.txt（无需手工点扩展）
==============================================================

背景：YouTube 会作废「新建 profile + 机房/VPN 出口 IP」的会话，
只有用户日常那个**被信任的**浏览器会话能用。但 Chrome/Edge 136+ 两面夹击：
  - 默认 User Data 目录**禁止**开 remote-debugging-port（CDP 拿不到）；
  - cookie 值又是 App-Bound 加密，复制/链接 profile 都解不开。
唯一出口：**让浏览器自己交出明文 cookie** —— 用一个只申请 `cookies` 权限的本地扩展，
通过 `--load-extension` 随浏览器一起启动，把 cookie POST 给本机接收器。

注意：目标浏览器必须**完全退出**（否则新命令行会被转发给已有实例，参数失效）。

用法
----
    python scripts/export-cookies-via-chrome.py                  # 用真实 Chrome profile
    python scripts/export-cookies-via-chrome.py --browser edge   # 用真实 Edge profile
    python scripts/export-cookies-via-chrome.py --temp-profile   # 自检：临时 profile（拿不到登录态）
    python scripts/export-cookies-via-chrome.py --out <path>
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
EXT_DIR = Path(__file__).resolve().parent / "cookie-exporter"
DEFAULT_OUT = BACKEND_ROOT / "cookies.txt"

BROWSER = {
    "chrome": (
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/User Data",
        [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
         r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"],
        "chrome.exe",
    ),
    "edge": (
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/User Data",
        [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
         r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"],
        "msedge.exe",
    ),
}

AUTH_NAMES = ["SID", "HSID", "SSID", "SAPISID", "APISID",
              "__Secure-1PSID", "__Secure-3PSID", "__Secure-1PAPISID", "LOGIN_INFO"]

"""登录态判定（已用 yt-dlp 实测修正）

⚠️ 曾经要求 SID + HSID + LOGIN_INFO 才算健康 —— 那是**误判**：
现代浏览器在 `youtube.com` 域上通常**不下发** SID/HSID（它们跟着 `google.com` 走），
于是把一份完全能用的导出文件判成“登录态不完整”并**拒绝覆盖**。
实测：只要 `LOGIN_INFO` + 任一 `__Secure-*PSID` / SSID / LSID，yt-dlp 就能正常取到元音频。
"""
REQUIRED_ANY_OF = ["SID", "SSID", "LSID", "__Secure-1PSID", "__Secure-3PSID",
                   "__Host-1PLSID", "__Host-3PLSID"]
REQUIRED_MARKER = "LOGIN_INFO"


def parse_names(path):
    """解析 Netscape cookies.txt 的 cookie 名。

    `#HttpOnly_` 前缀行**也算**（httpOnly 几乎包含了全部会话 cookie，漏掉它们
    就会得到“只有 9 条、全是访客 cookie”的错结论）。
    """
    names = []
    for line in Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#HttpOnly_"):
            s = s[len("#HttpOnly_"):]
        elif s.startswith("#"):
            continue
        cols = s.split("\t") if "\t" in s else s.split()
        if len(cols) >= 7:
            names.append(cols[5])
    return names


def inspect(path):
    """返回 (cookie 总数, 命中的关键登录 cookie, 是否“可用的登录态”)。"""
    try:
        rows = parse_names(path)
    except FileNotFoundError:
        return 0, [], False
    hits = [n for n in AUTH_NAMES if n in rows]
    healthy = (REQUIRED_MARKER in rows) and any(n in rows for n in REQUIRED_ANY_OF)
    return len(rows), hits, healthy


def browser_running(exe):
    try:
        out = subprocess.run(["tasklist", "/FI", f"IMAGENAME eq {exe}", "/NH"],
                             capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return False
    return exe.lower() in out.lower()


def log(msg):
    print(msg, flush=True)


def live_probe():
    """联网实测 YouTube 是否认得当前 cookies —— 权威结论（文件体检只能说明“长得像”）。

    为什么必须加这层：2026-09-25 排查「服务器下载失败」时，文件体检显示
    「41 条 + LOGIN_INFO + 会话 cookie → ✅ 登录态可用」，**但** YouTube 早已把这份
    会话轮换掉（resp 里的 LOGGED_IN=false），yt-dlp 直接报 Sign in to confirm you're not a bot。
    只看文件就会把人引向「换 IP」，白折腾半天。
    """
    here = Path(__file__).resolve().parent
    checker = here / "youtube-check.mjs"
    if not checker.exists() or not (here.parent / "dist" / "transcription" / "youtube-session.js").exists():
        log("ℹ️ 跳过联网实测（未找到 scripts/youtube-check.mjs 或 dist/）→ 请先 npm run build，")
        log("   或单独跑：npm run youtube:check")
        return None
    log("")
    log("--- 联网实测（以此为准）---")
    try:
        proc = subprocess.run(["node", str(checker), "--json"], cwd=str(here.parent),
                              capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=90)
    except Exception as exc:  # node 缺失 / 超时都不该让 --check 崩掉
        log(f"⚠️ 实测未跑成（{exc}）→ 请单独跑 npm run youtube:check")
        return None
    line = next((l for l in (proc.stdout or "").splitlines() if l.strip().startswith("{")), "")
    if not line:
        log(f"⚠️ 实测没有返回结论（exit {proc.returncode}）→ 请单独跑 npm run youtube:check")
        return None
    try:
        data = json.loads(line)
    except Exception:
        log(f"⚠️ 实测输出无法解析 → 请单独跑 npm run youtube:check")
        return None
    session = data.get("session") or {}
    state = session.get("state", "unknown")
    log(f"状态：{state}（出口 {session.get('route')}，{session.get('cookieCount')} 条，{session.get('elapsedMs')}ms）")
    log(str(session.get("detail", "")))
    if state == "signed-out":
        log("❌ 必须重新导出：完全退出浏览器 → npm run youtube:cookies")
        log("   （换 IP / 换节点无效 —— 这不是风控，是这份会话已作废。）")
    elif state == "signed-in":
        log("✅ YouTube 认这份 cookies。若仍下载失败，问题在出口 IP 或缺少 PO token。")
    elif state == "unreachable":
        log("⚠️ 网络没通，无法判定 cookies 好坏 —— 先解决网络/代理。")
    return state


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser(description="用浏览器扩展从真实 profile 导出 cookies.txt")
    ap.add_argument("--browser", default="chrome", choices=sorted(BROWSER))
    ap.add_argument("--profile", default="", help="User Data 目录（默认取系统安装目录）")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--port", type=int, default=5199)
    ap.add_argument("--timeout", type=int, default=90)
    ap.add_argument("--temp-profile", action="store_true", help="自检用：临时 profile，不碰真实数据")
    ap.add_argument("--headed", action="store_true", help="显示浏览器窗口（部分浏览器在无头下不启动扩展 SW）")
    ap.add_argument("--keep", action="store_true", help="结束后不删除临时 profile")
    ap.add_argument("--check", action="store_true", help="只检查当前 cookies 文件的登录态健康度，不启动浏览器")
    ap.add_argument("--force", action="store_true", help="即使新 cookie 不健康（缺 SID/LOGIN_INFO）也覆盖目标文件")
    args = ap.parse_args()

    out_path = Path(args.out)

    # ── 仅检查当前文件（不启动浏览器）──
    if args.check:
        if not out_path.exists():
            log(f"❌ 文件不存在：{out_path}")
            return 4
        total, hits, healthy = inspect(out_path)
        log(f"文件：{out_path}（{total} 条 cookie）")
        log(f"登录 cookie：{', '.join(hits) if hits else '（无）'}")
        if not healthy:
            log("⚠️ 文件层面就不像登录态：需要 LOGIN_INFO + 任一会话 cookie（SID / SSID / LSID / __Secure-*PSID）。")
            log("   请重新导出：先完全退出浏览器，再跑 npm run youtube:cookies")
            return 4
        log("✅ 文件完整（含 LOGIN_INFO + 会话 cookie）。")
        log("   ⚠️ 但“文件完整”≠“YouTube 还认它”：会话会被浏览器轮换，文件看着正常也可能已作废。")
        # 权威结论要靠联网实测（失败也不影响退出码 0 的语义？—— 不：signed-out 必须报错）
        state = live_probe()
        if state == "signed-out":
            return 4
        return 0

    received = threading.Event()
    holder = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            if self.path != "/save":
                self.send_response(404)
                self.end_headers()
                return
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length).decode("utf-8", errors="replace")
            holder["body"] = body
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"ok")
            received.set()

        def do_OPTIONS(self):  # noqa: N802
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.end_headers()

        def log_message(self, *a):  # 静音
            return

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log(f"接收器已启动：http://127.0.0.1:{args.port}/save")

    default_root, exe_candidates, exe_name = BROWSER[args.browser]
    exe = next((Path(p) for p in exe_candidates if Path(p).exists()), None)
    if exe is None:
        log(f"找不到 {args.browser} 可执行文件")
        return 2

    if args.temp_profile:
        user_data = Path(tempfile.gettempdir()) / "gm-cookie-export-temp"
        if user_data.exists():
            shutil.rmtree(user_data, ignore_errors=True)
        log(f"自检模式：临时 profile {user_data}（预期只有匿名 cookie）")
    else:
        user_data = Path(args.profile) if args.profile else default_root
        if not user_data.exists():
            log(f"找不到 User Data 目录：{user_data}")
            return 2
        if browser_running(exe_name):
            log(f"⚠️ {exe_name} 正在运行 —— --load-extension 会被忽略（新命令行只是转发给已有实例）。")
            log(f"   请**完全退出 {args.browser}** 后重试。")
            return 5

    cmd = [
        str(exe),
        f"--user-data-dir={user_data}",
        f"--load-extension={EXT_DIR}",
        "--no-first-run",
        "--no-default-browser-check",
        "https://www.youtube.com/",
    ]
    if not args.headed:
        cmd.insert(-1, "--headless=new")
    log(f"启动浏览器：{exe.name}（--load-extension={EXT_DIR.name}，{'headed' if args.headed else 'headless'}）")
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    got = received.wait(timeout=args.timeout)
    if not got:
        log("⚠️ 超时：没有收到 cookie。常见原因：目标浏览器没完全退出 / 该版本已禁用 --load-extension。")
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.terminate()
        server.shutdown()
        if args.temp_profile and not args.keep:
            shutil.rmtree(user_data, ignore_errors=True)
        return 6

    out_path.parent.mkdir(parents=True, exist_ok=True)
    total, hits, healthy = inspect(out_path)  # 先看看旧文件（写入前不做它用，仅用于警告）
    body = holder["body"]
    tmp_path = out_path.with_suffix(out_path.suffix + ".new")
    """
    ⚠️ 不能用 `Path.write_text(..., newline=...)`：`newline` 是 Python **3.10+** 才有的参数，
    而本机 PATH 上的 `python` 是 3.8（裸解释器）→ 会直接在「收到 cookie 之后」TypeError 崩掉，
    表现为「扩展明明把 cookie 发过来了、文件却没更新」。改用 open() 显式写。
    """
    with open(tmp_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(body)
    new_total, new_hits, new_healthy = inspect(tmp_path)

    """
    fail-safe：新导出的 cookie 如果**不是完整登录态**，绝不覆盖旧文件。
    否则一次误操作（例如在未登录的 profile 里导出）会把原本能用的 cookies.txt 弄坏 ——
    这正是之前反复出现「上次能用、这次突然被拦」的原因。
    """
    if not new_healthy and not args.force:
        # ⚠️ 存档名必须带时间戳：固定叫 cookies.rejected.txt 的话，下次再导出失败就会把
        # **上一次那份仍然能用的存档**覆盖掉（实测就是这样丢掉了一份 41 条的好文件）。
        rejected = out_path.with_name(
            f"{out_path.stem}.rejected.{time.strftime('%Y%m%d-%H%M%S')}.txt"
        )
        shutil.move(str(tmp_path), str(rejected))
        log("")
        log(f"⚠️ 新导出的 cookie **不是可用的登录态**（{new_total} 条，需 LOGIN_INFO + SID/SSID/__Secure-*PSID 任一）→ 不覆盖旧文件。")
        log(f"   已存到：{rejected}（仅存档，供排查）")
        log(f"   当前 cookies.txt 保持原样（{total} 条，登录 cookie：{', '.join(hits) if hits else '（无）'}）。")
        log("   正确做法：在**你日常那个已登录 YouTube 的浏览器**里导出；")
        log("   自动导出需先完全退出浏览器（Chrome 已禁用 --load-extension，只支持 Edge）。")
        return 4

    shutil.move(str(tmp_path), str(out_path))

    try:
        proc.wait(timeout=15)
    except Exception:
        proc.terminate()
    server.shutdown()
    if args.temp_profile and not args.keep:
        shutil.rmtree(user_data, ignore_errors=True)

    log("")
    log(f"已写出 {out_path}（{new_total} 条 cookie）")
    if new_hits:
        log(f"✅ 含登录 cookie：{', '.join(new_hits)}")
        if new_healthy:
            log("   登录态完整（SID / HSID / LOGIN_INFO 齐备），后端会实时读取，直接重试导入即可。")
        else:
            log("   ⚠️ 但缺少 SID / HSID / LOGIN_INFO —— YouTube 仍会当作未登录（已用 --force 覆盖）。")
    else:
        log("⚠️ 没有登录 cookie —— 该 profile 未登录 YouTube（自检模式属正常）。")
    log("")
    log("⚠️ 该文件等同于账号凭证，切勿提交到仓库或外发。")
    return 0 if (new_hits and new_healthy) else 4


if __name__ == "__main__":
    sys.exit(main())
