/**
 * TagHit 示例插件 —— hello
 * 演示插件协议：module.exports.activate(ctx) → { tools }
 * ctx 按 plugin.json 的 permissions 注入受限 Node API（此处 fs 只读）。
 * 注意：插件使用 CommonJS（.cjs），因为项目 package.json 为 "type": "module"，
 * .js 会被 Node 视为 ESM；宿主用 require() 加载，因此统一用 .cjs。
 */
module.exports = {
  activate(ctx) {
    ctx.log('hello 插件已激活')

    return {
      tools: {
        hello: (args) => ({
          greeting: `你好，${args?.name ?? '世界'}！来自「${ctx.name}」插件`,
          version: '0.1.0'
        }),

        listDir: async (args) => {
          if (!ctx.fs) return { error: '当前插件无 fs 权限' }
          const dir = args?.path ?? '.'
          const entries = await ctx.fs.readdir(dir)
          return { dir, entries }
        }
      }
    }
  }
}
