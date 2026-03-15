# testy-sample

一个类似 **CurseAway** 的 AI 发泄平台，面向想要快速倾诉、吐槽、释放情绪的用户。项目使用 **Node.js + SQLite + HTML/CSS/JavaScript** 构建，目标是提供一个轻量、易部署、低门槛的情绪表达与 AI 互动原型。

## Overview

用户可以在网页中输入自己的烦恼、情绪或吐槽内容，系统将通过 AI 生成回应，提供陪伴感、反馈感或轻度引导。整个项目尽量保持简单直接，适合作为：

- AI 情绪陪伴类产品原型
- Node.js + SQLite 全栈练手项目
- 轻量级 Web 应用实验项目

## Features

- **情绪发泄输入**  
  提供一个低门槛的表达入口，让用户快速把想说的话写出来。

- **AI 自动回复**  
  根据用户输入返回相应内容，可用于安慰、共情、吐槽式互动或轻度陪伴。

- **轻量本地存储**  
  使用 SQLite 保存基础数据，减少部署复杂度。

- **简洁前端界面**  
  基于 HTML / CSS / JavaScript 实现基础交互页面。

- **Node.js 后端服务**  
  负责请求处理、AI 调用封装、数据读写和页面/API 服务。

## Tech Stack

- **Backend:** Node.js
- **Database:** SQLite
- **Frontend:** HTML, CSS, JavaScript

## Getting Started

> 当前仓库的具体命令和目录结构可能会随着开发调整，以下内容为初始 README 的通用启动方式。

### 1. Clone repository

```bash
git clone git@github.com:XXXieyuan/testy-sample.git
cd testy-sample
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the app

```bash
npm start
```

如果项目后续加入开发模式，也可以使用：

```bash
npm run dev
```

### 4. Open in browser

常见本地地址示例：

```bash
http://localhost:3000
```

## Usage

1. 打开网页应用
2. 在输入框中写下你的情绪、压力、吐槽或想说的话
3. 提交后等待 AI 返回回应
4. 根据需要继续对话或开始新的表达

## Possible Project Structure

由于当前项目仍处于初始阶段，下面是一个可能的结构示例：

```bash
testy-sample/
├── public/              # 前端静态资源
│   ├── index.html
│   ├── style.css
│   └── script.js
├── server/              # 后端逻辑与 API
├── database/            # SQLite 数据文件 / 初始化脚本
├── package.json
└── README.md
```

## Product Direction

这个项目更偏向一个 **AI 发泄 / 陪伴 / 情绪互动平台原型**，核心关注点包括：

- 让用户更容易开口表达
- 让 AI 回应更自然、更有陪伴感
- 用尽可能低的技术门槛完成部署与迭代

## Roadmap

- [ ] 增加更稳定的对话存储
- [ ] 支持多轮聊天上下文
- [ ] 增加不同 AI 回复风格 / 人设
- [ ] 增加情绪分类与标签
- [ ] 优化前端界面与移动端体验
- [ ] 增加基础内容审核与安全机制
- [ ] 增加部署说明与环境变量配置

## Disclaimer

本项目主要用于学习、实验和产品原型验证。它**不构成心理治疗、医学建议或专业心理健康服务**。如果用户处于严重情绪危机或存在现实风险，请及时寻求专业帮助。

## License

MIT
