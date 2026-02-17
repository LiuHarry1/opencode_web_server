"""
LSP 功能测试文件 — 用于验证自定义 LSP Server 的各项功能。

你可以在 OpenCode Web 端让 agent 打开这个文件，观察 LSP 的诊断结果。
"""

from os import *  # Warning: import *

import json


# TODO: 这里需要重构
def process_data(items):
    result = []
    for item in items:
        print(item)  # Hint: 建议使用 logging
        result.append(item * 2)
    return result


# FIXME: 这个函数有 bug
def divide(a, b):
    try:
        return a / b
    except:  # Warning: bare except
        return None


# HACK: 临时方案，后面要改
def get_config():
    return {"debug": True}


# 这一行故意写得很长很长很长，超过 120 个字符，用来测试超长行检测功能 ==========================================================================================================================
x = 1


def main():
    data = [1, 2, 3, 4, 5]
    result = process_data(data)
    config = get_config()
    value = divide(10, 0)
    print(f"Result: {result}, Config: {config}, Value: {value}")


if __name__ == "__main__":
    main()
