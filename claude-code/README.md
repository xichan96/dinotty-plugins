# Claude Code

Claude Code 可视化对话管理插件 -- 浏览历史、新建和恢复会话。

## 前置要求

本插件基于 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 构建，**必须先安装终端版本的 Claude Code** 才能使用。

### 安装 Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

安装完成后，确认 `claude` 命令可用：

```bash
claude --version
```

首次使用需要登录：

```bash
claude login
```

详细安装文档请参考：https://docs.anthropic.com/en/docs/claude-code

## 功能

- 浏览所有 Claude Code 对话历史
- 按项目分组查看会话
- 搜索历史对话内容
- 新建对话并直接在插件内交互
- 恢复已有会话继续对话
- 快捷键快速切换会话
- 查看对话消耗费用
- Slash 命令面板 (`/new`, `/open`, `/search`, `/skills` 等)

## 构建

```bash
cd claude-code
npm install
npm run build
```

## 依赖

- `claude` CLI (需在 PATH 中可用)
- Node.js (构建时)
