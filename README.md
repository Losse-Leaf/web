# 《散页》 · Loose Leaf Web Client

> **Digital Atelier & Living Archive · 线上公开画廊与生活时间流**
>
> 组织主页: [https://github.com/Losse-Leaf](https://github.com/Losse-Leaf)  
> 线上画廊: [https://codeactivityhub.top](https://codeactivityhub.top)  
> 后端核心: [https://github.com/Losse-Leaf/backend](https://github.com/Losse-Leaf/backend)

---

## 项目概览

《散页》Web 端是面向公众与主理人的数字生活档案展厅。整体排版基于经典的纯纸本印刷出版物设计哲学，追求极简、克制与呼吸感，彻底告别单向度技术求职简历的刻板范式。

- **核心技术**：Vue 3 + Vite + TypeScript + Tailwind CSS
- **排版字体**：Newsreader（电影级衬线体）+ JetBrains Mono（等宽数字刻度）+ Plus Jakarta Sans
- **视觉特性**：
  - 纯原生 SVG 纸张微噪点覆盖（0 外部网络请求）
  - 胶片暗房装裱底片框 (`.film-frame`) 与全屏沉浸灯箱 (`EditorialLightbox`)
  - 岁月留白刻度（相邻记录跨度 $\ge 14$ 天自动触发极简切线标注）
  - 支出光谱细线条（提取陶土红、青石灰、皮褐、暮紫、苔藓绿大地色系）
- **核心板块**：
  - **时间流 (Life Stream)**：多态内容排版（日常、想法、胶卷照片、项目经历、柴米油盐）
  - **记账 (Bookkeeping)**：按日汇聚流水、月度三项概览与类目光谱
  - **造物 (Things I Made)**：软件架构实验、开源服务与生活手艺（手冲方案、夜骑路书）
  - **主理人 (Curator Profile)**：暗房装裱肖像、精神信条、独白与随身桌面设备清单 (EDC)
  - **当下 (Now Status)** 与 **按年月归档 (Archive)**

---

## 本地开发与构建

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器 (默认端口 5174，自动反代至后端 8088 端口)
npm run dev

# 3. 生产打包
npm run build
```
