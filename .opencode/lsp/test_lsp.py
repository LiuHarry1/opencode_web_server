"""
LSP Server 集成测试 — 通过 JSON-RPC 协议与 custom_lsp_server 通信，验证各项功能。

用法: python .opencode/lsp/test_lsp.py
"""

import json
import subprocess
import sys
import os
import time
import threading

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_SCRIPT = os.path.join(SCRIPT_DIR, "custom_lsp_server.py")

# ── JSON-RPC helpers ──────────────────────────

_msg_id = 0


def _next_id():
    global _msg_id
    _msg_id += 1
    return _msg_id


def encode_message(body: dict) -> bytes:
    payload = json.dumps(body).encode("utf-8")
    header = f"Content-Length: {len(payload)}\r\n\r\n"
    return header.encode("ascii") + payload


def make_request(method: str, params: dict | None = None) -> dict:
    return {"jsonrpc": "2.0", "id": _next_id(), "method": method, "params": params or {}}


def make_notification(method: str, params: dict | None = None) -> dict:
    return {"jsonrpc": "2.0", "method": method, "params": params or {}}


# ── Reader thread ─────────────────────────────

class JsonRpcReader:
    def __init__(self, stream):
        self.stream = stream
        self.responses: dict[int, dict] = {}
        self.notifications: list[dict] = []
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def _read_loop(self):
        while True:
            try:
                header = b""
                while b"\r\n\r\n" not in header:
                    chunk = self.stream.read(1)
                    if not chunk:
                        return
                    header += chunk

                content_length = 0
                for line in header.decode("ascii").split("\r\n"):
                    if line.lower().startswith("content-length:"):
                        content_length = int(line.split(":")[1].strip())

                body = self.stream.read(content_length)
                msg = json.loads(body.decode("utf-8"))

                with self._lock:
                    if "id" in msg and "method" not in msg:
                        self.responses[msg["id"]] = msg
                    else:
                        self.notifications.append(msg)
            except Exception:
                return

    def wait_response(self, msg_id: int, timeout: float = 10.0) -> dict | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                if msg_id in self.responses:
                    return self.responses.pop(msg_id)
            time.sleep(0.05)
        return None

    def wait_notification(self, method: str, timeout: float = 5.0) -> dict | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                for i, n in enumerate(self.notifications):
                    if n.get("method") == method:
                        return self.notifications.pop(i)
            time.sleep(0.05)
        return None


# ── Test runner ───────────────────────────────

TEST_FILE_URI = "file:///tmp/test_lsp_sample.py"

TEST_CONTENT = """\
from os import *

import json

# TODO: refactor this
def process(items):
    print(items)
    result = []
    for item in items:
        result.append(item * 2)
    return result

def divide(a, b):
    try:
        return a / b
    except:
        return None

x = "this line is intentionally written to be very very very very very very very very very very very very long to exceed the 120-character limit for testing"
"""

PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
results = []


def check(name: str, condition: bool, detail: str = ""):
    status = PASS if condition else FAIL
    results.append(condition)
    extra = f"  ({detail})" if detail else ""
    print(f"  {status}  {name}{extra}")


def main():
    print(f"\n{'='*60}")
    print("  Custom LSP Server — 集成测试")
    print(f"{'='*60}\n")

    proc = subprocess.Popen(
        [sys.executable, SERVER_SCRIPT],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    reader = JsonRpcReader(proc.stdout)

    def send(msg: dict):
        proc.stdin.write(encode_message(msg))
        proc.stdin.flush()

    def request(method: str, params: dict | None = None) -> dict | None:
        msg = make_request(method, params)
        send(msg)
        return reader.wait_response(msg["id"])

    try:
        # ── 1. Initialize ──
        print("[1] Initialize 握手")
        resp = request("initialize", {
            "processId": os.getpid(),
            "capabilities": {},
            "rootUri": "file:///tmp",
        })
        check("initialize 返回结果", resp is not None)
        if resp:
            caps = resp.get("result", {}).get("capabilities", {})
            check("支持 completionProvider", "completionProvider" in caps)
            check("支持 hoverProvider", "hoverProvider" in caps)

        send(make_notification("initialized", {}))
        time.sleep(0.3)

        # ── 2. Open document → Diagnostics ──
        print("\n[2] Diagnostics 诊断检测")
        send(make_notification("textDocument/didOpen", {
            "textDocument": {
                "uri": TEST_FILE_URI,
                "languageId": "python",
                "version": 1,
                "text": TEST_CONTENT,
            }
        }))

        diag_notif = reader.wait_notification("textDocument/publishDiagnostics", timeout=5)
        check("收到 publishDiagnostics 通知", diag_notif is not None)

        if diag_notif:
            diags = diag_notif.get("params", {}).get("diagnostics", [])
            messages = [d["message"] for d in diags]
            check("检测到 import *", any("import *" in m for m in messages), f"共 {len(diags)} 条诊断")
            check("检测到 TODO", any("TODO" in m for m in messages))
            check("检测到 bare except", any("except" in m for m in messages))
            check("检测到 print()", any("print" in m for m in messages))
            check("检测到超长行", any("行过长" in m or "过长" in m for m in messages))

        # ── 3. Completion ──
        print("\n[3] Completion 代码补全")
        resp = request("textDocument/completion", {
            "textDocument": {"uri": TEST_FILE_URI},
            "position": {"line": 5, "character": 3},
        })
        check("completion 返回结果", resp is not None)
        if resp:
            items = resp.get("result", {})
            if isinstance(items, dict):
                items = items.get("items", [])
            check("补全列表非空", len(items) > 0, f"共 {len(items)} 项")
            labels = [it.get("label", "") for it in items]
            has_snippets = any(l in ("def", "class", "for", "if") for l in labels)
            check("包含代码片段", has_snippets, f"labels: {labels[:8]}...")

        # ── 4. Hover ──
        print("\n[4] Hover 悬浮提示")
        # hover over "print" at line 6
        resp = request("textDocument/hover", {
            "textDocument": {"uri": TEST_FILE_URI},
            "position": {"line": 6, "character": 5},
        })
        check("hover 返回结果", resp is not None)
        if resp:
            hover_result = resp.get("result")
            check("hover 内容非空", hover_result is not None)
            if hover_result:
                contents = hover_result.get("contents", {})
                value = contents.get("value", "") if isinstance(contents, dict) else str(contents)
                check("hover 包含 print 文档", "print" in value.lower(), f"内容: {value[:80]}...")

        # hover over keyword "def" at line 5
        resp = request("textDocument/hover", {
            "textDocument": {"uri": TEST_FILE_URI},
            "position": {"line": 5, "character": 1},
        })
        if resp and resp.get("result"):
            contents = resp["result"].get("contents", {})
            value = contents.get("value", "") if isinstance(contents, dict) else str(contents)
            check("hover 支持 Python 关键字", "def" in value.lower())

        # ── Summary ──
        print(f"\n{'='*60}")
        passed = sum(results)
        total = len(results)
        color = "\033[92m" if passed == total else "\033[93m"
        print(f"  {color}测试结果: {passed}/{total} 通过\033[0m")
        print(f"{'='*60}\n")

    finally:
        send(make_request("shutdown"))
        time.sleep(0.3)
        send(make_notification("exit"))
        proc.wait(timeout=5)
        print(f"  Server 退出码: {proc.returncode}")


if __name__ == "__main__":
    main()
