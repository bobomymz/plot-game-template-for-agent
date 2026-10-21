// ===== variables.js · 变量表（校验侧对账，运行时不读；运行时初值在 00core.js 的 _variables） =====
// 四项闭环：source 来源 / changes 变化节点 / uses 读取节点 / endings 结局判据。
// onEnter 直改与 redirect 函数体里的读写无法静态解析，靠本表登记对账（changes 写节点列表）。
var VARIABLES = {
  sawNote: {
    init: 0, min: 0, max: 1,
    source: ["开局 0"],
    changes: [{ node: "note" }],          // onEnter 函数直改
    uses: ["stairs"],                     // stairs 的 choice.condition 引用
    endings: [{ ending: "end_safe" }, { ending: "end_miss" }]
  },
  trust: {
    init: 0, min: 0, max: 5,
    source: ["开局 0"],
    changes: [{ node: "knock" }],         // onEnter 声明式 add
    uses: ["knock", "reveal"],            // knock 的 redirect 函数与 {trust} 插值
    endings: [{ ending: "end_true" }]
  }
};
