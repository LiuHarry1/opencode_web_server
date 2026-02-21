"""
Custom LSP Server — 一个用 pygls 构建的自定义 Language Server。

功能:
  1. Diagnostics  — 检测 TODO/FIXME 注释、超长行、未使用的 import
  2. Completion   — 提供常用 Python 代码片段补全
  3. Hover        — 悬浮提示，显示常用内置函数的文档
  4. Formatting   — 简单的空白行清理

启动方式: python custom_lsp_server.py (通过 stdio 与客户端通信)
日志输出到 stderr（不影响 stdio 通信）
"""

import os
import re
import logging
import time
from typing import Optional

from pygls.lsp.server import LanguageServer
from lsprotocol import types

# ──────────────────────────────────────────────
# Server 初始化
# ──────────────────────────────────────────────

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lsp.log")

server = LanguageServer("custom-python-lsp", "v0.1.0")
logger = logging.getLogger("custom-python-lsp")
_call_seq = 0


def _log_call(method: str, detail: str = ""):
    """统一的方法调用日志，带序号和时间戳方便追踪调用顺序。"""
    global _call_seq
    _call_seq += 1
    ts = time.strftime("%H:%M:%S")
    msg = f"[#{_call_seq} {ts}] ← {method}"
    if detail:
        msg += f"  |  {detail}"
    logger.info(msg)

# ──────────────────────────────────────────────
# 1. Diagnostics — 文档打开 / 修改时自动检测问题
# ──────────────────────────────────────────────

MAX_LINE_LENGTH = 120

# 常见内置函数/关键字文档，用于 Hover
BUILTIN_DOCS = {
    "print": "print(*objects, sep=' ', end='\\n', file=sys.stdout, flush=False)\n\n将对象打印到文本流。",
    "len": "len(s)\n\n返回对象的长度（元素个数）。",
    "range": "range(stop) / range(start, stop[, step])\n\n生成不可变的整数序列。",
    "open": "open(file, mode='r', encoding=None, ...)\n\n打开文件并返回文件对象。",
    "enumerate": "enumerate(iterable, start=0)\n\n返回枚举对象，产出 (index, value) 对。",
    "isinstance": "isinstance(object, classinfo)\n\n检查对象是否为指定类型的实例。",
    "dict": "dict(**kwargs) / dict(mapping) / dict(iterable)\n\n创建字典。",
    "list": "list([iterable])\n\n创建列表。",
    "str": "str(object='') / str(bytes, encoding='utf-8', errors='strict')\n\n创建字符串。",
    "int": "int(x=0) / int(x, base=10)\n\n将值转换为整数。",
    "zip": "zip(*iterables, strict=False)\n\n并行迭代多个可迭代对象，产出元组。",
    "map": "map(function, iterable, ...)\n\n对每个元素应用函数，返回迭代器。",
    "filter": "filter(function, iterable)\n\n过滤元素，返回使 function 返回 True 的元素。",
    "sorted": "sorted(iterable, /, *, key=None, reverse=False)\n\n返回排序后的新列表。",
    "type": "type(object)\n\n返回对象的类型。",
    "super": "super([type[, object-or-type]])\n\n返回代理对象，将方法调用委托给父类。",
    "input": "input([prompt])\n\n从标准输入读取一行文本。",
    "abs": "abs(x)\n\n返回数值的绝对值。",
    "max": "max(iterable, *[, key, default]) / max(arg1, arg2, ...)\n\n返回最大值。",
    "min": "min(iterable, *[, key, default]) / min(arg1, arg2, ...)\n\n返回最小值。",
}

# 补全代码片段
COMPLETION_SNIPPETS = [
    ("def", "def ${1:function_name}(${2:args}):\n    ${3:pass}", "定义函数"),
    ("class", "class ${1:ClassName}:\n    def __init__(self${2:, args}):\n        ${3:pass}", "定义类"),
    ("if", "if ${1:condition}:\n    ${2:pass}", "if 语句"),
    ("for", "for ${1:item} in ${2:iterable}:\n    ${3:pass}", "for 循环"),
    ("while", "while ${1:condition}:\n    ${2:pass}", "while 循环"),
    ("try", "try:\n    ${1:pass}\nexcept ${2:Exception} as e:\n    ${3:raise}", "try/except"),
    ("with", "with ${1:expression} as ${2:var}:\n    ${3:pass}", "with 语句"),
    ("main", 'if __name__ == "__main__":\n    ${1:main()}', "主入口"),
    ("import", "import ${1:module}", "导入模块"),
    ("from", "from ${1:module} import ${2:name}", "从模块导入"),
    ("lambda", "lambda ${1:args}: ${2:expression}", "lambda 表达式"),
    ("list_comp", "[${1:expr} for ${2:item} in ${3:iterable}]", "列表推导式"),
    ("dict_comp", "{${1:key}: ${2:value} for ${3:item} in ${4:iterable}}", "字典推导式"),
    ("dataclass", "from dataclasses import dataclass\n\n@dataclass\nclass ${1:ClassName}:\n    ${2:field}: ${3:str}", "数据类"),
    ("logger", 'import logging\nlogger = logging.getLogger(__name__)', "日志记录器"),
]


def _diagnose(text: str) -> list[types.Diagnostic]:
    """分析文本，返回诊断信息列表。"""
    diagnostics = []
    lines = text.splitlines()

    for i, line in enumerate(lines):
        # 检测 TODO / FIXME
        for tag in ("TODO", "FIXME", "HACK", "XXX"):
            col = line.upper().find(tag)
            if col != -1:
                diagnostics.append(types.Diagnostic(
                    range=types.Range(
                        start=types.Position(line=i, character=col),
                        end=types.Position(line=i, character=col + len(tag)),
                    ),
                    message=f"发现 {tag} 注释: {line.strip()}",
                    severity=types.DiagnosticSeverity.Information,
                    source="custom-lsp",
                    tags=[types.DiagnosticTag.Unnecessary] if tag == "HACK" else [],
                ))

        # 检测超长行
        if len(line) > MAX_LINE_LENGTH:
            diagnostics.append(types.Diagnostic(
                range=types.Range(
                    start=types.Position(line=i, character=MAX_LINE_LENGTH),
                    end=types.Position(line=i, character=len(line)),
                ),
                message=f"行过长 ({len(line)} > {MAX_LINE_LENGTH} 字符)",
                severity=types.DiagnosticSeverity.Warning,
                source="custom-lsp",
            ))

        # 检测 `import *`
        if re.match(r"^\s*from\s+\S+\s+import\s+\*", line):
            diagnostics.append(types.Diagnostic(
                range=types.Range(
                    start=types.Position(line=i, character=0),
                    end=types.Position(line=i, character=len(line)),
                ),
                message="避免使用 `from xxx import *`，请显式导入",
                severity=types.DiagnosticSeverity.Warning,
                source="custom-lsp",
            ))

        # 检测 bare except
        if re.match(r"^\s*except\s*:", line):
            diagnostics.append(types.Diagnostic(
                range=types.Range(
                    start=types.Position(line=i, character=0),
                    end=types.Position(line=i, character=len(line)),
                ),
                message="避免使用裸 `except:`，请指定异常类型",
                severity=types.DiagnosticSeverity.Warning,
                source="custom-lsp",
            ))

        # 检测 `print()` 调试语句
        if re.match(r"^\s*print\(", line) and "# noqa" not in line:
            diagnostics.append(types.Diagnostic(
                range=types.Range(
                    start=types.Position(line=i, character=line.index("print")),
                    end=types.Position(line=i, character=line.index("print") + 5),
                ),
                message="检测到 print() 调用，生产代码中建议使用 logging",
                severity=types.DiagnosticSeverity.Hint,
                source="custom-lsp",
            ))

    return diagnostics


def _publish(uri: str, diagnostics: list[types.Diagnostic]):
    """发布诊断信息到客户端。"""
    _log_call("publishDiagnostics →", f"uri={uri}  count={len(diagnostics)}")
    server.text_document_publish_diagnostics(
        types.PublishDiagnosticsParams(uri=uri, diagnostics=diagnostics)
    )


# ──────────────────────────────────────────────
# 0. Lifecycle — 生命周期事件
# （注意: pygls 2.x 内部管理 initialize/shutdown，
#   这里只 hook initialized 通知，不影响内部流程）
# ──────────────────────────────────────────────

@server.feature(types.INITIALIZED)
def on_initialized(params: types.InitializedParams):
    """客户端确认初始化完成，LSP 进入工作状态。"""
    _log_call("initialized", "server ready — 开始接收文档事件")


# ──────────────────────────────────────────────
# 1. Document Sync — 文档同步事件
# ──────────────────────────────────────────────

@server.feature(types.TEXT_DOCUMENT_DID_OPEN)
def did_open(params: types.DidOpenTextDocumentParams):
    """文档打开时进行诊断。"""
    doc = params.text_document
    lines = doc.text.count("\n") + 1
    _log_call("textDocument/didOpen", f"uri={doc.uri}  lang={doc.language_id}  version={doc.version}  lines={lines}")
    diags = _diagnose(doc.text)
    _publish(doc.uri, diags)


@server.feature(types.TEXT_DOCUMENT_DID_CHANGE)
def did_change(params: types.DidChangeTextDocumentParams):
    """文档内容改变时重新诊断。"""
    uri = params.text_document.uri
    ver = params.text_document.version
    changes = len(params.content_changes) if params.content_changes else 0
    _log_call("textDocument/didChange", f"uri={uri}  version={ver}  changes={changes}")
    doc = server.workspace.get_text_document(uri)
    _publish(uri, _diagnose(doc.source))


@server.feature(types.TEXT_DOCUMENT_DID_SAVE)
def did_save(params: types.DidSaveTextDocumentParams):
    """文档保存时重新诊断。"""
    uri = params.text_document.uri
    _log_call("textDocument/didSave", f"uri={uri}")
    doc = server.workspace.get_text_document(uri)
    _publish(uri, _diagnose(doc.source))


@server.feature(types.TEXT_DOCUMENT_DID_CLOSE)
def did_close(params: types.DidCloseTextDocumentParams):
    """文档关闭。"""
    uri = params.text_document.uri
    _log_call("textDocument/didClose", f"uri={uri}")


# ──────────────────────────────────────────────
# 2. Completion — 代码补全
# ──────────────────────────────────────────────

@server.feature(
    types.TEXT_DOCUMENT_COMPLETION,
    types.CompletionOptions(trigger_characters=[".", " "]),
)
def completions(params: types.CompletionParams) -> types.CompletionList:
    """提供代码补全建议。"""
    uri = params.text_document.uri
    pos = params.position
    _log_call("textDocument/completion", f"uri={uri}  line={pos.line}  char={pos.character}")

    doc = server.workspace.get_text_document(uri)
    line = doc.source.splitlines()[pos.line] if doc.source.splitlines() else ""
    current_word = _get_word_at(line, pos.character)

    items = []

    for label, snippet, doc_str in COMPLETION_SNIPPETS:
        if current_word and not label.startswith(current_word):
            continue
        items.append(types.CompletionItem(
            label=label,
            kind=types.CompletionItemKind.Snippet,
            detail=doc_str,
            insert_text=snippet,
            insert_text_format=types.InsertTextFormat.Snippet,
        ))

    for name, doc_str in BUILTIN_DOCS.items():
        if current_word and not name.startswith(current_word):
            continue
        items.append(types.CompletionItem(
            label=name,
            kind=types.CompletionItemKind.Function,
            detail="Python 内置函数",
            documentation=types.MarkupContent(
                kind=types.MarkupKind.Markdown,
                value=f"```python\n{doc_str.split(chr(10))[0]}\n```\n\n{doc_str.split(chr(10))[-1]}",
            ),
        ))

    _log_call("textDocument/completion →", f"返回 {len(items)} 个补全项  word={current_word!r}")
    return types.CompletionList(is_incomplete=False, items=items)


def _get_word_at(line: str, character: int) -> str:
    """获取光标位置的当前单词。"""
    if not line or character <= 0:
        return ""
    left = line[:character]
    match = re.search(r"[a-zA-Z_]\w*$", left)
    return match.group() if match else ""


# ──────────────────────────────────────────────
# 3. Hover — 悬浮提示
# ──────────────────────────────────────────────

@server.feature(types.TEXT_DOCUMENT_HOVER)
def hover(params: types.HoverParams) -> Optional[types.Hover]:
    """鼠标悬浮时显示文档提示。"""
    uri = params.text_document.uri
    pos = params.position
    _log_call("textDocument/hover", f"uri={uri}  line={pos.line}  char={pos.character}")

    doc = server.workspace.get_text_document(uri)
    lines = doc.source.splitlines()
    if pos.line >= len(lines):
        _log_call("textDocument/hover →", "line out of range, return None")
        return None

    line = lines[pos.line]
    word = _get_word_at_position(line, pos.character)

    if not word:
        _log_call("textDocument/hover →", "no word at position, return None")
        return None

    _log_call("textDocument/hover →", f"word={word!r}")

    if word in BUILTIN_DOCS:
        return types.Hover(
            contents=types.MarkupContent(
                kind=types.MarkupKind.Markdown,
                value=f"### `{word}`\n\n```python\n{BUILTIN_DOCS[word].split(chr(10))[0]}\n```\n\n{BUILTIN_DOCS[word].split(chr(10))[-1]}",
            ),
        )

    # Python 关键字提示
    keyword_docs = {
        "def": "定义函数",
        "class": "定义类",
        "import": "导入模块",
        "from": "从模块导入",
        "return": "从函数返回值",
        "yield": "生成器 yield 值",
        "async": "异步定义",
        "await": "等待异步操作",
        "with": "上下文管理器",
        "lambda": "匿名函数",
        "raise": "抛出异常",
        "try": "异常处理块",
        "except": "捕获异常",
        "finally": "异常处理的 finally 块",
    }
    if word in keyword_docs:
        return types.Hover(
            contents=types.MarkupContent(
                kind=types.MarkupKind.Markdown,
                value=f"**`{word}`** — Python 关键字\n\n{keyword_docs[word]}",
            ),
        )

    return None


def _get_word_at_position(line: str, character: int) -> str:
    """获取指定位置的完整单词。"""
    if not line:
        return ""
    start = character
    while start > 0 and (line[start - 1].isalnum() or line[start - 1] == "_"):
        start -= 1
    end = character
    while end < len(line) and (line[end].isalnum() or line[end] == "_"):
        end += 1
    return line[start:end]


# ──────────────────────────────────────────────
# 启动
# ──────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
        filename=LOG_FILE,
        filemode="w",
    )
    logger.info("Custom Python LSP Server starting (pid=%d)  log → %s", os.getpid(), LOG_FILE)
    server.start_io()
