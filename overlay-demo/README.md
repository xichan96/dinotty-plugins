# Overlay Demo 插件

全局 overlay 贡献点的示例插件，演示 Dinotty 的悬浮界面能力。

## 功能

- **whole 模式**：全局悬浮操作按钮（FAB）
- **grip 模式**：可拖动的看板面板
- **被动状态条**：不打扰输入的常驻状态提示
- 与宿主 Vue 运行时共享响应式状态

## 使用

安装后插件会注册全局 overlay。可在命令面板执行 “Open Overlay Demo” 切换演示形态，或在插件设置中调整显示模式。

## 开发

源码位于 `src/`，样式使用 `build-styles.mjs` 构建，构建产物为仓库根目录的 `main.js` 与 `styles.css`。
