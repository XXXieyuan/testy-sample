# testy-sample

一个暗色霓虹风的 AI 灵感发泄平台原型：用户输入吐槽文字，点击 **「销毁」** 后触发焚化动画，内容会被写入 SQLite，并进入按点赞数排序的排行榜。

## Features

- **销毁式发泄入口**：输入吐槽后点击「销毁」，触发碎裂/焚化视觉效果
- **SQLite 永久存储**：所有吐槽写入本地 SQLite 数据库
- **排行榜机制**：展示所有吐槽，支持点赞，按点赞数降序排序
- **暗色霓虹 UI**：主色调为深色背景 + 橙色 / 绿色荧光效果
- **单页面应用**：Node.js + Express 提供 API 和静态前端

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite
- **Frontend:** HTML + CSS + JavaScript
- **Architecture:** SPA (Single Page Application)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm start
```

### 3. Open in browser

```bash
http://localhost:3000
```

## API Endpoints

- `GET /api/health` — health check
- `GET /api/vents` — 获取所有吐槽，按点赞数降序返回
- `POST /api/vents` — 新建吐槽
- `POST /api/vents/:id/like` — 给吐槽点赞

### Example payload

```json
{
  "content": "今天的破会开得像无限递归。"
}
```

## Project Structure

```bash
testy-sample/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/
│   └── vents.db
├── server.js
├── package.json
├── AUTOPILOT_LOG.md
└── README.md
```

## Notes

- 数据库存放在 `data/vents.db`
- `node_modules/` 和数据库文件已加入 `.gitignore`
- 当前版本为轻量原型，适合继续扩展登录、AI 回复、内容审核等功能

## Future Ideas

- 接入 AI 回复 / 共情文案生成
- 增加多标签分类（工作 / 学业 / 关系 / 随机发疯）
- 增加“今日最毒吐槽”模块
- 支持分页、搜索、匿名昵称
- 加入节奏更强的销毁动画和音效

## License

MIT
