# 项目模板库

新建下列文件时，复制对应模板。所有示例值均为占位符，按实际内容替换。本文件超过约 400 行时按类型拆分（如 `templates/nodes.md`、`templates/lore.md`），并同步更新 CLAUDE.md 与各文档中的引用。

## 1. 项目状态 /docs/00-project-state.md

```markdown
# 项目状态

current_phase: 1 概念与需求
current_version: -
last_session: -
next_gate: 用户确认需求规格与概念圣经

frozen: {}            # 已冻结项，如 concept_bible: v0.1

open_questions: []    # 待用户裁决的问题

next_actions: []

notes: []             # 用户偏好、约束等
```

## 2. 会话日志 /docs/sessions/YYYY-MM-DD-NN-主题.md

```markdown
# 会话 YYYY-MM-DD-NN

目标：
加载文件：
完成：
用户决策：
新增/修改实体：       # 如 char_xx: draft -> frozen
待确认：
下一步：
```

## 3. 决策记录 /docs/decisions/ADR-NNNN-标题.md

```markdown
# ADR-NNNN <标题>

状态：proposed | accepted | rejected
日期：YYYY-MM-DD

背景：
决策：
备选方案：             # 各备选及否决原因；整个决策被否决时状态记 rejected 并说明
后果：
```

## 4. 实体卡 /lore/{characters|locations|events|factions}/<id>.yaml

```yaml
id: <type>_<name>        # 如 char_xx、loc_xx_city
type: character          # character | location | event | faction
name:
status: draft            # draft | frozen | deprecated
version: 1
summary:
core:                    # 角色卡：欲望/恐惧/秘密；场所卡改为此场所的特征/危险/秘密
  desire:
  fear:
  secret:
relationships: []        # [{target: <实体ID>, type, tension}]
appears_in: []           # 出现的节点 ID
related_variables: []
tags: []
source_sessions: []
```

## 5. 索引 /memory/index.json

```json
{
  "<entity_id>": {
    "type": "character",
    "file": "/lore/characters/<id>.yaml",
    "status": "draft",
    "summary": "",
    "tags": []
  }
}
```

## 6. 剧情节点 /story/chapters/*.json

每章一个文件（如 `ch1.json`），内容为该章全部节点的数组；会话按需加载单章。

```json
[
  {
    "id": "ch1_03",
    "text": "……",
    "conditions": {"flag_met_xx": true},
    "next": "ch1_04",
    "effects": {"flag_seen_xx": {"set": true}}
  },
  {
    "id": "ch1_04",
    "text": "……",
    "choices": [
      {"text": "追问", "effects": {"trust_xx": {"delta": 1}}, "next": "ch1_05a"},
      {"text": "离开", "effects": {"trust_xx": {"delta": -1}}, "next": "ch1_05b"}
    ]
  }
]
```

- `next` 与 `choices` 二选一：线性节点用节点级 `next`，分支节点用 `choices`；两者皆无为终点，必须是结局表引用的 `entry_node`，否则校验报死路。
- `effects` 统一语法：数值增减 `{"delta": n}`，赋值 `{"set": v}`；节点级与选项级同构，并与 variables.json 的 `changes` 记录一一对应。
- `conditions` 为进入该节点的条件，引用 variables.json 变量。

## 7. 变量表 /story/variables.json

每个变量一条记录，四个字段对应「来源 / 变化 / 用途 / 结局条件」闭环要求，值引用节点 ID / 结局 ID。任一字段为空数组即闭环缺失，阶段 2 自查与阶段 5 校验以本文件为准。数值变量须声明 `min`/`max`，校验据此查值域越界。

```json
{
  "trust_ally": {
    "desc": "同伴信任度（0-5）",
    "init": 0,
    "min": 0,
    "max": 5,
    "source": ["ch1_02"],
    "changes": [
      {"node": "ch1_02", "delta": 1},
      {"node": "ch2_03", "set": 3}
    ],
    "uses": ["ch2_10:conditions", "ch3_04:解锁选项"],
    "endings": [{"ending": "end_true", "cond": ">=3"}]
  }
}
```

## 8. 结局表 /story/endings.json

每个结局一条记录。`requirements` 引用 variables.json 中的变量名；`priority` 数值越小越优先，多结局条件同时满足时按其判定，避免歧义。

```json
{
  "end_true": {
    "name": "真结局",
    "desc": "一句话描述",
    "entry_node": "end_true_01",
    "requirements": [
      {"var": "trust_ally", "op": ">=", "value": 3},
      {"var": "flag_relic_found", "op": "==", "value": true}
    ],
    "priority": 1
  }
}
```

## 9. 新项目初始化清单

把本模板母本复制为新游戏项目后、开始阶段 1 前，按序执行：

1. 删除 `docs/sessions/` 下全部模板元会话日志、`docs/decisions/` 下全部模板 ADR。
2. 按 §1 模板重置 `docs/00-project-state.md`（清空 notes 与 frozen）。
3. 重置 `CHANGELOG.md`：仅保留一行「基于工作流模板 workflow-v2.x 初始化」。
4. 创建/清空 `/memory/index.json` 为 `{}`；确认 `/story/`、`/lore/`、`/src/`、`/tests/` 无模板遗留内容。
5. 执行完本清单后，删除 CLAUDE.md 头部指向本清单的指引；「常用命令」小节留待阶段 3 回填。
6. 重新 `git init` 并做首次提交（母本的 git 历史与标签不随文件复制）。

## 10. 文风指南 /docs/05-style-guide.md

阶段 4 扩写前冻结；跨会话续写以本文件对齐文风。

```markdown
# 文风指南

人称与视角：        # 如：第一人称、现在时
章节字数带宽：      # 如：每章 2000-3500 字，单节点 100-300 字
句长节奏：          # 如：长短句交替，紧张段落以短句为主
对白格式：          # 如：引号样式、何时标说话人
称谓规则：          # 角色称呼如何随关系变化（引用实体 name，不写死）
禁用表达：          # 出戏的现代网络语、陈词滥调等
基调红线：          # 与概念圣经支柱冲突、阶段 1 禁忌内容的表达
```
