// 迷你样例变量表——四字段闭环齐全
var VARIABLES = {
  trust_ally: {
    desc: "同伴信任度（0-5）",
    init: 0,
    min: 0,
    max: 5,
    source: ["ch1_02"],
    changes: [
      { node: "ch1_02", delta: 1 },
      { node: "ch1_02", delta: -1 }
    ],
    uses: ["ch1_02:effects", "end_true:requirements"],
    endings: [{ ending: "end_true", cond: ">=3" }]
  }
};
