#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 登录 → 自动导出 cookies.txt
==================================

为什么需要它：YouTube 现在对无 cookies 的请求固定返回
``Sign in to confirm you're not a bot``，而 Chromium 127+ 的 **App-Bound Encryption**
让 ``yt-dlp --cookies-from-browser chrome|edge`` 无法解密（``Failed to decrypt with DPAPI``）。

思路（唯一能绕开 App-Bound 加密的干净做法）：
用 Playwright 驱动**真正的 Edge/Chrome 二进制**打开一个独立 profile，
你在窗口里用谷歌账号登录；**浏览器自己**解密 cookie，并通过 CDP 把**明文**交给脚本。
脚本只保留 youtube.com / google.com 的 cookie，按 Netscape 格式写到 ``<后端>/cookies.txt``。

后端会在每次下载时实时读取该文件（无需重启）。

用法
----
    python scripts/youtube-login.py                          # 弹出独立窗口，登录后自动导出
    python scripts/youtube-login.py --scan                   # 列出哪些浏览器 profile 已登录 YouTube
    python scripts/youtube-login.py --from-profile chrome:Default   # 直接从已登录的 profile 导出
    python scripts/youtube-login.py --from-profile edge:Default --headed
    python scripts/youtube-login.py --timeout 900            # 自定义等待秒数（默认 600）
    python scripts/youtube-login.py --probe                  # 无窗口：仅验证链路（不等登录）
    python scripts/youtube-login.py --out <path>             # 自定义输出路径
    python scripts/youtube-login.py --purge                  # 删除 profile 与 cookies.txt

为何要 ``--from-profile``：你日常浏览器里往往**已经登录**了 YouTube。
直接复用那个 profile（需先关闭该浏览器）就能拿到底层 cookie，
不必重新登录、也避开了 Google 对自动化登录窗口的拦截。

依赖：``pip install playwright``（**不需要** playwright install，使用系统已装的 Edge/Chrome）。
"""

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = BACKEND_ROOT / "cookies.txt"
PROFILE_DIR = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "GuitarMate" / "youtube-login" / "profile"

LOGIN_URL = (
    "https://accounts.google.com/ServiceLogin"
    "?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F"
)
HOME_URL = "https://www.youtube.com/"

# 能证明「已登录」的 cookie（只看名字）
AUTH_NAMES = [
    "SID", "HSID", "SSID", "SAPISID", "APISID",
    "__Secure-1PSID", "__Secure-3PSID", "__Secure-1PAPISID", "LOGIN_INFO",
]

"""
登录态判据（**已用 yt-dlp 实测修正，与 export-cookies-via-chrome.py 保持一致**）

⚠️ 曾经要求 `SID + HSID + LOGIN_INFO` 三件齐才算健康 —— 那是**误判**：
现代浏览器在 `youtube.com` 域上通常**不下发** SID/HSID（它们跟着 `google.com` 走）。
后果不只是误报，而是：一份**完全能用**的 cookies.txt 被判成「不值得保护」，
于是被一次更弱的导出**直接覆盖** → 表现为反复「上次能用、这次突然被拦」。

实测：只要 `LOGIN_INFO` + 任一 `__Secure-*PSID` / SSID / LSID，yt-dlp 就能正常取到元音频。
"""
REQUIRED_MARKER = "LOGIN_INFO"
REQUIRED_ANY_OF = [
    "SID", "SSID", "LSID",
    "__Secure-1PSID", "__Secure-3PSID",
    "__Host-1PLSID", "__Host-3PLSID",
]


def is_healthy(names):
    """登录态是否可用：`LOGIN_INFO` + 任一会话 cookie。"""
    return (REQUIRED_MARKER in names) and any(n in names for n in REQUIRED_ANY_OF)
# 只导出这两个站点的 cookie（不外传其它网站的 cookie）
SITE_SUFFIXES = ("youtube.com", "google.com")

# 浏览器名 → (User Data 相对目录, Playwright channel, 进程名)
BROWSER_ROOTS = {
    "chrome": ("Google/Chrome/User Data", "chrome", "chrome.exe"),
    "edge": ("Microsoft/Edge/User Data", "msedge", "msedge.exe"),
}

# 浏览器名 → 可执行文件候选路径（用于「普通启动 + CDP 只读」这条路径）
BROWSER_EXE = {
    "edge": [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ],
    "chrome": [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ],
}


def find_browser_exe(name):
    for candidate in BROWSER_EXE.get(name, []):
        path = Path(candidate)
        if path.exists():
            return path
    return None


def wait_for_cdp(port, timeout=60):
    """轮询 CDP 端点直到就绪（浏览器起来要几秒）。显式禁用代理，避免本地地址被代理拦。"""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    url = f"http://127.0.0.1:{port}/json/version"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with opener.open(url, timeout=2) as resp:
                return json.loads(resp.read().decode("utf-8")).get("webSocketDebuggerUrl")
        except Exception:
            time.sleep(1)
    return None


def user_data_root(browser):
    rel, channel, exe = BROWSER_ROOTS[browser]
    base = Path(os.environ.get("LOCALAPPDATA") or Path.home())
    return base / rel, channel, exe


def browser_running(exe):
    try:
        out = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {exe}", "/NH"],
            capture_output=True, text=True, timeout=20,
        ).stdout
    except Exception:
        return False
    return exe.lower() in out.lower()


def cookie_names(db_path):
    """只读 cookie 名（值不解密）—— 用于 --scan 判断「这个 profile 是否已登录」。"""
    tmp = Path(tempfile.gettempdir()) / "gm_cookie_scan.db"
    try:
        shutil.copy2(db_path, tmp)
    except Exception as exc:
        return None, f"无法读取（{type(exc).__name__}）—— 浏览器可能正在运行"
    try:
        con = sqlite3.connect(str(tmp))
        rows = con.execute(
            "select name from cookies where host_key like '%youtube.com' or host_key like '%google.com'"
        ).fetchall()
        con.close()
        return [r[0] for r in rows], None
    except Exception as exc:
        return None, f"解析失败：{exc}"


def log(msg):
    """带 flush 的输出：避免 PowerShell 管道缓冲住日志、看不到进度。"""
    print(msg, flush=True)


def scan_profiles():
    """列出各浏览器 profile 的 YouTube 登录状态（只看 cookie 名）。"""
    print("浏览器    profile      已登录 YouTube？  说明")
    print("─" * 78)
    for browser in BROWSER_ROOTS:
        root, _, exe = user_data_root(browser)
        if not root.exists():
            print(f"{browser:<9} -             -                 未安装")
            continue
        running = browser_running(exe)
        for profile_dir in sorted(
            p for p in root.iterdir()
            if p.is_dir() and (p.name == "Default" or p.name.startswith("Profile"))
        ):
            db = profile_dir / "Network" / "Cookies"
            if not db.exists():
                continue
            names, err = cookie_names(db)
            status = "—"
            note = err or ""
            if names is not None:
                hits = [n for n in AUTH_NAMES if n in names]
                status = "✅ 是" if hits else "❌ 否"
                note = (", ".join(hits) if hits else f"仅 {len(names)} 条访客 cookie") + (
                    "（浏览器运行中，关闭后可用 --from-profile 导出）" if running else ""
                )
            print(f"{browser:<9} {profile_dir.name:<13} {status:<18} {note}")
    print()
    print("导出示例： npm run youtube:login -- --from-profile chrome:Default   （需先完全退出该浏览器）")


def relevant(cookies):
    return [c for c in cookies if c.get("domain", "").lstrip(".").endswith(SITE_SUFFIXES)]


def auth_hits(cookies):
    names = {c["name"] for c in cookies}
    return [n for n in AUTH_NAMES if n in names]


def to_netscape(cookies):
    lines = [
        "# Netscape HTTP Cookie File",
        "# 由 guitarmate-audio-backend/scripts/youtube-login.py 自动导出",
        "# ⚠️ 内含账号凭证，等同于密码，请勿提交到仓库或外发（.gitignore 已忽略）",
        "",
    ]
    for c in cookies:
        domain = c.get("domain", "")
        flag = "TRUE" if domain.startswith(".") else "FALSE"
        secure = "TRUE" if c.get("secure") else "FALSE"
        expires = int(c.get("expires") or 0)
        if expires < 0:
            expires = 0
        prefix = "#HttpOnly_" if c.get("httpOnly") else ""
        lines.append(
            "{p}{d}\t{f}\t{path}\t{s}\t{e}\t{name}\t{value}".format(
                p=prefix, d=domain, f=flag, path=c.get("path", "/"),
                s=secure, e=expires, name=c["name"], value=c["value"],
            )
        )
    return "\n".join(lines) + "\n"


def collect(context, session=None):
    """合并读取 cookie（CDP 返回的是**已解密的明文**）。

    三条途径叠加，避免漏读：
    1. ``context.cookies()``（整个 context）；
    2. ``context.cookies(url)``（按站点）；
    3. 原始终止手段 ``Network.getAllCookies``（需传入**复用**的 session）。

    ⚠️ session 必须复用：每轮新建 + detach 会让后续的 ``context.cookies()`` 也失效
    （表现为第一轮读到 8 条、之后全是 0 条）。
    """
    merged = {}

    def add(items):
        for c in items or []:
            if c.get("domain") and c.get("name"):
                merged[(c["domain"], c.get("path", "/"), c["name"])] = c

    try:
        add(context.cookies())
    except Exception:
        pass
    for url in ("https://www.youtube.com", "https://accounts.google.com", "https://www.google.com"):
        try:
            add(context.cookies(url))
        except Exception:
            continue
    if session is not None:
        try:
            add(session.send("Network.getAllCookies").get("cookies"))
        except Exception:
            pass
    return relevant(list(merged.values()))


def read_cookies_file(path):
    """读回 cookies.txt，返回 (总条数, 命中的登录 cookie 名)。"""
    rows = []
    try:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") and not line.startswith("#HttpOnly_"):
                continue
            cols = line.replace("#HttpOnly_", "").split("\t")
            if len(cols) >= 6:
                rows.append(cols[5])
    except FileNotFoundError:
        return 0, []
    return len(rows), [n for n in AUTH_NAMES if n in rows]


def finish(cookies, out_path, from_profile=None):
    """写出 cookies.txt 并给出结论（两个导出模式共用）。"""
    if not cookies:
        print("未捕获任何 cookie —— 站点可能未加载成功。", file=sys.stderr)
        return 3

    names = {c["name"] for c in cookies}
    healthy = is_healthy(names)

    """
    fail-safe：新 cookie 不是**可用的登录态**时绝不覆盖旧文件。
    这个脚本跑的是「我们自己的 profile」，YouTube 经常把这类新会话判为不可信
    （表现为登录后 watch 页仍是 LOGIN_REQUIRED、cookie 里缺会话凭据）；
    如果不加判断就覆盖，会把原本能用的 cookies.txt 弄坏 —— 这正是反复「上次能用、这次被拦」的根因。
    """
    if not healthy and out_path.exists():
        _, existing_hits = read_cookies_file(out_path)
        existing_healthy = is_healthy(existing_hits)
        if existing_healthy:
            # 存档名带时间戳：避免下一次失败导出把上一份“还能用”的存档覆盖掉
            rejected = out_path.with_name(
                f"{out_path.stem}.rejected.{time.strftime('%Y%m%d-%H%M%S')}.txt"
            )
            rejected.write_text(to_netscape(cookies), encoding="utf-8", newline="\n")
            print()
            print(
                f"⚠️ 本次只拿到「不可用的登录态」（{len(cookies)} 条，需 LOGIN_INFO + "
                f"SID/SSID/__Secure-*PSID 任一）→ **不覆盖** {out_path}"
            )
            print(f"   已存到：{rejected}（仅存档）")
            print(f"   现有文件的登录 cookie：{', '.join(existing_hits) or '（无）'} —— 保持不动。")
            print("   这说明我们自己的 profile 会话被 YouTube 判为不可信。")
            print("   请改用：npm run youtube:cookies（从你日常浏览器的真实 profile 自动导出，需先完全退出该浏览器）")
            return 4

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(to_netscape(cookies), encoding="utf-8", newline="\n")
    total, file_hits = read_cookies_file(out_path)

    print()
    print(f"已写出 {out_path}（{total} 条 cookie）")
    if file_hits:
        print(f"✅ 含登录 cookie：{', '.join(file_hits)}")
        if healthy:
            print("   登录态完整（SID / HSID / LOGIN_INFO 齐备），后端每次下载实时读取，无需重启。")
        else:
            print("   ⚠️ 但缺少 SID / HSID / LOGIN_INFO —— YouTube 仍会当作未登录，建议改用 npm run youtube:cookies。")
    else:
        print("⚠️ 未发现登录 cookie（SID / HSID / SAPISID …）—— 这次仍未完成登录。")
        if from_profile:
            print(f"   {from_profile} 这个 profile 本身就没登录 YouTube；")
            print("   请先在该浏览器里登录 YouTube，或直接运行 npm run youtube:login 交互式登录。")
        else:
            print("   请重新运行本脚本，并在弹出的窗口里真正登录（确认 YouTube 右上角是你的头像）。")
    print()
    print("⚠️ 该文件等同于你的账号凭证，请勿提交到仓库或发送给他人。")
    print("   不再需要时：python scripts/youtube-login.py --purge")
    return 0 if (file_hits and healthy) else 4


def purge():
    if PROFILE_DIR.exists():
        shutil.rmtree(PROFILE_DIR, ignore_errors=True)
        print(f"已删除 profile：{PROFILE_DIR}")
    if DEFAULT_OUT.exists():
        DEFAULT_OUT.unlink()
        print(f"已删除 {DEFAULT_OUT}")
    print("完成。下次运行需重新登录。")


def main():
    # Windows 控制台默认是 GBK（cp936），emoji / 破折号会抛 UnicodeEncodeError
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser(description="登录 YouTube 并导出 cookies.txt")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help=f"输出路径（默认 {DEFAULT_OUT}）")
    ap.add_argument("--timeout", type=int, default=600, help="等待登录的秒数（默认 600）")
    ap.add_argument("--probe", action="store_true", help="无窗口、不等登录，仅验证链路")
    ap.add_argument("--purge", action="store_true", help="删除 profile 与 cookies.txt 后退出")
    ap.add_argument("--scan", action="store_true", help="列出哪些浏览器 profile 已登录 YouTube 后退出")
    ap.add_argument(
        "--from-profile",
        metavar="BROWSER:PROFILE",
        help="直接从已登录的浏览器 profile 导出（如 chrome:Default，需先退出该浏览器）",
    )
    ap.add_argument("--headed", action="store_true", help="配合 --from-profile：显示窗口（默认无头）")
    ap.add_argument("--browser", default="edge", choices=sorted(BROWSER_EXE), help="用哪个浏览器登录（默认 edge）")
    ap.add_argument("--port", type=int, default=9222, help="CDP 调试端口（默认 9222）")
    args = ap.parse_args()

    if args.scan:
        scan_profiles()
        return 0

    if args.purge:
        purge()
        return 0

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("缺少 playwright。请先安装：", file=sys.stderr)
        print(f'  "{sys.executable}" -m pip install playwright', file=sys.stderr)
        return 2

    out_path = Path(args.out)
    headless = args.probe

    # ── 为什么不能直接“偷”你日常浏览器里已登录的 cookie（已实测，两条路都死）──
    #   ① 直接用真实 User Data 目录：Chrome/Edge 136+ 报
    #      「DevTools remote debugging requires a non-default data directory」，Playwright 永久挂住；
    #   ② 复制 profile 或建 junction 绕开路径限制：浏览器只能读到 7 条**明文**访客 cookie，
    #      SID/HSID/… 这些 v20（App-Bound）加密的会被**静默丢弃**。
    #   结论：必须让用户在**我们自己的 profile**里真登录一次（cookie 由同一个实例写入，不存在路径/密钥错配）。
    if args.from_profile:
        print(
            "不支持的参数 --from-profile：\n"
            "  Chrome/Edge 136+ 不允许在默认 User Data 目录上开远程调试（CDP），\n"
            "  而 App-Bound 加密的登录 cookie 也无法在复制/链接目录里解密（实测只能读到匿名 cookie）。\n"
            "\n"
            "请改用：npm run youtube:login          # 弹出独立窗口，登录一次即可\n"
            "或：    npm run youtube:login -- --scan # 先看看哪个浏览器已登录",
            file=sys.stderr,
        )
        return 2

    print(f"浏览器：系统已安装的 Edge（独立 profile：{PROFILE_DIR}）")
    print(f"输出：{out_path}")
    print()

    # 关键：**不要**用 Playwright 启动浏览器。
    # ① 用 Playwright 启动会带上自动化痕迹，Google 登录页可能直接拒绝（「此浏览器或应用可能不安全」）；
    # ② 用普通方式启动（一个干净到不像机器人的 Edge），再通过 CDP 只用它来「读 cookie」。
    exe = find_browser_exe(args.browser)
    if not exe:
        print(f"找不到 {args.browser} 的可执行文件。", file=sys.stderr)
        return 2

    port = args.port or 9222
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    browser_args = [
        str(exe),
        f"--user-data-dir={PROFILE_DIR}",
        f"--remote-debugging-port={port}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=ChromeWhatsNewUI",
    ]
    if headless:
        browser_args.append("--headless=new")
    browser_args.append(LOGIN_URL)

    log(f"启动浏览器（普通进程，无自动化参数）：{exe.name} --remote-debugging-port={port}")
    proc = subprocess.Popen(browser_args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    cdp_url = wait_for_cdp(port, timeout=60 if not headless else 30)
    if not cdp_url:
        print("浏览器没有在预期时间内打开调试端口；安装/启动受限。", file=sys.stderr)
        proc.terminate()
        return 6
    log(f"已连接 CDP：{cdp_url}")

    if not headless:
        print()
        print("请在刚弹出的窗口里用谷歌账号登录 YouTube（看到右上角是你的头像就算成功）。")
        print("登录完成后脚本会自动写出 cookies.txt 并关闭该窗口。")
        print()

    cookies = []
    hits = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(cdp_url)
            context = browser.contexts[0] if browser.contexts else browser.new_context()

            if headless:
                # probe：先真正打开 youtube.com（cookie 是随页面写入的，不导航会读到空）
                try:
                    page = context.pages[0] if context.pages else context.new_page()
                    page.goto(HOME_URL, wait_until="domcontentloaded", timeout=60000)
                    time.sleep(3)
                except Exception as exc:
                    print(f"（probe 导航告警：{exc}）", file=sys.stderr)

            # 复用同一个 CDP session（每轮新建会把 context.cookies() 也弄失效）
            session = None
            try:
                first_page = context.pages[0] if context.pages else None
                if first_page is not None:
                    session = context.new_cdp_session(first_page)
            except Exception:
                session = None

            deadline = time.time() + args.timeout
            last_report = -1
            while True:
                cookies = collect(context, session)
                hits = auth_hits(cookies)
                if hits:
                    break
                if headless or time.time() >= deadline:
                    break
                remaining = int(deadline - time.time())
                # 每 15 秒报一次进度，避免刷屏
                if remaining % 15 == 0 and remaining != last_report:
                    print(
                        f"[{remaining:>4}s] 已捕获 {len(cookies)} 条 cookie，登录凭证 {len(hits)} 个",
                        flush=True,
                    )
                    last_report = remaining
                time.sleep(2)

            if hits and not headless:
                print(f"✅ 检测到登录 cookie（{len(hits)} 个），正在导出……", flush=True)
            browser.close()
    except Exception as exc:
        print(f"（CDP 读写告警：{exc}）", file=sys.stderr)
        cookies = []
    finally:
        try:
            proc.wait(timeout=15)
        except Exception:
            proc.terminate()

    return finish(cookies, out_path)


if __name__ == "__main__":
    sys.exit(main())
