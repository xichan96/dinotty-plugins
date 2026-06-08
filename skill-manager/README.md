# Skill Manager 插件

dinotty 插件，统一管理 Claude Code、Codex 以及自定义目录中的 Agent Skills。提供已安装 Skills 的管理和从 skills.sh 公共目录发现新 Skills 的功能。

## 功能

### 已安装 (Installed)

- 自动扫描多个来源的 Skills：
  - **Claude Code**：`~/.claude/skills/` 目录下的 Skills
  - **Codex**：`~/.codex/skills/` 目录下的 Skills（含 `.md` 文件和 `.system/` 系统 Skills）
  - **自定义目录**：用户配置的任何额外 Skills 目录
- 来源标签：每个 Skill 卡片显示来源（Claude / Codex / 自定义）
- 来源过滤：按来源筛选已安装的 Skills
- 编辑 SKILL.md 内容
- 删除 Skill（系统内置 Skill 不可删除/编辑）
- 从远程仓库同步更新（支持单个和批量）
- 新建 Skill（可选择创建到 Claude / Codex / 自定义目录）
- 自定义目录管理：添加/移除额外的 Skills 扫描目录，配置持久化到 `~/.dinotty/skill-manager-dirs.json`
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
│  Skill Manager      [已安装 (12)]  [发现]           │
├─────────────────────────────────────────────────────┤
│  12 个 Skills  [全部同步 (3)] [+ 新建] [刷新]       │
│                                                     │
│  [全部(12)] [Claude(6)] [Codex(4)] [自定义(2)]      │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Git Commit    git-commit  [Claude]           │  │
│  │  xichan96/skills                              │  │
│  │  按约定式提交规范撰写 Git commit message        │  │
│  │  [Read] [Bash] [Write]                        │  │
│  │                          [同步] [编辑] [删除]  │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Git Workflow  git-workflow [Codex]           │  │
│  │  Git 工作流模式，分支策略、提交规范...          │  │
│  │                                    [编辑] [删除]│ │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌ 自定义目录 ───────────────── [+ 添加目录] ──┐   │
│  │  ~/my-skills                     [移除]      │   │
│  └──────────────────────────────────────────────┘   │
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
2. 选择目标来源（Claude / Codex / 自定义目录）
3. 输入 Skill 名称
4. 自动生成模板 SKILL.md 并打开编辑器

### 自定义目录

1. 点击 `+ 添加目录` 输入本地 Skills 目录路径（支持 `~` 展开）
2. 添加后自动扫描该目录下的 Skills（子目录含 `SKILL.md`）
3. 配置持久化到 `~/.dinotty/skill-manager-dirs.json`

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
