# Whiteboard 插件

dinotty 插件，提供无限画布白板工具，支持自由绘图、图形、文本和图片。

## 功能

### 绘图工具

| 工具 | 快捷键 | 说明 |
|------|--------|------|
| 选择 | `V` / `1` | 点选、Shift 多选、框选、拖拽移动、缩放手柄 |
| 画笔 | `P` / `7` | 自由手绘 |
| 马克笔 | -- | 半透明手绘 |
| 荧光笔 | -- | 黄色高亮，高透明度 |
| 橡皮擦 | `E` / `9` | 擦除接触的元素 |
| 矩形 | `R` / `2` | 拖拽绘制矩形 |
| 椭圆 | `O` / `4` | 拖拽绘制椭圆 |
| 菱形 | `D` / `3` | 拖拽绘制菱形 |
| 线段 | `L` / `6` | 拖拽绘制线段 |
| 箭头 | `A` / `5` | 拖拽绘制箭头（支持起点/终点标记） |
| 文本 | `T` / `8` | 双击创建，内联编辑，自动调整大小 |
| 图片 | `0` | 文件选择器或剪贴板粘贴 |

### 画布操作

- **无限平移**：鼠标中键拖拽，或 `Space` + 拖拽
- **缩放**：触控板双指捏合、滚轮缩放、工具栏 +/- 按钮
- **惯性滚动**：平移释放后带惯性动画
- **网格**：可切换显示/隐藏

### 编辑功能

- **撤销/重做**：50 步历史栈（`Ctrl+Z` / `Ctrl+Shift+Z`）
- **复制/粘贴**：选中元素后 `Ctrl+C` / `Ctrl+V`
- **全选**：`Ctrl+A`

### 导出

- PNG（白底）
- JPG（白底）
- JSON（包含完整元素数据和视口状态）

### 其他

- **小地图**：右下角概览视图
- **状态栏**：当前工具、元素数量、缩放比例
- **自动保存**：数据持久化到插件存储
- **颜色选择**：描边颜色和填充颜色面板
- **线宽调整**：数字键 `1-0` 快速切换，`[` / `]` 微调

## 目录结构

```
dinotty-whiteboard/
├── README.md           # 本文档
├── plugin.json         # 插件清单
├── package.json        # Node.js 项目配置
├── build.js            # esbuild 构建脚本
├── main.js             # 编译产物
├── styles.css          # 样式
└── src/
    ├── main.js         # 插件入口
    ├── constants.js    # 默认值、限制、颜色面板
    ├── core/
    │   ├── board.js    # 主 Board 类，事件处理，工具编排
    │   ├── viewport.js # 坐标变换，平移/缩放
    │   ├── renderer.js # Canvas 2D 渲染
    │   └── history.js  # 撤销/重做栈
    ├── elements/
    │   ├── base.js     # 元素基础定义
    │   ├── freehand.js # 自由手绘元素
    │   ├── shapes.js   # 几何图形元素
    │   ├── text.js     # 文本元素
    │   └── image.js    # 图片元素
    ├── tools/
    │   ├── select.js   # 选择工具
    │   ├── pen.js      # 画笔工具
    │   ├── eraser.js   # 橡皮擦工具
    │   ├── shape.js    # 图形工具
    │   ├── text.js     # 文本工具
    │   └── image.js    # 图片工具
    ├── ui/
    │   ├── toolbar.js  # 工具栏
    │   ├── minimap.js  # 小地图
    │   └── exportDialog.js # 导出对话框
    └── utils/
        ├── clipboard.js      # 剪贴板操作
        ├── export.js         # 导出工具
        ├── id.js             # ID 生成
        ├── simplify.js       # RDP 线条简化
        └── spline.js         # Catmull-Rom 样条平滑
```

## 构建

需要 Node.js 和 esbuild：

```bash
cd dinotty-whiteboard
npm install
npm run build
```

## 安装

### 从源码构建

```bash
cd dinotty-whiteboard
npm install && npm run build
ln -s $(pwd) ~/.dinotty/plugins/dinotty-whiteboard
```

### 直接安装

使用编译好的 `main.js`，无需构建：

```bash
ln -s $(pwd) ~/.dinotty/plugins/dinotty-whiteboard
```
