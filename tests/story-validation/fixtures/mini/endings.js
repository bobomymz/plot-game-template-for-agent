// 迷你样例结局表
var ENDINGS = {
  end_true: {
    name: "真结局",
    desc: "迷你样例：信任达标后的收束",
    entry_node: "end_true_01",
    requirements: [
      { var: "trust_ally", op: ">=", value: 3 }
    ],
    priority: 1
  }
};
