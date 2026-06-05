# Skill Manager 插件

dinotty 插件，用于管理 Claude Code Agent Skills（`~/.claude/skills/`）。提供已安装 Skills 的管理和从 skills.sh 公共目录发现新 Skills 的功能。

## 功能

### 已安装 (Installed)

- 列出所有已安装的 Skills，显示名称、描述、允许的工具和来源仓库
- 编辑 SKILL.md 内容
- 删除 Skill
- 从远程仓库同步更新（支持单个和批量）
- 新建 Skill（从模板创建）
- 解析 SKILL.md 的 YAML frontmatter（name、description、allowed-tools）

### 发现 (Discover)

- 搜索 [skills.sh](https://skills.sh) 公共 Skill 目录
- 通过 git sparse checkout 安装 Skills
- 显示安装数量和安装状态
- 分页加载更多结果

## 使用

### 已安装标签页

```
┌─────────────────────────────────────────────────────┐
│  Skill Manager      [已安装 (6)]  [发现]            │
├─────────────────────────────────────────────────────┤
│  6 个 Skills    [全部同步 (3)]  [+ 新建]  [刷新]    │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Git Commit          git-commit               │  │
│  │  xichan96/skills                             │  │
│  │  按约定式提交规范撰写 Git commit message       │  │
│  │  [Read] [Bash] [Write]                        │  │
│  │                          [同步] [编辑] [删除]  │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Code Review         code-review              │  │
│  │  ...                                         │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 发现标签页

```
┌─────────────────────────────────────────────────────┐
│  Skill Manager      [已安装 (6)]  [发现]            │
├─────────────────────────────────────────────────────┤
│  [搜索 skills.sh 公共目录...]           [搜索]      │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  My Skill     my-skill     user/repo  ↓120    │  │
│  │                                    [安装]      │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Another Skill  another   user/repo  ↓85  ✓  │  │
│  │                                  [已安装]      │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [加载更多]                                         │
└─────────────────────────────────────────────────────┘
```

### 新建 Skill

1. 点击 `+ 新建` 按钮
2. 输入 Skill 名称
3. 自动生成模板 SKILL.md 并打开编辑器

### 同步

对于从仓库安装的 Skills（带有 `.skill-meta.json`），支持一键同步到最新版本。`全部同步` 按钮可批量更新所有仓库安装的 Skills。

## 目录结构

```
skill-manager/
├── README.md       # 本文档
├── plugin.json     # 插件清单
├── src/
│   └── ui.ts       # TypeScript UI 源码
├── dist/
│   └── main.js     # 编译产物
└── styles.css      # 样式
```

## 构建

```bash
cd skill-manager
esbuild src/ui.ts --bundle --format=esm --outfile=dist/main.js
```

## 安装

### 从源码构建

```bash
cd skill-manager
esbuild src/ui.ts --bundle --format=esm --outfile=dist/main.js
ln -s $(pwd) ~/.dinotty/plugins/skill-manager
```

### 直接安装

使用编译好的 `dist/main.js`，无需构建：

```bash
ln -s $(pwd) ~/.dinotty/plugins/skill-manager
```

## 依赖

- `git`：用于通过 sparse checkout 安装和同步 Skills
- `curl`：用于访问 skills.sh API
