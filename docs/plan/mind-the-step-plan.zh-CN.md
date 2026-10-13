# Mind the Step：Data Observatory 申请 Demo 方案（调研版 v1）

> **岗位**：Imperial DSI · Data for Humanity Internship · Data Science Intern
> **路径**：Developer Playground（[`dsi-icl/do-starter-playground`](https://github.com/dsi-icl/do-starter-playground)）
> **截止**：2026-11-20（建议 11-18 前提交）· **面试**：2026-12-09（线下）
> **状态**：只做调研与设计，尚未写代码（2026-10-13）
>
> 标注"⚠ 待核实"的内容来自二手资料或推算，实现时需用一手数据确认。

---

## 0. 一页纸摘要

**项目名**：**Mind the Step：同一张网，两个伦敦**（One network, two Londons）

**一句话**：用 TfL 开放数据算清楚"伦敦对轮椅使用者有多大"，再借 DO 的 313° 环幕让观众亲身感受。同一段旅程，标准出行者 22 分钟到达，轮椅使用者的旅程却要绕墙走完整整一圈（数字仅为示意）。

### 为什么能脱颖而出

| 评审维度（推断） | 多数申请者可能会做 | 本方案 |
|---|---|---|
| 故事与社会影响 | 实时列车地图、客流热力图（好看，但没有"为谁"） | **残障出行公平**：只有约 1/3 地铁站无台阶；DO 所在的 South Kensington 站要到 **2031 年**才能无台阶出入 |
| 数据科学深度 | 调 API，画出来 | 大规模真值采样（TfL Journey Planner：标准与无台阶两种情景）、图网络模型与参数校准、空间统计（LISA）、ML（空间交叉验证的残差模型、生存分析）、组合优化，外加**自建数据集**（从第一天起每 15 分钟记录全网电梯故障） |
| 与 DSI 研究的连接 | 无 | 接续 **Imperial Centre for Transport Studies** 的 Candela et al. (2021) 无障碍改造优化研究，补上它没做的两块："电梯可靠性"和"沉浸式决策"。这也正是首届实习生"把 Imperial 研究搬上 DO"的做法 |
| 为 DO 这个"房间"而设计 | 把网页放大到 64 块屏 | **时间=圆周**（轮椅旅程真的绕墙一圈）；**5\|6\|5 三区构图**；**宏观/微观双读距**；**眼高带**同时照顾站立与轮椅观众的视线；**双平板"赛跑"** |
| 工程质量 | 能跑就行 | 逐条落实 `BEST_PRACTICES.md`；时钟同步沿用 **Vizzy Studio 的二进制协议约定**；修掉 starter 上真墙会出的问题（3×2 坐标钳制、沙箱 iframe 中 localStorage 崩溃、64 个 iframe 超出 WebGL 上下文上限）；测试策略对齐 Vizzy（seam continuation、确定性截图） |
| 评审体验 | 要求评审者本地装环境 | 在线一键 Demo（无服务器模式）、全墙录屏、2 分钟 Reviewer's Guide；可直接作为 Vizzy 的 **Custom Render URL** 上墙 |

**MVP（11-05 前完成）**：场景 S0/S2/S3/S6/S8、双平板、16×4 全墙预览、测试与 CI、在线 Demo。
**加分项**：S1 Pulse、S4 公平、S5 实时电梯（"纸面 vs 实际"）、S7 决策剧场、生存分析、全景模式。

---

## 1. 任务解读与评审视角

### 1.1 硬性信息（来自申请指南 PDF）

| 项 | 内容 |
|---|---|
| 申请三件套 | DO Demo（Vizzy Studio 或 Developer Playground 二选一）、30 秒自我介绍视频、CV；通过 tinyurl.com/D4H-2026 提交 |
| Brief | "use Transport for London's Open Data to tell a story"，题目很宽 |
| Playground 要求 | 克隆仓库，完成开发，推送到自己账号下的 **public** 仓库，在表单里填链接 |
| 画布 | 4 行 × 16 列，每块 1920×1080 |
| 岗位画像 | "strong data science/computational background, analysis, modelling or ML, familiarity with Python" |
| 工作内容 | 参与 **Vizzy Studio** 开发，做医疗、AI、可持续、创新、人道等全球议题的可视化 |
| 待遇与时间 | 最多 4 人；约每周 6 小时，共 6 个月；£1,000/月；2027 年 1 月开始 |
| 联系人 | Kate Heyworth，DO Team Leader |

### 1.2 谁在评审、他们在乎什么（推断）

- 评审很可能是 DO 团队本身：负责人，以及写 starter 和 Vizzy 的开发者。`BEST_PRACTICES.md` 写得极具体，例如"尽量二进制传输（no JSON, no BSON）""渲染里禁用 `Math.random()`/`Date.now()`""主文字不低于屏高 20%"。他们会看你是否读懂并遵守了这些规则。
- 我们推断的评分维度：故事与影响 25%、数据科学 25%、DO 原生设计 25%、工程与可维护性 25%。此外有一道隐性门槛：**能不能直接上墙**。

### 1.3 首届实习生给的信号

首届项目 "Predicting Wildfires Using Human Sensor Data"（Elliott Dwyer、Hongyi Luo，MSc EDSML）把 Imperial Data Learning Group 与 Leverhulme Centre 的研究做成了 DO 可视化。"Imperial 研究 → 沉浸式叙事"这条路径，正是他们想要的。

---

## 2. 调研发现

### 2.1 DO 物理规格与设计约束

| 项 | 值 | 来源 |
|---|---|---|
| 屏幕 | 64 块，4 行 × 16 列，单屏 1920×1080 | 申请指南；DO Demo Guidance |
| 画布 | 30,720 × 4,320 px = 132,710,400 px | DO Demo Guidance |
| 视角 | 313°（个别来源写 310°） | Imperial；SES |
| 尺寸 | 直径约 6 m，高 2.53 m，落地式半圆 | DO Demo Guidance；Imperial 新闻 |
| 渲染 | 32 台渲染节点（另有来源称 40 台以上） | F1000Research 2016；Imperial Business School |
| 官方设计建议 | 关键信息放中央；左→右叙事；避免亮背景和大面积亮块；避免快速运动（会晕）；网页在 Vizzy 中不可交互；视频最大 8K（覆盖 4×4 屏） | DO Demo Guidance |
| starter 规范 | 主文字不低于屏高 20%（约 216 px），按 10 m 视距设计；避免快速、抖动、闪烁 | `BEST_PRACTICES.md` §6 |

**设计推论**（我们的推算，⚠ 需现场核实）：

- **三区构图**：观众站在圆心，舒适视野约 110–120°，即约 1/3 圈、5 列。因此把墙分为 **5|6|5** 三区：
  - 左区 c0–4：语境
  - 中区 c5–10：关键信息。6 列合计 11,520×4,320，恰好并排放下两张全高的伦敦地图
  - 右区 c11–15：含义与行动
- **眼高带**：2.53 m 的落地墙每行约 0.63 m。
  - r0：约 1.90–2.53 m，高于视线
  - r1：约 1.27–1.90 m，站立视线约 1.6 m
  - r2：约 0.63–1.27 m，轮椅或坐姿视线约 1.1–1.3 m
  - r3：约 0–0.63 m，团体参观时容易被前排挡住

  所以关键内容放 **r1–r2**，r3 不放关键信息。这条原则本身就呼应了无障碍主题。
- **边框**：屏与屏之间有窄边框。文字永远不跨边框，地图可以跨。
- **字高**：如果面板是 46 英寸（⚠ 待核实），像素间距约 0.53 mm，216 px 约合 11 cm 字高。

### 2.2 Developer Playground 代码审读

**架构**：TanStack Start（React 19）+ Nitro WebSocket（crossws），用 Vite+（`vp`）管理 monorepo。

| 路由 | 作用 |
|---|---|
| `/` | 模拟器：3×2 迷你墙（6 个 iframe）加两块"平板"控制面板 |
| `/control` | 操作员界面，只发送意图 |
| `/screen?c=&r=` | 单块屏。用 `deriveScreenMapView()` 按像素偏移把"整面墙的地图相机"换算成本屏相机 |
| `/bus` | WebSocket 发布订阅，提供 hello 快照 |

渲染上，顶层文档走 DeckGL + MapLibre 路径，iframe 中走纯 MapLibre 回退路径，以免耗尽 WebGL 上下文。

**上真墙会出的问题，以及可以加分的空白**：

| # | 发现 | 影响 | 我们的处理 |
|---|---|---|---|
| 1 | `WALL_COLS=3`、`WALL_ROWS=2` 写死，`parseScreenCoordinate` 会把坐标钳制到这个范围 | **在 16×4 的 DO 上，c≥3 的 13 列都会显示 c=2 的画面，r≥2 的两行都会显示 r=1 的画面** | 参数化 `WallLayout`，默认 16×4，与 Vizzy 的 `StageLayout` 一致；模拟器保留 3×2 |
| 2 | 没有任何测试（§12 自己写明了） | 评审者知道这是空白 | 补齐 unit、integration、Playwright 测试 |
| 3 | 消息全部是 JSON | 与 §8 的"尽量二进制"相悖 | 高频消息改为二进制帧，沿用 Vizzy 的 opcode 约定 |
| 4 | `ThemeProvider` 和 `ScriptOnce` 直接读写 `localStorage` | Vizzy 经同源代理嵌入时，iframe 的 sandbox 是 `allow-scripts allow-forms`，没有 `allow-same-origin`，访问 localStorage 会抛 SecurityError | 加 `safeStorage` 封装；`/screen` 固定深色主题 |
| 5 | 使用 `/bus`、`/data/...` 这类绝对路径；子路径部署支持曾经合入又被回滚（PR #2/#3） | 回滚前的文档写明应用"设计为在 URL 前缀下运行"（例如 `/my-demo/`），说明 DSI 很可能按子路径部署 | 统一用 `BASE_URL` 拼接路径，并加子路径 e2e 测试 |
| 6 | 16×4 如果用 64 个 iframe 预览 | 超过浏览器约 16 个活跃 WebGL 上下文的上限 | **单 canvas 多 View 的全墙预览**，见 §6.3 |
| 7 | 重连固定间隔 1.5 s，没有心跳和抖动（§8 建议要有） | 64 个节点会同时重连，形成雷群 | 指数退避加 jitter，加 ping |
| 8 | `shuffleSegments` 使用 `Math.random` | 控制端可以接受，但渲染端必须确定性 | 渲染端统一用 seeded PRNG 和共享时钟 |

### 2.3 Vizzy Studio：实习生将参与开发的平台

[`dsi-icl/vizzy-studio`](https://github.com/dsi-icl/vizzy-studio) 是公开仓库（MIT），最近一次提交在 2026-10-12，仍在活跃开发。审读后的关键结论：

| 发现 | 对我们的意义 |
|---|---|
| 技术栈与 starter 相同：TanStack Start、Nitro v3、React 19、Tailwind v4 | 我们写的代码能直接迁移，也能证明你上手就能贡献 |
| 墙节点可以绑定 **Custom Render URL**。非兼容模式下，每块屏的 iframe 加载 `<url>?c=<col>&r=<row>`；兼容模式下，以世界尺寸（30720×4320）渲染再按偏移裁切 | 我们同时提供 `/screen?c&r`（推荐）和 `/world`（兼容模式与录屏）两个入口，可以直接上墙 |
| 外部 URL 的 iframe sandbox 是 `allow-scripts allow-same-origin allow-forms`；经同源代理时是 `allow-scripts allow-forms` | 推荐用远程源部署；代码必须对两种情况都健壮（见 §2.2 第 4 条） |
| 二进制协议（小端）：`CLOCK_PING 0x08 [u8,f64 t0]`、`CLOCK_PONG 0x09 [u8,f64 t0,t1,t2]`、`VIDEO_SYNC 0x15 [anchorMediaTime, anchorServerTime]`；墙端每 2 s 发一次 ping，用最小 RTT 估计时钟偏移 | 我们的 **TIMELINE_SYNC** 帧照搬 VIDEO_SYNC 的"锚点"语义，时钟同步沿用同一套 opcode 约定 |
| `StageLayout {columns, rows, screenWidth, screenHeight}`，旧版默认 16×4 @ 1920×1080；MVP 明确不做边框补偿 | `WallLayout` 类型与之同构；我们的"边框感知排版"可作为一个潜在贡献点 |
| 测试哲学：确定性 Playwright（降低动效、固定时区和 locale）；"Elapsed time is not a correctness condition"；多墙测试检查 **seam continuation** | 我们照这套方法写测试 |
| `/wall?m=dev` 打开可视化调试器 | 我们沿用 `?m=dev` 这个开关名 |

### 2.4 往届 DO demo：crypto-explorer

[`dsi-icl/crypto-explorer`](https://github.com/dsi-icl/crypto-explorer) 是 2024 年一位 MSc Computing 学生的作品，也是 DO 官网上的案例（Bitcoin 实时交易图）。

- 技术：Flask + Socket.IO；接入实时 Bitcoin WebSocket；服务端用 networkx + ForceAtlas2 布局；有独立的 controller 页面；用 JSON 快照做离线回放。
- 它揭示了 DO 喜欢的模式：**实时数据流 + 控制端 + 快照兜底**。我们沿用这个模式，并在可复现管线、测试、社会议题和分析深度上全面提高标准。
- 反面教材：该仓库提交了 `.env` 文件。我们只提交 `.env.example`，密钥放 GitHub Secrets。

### 2.5 数据清单

| 数据 | 获取方式 | 粒度 | 用途 | 注意 |
|---|---|---|---|---|
| 线路与几何 | Unified API `/Line/{id}/Route/Sequence/{dir}` | 有序站点 + lineStrings | 网络图、地图 | 需注册 key，500 次/分钟 |
| 车站与无障碍属性 | `/StopPoint/Mode/{modes}`、`/StopPoint/{id}` | 车站、入口、属性 | 无台阶状态 | 属性字段需清洗 |
| 无台阶基线 | **lrad-v2** XML（电梯路线 ↔ 入口/站台）；Zenodo 2026 数据集（Royal Holloway，2025-12 状态） | 站内路线级 / 车站级 | 构图、交叉验证 | ⚠ lrad 曾被反映过时；Zenodo 数据非官方 |
| 实时电梯 | `/Disruptions/Lifts/v2`；Step-Free Disruptions API（约每分钟更新） | 单部电梯 | S5 实时层、自建日志 | 有开发者报告约 8% 的调用失败；电梯 ID 与站内标识（字母）对不上 |
| 行程规划（真值） | `/Journey/JourneyResults/{from}/to/{to}`，参数 `accessibilityPreference=stepFreeToVehicle`、`stepFreeToPlatform`、`noSolidStairs`…… | 起终点对 | S3、S4、S6；返回各段路径 lineString | 参数大小写 ⚠ 待实测 |
| 实时拥挤度 | `/crowding/{naptan}/Live` | 车站级，5 分钟 | 可选 | 只有相对值（percentageOfBaseline） |
| NUMBAT | crowding.data.tfl.gov.uk | 典型日 15 分钟链路客流 / 进出站 | S1 Pulse | 年度"典型日"；⚠ 最新年份待核实 |
| 车站进出站 | Network demand data（2023 年至今，每周刷新） | 车站级（⚠ 日粒度待核实） | 语境、可选时间序列 | |
| BUSTO | TfL 公交 15 分钟上下客与载客 | 典型日 | 可选："公交兜底" | |
| 残障与年龄 | Census 2021 TS038（Equality Act 定义）、TS007 | LSOA/MSOA | 公平权重 | |
| 贫困 | **English IoD 2025**（2025-10-30 发布，LSOA 2021） | LSOA | 公平分析 | |
| 机会 | BRES 就业（Nomis）；有 A&E 的医院列表（NHS ODS）；大学 | LSOA / 点 | 可达性"机会" | |
| 空间单元 | ONS LSOA/MSOA 2021 边界与人口加权质心；H3 网格 | — | 聚合 | 伦敦有 4,994 个 LSOA、1,002 个 MSOA |
| 步行/轮椅路网 | OSM（Geofabrik Greater London 抽取）；剔除 `highway=steps` | 路段 | 进出站时间 | |
| 底图 | Protomaps PMTiles（dark 风格） | 矢量瓦片 | 离线可用的底图 | ODbL，需署名 |
| 多模式（可选） | TfL TransXChange 经 `transx2gtfs`（作者 Henrikki Tenkanen，UCL）转 GTFS，再用 r5py | 时刻表 | 全矩阵多模式 | TfL 表示不会提供官方 GTFS |

### 2.6 已有研究与作品

| 工作 | 方法与结论 | 局限，以及我们的增量 |
|---|---|---|
| MDUK Trailblazers（2016） | 用 TfL Journey Planner 抽样：无台阶出行平均耗时 **4.5 倍**。Baker St → Bond St：2 分钟对 33 分钟 | 样本小且已过时：Bond St 于 2017-11 实现无台阶（第 72 个无台阶站）。我们复现这条行程，展示"十年间变了什么" |
| Bolt Burdon Kemp（2023） | 5 位轮椅使用者真实赛跑：总耗时多 **49%**。Wembley Park → Westminster 比 **TfL 自己的无台阶估计还慢 83%**；Liverpool St → King's Cross 9 分钟对 32 分钟，只能坐 205 路公交 | n=5。但它证明了规划器本身偏乐观，正好支撑我们"纸面 vs 实际"的主线 |
| **Candela et al.（2021，Imperial CTS）** | k-最短路 + MILP 选站改造，加入不平等惩罚项：无台阶出行 +15%，绕行时间约 −60% | 静态模型（假设电梯永远可用）、只含地铁、按区（borough）聚合。我们补上可靠性维度和沉浸式交互 |
| Betz（2025，arXiv 2512.03766） | L-space 无权图拓扑，对比伦敦与纽约 | 没有时间、需求和可靠性 |
| Crisanti（2023，PoliTo 硕士论文） | Hansen / Shen 可达性指数 | 学术成果，没有交互 |
| Kamat（2025，Warwick） | 数据驱动的改造优先级 | 学生项目 |
| Tube Alerter（2026） | 567 部电梯、201 站、80 天：电梯时可用率 **96.12%**；单次故障中位 5.7 小时、均值 30.8 小时；45 次超过 1 周；**26 个无台阶站只有 1 部电梯**；Barking 80 天中约 60 天不可用 | 只是描述统计，没有接到出行时间和公平问题上 |
| Snowball app（2025） | 轮椅使用者亲自走访，给每站打交通灯评级 | 定性；是我们引用"亲历经验"的来源 |

**我们填补的空白**：目前没有一个开放、可复现、可交互的工具，能同时回答四件事：大规模的出行时间惩罚、电梯可靠性、公平分布、决策支持。

### 2.7 可复用的开源积木

| 用途 | 选型 |
|---|---|
| 渲染 | deck.gl 9（TripsLayer、PathLayer、H3HexagonLayer、TextLayer、多 View），MapLibre + PMTiles，d3-scale / d3-shape |
| 前端工程 | zod（消息与资产 schema）、Vitest、Playwright、fast-check（可选，用于消息 fuzz） |
| Python 管线 | uv、httpx + tenacity（限速与重试）、polars/pandas + DuckDB + pyarrow、geopandas、osmnx/networkx、h3、PySAL esda（Moran's I / LISA）、LightGBM + SHAP、lifelines（生存分析）、pandera（数据契约）、PuLP 或 OR-Tools（MILP 对照） |
| 灵感 | Mini Tokyo 3D（实时 3D 交通）、tldraw 博文 "Mind the gap"（列车位置插值）、Tube Heartbeat（NUMBAT 流量）、Snowball 无障碍地图 |

---

## 3. 选题比较与决策

| 方案 | 人文影响 | DS 深度 | DO 契合 | 数据可得 | 新颖 | 5 周可行 |
|---|---|---|---|---|---|---|
| **A. Mind the Step**（无台阶公平 + 可靠性 + 决策） | 5 | 5 | 5 | 4 | 4 | 4 |
| B. London's New Rhythm（疫情后通勤节律、车站原型聚类、罢工与活动异常检测） | 3 | 4 | 4 | 5 | 3 | 5 |
| C. The Pulse（NUMBAT 24 小时客流奇观） | 2 | 2 | 5 | 4 | 2 | 5 |
| D. Breathing the Tube（地铁 PM2.5 暴露） | 5 | 3 | 3 | 2 | 4 | 3 |

**决策**：A 做主线；C 做开场钩子（S1）；B 作为备选方案（Plan B）。

不做实时列车动画：已有多个成熟作品（Matthew Somerville、londonunderground.live、tldraw），差异化低。

受益人群补充：无台阶出行的受益者远不止轮椅使用者，还包括推婴儿车的父母、拖行李的旅客、老人和临时受伤的人。

---

## 4. 核心方案：Mind the Step

### 4.1 研究问题

- **RQ1**：同一段旅程，轮椅使用者比标准出行者多花多少时间？在全城（人口加权）上如何分布？
- **RQ2**：这份"无障碍时间税"落在谁身上？它是否和残障比例、贫困（IMD 2025）叠加，形成"双重劣势"？
- **RQ3**："纸面无障碍"与"实际无障碍"差多少？电梯故障让可达性打了几折？
- **RQ4**：如果下一笔预算只能改造 N 个车站（或给单电梯车站加第二部电梯），哪种方案让最多人受益？和 TfL 2024 年公布的 12 站优先清单相比如何？

> **诚信原则**：大字结论以数据为准。如果某个假设不成立（例如残障比例与绕行惩罚并不相关），就如实呈现，这本身也是一个发现。

### 4.2 叙事与场景（Storyboard）

| # | 场景 | 时长 | 中心区关键信息 | 数据 | 交互 | 优先级 |
|---|---|---|---|---|---|---|
| S0 | **Attract**：标题、缓慢流动的线路、二维码 | 循环 | MIND THE STEP | — | 自动 | Must |
| S1 | **The Pulse**：伦敦的一天 | 60 s | "一个为所有人修建的网络？" | NUMBAT 链路客流 | 播放/暂停时间轴 | Should |
| S2 | **The Step**：揭示 | 45 s | "只有约 1/3 的地铁站无台阶"；"你所在的 South Kensington：最早 2031 年" | 车站无障碍属性、历年站数、TfL 12 站清单 | 逐步揭示 | Must |
| S3 | **Two Londons**：同一座城，两种距离 | 90 s | "从这里出发，轮椅出行中位数多 X 分钟" | Journey Planner 真值 + 网络模型 | 平板选起点 | Must |
| S4 | **Who pays**：代价落在谁身上 | 60 s | 由 RQ2 结果决定 | TS038、IoD 2025、LISA | 切换指标 | Should |
| S5 | **On paper vs in practice** | 60 s | "此刻有 N 部电梯停运，影响 M 个站、约 P 位居民" | 实时电梯数据 + 自建日志 | 实时/快照切换 | Should |
| S6 | **The Race**：双人赛跑 | 90 s | "她已经到了，他还在路上" | Journey Planner 行程与路径 | 两块平板选同一段行程 | **Must（招牌场景）** |
| S7 | **What would fix it**：决策剧场 | 90 s | "同样预算，换一种排序能多帮 X 人" | 网络模型 + 优化 | 预算滑杆、公平权重 | Could → Should |
| S8 | **Close** | 30 s | 核心信息、方法、数据致谢、二维码 | — | — | Must |

- **完整版**约 8–9 分钟；**精简版**（5 分钟）走 S0 → S2 → S3 → S6 → S7 → S8。
- **无人值守**（kiosk）模式按时长自动轮播。

### 4.3 为 DO 而生的设计原则

1. **5|6|5 三区构图**：中区放关键信息（⚠ 待确认中区是否正对入口），叙事从左到右。
2. **时间 = 圆周**：
   - S1：整面墙 16 列对应 24 小时，每列 1.5 小时，"现在"游标随时钟绕房间移动。
   - S6：每列 5 分钟，整面墙约 80 分钟。标准行程占约 4–5 列，轮椅行程可能绕墙大半圈，观众要转身才能跟上，把"时间"变成身体感受。
3. **宏观/微观双读距**：站在圆心看大字结论，走近墙读"数据墙"细节，例如每站一格的条码墙、电梯故障日历。这是利用大屏的"物理导航"（Ball, North & Bowman 2007；Andrews, Endert & North 2010）。
4. **眼高带**：关键内容放 r1–r2，同时覆盖站立和轮椅观众的视线；r3 不放关键信息。
5. **边框感知排版**：文字永远不跨边框；数字和标题在单屏内居中；地图可以跨屏。
6. **平静的运动**：
   - 同一时刻只有一个运动焦点。
   - 过渡不短于 1.2 s，用 ease-in-out。
   - 不闪烁（WCAG 2.3.1：每秒不超过 3 次闪烁）。
   - 相机不快速平移，避免眩晕。
7. **用无障碍的可视化讲无障碍**：
   - 色盲安全配色（Okabe–Ito / cividis）。
   - 形状冗余编码：实心 = 到车厢无台阶，半实心 = 到站台无台阶，空心 = 有台阶。
   - 字体用 **Atkinson Hyperlegible**（Braille Institute 为低视力读者设计，OFL 开源）。
   - 提供演讲稿与字幕。
8. **一个时钟**：64 块屏共享服务端权威的时间轴，机制同 Vizzy 的 VIDEO_SYNC 锚点。

### 4.4 全墙布局草图（16 列 × 4 行；L = c0–4，C = c5–10，R = c11–15）

**S1 The Pulse**

```text
      L: c0 ─────────── c4 │ C: c5 ──────────────────── c10 │ R: c11 ────────── c15
r0  ══ 24h 时间环：每列 = 1.5 小时；"现在"游标绕房间移动；总客流"天际线" ═══════════
r1  [各线路 24h 小倍数曲线 ] │ [  伦敦地理图：NUMBAT 链路客流动画 ] │ [ 此刻最繁忙区段 Top10 ]
r2  [ (每条线一条迷你曲线) ] │ [  线宽∝客流；全墙共用一个时钟     ] │ [ 大字：此刻在网人数   ]
r3  [ 来源 / 注释(小字)    ] │ [  图例                            ] │ [ 注释                 ]
```

**S2 The Step**

```text
r0  [ 标题：只有约 1/3 的站无台阶 ] │ [      大字关键信息            ] │ [ 2030 目标 vs 实际轨迹 ]
r1  [ 条码墙：每条线一行，每站一格] │ [ 地图：有台阶的站逐渐变空心   ] │ [ 历年无台阶站数        ]
r2  [ 实心/半实心/空心 三态        ] │ [ ★ 你在这里：South Kensington ] │ [ TfL 2024 年 12 站清单 ]
r3  [ 定义与图例(小字，走近读)     ] │ [   "最早 2031 年"             ] │ [ 来源                  ]
```

**S3 Two Londons**

```text
r0  [ 标题 + 当前起点           ] │ [ 标准出行·等时圈 ][ 轮椅出行·等时圈 ] │ [ 真实旅程复现        ]
r1  [ 惩罚分布 ECDF             ] │ [   地图 A        ][   地图 B        ] │ [ 2016 MDUK：2→33 分钟 ]
r2  [ 大字：中位 +X 分；Y% 超 2 倍] │ [ 15/30/45/60 分  ][  同一色阶       ] │ [ 2023 BBK：9→32 分钟  ]
r3  [ 方法：TfL Planner 真值     ] │ [ 图例            ][ 图例            ] │ [ 今天：模型 vs 实测   ]
```

**S6 The Race**（时间 = 圆周）

```text
     c0 ──── c1 ──── c2 ──── … ──── c15      （每列 = 5 分钟；整面墙 ≈ 80 分钟）
r0  [起终点小地图]  两块大字时钟（A 标准 / B 轮椅）随时间推进到当前列
r1  A ●━━(Piccadilly)━━━━━● 到达 22′
r2  B ●┄(推行)┄●━━(Bus 14)━━●┄┄●━━(Elizabeth)━━━●┄(电梯停运绕行)┄┄┄┄● 到达 58′
r3  [每段注释：均在单屏内，不跨边框]
```

**S7 决策剧场**

```text
r0  [ 策略说明              ] │ [ 标题：下一笔预算改哪几站？      ] │ [ 与 TfL 12 站对比 ]
r1  [ 效率–公平 Pareto 前沿 ] │ [ 地图：候选站大小=收益，选中高亮 ] │ [ Top-k 排名       ]
r2  [ 当前组合的收益（大字）] │ [ 受益人群热力                    ] │ [ 重合与差异解释   ]
r3  [ 平板：k=1..20，α 公平 ] │ [ 图例                            ] │ [ 方法与假设       ]
```

S4 用中区放双变量地图（残障比例 × 惩罚），左区放散点和回归，右区放 borough 排名与 LISA 聚类。S5 用中区放实时电梯地图，左区放"电梯故障日历"（车站 × 日期热力，需走近阅读），右区放生存曲线和单电梯车站风险列表。

### 4.5 交互设计

**角色**：

| 角色 | 设备 | 能做什么 |
|---|---|---|
| Presenter | 平板 A | 切换场景、阅读演讲稿、控制时间轴、查看墙体健康（连接屏数、时钟偏移） |
| Traveller | 平板 B | 只控制 S6 的出行者 B 和 S3 的起点 |
| Visitor（可选） | 手机伴随页 | 只读文字替代内容（无障碍），可以"选我的车站" |

starter 模拟器里正好有 Tablet #1 和 #2，天然对应 A 和 B。

**共享状态（最小化）**：

```text
{ sceneId, step, originId, destinationId, personaId, budgetK, equityAlpha,
  timeline: { anchorTimelineMs, anchorServerMs, rate, playing }, liveSnapshotId }
```

等时圈、路径、排名都在各屏端按相同输入确定性重算。总线上只传 ID，不传大载荷（§3）。

**协作规则**：
- 冲突：每个键带序号，后写者胜（LWW）；presenter 的场景控制优先级高于 traveller。
- 晚加入：`hello` 携带完整领域状态，新连上的屏或平板立即同步。
- 无人值守：没有 presenter 在线时，自动进入 kiosk 轮播。

### 4.6 视觉语言

- **背景**：近黑色（约 #0A0E14）。底图用 Protomaps dark 风格，尽量少放标注；遵守"避免大面积亮块"的建议。
- **颜色**：
  - 线路色沿用 TfL 官方色，只在网络视图中使用，方便观众认出线路。
  - 无台阶状态用**形状 + 亮度**编码，不与线路色冲突。
  - 惩罚值用 CVD 安全的顺序色阶；残障 × 惩罚用 3×3 CVD 安全的双变量色阶。
- **文字分级**（以屏高 h = 1080 为单位）：

  | 级别 | 高度 | 用途 |
  |---|---|---|
  | H1 | 20% h（216 px） | 主结论 |
  | H2 | 10% h（108 px） | 标签 |
  | Detail | 6% h（64 px） | 只用于"走近读"的数据墙；按 §6 需要设计评审批准，在文档中记录理由 |

  数字使用等宽数字（tabular numerals）。

---

## 5. 数据科学方法

### 5.1 管线总览

```text
TfL Unified API ─┐
TfL open data ───┤   ingest：httpx 限速、带缓存、可断点续跑 → raw/（按日期存 JSON，gzip）
ONS/MHCLG/Nomis ─┤   stage ：pandera 数据契约 → Parquet + DuckDB
OSM / Protomaps ─┘   model ：network · journeys · accessibility · equity · reliability · optimise
                     export：web 资产（graph.bin、access.bin、scenes.json；坐标量化为整数）+ provenance.json

GitHub Actions cron（每 15 分钟）→ 电梯快照 JSONL（data 分支）→ 每晚压缩成 Parquet → 可靠性统计
```

### 5.2 网络模型

- **节点**：站台级节点（车站 × 线路 × 方向）加车站"街面"节点（入口）。
- **边**：
  - 乘车：区间运行时间，来自时刻表或路线序列。
  - 停站。
  - 站内换乘：步行时间，并标记该换乘路线是否无台阶。
  - 进出站：街面 ↔ 站台，标记是否无台阶。
- **三张图**：
  - `G_std`：全部边。
  - `G_sf_platform`：只保留无台阶的进出站与换乘。
  - `G_sf_train`：再要求站台到车厢也是平层；"人工坡道"作为带协助等待惩罚的可选边。
- **接入层**：H3 res-8 网格（伦敦约 2,100 格）或 LSOA 质心，经 OSM 连接到车站入口。
  - 步行：4.8 km/h。
  - 轮椅：剔除 `highway=steps` 的路网，速度参数化并做敏感性分析。
- **等车时间**：按线路和时段取半个发车间隔（参数）。
- **计算**：Python 中用 Dijkstra 做全局分析。同时把压缩后的图（约 1.5k 节点 / 4k 边）发到浏览器，在 Web Worker 里计算等时圈，任意车站点选毫秒级出结果。算法是确定的，所以总线只需广播 `originId`，所有屏得到一致结果。
- **校准**：用 scipy.optimize 拟合换乘惩罚、等车系数、步行与轮椅速度，使模型与 TfL Journey Planner 真值的 MAE 最小；在留出集上报告 MAE 和 MAPE。

### 5.3 真值采样：TfL Journey Planner

- **情景**：默认，以及 `accessibilityPreference=stepFreeToVehicle`；敏感性分析另加 `stepFreeToPlatform`。时段取一个典型周二的 08:30（高峰）和 13:00（平峰）。
- **OD 设计**：

  | 组 | 设计 | 调用量（含两种情景） | 耗时（≤450 次/分钟） | 用途 |
  |---|---|---|---|---|
  | a | 1,002 个 MSOA 人口加权质心 × 约 40 个关键目的地（有一类急诊的医院、主要就业中心、大学） | 约 8 万次 | 约 3 小时 | S4 公平分析 |
  | b | 12 个精选起点 × 全部 MSOA | 约 2.4 万次 | 约 1 小时 | S3 等时圈 |
  | c | 约 5k 个车站对 | 约 1 万次 | 约 20 分钟 | 模型校准 |

- **工程**：
  - 限速器，指数退避加 jitter。
  - 以请求哈希为键的幂等缓存，中断后可续跑。
  - 原始 JSON 与解析后的 Parquet 分别存档，并记录请求时间等来源信息。
  - 密钥存为 GitHub Secret `TFL_APP_KEY`，用 `workflow_dispatch` 手动触发批处理。
- **解析字段**：总时长；各段（方式、线路、路径 lineString、站点）；步行分钟数；换乘次数；"无可行路线"标记（作为删失值处理，例如 >120 分钟，并单独报告占比）。

### 5.4 指标体系

- **单对惩罚**：Δ_od = T_sf − T_std，R_od = T_sf / T_std；"严重惩罚"定义为 R > 2 的比例。
- **人口加权惩罚**：P_i = Σ_j w_j·Δ_ij / Σ_j w_j，其中 w_j 为目的地重要性。
- **累计机会**：A_i(τ) = Σ_j O_j·1[T_ij ≤ τ]，τ = 45 分钟；**可达性缺口** = 1 − A_sf / A_std。
- **可靠性调整的有效可达性**：用电梯可用率（来自自建日志与 Tube Alerter 的统计）做蒙特卡洛，抽样约 1,000 种故障状态，得到 E[T_sf]。对比"名义可达性"和"有效可达性"，直接回答 RQ3。

### 5.5 公平性分析

- 连接 TS038（Equality Act 定义下的残障比例）、TS007（65 岁以上比例）、IMD 2025 十分位与人口。
- **双变量分级**：惩罚三分位 × 残障三分位，找出"双重劣势"区域。
- **空间自相关**：全局 Moran's I；LISA 的高-高聚类，用置换检验 p 值并做 FDR 校正。
- **回归**：惩罚 ~ 到市中心距离 + IMD + 残障比例。OLS 用稳健标准误，再用 spreg 检查空间滞后与空间误差模型。定位为**描述性**分析，不做因果解读，报告效应量和置信区间。

### 5.6 机器学习

**(a) "哪里靠公交兜底"残差模型（Should）**
- 目标值：TfL 真值 − 我们的"轨道 + 步行"模型时间。
- 特征：400 m 内公交站密度与班次、离最近无台阶站的距离、网络中心性等。
- 模型：LightGBM，用**按 borough 分组的空间分块交叉验证**防止空间泄漏，用 SHAP 解释。
- 产出：一张"公交兜底指数"地图（可能本身就是一个新发现），同时作为交互模式下的混合修正项。

**(b) 电梯故障生存分析（Could）**
- 前提：到 11 月中旬积累约 300 次以上故障事件。
- 方法：按单电梯 / 多电梯站、按线路分组画 Kaplan–Meier 曲线；Cox PH 模型；仍在进行的故障作右删失处理。
- 产出："现在开始的这次故障，24 小时后仍未修好的概率"，这对出行者有用。
- 外部基准：Tube Alerter 的中位 5.7 小时、均值 30.8 小时。

### 5.7 优化：下一笔预算给谁

- **决策变量**：从有台阶站中选出 k 个改造；另设一种"可靠性投资"方案：给单电梯站加装第二部电梯。
- **目标函数**：max Σ_od w_od·(T_sf,now − T_sf,S)，其中 w = 需求代理（NUMBAT / 进出站量）× 公平权重 (1 + α·残障比例 + β·IMD)。
- **方法**：贪心（逐步选边际收益最大的站，增量更新最短路）；在缩小的实例上与 MILP 精确解对照（呼应 Candela et al.）；扫描 α 画出效率–公平 Pareto 前沿。
- **基准**：TfL 2024 年清单——Alperton、Arnos Grove、Colliers Wood、Croxley、Eastcote、East Finchley、Neasden、North Acton、Northwood、Tooting Broadway、Turnham Green、West Hampstead——以及 South Kensington（2031）。
- **上墙方式**：预计算 k=1..20 × 3 种策略的结果，滑杆拖动即时切换，现场不做重计算。

### 5.8 验证、局限与伦理

- **复现已发表的行程**：MDUK 2016 和 BBK 2023 的路线。把我们的真值和模型结果与他们实测的赛跑时间对比，量化"规划器偏乐观"的程度。
- **敏感性分析**：轮椅速度、协助等待时间（Turn-up-and-go 坡道服务）、换乘惩罚。
- **局限**：
  - "无台阶"不等于"完全无障碍"：视障、听障、认知障碍和神经多样性人群的需求没有建模。
  - 站台与车厢之间的间隙、车厢内轮椅位的拥挤没有建模。
  - 电梯 ID 的映射有不确定性；规划器本身也是模型；自建日志只覆盖约 5 周。
- **伦理与用语**：
  - 遵循英国的社会模式用语（"disabled people"），避免悲情叙事。
  - 引用亲历者的声音，例如 Snowball 创始人、Transport for All。
  - 只用聚合数据，不涉及任何个人数据。

---

## 6. 工程方案

### 6.1 仓库策略

- **保留上游历史**引入 starter：

  ```bash
  git remote add upstream https://github.com/dsi-icl/do-starter-playground
  git fetch upstream
  git merge --allow-unrelated-histories upstream/main
  ```

  评审者可以用 `git diff upstream/main...` 一眼看出你做了什么。保留 Apache-2.0 LICENSE，并新增 NOTICE 说明修改。
- **目录结构**：

  ```text
  apps/website/            # DO 应用（来自 starter）：/ /control /screen /world /bus /preview
    src/wall/              # WallLayout、tile 相机、BezelSafeText、调试层、全墙预览
    src/scenes/            # 声明式场景定义（S0–S8）
    src/views/             # 可复用视图：MapView、BarcodeView、StatCard、ChartView、RaceStrip
    src/lib/realtime/      # 传输抽象、二进制编解码、时钟同步、zod schema
  pipeline/                # Python（uv）：ingest/ stage/ model/ export/ + notebooks/ + tests/
  data/                    # 小型快照（大文件放 GitHub Releases）
  docs/                    # METHODS、DESIGN、adr/、RUNBOOK、PRESENTER_SCRIPT、DEPLOY_CHECKLIST
  .github/workflows/       # ci.yml、collect-lifts.yml（cron）、planner-batch.yml、deploy-pages.yml
  ```

### 6.2 系统架构

```text
            ┌──────── /control（平板 A：Presenter）   ┌──────── /control（平板 B：Traveller）
            │ 意图：scene/goto、race/pick …            │
            ▼                                         ▼
   ┌───────────────────── /bus（Nitro WebSocket）──────────────────────┐
   │ hello 快照 · zod 校验 · 角色权限 · 按键序号 LWW · 二进制快路径      │
   │ 时钟：CLOCK_PING/PONG(0x08/0x09) · TIMELINE_SYNC（锚点语义）       │
   │ 实时适配器：TfL 电梯数据 60 s 轮询 → 变更时广播 live/lifts（附快照兜底）│
   └──────────────┬───────────────────────────────────────────────────┘
                  ▼ 64 ×
        /screen?c=&r=（每块屏）：按 tile 剔除区域 → 确定性渲染（deck.gl/MapLibre + DOM 文字）
        静态资产：graph.bin / access.bin / scenes.json / PMTiles（离线可用）
```

### 6.3 关键模块

1. **wall-kit**
   - `WallLayout`（默认 16×4，`?layout=mini` 切换为 3×2）。
   - 墙坐标 ↔ tile 坐标换算；推广后的 `deriveScreenMapView`。
   - `<WallRegion col row colSpan rowSpan>`：不与本屏相交时直接剔除。
   - `<BezelSafeText>`：开发模式下，文本框跨边框时告警，并强制使用文字分级。
   - `?m=dev` 调试层：网格、边框、眼高带、三区、时钟偏移。
2. **场景引擎**：场景是数据（TS 对象，zod 校验），包含区域 → 视图 + 参数、进出场过渡、演讲稿、kiosk 时长。这种结构便于将来映射到 Vizzy 的 slide/layer 概念。
3. **时间轴同步（二进制）**
   - 时钟：`CLOCK_PING/PONG` 兼容 Vizzy；采用最小 RTT 过滤，每 5 s 重置。
   - 新增 `TIMELINE_SYNC`（例如 opcode 0x20）：`[u8 op][u8 status][f64 anchorTimelineMs][f64 anchorServerMs][f32 rate]`。
   - 各屏在 rAF 中计算 `t = anchorTimeline + (serverNow − anchorServer) × rate`。64 块屏保持同步，却不需要逐帧发消息。
4. **领域消息**：低频消息用 JSON（`v:1`，命名空间如 `scene/*`、`race/*`、`live/*`，zod 校验）；高频消息（如拖动滑杆）先节流，再走二进制帧。
5. **传输抽象**：`BusTransport` 接口，两种实现：
   - `WebSocketTransport`：心跳 + 退避 + jitter。
   - `BroadcastChannelTransport`：同一浏览器内的 iframe 共用一个频道，由一个"领导者"标签页扮演服务端，用于 GitHub Pages 的**无服务器在线 Demo**（⚠ 需验证 TanStack Start SPA 模式）。
6. **实时适配器**（服务端）：轮询、缓存、标准化、差分广播；熔断；降级到最近一次快照；API key 永不下发给客户端。
7. **数据加载**：二进制 typed array 资产，坐标量化为整数（§8"浮点 → 整数"）；一次加载、按引用共享；最短路计算放在 Web Worker。
8. **沙箱安全工具**：`safeStorage`（try/catch 加内存回退）；不依赖 cookie。
9. **全墙预览**：一个 deck.gl 实例挂 64 个 `MapView`，每个对应一块屏，用与生产完全相同的相机算法，视图之间留缝模拟边框，只占用一个 WebGL 上下文。同时保留 3×2 iframe 路径，用于测试回退渲染。
10. **`/world` 世界模式**：用于 Vizzy 兼容模式和录屏；按缩放渲染 30720×4320。
11. **可选：全景模式**：每列用一个 `FirstPersonView`，方位角 = 列号 × 313°/16，配合离轴投影矩阵，观众站在圆心"环视伦敦"。只作为演示加分项。

### 6.4 `BEST_PRACTICES.md` 逐条落实

| § | 要求 | 我们的落实 | 证据 |
|---|---|---|---|
| 1 | Control 与 Screen 分离 | `/control` 有两种角色，只发意图；`/screen` 只渲染；另有 `/world` | 架构图、集成测试 |
| 2 | WebSocket：hello、peerId、命名空间、校验 | hello 携带完整领域状态；双端 zod 校验；消息带版本号 | ws 集成测试 |
| 3 | 最小同步 | 只同步 `{scene, params, timeline anchor}`，其余在端上确定性重算 | "同输入同输出"单测 |
| 4 | SSR 门控；禁用随机数和当前时间 | `safeStorage`；seeded PRNG；渲染时间来自共享时钟；渲染目录用 lint 规则禁用 `Math.random`/`Date.now` | lint + 单测 |
| 5 | 每屏预算、增量更新、剔除 | 区域和图层按 tile 剔除；二进制资产；Worker | 性能预算表、trace |
| 6 | 相对单位；主文字 ≥ 20% 屏高 | 文字分级 token（clamp + 屏高单位）；`BezelSafeText`；调试层 | 视觉回归测试、设计评审记录 |
| 7 | 富渲染 + iframe 回退 | 保留两条路径；全墙预览用单上下文多 View | iframe 冒烟测试 |
| 8 | 节流、紧凑、二进制、退避 | 二进制帧（Vizzy 约定）；整数量化；退避加 jitter；心跳 | 编解码往返测试 |
| 9 | 多方协作 | 角色权限；按键序号 LWW；可选事件日志 | 双控制端集成测试 |
| 10 | 数据校验 | 前端资产用 zod，管线用 pandera；软失败加重试；加载与错误状态进入 store | 单测、管线测试 |
| 11 | 可维护性 | ADR、消息分类表、命名常量、注释写"为什么" | `docs/adr/` |
| 12 | 测试 | 单元、集成、重连、iframe 视觉测试全部进 CI | CI 徽章 |
| 13 | 子路径部署（回滚分支中的建议） | `BASE_PATH` 三层一致，并做 `/mind-the-step/` 构建测试 | 子路径 e2e |
| 14 | 部署清单 | 7 项逐条记录验证结果 | `docs/DEPLOY_CHECKLIST.md` |

### 6.5 测试与 CI

- **单元**（Vitest）：
  - 二进制编解码往返。
  - schema 清洗（可加 fuzz）。
  - 16×4 相机换算，包括各条接缝。
  - 时钟偏移估计器、场景 schema。
  - **跨语言黄金测试**：TS 版 Dijkstra 与 Python 参考结果逐一对比。
- **集成**：启动 Nitro，连接 N 个模拟屏和 2 个控制端，验证消息传播、晚加入、断线重连后的恢复、冲突处理。
- **Playwright**：
  - **seam continuation**：相邻 tile 边缘反投影后的地理坐标连续。
  - iframe 回退冒烟测试。
  - 各场景截图回归：降低动效，固定时区和 locale，时间轴冻结在确定的时刻。
  - 夜间运行 30 分钟内存浸泡测试（不作为 PR 门禁）。
- **Python**：pytest 覆盖各转换步骤；pandera 契约；小型 fixture；导出资产做哈希校验，保证可复现。
- **CI**：`vp run ready`（fmt + lint + test + build）、pytest、Playwright（chromium），并上传截图产物。数据类 workflow 独立运行（cron 和手动批处理）。

### 6.6 部署（三种形态）

1. **静态在线 Demo（GitHub Pages）**：SPA 构建 + BroadcastChannel，加上 cron 提交的最新电梯快照。评审者点开链接即可使用。
2. **完整服务端**（Docker；Render 或 Fly）：WebSocket 总线 + 实时适配器，支持真实的平板和手机多设备演示。
3. **上 DO**：
   - 在 Vizzy 中设置 Custom Render URL 为 `https://<host>/screen`（非兼容模式），或用 `/world` 走兼容模式。
   - 用 `BASE_PATH` 支持子路径部署。
   - 资产全部离线可用：PMTiles 底图、自托管字体。
   - 写一份 RUNBOOK：部署、平板操作、故障恢复。

### 6.7 性能预算（初版）

- 每块屏只用 1 个 WebGL 上下文；看不见的图层一律剔除；目标 60 fps（⚠ DO 渲染节点的 GPU 待核实）。
- 静态资产 gzip 后总计不超过约 20 MB。
- 控制消息节流到 10 Hz 以下；高频路径全部走二进制。

---

## 7. 评审体验与交付物

- **README 结构**：
  1. 全墙 GIF
  2. **2 分钟 Reviewer's Guide**：看视频 → 打开在线 Demo → 推荐阅读的 5 个文件
  3. 故事
  4. 一条命令运行
  5. 架构
  6. 方法摘要
  7. BEST_PRACTICES 落实矩阵
  8. 测试与 CI 徽章
  9. 局限与伦理
  10. 数据署名与许可（如 "Powered by TfL Open Data"、© OpenStreetMap contributors、ONS/MHCLG 的 OGL 声明）
- **文档**：`docs/METHODS.md`（或 Quarto 方法页）、`DESIGN.md`（含墙面布局与设计理由）、`adr/`、`RUNBOOK.md`、`PRESENTER_SCRIPT.md`。
- **媒体**：60–90 秒全墙录屏（用 Playwright 驱动 `/world` 或全墙预览录制）；可选一张"圆柱房间"效果图。
- **数据新鲜度**：README 徽章显示"电梯日志最近一次运行时间"，并附 provenance 文件。

---

## 8. 时间计划与优先级

| 周 | 日期 | 里程碑 |
|---|---|---|
| W0 | 10-13 至 10-15 | 确认选题；注册 TfL API key；保留上游历史引入 starter；**当天上线电梯日志 cron**，开始积累数据 |
| W1 | 10-16 至 10-22 | wall-kit（16×4、相机、调试层、全墙预览）、场景引擎骨架、时钟同步；车站、线路、无台阶数据；**S2 端到端打通** |
| W2 | 10-23 至 10-29 | Journey Planner 批量采样（a/b/c 三组）；网络模型 v1 与校准；S3；平板 v1 |
| W3 | 10-30 至 11-05 | S6 赛跑（双平板）；S1 Pulse；单元与集成测试、CI。**MVP 冻结** |
| W4 | 11-06 至 11-12 | S4 公平、S5 实时电梯与可靠性、S7 优化（预计算）；Playwright 接缝与视觉测试；静态部署 |
| W5 | 11-13 至 11-18 | 打磨（在全墙预览上做可读性评审）、README、文档、录屏；演讲彩排；**11-18 前后提交**；拍 30 秒视频；更新 CV |
| 缓冲 | 11-19 至 11-20 | 应急 |

| 优先级 | 内容 |
|---|---|
| **Must** | 16×4 wall-kit 与全墙预览、场景引擎、时钟同步、S0/S2/S3/S6/S8、双平板、真值采样 + 网络模型 v1、电梯日志 cron、单元与集成测试 + CI、README |
| **Should** | S1、S4、S5，模型校准与残差模型，Playwright 接缝与视觉测试，静态在线 Demo，离线底图 |
| **Could** | S7 优化、生存分析、手机伴随页、全景模式、3D 房间预览 |
| **Won't（本轮不做）** | 实时列车动画、r5py 全矩阵多模式、用户账户与后台 |

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| TfL API 限流或故障；lrad 过时 | 限速、缓存、断点续跑；多源交叉验证；每个数据集写明版本和日期 |
| 规划器返回"无可行路线"或异常结果 | 作为删失值处理并单独报告占比；人工抽查 |
| 范围蔓延 | MoSCoW；先打通纵向切片；11-05 冻结 MVP |
| 从未在真墙上测试过 | 全墙预览使用与生产完全相同的算法；接缝测试；遵循 Vizzy 的布局约定；如有机会，申请现场实测 |
| DO 节点的 GPU 性能未知 | 保守的性能预算；保留回退渲染路径 |
| 表述伦理风险 | 用语指南；引用亲历者来源；场景内设"局限"面板 |
| 演示当天断网 | 离线模式：PMTiles + 快照；实时层显示"最后更新时间" |
| 授权与署名 | 统一维护一个 attribution 列表，在 S8 和 README 中展示 |

---

## 10. 与视频、CV、面试的协同

- **30 秒视频参考稿**（英文，约 70 词）：
  > "Hi, I'm [name], a [programme] student at Imperial. For my demo I built *Mind the Step*: using TfL open data, I measured how much longer London journeys take for wheelchair users — and turned it into a two-person race around the Data Observatory. I want to join Data for Humanity because data should change how cities are built for the people they leave out — and the DO makes people *feel* that, not just read it."
- **CV 条目示例**：
  > *Mind the Step* (Imperial DO demo) — immersive 64-screen visualisation + Python pipeline quantifying London's step-free accessibility gap: ~100k TfL Journey Planner queries, network model calibrated to MAE ≈ X min, spatial equity analysis (LISA), real-time lift-outage logger; TypeScript/deck.gl, binary WebSocket sync, CI-tested.
- **面试准备**：
  - 3 分钟上墙讲解稿。
  - 常见追问：为什么选这个题？最大的局限是什么？如何迁移到 Vizzy？如果有 6 个月会做什么？如何避免误导？

---

## 11. 需要你决定 / 下一步

1. **确认选题**：Mind the Step（推荐），或 Plan B "London's New Rhythm"。
2. **注册 TfL API key**（[api-portal.tfl.gov.uk](https://api-portal.tfl.gov.uk/)），存为仓库 Secret `TFL_APP_KEY`。
3. **托管**：GitHub Pages 静态 Demo（推荐必做）；Render 或 Fly 完整服务端（可选）。
4. **网络限制**：当前云端会话的网络策略拦截了 `api.tfl.gov.uk`、`tfl.gov.uk`、`crowding.data.tfl.gov.uk`、`data.london.gov.uk`、`www.imperial.ac.uk` 等域名。数据管线需要在本地或 GitHub Actions 中运行，或者在环境设置的 Network access 中加入这些域名。
5. **可选**：把通用修复（墙尺寸参数化、沙箱安全的 storage）以小 PR 回馈给 `dsi-icl/do-starter-playground`。这是对外动作，由你决定。

确认后即可按 W0 开始实现。

---

## 附录 A：参考来源

**DO 与 DSI**
- DO Demo Guidance（PDF）：https://www.imperial.ac.uk/media/imperial-college/data-science-institute/DO-Demo-Guidance-.pdf
- Data Observatory：https://www.imperial.ac.uk/data-science/facilities/data-observatory/
- Creating content（Vizzy Studio / Developer Playground）：https://www.imperial.ac.uk/data-science/facilities/data-observatory/creating-content-for-the-data-observatory-/
- 首届 D4H 报道：https://www.imperial.ac.uk/news/articles/research-groups/data-science-imperial-articles/2026/inside-the-launch-of-imperials-first-data-for-humanity-internship-programme/
- 关于 DO 的论文（F1000Research 2016）：https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5031127/
- 代码：https://github.com/dsi-icl/do-starter-playground ・ https://github.com/dsi-icl/vizzy-studio ・ https://github.com/dsi-icl/crypto-explorer ・ OVE：https://ove.readthedocs.io

**TfL 数据**
- Network demand data：https://tfl.gov.uk/corporate/publications-and-reports/network-demand-data
- API 门户：https://api-portal.tfl.gov.uk/
- 速率限制：https://techforum.tfl.gov.uk/t/what-is-the-rate-limit-or-quota-for-the-api/22
- 拥挤度 API：https://techforum.tfl.gov.uk/t/data-drop-near-real-time-crowding-data-api/1916
- 无台阶与电梯数据：https://techforum.tfl.gov.uk/t/new-data-step-free-lift-status-and-accessible-routes-in-stations/1609 ・ https://techforum.tfl.gov.uk/t/station-lifts-data/2230 ・ https://techforum.tfl.gov.uk/t/api-tfl-gov-uk-disruptions-lifts-v2-intermittent-fails/2904
- GTFS 立场：https://techforum.tfl.gov.uk/t/do-tfl-plan-on-releasing-their-network-in-gtfs-format/98 ・ transx2gtfs：https://pypi.org/project/transx2gtfs

**政策与事实**
- TfL 下一批 12 个无台阶改造站（2024-08）：https://tfl.gov.uk/info-for/media/press-releases/2024/august/tfl-confirms-the-next-12-tube-stations-to-be-prioritised-for-step-free-access
- 93/272：https://www.romfordrecorder.co.uk/news/25294849.tfl-list-south-london-tube-stations-set-upgrades/
- 成本压力：https://www.railmagazine.com/news/2025/02/27/cost-pressures-set-to-curtail-plans-for-total-london-underground-step-free-access
- South Kensington：https://www.railtechnologymagazine.com/articles/major-south-kensington-tube-station-upgrade-accelerates-after-tfl-business-plan-inclusion ・ https://www.theconstructionindex.co.uk/news/view/tfl-picks-costain-for-south-kensington-upgrade
- Bond Street 2017 无台阶：https://londonist.com/london/transport/bond-street-station-s-300m-revamp-is-complete
- London TravelWatch 2026 仪表盘：https://www.londontravelwatch.org.uk/wp-content/uploads/2026/07/07-Performance-dashboards-LTW835.pdf

**已有研究与作品**
- Tube Alerter 电梯可靠性：https://tubenotifications.co.uk/insights/london-tube-lift-reliability
- MDUK 2016：https://londonist.com/2016/04/disability-transport
- BBK 2023：https://ablemagazine.co.uk/london-transport-nightmare-new-travel-experiment-reveals-dire-commutes-for-wheelchair-users/
- Candela et al. 2021：https://optimization-online.org/2021/10/8657/
- Betz 2025：https://arxiv.org/abs/2512.03766
- Crisanti 2023：https://webthesis.biblio.polito.it/28963/
- Kamat 2025：https://linen-dog.lnx.warwick.ac.uk/items/show/1010
- Zenodo 2026 数据集：https://zenodo.org/records/18313509
- Snowball 无障碍地图：https://www.timeout.com/london/news/a-brand-new-london-tube-map-makes-travel-easier-for-disabled-travellers-100525

**人口与贫困数据**
- IoD 2025：https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025/english-indices-of-deprivation-2025-statistical-release
- Census TS038：https://www.ons.gov.uk/datasets/TS038/editions/2021/

**技术**
- deck.gl Views：https://deck.gl/docs/developer-guide/views
- Protomaps + MapLibre：https://docs.protomaps.com/basemaps/maplibre
- GTFS 无障碍字段：https://gtfs.org/getting-started/features/accessibility/
- tldraw "Mind the gap"：https://tldraw.dev/blog/mind-the-gap
- Mini Tokyo 3D：https://minitokyo3d.com/docs/master/user-guide/overview.html
