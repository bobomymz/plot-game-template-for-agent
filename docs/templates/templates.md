# 项目模板库

新建下列文件时，复制对应模板。所有示例值均为占位符，按实际内容替换。

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
id: <type>_<name>        # 如 char_hu、loc_jingjue_city
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

```json
{
  "id": "ch1_03",
  "text": "……",
  "conditions": {"flag_met_xx": true},
  "choices": [
    {"text": "追问", "effects": {"trust_xx": 1, "flag_asked": true}, "next": "ch1_04a"},
    {"text": "离开", "effects": {"trust_xx": -1}, "next": "ch1_04b"}
  ]
}
```
