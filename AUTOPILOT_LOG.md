# AUTOPILOT_LOG

- 时间：2026-03-15 16:20 UTC
- 模式：Autopilot
- 仓库：`/home/node/.openclaw/workspace/testy-sample`

## 本次升级内容

1. 为每条吐槽新增基于 seed 的随机像素怪物头像，使用前端 SVG 生成，无外部 API。
2. 增加发泄分类标签：`老板 / 学校 / 生活 / 感情 / 其他`，支持发帖分类与排行榜筛选。
3. 增加连续发 3 条触发的「暴怒模式」：页面染红 + 多点粒子爆炸。
4. 顶部新增「今日全站已销毁多少条」统计。
5. 将销毁动画升级为 Canvas 粒子爆炸效果。
6. 为排行榜条目增加淡入动画。
7. 点击销毁按钮时增加全屏抖动特效。
8. 新增随机 nickname（如 `匿名熔炉者#1234`），使用 cookie 持久化。
9. 引入 WebSocket 实时更新排行榜。

## 额外增强

- 增加快捷吐槽 chips，减少空白输入摩擦。
- 排行榜显示发帖昵称、标签、时间与像素怪物头像。
- 排行榜筛选器显示各分类条目总量。
- 保留原有核心能力：发帖、点赞、排序、单页应用访问。

## 主要改动文件

- `server.js`
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `package.json`

## 验证

- `npm install`
- 启动 `node server.js`
- 验证 `/api/health`
- 验证 `/api/profile`
- 验证 `POST /api/vents`
- 验证 `GET /api/vents?category=老板`

## 备注

- 数据库采用增量 schema 升级，兼容已有 `vents` 表。
- WebSocket 服务路径为 `/ws`。
- 昵称由服务器生成并通过 cookie 固定，避免刷新后身份漂移。
