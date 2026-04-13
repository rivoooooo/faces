# 任务列表

- [x] 任务 1: 创建主题目录结构 src/themes/
  - 创建 src/themes/ 目录
  - 创建 src/themes/variables.css 用于共享 CSS 自定义属性
  - 创建 src/themes/reset.css 用于公共重置和基础样式
  - 创建 src/themes/default.theme.css(原始 style.css 的副本)
  - 创建 src/themes/pixel.theme.css(新的 1-bit dither-punk 主题)

- [x] 任务 2: 将 CSS 变量提取到 src/themes/variables.css
  - 识别所有颜色变量(--ink, --muted, --paper 等)
  - 识别排版变量(--font-body, --font-display)
  - 识别阴影和效果变量(--shadow)
  - 添加任何缺失的共享变量

- [x] 任务 3: 将共享重置和基础样式提取到 src/themes/reset.css
  - 提取 \* 选择器的 box-sizing
  - 提取 body 的 margin 和 min-width
  - 提取 h1, h2, p 的 margin
  - 提取 h1, h2 的字体属性
  - 提取 #app 的 min-height
  - 提取 @keyframes 动画(breathe, hit-shake, spin 等)

- [x] 任务 4: 将原始 style.css 重命名为 default.theme.css
  - 将 style.css 内容复制到 src/themes/default.theme.css
  - 在顶部导入 variables.css 和 reset.css
  - 更新原始 src/style.css 导入 themes/default.theme.css

- [x] 任务 5: 创建 pixel.theme.css 实现 1-bit horror 美学
  - 将颜色变量覆盖为仅使用纯黑(#000)和纯白(#FFF)
  - 实现抖动图案 SVG 定义
  - 添加 3 层边框系统
  - 实现按钮反转状态
  - 移除所有 border-radius(尖角)
  - 为标题添加大写 + 字间距
  - 添加像素字体族
  - 为白色-on-黑色添加"燃烧"发光效果
  - 添加卡顿/步进动画

- [x] 任务 6: 为 pixel 主题设计卡牌稀有度 1-bit 美学
  - 设计普通(普通)稀有度方块:白色带黑色点状抖动
  - 设计稀有度方块:黑色带白色交叉线图案
  - 设计史诗稀有度方块:白色带黑色对角线图案
  - 设计传说稀有度方块:纯黑带白色边框闪烁效果
  - 实现 CSS 抖动图案和边框效果

- [x] 任务 7: 更新 src/style.css 作为主题导入协调器
  - 导入 default 主题(或允许主题切换)
  - 添加注释说明如何切换主题

# 任务依赖

- 任务 2 依赖于任务 1
- 任务 3 依赖于任务 1
- 任务 4 依赖于任务 2 和任务 3
- 任务 5 依赖于任务 2 和任务 3
- 任务 6 依赖于任务 5
- 任务 7 依赖于任务 4 和任务 5
