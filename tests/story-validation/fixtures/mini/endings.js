// ===== endings.js · 结局表（校验侧对账，运行时不读；结局按钮由场景 deathRestart 或 ID 前缀「结局」驱动） =====
// requirements: [{var, op, value}] 多结局同时满足时按 priority 大者胜。
var ENDINGS = {
  end_true:  { entry_node: "结局_真相", priority: 100, requirements: [{ var: "trust", op: ">=", value: 1 }] },
  end_safe:  { entry_node: "结局_平安", priority: 50,  requirements: [{ var: "sawNote", op: "==", value: 1 }] },
  end_miss:  { entry_node: "结局_错过", priority: 10,  requirements: [{ var: "sawNote", op: "==", value: 0 }] },
  dead_fall: { entry_node: "dead_fall", priority: 10,  requirements: [{ var: "trust", op: ">=", value: 0 }] }
};
