/**
 * OpenCode Test Plugin — 用于测试 Plugin 功能。
 *
 * 功能：
 *  1. 事件日志：记录 session 和 file 事件
 *  2. 自定义工具 (hello)：一个简单的问候工具，验证 custom tool 机制
 *  3. 自定义工具 (timestamp)：返回格式化的当前时间
 *  4. tool.execute.before 钩子：在每次工具执行前打印日志
 */

import { tool } from "@opencode-ai/plugin"

export const TestToolsPlugin = async ({ project, client, $, directory, worktree }) => {
  console.log(`[test-tools] Plugin loaded — workspace: ${directory}`)

  return {
    // ─── 事件监听 ───────────────────────────────
    event: async ({ event }) => {
      if (event.type === "session.created") {
        console.log(`[test-tools] New session created`)
      }
      if (event.type === "session.idle") {
        console.log(`[test-tools] Session is idle`)
      }
      if (event.type === "file.edited") {
        console.log(`[test-tools] File edited: ${JSON.stringify(event.properties)}`)
      }
    },

    // ─── Hook: 工具执行前拦截 ─────────────────────
    "tool.execute.before": async (input, output) => {
      console.log(`[test-tools] Tool executing: ${input.tool}`)
    },

    // ─── Hook: 工具执行后 ────────────────────────
    "tool.execute.after": async (input, output) => {
      console.log(`[test-tools] Tool finished: ${input.tool}`)
    },

    // ─── 自定义工具 ─────────────────────────────
    tool: {
      hello: tool({
        description:
          "A simple greeting tool for testing plugins. Say hello to someone and get a friendly response.",
        args: {
          name: tool.schema.string("The name to greet"),
        },
        async execute(args, context) {
          const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
          return `你好, ${args.name}! 当前时间: ${now} | 工作区: ${context.directory}`
        },
      }),

      timestamp: tool({
        description:
          "Return the current timestamp in multiple formats. Useful for testing and debugging.",
        args: {},
        async execute(_args, context) {
          const now = new Date()
          return JSON.stringify(
            {
              iso: now.toISOString(),
              unix: Math.floor(now.getTime() / 1000),
              local_cn: now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
              local_us: now.toLocaleString("en-US", { timeZone: "America/New_York" }),
              workspace: context.directory,
            },
            null,
            2,
          )
        },
      }),
    },
  }
}
