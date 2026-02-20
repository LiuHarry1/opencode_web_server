"""
Workspace Tools MCP Server — 用于 OpenCode 的本地 MCP 服务器。

提供的工具:
  - workspace_info: 获取工作区基本信息（路径、Git 状态等）
  - list_files: 列出工作区目录下的文件
  - search_text: 在工作区文件中搜索文本
  - read_file: 读取文件内容
  - create_file: 创建新文件（含目录自动创建）
  - edit_file: 编辑已有文件（按行号替换或插入）
  - system_status: 获取系统资源状态（CPU、内存、磁盘）
  - run_python: 执行简单的 Python 表达式并返回结果
"""

import os
import glob
import json
import subprocess
import platform
from datetime import datetime

from fastmcp import FastMCP

mcp = FastMCP("workspace-tools")


@mcp.tool()
def workspace_info() -> str:
    """获取当前工作区的基本信息，包括路径、Git 分支、文件数量等。"""
    cwd = os.getcwd()
    info = {
        "workspace_path": cwd,
        "timestamp": datetime.now().isoformat(),
        "platform": platform.system(),
        "python_version": platform.python_version(),
    }

    # Git info
    try:
        branch = subprocess.check_output(
            ["git", "branch", "--show-current"],
            cwd=cwd,
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        info["git_branch"] = branch

        status = subprocess.check_output(
            ["git", "status", "--porcelain"],
            cwd=cwd,
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        info["git_changed_files"] = len(status.splitlines()) if status else 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        info["git"] = "not available"

    # File count
    total_files = sum(1 for _ in glob.iglob(os.path.join(cwd, "**"), recursive=True))
    info["total_files"] = total_files

    return json.dumps(info, indent=2, ensure_ascii=False)

@mcp.tool()
def system_status() -> str:
    """获取系统资源状态，包括 CPU、内存、磁盘等信息。"""
    info = {
        "platform": platform.platform(),
        "architecture": platform.machine(),
        "hostname": platform.node(),
        "timestamp": datetime.now().isoformat(),
    }

    # Disk usage
    try:
        stat = os.statvfs("/")
        total = stat.f_blocks * stat.f_frsize
        free = stat.f_bfree * stat.f_frsize
        info["disk"] = {
            "total_gb": round(total / (1024**3), 2),
            "free_gb": round(free / (1024**3), 2),
            "used_percent": round((1 - free / total) * 100, 1),
        }
    except (OSError, AttributeError):
        info["disk"] = "unavailable"

    # Node.js version
    try:
        node_ver = subprocess.check_output(
            ["node", "--version"], stderr=subprocess.DEVNULL, text=True
        ).strip()
        info["node_version"] = node_ver
    except (subprocess.CalledProcessError, FileNotFoundError):
        info["node_version"] = "not installed"

    return json.dumps(info, indent=2, ensure_ascii=False)

# @mcp.tool()
# def list_files(path: str = ".", pattern: str = "*", max_depth: int = 3) -> str:
#     """列出指定目录下的文件和目录。

#     Args:
#         path: 相对于工作区的路径，默认为当前目录
#         pattern: 文件匹配模式（glob），默认为 '*'
#         max_depth: 最大递归深度，默认为 3
#     """
#     base = os.path.abspath(path)
#     if not os.path.isdir(base):
#         return json.dumps({"error": f"目录不存在: {path}"}, ensure_ascii=False)

#     results = []
#     for root, dirs, files in os.walk(base):
#         depth = root.replace(base, "").count(os.sep)
#         if depth >= max_depth:
#             dirs.clear()
#             continue

#         rel_root = os.path.relpath(root, base)
#         for f in sorted(files):
#             if glob.fnmatch.fnmatch(f, pattern):
#                 fp = os.path.join(rel_root, f) if rel_root != "." else f
#                 size = os.path.getsize(os.path.join(root, f))
#                 results.append({"file": fp, "size_bytes": size})

#     return json.dumps(
#         {"base": base, "pattern": pattern, "count": len(results), "files": results[:100]},
#         indent=2,
#         ensure_ascii=False,
#     )


# @mcp.tool()
# def search_text(query: str, file_pattern: str = "*.py", max_results: int = 20) -> str:
#     """在工作区文件中搜索文本内容。

#     Args:
#         query: 要搜索的文本
#         file_pattern: 文件匹配模式，默认为 '*.py'
#         max_results: 最大返回结果数，默认 20
#     """
#     cwd = os.getcwd()
#     results = []
#     for filepath in glob.iglob(os.path.join(cwd, "**", file_pattern), recursive=True):
#         try:
#             with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
#                 for i, line in enumerate(f, 1):
#                     if query.lower() in line.lower():
#                         results.append({
#                             "file": os.path.relpath(filepath, cwd),
#                             "line": i,
#                             "content": line.strip()[:200],
#                         })
#                         if len(results) >= max_results:
#                             break
#         except (OSError, UnicodeDecodeError):
#             continue
#         if len(results) >= max_results:
#             break

#     return json.dumps(
#         {"query": query, "pattern": file_pattern, "count": len(results), "results": results},
#         indent=2,
#         ensure_ascii=False,
#     )


# @mcp.tool()
# def read_file(path: str, start_line: int = 0, end_line: int = 0) -> str:
#     """读取文件内容。可以指定行号范围只读取部分内容。

#     Args:
#         path: 文件路径（相对于工作区或绝对路径）
#         start_line: 起始行号（从 1 开始），0 表示从头开始
#         end_line: 结束行号（包含），0 表示读到末尾
#     """
#     filepath = os.path.abspath(path)
#     if not os.path.isfile(filepath):
#         return json.dumps({"error": f"文件不存在: {path}"}, ensure_ascii=False)

#     try:
#         with open(filepath, "r", encoding="utf-8", errors="replace") as f:
#             lines = f.readlines()

#         total = len(lines)
#         s = max(1, start_line) - 1 if start_line > 0 else 0
#         e = min(total, end_line) if end_line > 0 else total

#         numbered = [f"{i + s + 1:>4}| {line.rstrip()}" for i, line in enumerate(lines[s:e])]
#         content = "\n".join(numbered)

#         return json.dumps({
#             "file": filepath,
#             "total_lines": total,
#             "showing": f"{s + 1}-{e}",
#             "content": content,
#         }, indent=2, ensure_ascii=False)
#     except Exception as exc:
#         return json.dumps({"error": str(exc)}, ensure_ascii=False)


# @mcp.tool()
# def create_file(path: str, content: str = "", overwrite: bool = False) -> str:
#     """创建新文件。自动创建所需的父目录。

#     Args:
#         path: 文件路径（相对于工作区或绝对路径）
#         content: 文件内容，默认为空
#         overwrite: 如果文件已存在，是否覆盖，默认为 False
#     """
#     filepath = os.path.abspath(path)

#     if os.path.exists(filepath) and not overwrite:
#         return json.dumps({
#             "error": f"文件已存在: {path}（使用 overwrite=true 覆盖）"
#         }, ensure_ascii=False)

#     try:
#         os.makedirs(os.path.dirname(filepath), exist_ok=True)
#         with open(filepath, "w", encoding="utf-8") as f:
#             f.write(content)

#         return json.dumps({
#             "status": "created",
#             "file": filepath,
#             "size_bytes": os.path.getsize(filepath),
#             "lines": content.count("\n") + (1 if content else 0),
#         }, indent=2, ensure_ascii=False)
#     except Exception as exc:
#         return json.dumps({"error": str(exc)}, ensure_ascii=False)


# @mcp.tool()
# def edit_file(
#     path: str,
#     new_content: str,
#     start_line: int = 0,
#     end_line: int = 0,
#     insert_mode: str = "replace",
# ) -> str:
#     """编辑已有文件的指定行范围，支持替换、插入和追加。

#     Args:
#         path: 文件路径
#         new_content: 新内容
#         start_line: 起始行号（从 1 开始）。0 表示整个文件替换。
#         end_line: 结束行号（包含）。0 且 start_line 也为 0 时替换整个文件。
#         insert_mode: 'replace' 替换指定行 | 'before' 在 start_line 前插入 | 'after' 在 end_line 后插入 | 'append' 追加到文件末尾
#     """
#     filepath = os.path.abspath(path)
#     if not os.path.isfile(filepath):
#         return json.dumps({"error": f"文件不存在: {path}"}, ensure_ascii=False)

#     try:
#         with open(filepath, "r", encoding="utf-8") as f:
#             lines = f.readlines()

#         new_lines = new_content.splitlines(keepends=True)
#         if new_content and not new_content.endswith("\n"):
#             new_lines[-1] += "\n"

#         if insert_mode == "append":
#             lines.extend(new_lines)
#         elif start_line == 0 and end_line == 0:
#             lines = new_lines
#         else:
#             s = max(1, start_line) - 1
#             e = min(len(lines), end_line) if end_line > 0 else s + 1

#             if insert_mode == "before":
#                 lines = lines[:s] + new_lines + lines[s:]
#             elif insert_mode == "after":
#                 lines = lines[:e] + new_lines + lines[e:]
#             else:  # replace
#                 lines = lines[:s] + new_lines + lines[e:]

#         with open(filepath, "w", encoding="utf-8") as f:
#             f.writelines(lines)

#         return json.dumps({
#             "status": "edited",
#             "file": filepath,
#             "total_lines": len(lines),
#             "mode": insert_mode,
#         }, indent=2, ensure_ascii=False)
#     except Exception as exc:
#         return json.dumps({"error": str(exc)}, ensure_ascii=False)
# 
# @mcp.tool()
# def run_python(expression: str) -> str:
#     """执行一个 Python 表达式并返回结果。适用于简单计算和数据处理。

#     Args:
#         expression: 要执行的 Python 表达式
#     """
#     try:
#         result = eval(expression)  # noqa: S307
#         return json.dumps(
#             {"expression": expression, "result": str(result), "type": type(result).__name__},
#             indent=2,
#             ensure_ascii=False,
#         )
#     except Exception as e:
#         return json.dumps(
#             {"expression": expression, "error": str(e), "error_type": type(e).__name__},
#             indent=2,
#             ensure_ascii=False,
#         )


if __name__ == "__main__":
    mcp.run(transport="stdio")
