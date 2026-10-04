// ===== mini · 文件头结构图：start → ch1_02 →(选择)→ end_true_01 / ch1_03 → end_true_01 =====
Object.assign(storyData, {
  "start": {
    text: "雨夜，你推开旅馆的大门，前台没有人，只有一盏灯亮着。",
    next: "ch1_02"
  },
  "ch1_02": {
    // 伏笔 F01（埋设）：字条入册；计划回收：ch1_03
    // 选择影响：追问 → trust_ally+1（end_true 判据）；离开 → trust_ally-1（旁支 ch1_03）
    text: "柜台后的墙上钉着一张字条，写着你不认识的规则。",
    choices: [
      { text: "追问", effects: { trust_ally: { delta: 1 } }, next: "end_true_01" },
      { text: "离开", effects: { trust_ally: { delta: -1 } }, next: "ch1_03" }
    ]
  },
  "ch1_03": {
    // 伏笔 F01（回收）：字条内容在退房场景应验
    text: "字条上的第 13 条规则应验了，你转身去找前台问个明白。",
    next: "end_true_01"
  },
  "end_true_01": {
    text: "你把钥匙放回原处，雨停了。——真结局"
  }
});
