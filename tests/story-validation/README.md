# 最小校验脚本（母本预置）

阶段 2 起随时可跑；阶段 3 随数据模型扩展项目专属字段；阶段 5 全量跑并存档报告。

```bash
node tests/story-validation/validate.js                 # 校验 /story/
node tests/story-validation/validate.js fixtures/mini   # 冒烟自检（在 tests/story-validation/ 下执行，应全绿）
node tests/story-validation/validate.js --gen-index     # 从 /lore/ 卡生成 /memory/index.json（消灭索引双写）
node tests/story-validation/validate.js > /tests/reports/<日期>-校验.txt   # 报告存档
```

## 已覆盖（CLAUDE.md 阶段 5 共性清单的机器可查项）

- 图结构：死路（无 next/choices 且非结局入口）、死链（指向不存在节点）、孤岛（从 `start` 不可达）、不可达结局、无法抵达任何结局的节点（含全循环陷阱）
- schema（引擎方言，ADR-0010）：死路（无 choices 且非结局入口）、选项缺 text/nextScene、跨文件重复节点 ID、文本完全重复
- 变量：四字段闭环（来源/变化/用途/结局条件）、双层一致性（VARIABLES.init 与 00core `_variables` 同名值相等）、changes/uses 引用的节点与结局存在、未声明变量、剧情零读写变量、init 越值域、结局判据值越值域（条件永假/永真）
- 伏笔（固定分支/混合）：台账埋设/回收节点存在、status 与回收点一致、零回收未标 herring、行内注释 × 台账双向对账（埋设只写一处的纪律由脚本兜底）
- 动态路由函数：函数体内引用的已定义节点 ID 计入静态可达，仍计数提示，请人工确认静态兜底
- 节奏带宽粗检（warning 级，阈值在 validate.js `PACING` 可调）：每剧情文件节点数、平均每选择节点字数；剧情文件不足 3 个时跳过（冒烟样例/单章切片）

## 不覆盖（人工或阶段 3 扩展）

- 路径专属项：开放世界联通红线（死链=0/死胡同=0/连通块=1/环秩≥2）、区域可达、时间触发器覆盖——阶段 3 在 validate.js 标「扩展点」处追加
- 文本质量、L0-L4 分级合理性、整体节奏曲线——阶段 5 人工门禁（带宽粗检已由脚本兜底）

## 扩展点（阶段 3）

- 项目新增节点字段（区域、位置、静态属性等）→ `checkNodes()` 内标「扩展点」处
- 项目改用 ESM/模块导入加载剧情 → 只改 `loadStory()`，检查逻辑不动
- 固定分支项目建议追加：结局阈值可满足性（图遍历算单周目判据上限 ≥ 阈值）
