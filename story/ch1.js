// ===== ch1.js · 文件头结构图：start → hall →(细读字条 note / 直接上楼)→ stairs
//       →(叩门 knock[条件] / 摸黑 dead_fall[死亡] / 回房 结局_错过)→ knock →(追问[redirect] reveal|refuse
//       / 道谢 结局_平安)→ reveal → 结局_真相 =====
// 引擎方言：推进一律走 choices——单选项＝纯推进，多选项同目标＝L0 风味选择；
// 无 choices 的场景即终点（结局/死亡）。节点级 next 不是引擎方言，勿用。
Object.assign(storyData, {
  "start": {
    text: "雨夜，你推开旅馆的大门。前台没有人，只有一盏灯亮着。",
    choices: [
      { text: "走近前台", nextScene: "hall" }
    ]
  },

  "hall": {
    // 伏笔 F01（埋设）：字条上的第 13 条规则；计划回收：reveal
    text: "柜台后的墙上钉着一张字条，墨迹被水汽洇开了一半。",
    choices: [
      { text: "细读字条", nextScene: "note" },
      { text: "不管它，上楼", nextScene: "stairs" }
    ]
  },

  "note": {
    // 选择影响：细读字条 → sawNote=1（onEnter 直改），解锁 stairs 的叩门选项（condition 引用）与 end_safe 判据
    // onEnter 两种写法示范：函数直改（本节点）与声明式对象（见 knock 的 add）
    // 两组选择同指 stairs＝L0 风味选择，不产生分支
    onEnter: function (v) { v.sawNote = 1; },
    text: "第 13 条写着：「午夜前，对储物间的暗门轻叩三下，会有应答。」",
    choices: [
      { text: "把这句话记在心里", nextScene: "stairs" },
      { text: "撕下半张，塞进口袋", nextScene: "stairs" }
    ]
  },

  "stairs": {
    text: "楼梯间没有灯。你隐约记得，储物间就在转角后面。",
    choices: [
      // 条件门槛三种写法：showCondition 不满足→整条隐藏；condition 不满足且无 elseScene→同样隐藏；
      // condition + elseScene→按钮显示，点击时按当前条件分流（不满足走 elseScene）。
      // 选项级声明式效果用 choice.effect（单数，{set/add/mul}），本演示用 onEnter 演示同能力。
      // 选择影响：叩门 → 需 sawNote=1（没读字条就不知道暗门在哪）；摸黑 → 死亡（deathRestart 演示）
      { text: "按字条暗示，对暗门轻叩三下", condition: { sawNote: 1 }, nextScene: "knock" },
      { text: "摸黑走过去", nextScene: "dead_fall" },
      { text: "回房睡觉", nextScene: "结局_错过" }
    ]
  },

  "knock": {
    // 选择影响：叩门成功 → trust+1（声明式 add），knock 的 {trust} 文案与 end_true 判据都读它
    onEnter: { add: { trust: 1 } },
    text: "三下叩响之后，门开了半指宽。门后的人盯着你看了很久（信任 {trust}）。",
    choices: [
      // redirect 函数：返回节点 ID；静态兜底——trust>=1 → reveal，否则 refuse（两目标均已定义）
      { text: "追问他到底是谁", nextScene: function (v) { return v.trust >= 1 ? "reveal" : "refuse"; } },
      { text: "道谢后回房", nextScene: "结局_平安" }
    ]
  },

  "reveal": {
    // 伏笔 F01（回收）：字条第 13 条的应答者现身，规则应验
    text: "「你照规矩来了。」他侧过身，灯下是一整墙的旧房客名册——包括你的。",
    choices: [
      { text: "接过他递来的笔", nextScene: "结局_真相" }
    ]
  },

  "refuse": {
    text: "他把门合上了。你听见锁舌落进槽里的声音，很轻，很稳。",
    choices: [
      { text: "回房", nextScene: "结局_平安" }
    ]
  },

  "dead_fall": {
    text: "你踩空了最后一级台阶。雨声在很远的地方继续下着。",
    deathRestart: true
  },

  "结局_真相": {
    text: "名册的最后一页留了空白，笔递到你手里。—— 结局：真相"
  },

  "结局_平安": {
    text: "这一夜什么也没发生。退房时你多看了一眼那面墙。—— 结局：平安"
  },

  "结局_错过": {
    text: "你在雨声里睡得很沉，天亮就走了。—— 结局：错过"
  }
});
