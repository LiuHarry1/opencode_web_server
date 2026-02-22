#!/usr/bin/env python3
"""
LSP stdio ↔ TCP 桥接脚本。

OpenCode 通过 command 启动此脚本，用 stdio 与 OpenCode 通信；
此脚本连接远程 TCP LSP server，转发消息。

用法:
  python lsp_tcp_bridge.py <host> <port>
  python lsp_tcp_bridge.py 192.168.1.100 6008
  python lsp_tcp_bridge.py 127.0.0.1 6008   # 本地

环境变量（可选）:
  LSP_TCP_HOST  LSP_TCP_PORT  覆盖命令行参数
"""

import sys
import socket
import select
import struct
import os
import threading

def _read(stream, n):
    if hasattr(stream, "recv"):
        return stream.recv(n)
    data = stream.read(n)
    return data if data else None

def _write(stream, data):
    if hasattr(stream, "sendall"):
        stream.sendall(data)
    else:
        stream.write(data)
        stream.flush()

def read_content_length(stream):
    header = b""
    while b"\r\n\r\n" not in header:
        b = _read(stream, 1)
        if not b:
            return None
        header += b
    for line in header.decode("ascii").split("\r\n"):
        if line.lower().startswith("content-length:"):
            return int(line.split(":")[1].strip())
    return 0

def read_message(stream):
    n = read_content_length(stream)
    if n is None:
        return None
    data = b""
    while len(data) < n:
        chunk = _read(stream, n - len(data))
        if not chunk:
            return None
        data += chunk
    return data

def write_message(stream, data: bytes):
    header = f"Content-Length: {len(data)}\r\n\r\n"
    _write(stream, header.encode("ascii") + data)

def relay(a, b, label):
    try:
        while True:
            msg = read_message(a)
            if msg is None:
                break
            write_message(b, msg)
    except (BrokenPipeError, ConnectionResetError, OSError):
        pass
    finally:
        try:
            if hasattr(a, "shutdown"):
                a.shutdown(socket.SHUT_RD)
            if hasattr(b, "shutdown"):
                b.shutdown(socket.SHUT_WR)
        except OSError:
            pass

def main():
    host = os.environ.get("LSP_TCP_HOST") or (sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1")
    port = int(os.environ.get("LSP_TCP_PORT") or (sys.argv[2] if len(sys.argv) > 2 else "6008"))

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    try:
        sock.connect((host, port))
    except OSError as e:
        sys.stderr.write(f"lsp_tcp_bridge: 无法连接 {host}:{port} - {e}\n")
        sys.exit(1)

    sock.setblocking(True)
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer

    t1 = threading.Thread(target=relay, args=(stdin, sock, "stdin->tcp"), daemon=True)
    t2 = threading.Thread(target=relay, args=(sock, stdout, "tcp->stdout"), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

if __name__ == "__main__":
    main()
