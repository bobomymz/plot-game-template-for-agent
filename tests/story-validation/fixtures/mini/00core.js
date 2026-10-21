// ===== 00core.js · 引导文件：全局 storyData、运行时变量初值、_meta 弹窗文案 =====
// 结构：引导文件（本文件，最先加载）→ ch1.js 等正文（按章/幕/区域一文件，Object.assign 追加）。
// 表文件 endings.js / variables.js / foreshadow.js 只给校验脚本对账，运行时不读，无需在 index.html 装配。
var storyData = (typeof storyData !== "undefined" && storyData) ? storyData : {};

// 运行时变量初值（平铺）。四项闭环（来源/变化/用途/结局条件）登记在 variables.js 的 VARIABLES 表。
storyData._variables = {
  sawNote: 0,   // 是否细读了字条（hall → note 的 onEnter 直改）
  trust: 0      // 前台掌柜对玩家的信任（note 路线的 onEnter 声明式 +1）
};

// 存档弹窗与死亡重开文案覆盖口（引擎缺省回落 document.title / 通用文案）
storyData._meta = {
  title: "雨夜旅馆",
  continueText: "接着住",
  newText: "重新开房",
  deathRestartText: "🌙 从门厅重新开始"
};
