/* ============================================================================
   engine-behavior-probe.js · 引擎行为探针（为「引擎语法手册」的断言取证）

   用途：手册里每一条"引擎实际会怎样"的断言，凡是能从代码里跑出来的，都跑一遍，
        避免手册与引擎悄悄分叉。改完手册或引擎后跑：
            node tools/engine-behavior-probe.js
        输出每条探针的 期望 / 实际 / 判定（PASS/FAIL），有 FAIL 时退出码 1。

   做法：用最小 DOM 桩把 engine.js 加载进 node:vm，直接调用其顶层函数
        （renderScene / applyEffect / checkCondition …），不依赖浏览器与任何依赖包。
        ⚠ engine.js 的运行态（gameState / currentScene / historyStack）是顶层 let，
          不是 sandbox 的属性，探针里一律用 read()/ctx() 在 vm 内取值。
        ⚠ 剧情里的函数（onEnter 等）必须写在 vm 内的源码里，写在 Node 侧会拿不到
          rollOnce / flashStatusWarning 等引擎全局（作用域链不跨 realm）。

   局限：只覆盖"不靠视觉与定时"的行为。打字机节奏、闪色时序、光锥手势
        需真实浏览器，本探针不测。
   ============================================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ENGINE = path.join(__dirname, "..", "engine.js");

/* ---------- 最小 DOM 桩 ---------- */
function makeEl(id) {
  return {
    id: id || "",
    style: { setProperty() {}, cssText: "" },
    dataset: {},
    children: [],
    innerHTML: "",
    textContent: "",
    className: "",
    src: "",
    scrollTop: 0,
    offsetWidth: 0, offsetHeight: 0,
    clientWidth: 900, clientHeight: 600,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) {
        if (on === undefined) on = !this._s.has(c);
        if (on) this._s.add(c); else this._s.delete(c);
        return on;
      },
      contains(c) { return this._s.has(c); }
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    focus() {},
    insertAdjacentElement() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600 }; }
  };
}

const DOM_IDS = ["scene-image", "scene-text", "choices-area", "restart-btn", "backtrack-btn",
  "image-area", "zoom-badge", "image-viewer", "image-viewer-img", "text-area",
  "game-container", "status-warning", "qte-timer", "preload-overlay", "preload-bar",
  "preload-label", "screen-effect-overlay", "save-dialog"];

/**
 * @param {string} storySource 一段 JS 表达式源码，在 vm 内求值为 storyData
 *                             （剧情函数必须写在这里，见文件头说明）
 */
function makeSandbox(storySource) {
  const els = {};
  DOM_IDS.forEach(id => { els[id] = makeEl(id); });

  const document = {
    title: "probe",
    body: makeEl("body"),
    getElementById(id) { return els[id] || null; },
    createElement(tag) { return makeEl(tag); },
    addEventListener() {},
    querySelector() { return null; }
  };

  const store = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },   // 静音引擎日志，输出只留探针结论
    document,
    location: { pathname: "/probe/index.html" },
    localStorage: {
      getItem(k) { return k in store ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; }
    },
    matchMedia() { return { matches: false, addEventListener() {} }; },
    requestAnimationFrame() { return 0; },
    setTimeout, clearTimeout, setInterval, clearInterval,
    getComputedStyle() { return { objectFit: "cover" }; },
    Image: function () { this.src = ""; },
    DOMParser: function () {
      this.parseFromString = function (html) {
        const inner = html.replace(/^<div id='__r'>/, "").replace(/<\/div>$/, "");
        const root = makeEl("__r");
        root.innerHTML = inner;
        return { getElementById() { return root; } };
      };
    },
    alert() {}, JSON, Math, Date, Object, Array, String, Number, Boolean, Error,
    Set, Map, RegExp, isNaN, parseFloat, parseInt
  };
  sandbox.addEventListener = function () {};
  sandbox.removeEventListener = function () {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // 1) 先建 storyData（剧情函数在此求值，能看见引擎全局）
  vm.runInContext("var storyData = " + storySource + ";", sandbox, { filename: "story.js" });
  // 2) 再加载引擎
  vm.runInContext(fs.readFileSync(ENGINE, "utf8"), sandbox, { filename: "engine.js" });
  // 顶层 let 绑定（gameState/currentScene/historyStack）在同 realm 的后续脚本里可读
  const read = (expr) => vm.runInContext(expr, sandbox);
  return { sandbox, els, read };
}

/* ---------- 探针框架 ---------- */
const results = [];
function probe(name, fn) {
  try {
    const r = fn();
    results.push({ name, pass: !!r.ok, expected: r.expected, actual: r.actual });
  } catch (e) {
    results.push({ name, pass: false, expected: "—", actual: "抛错: " + e.message });
  }
}

/* ---------- 1. 选项 text 写成数组 ---------- */
probe("选项 text 写成数组 → 直接 TypeError（手册 §3.3 / §20-16）", () => {
  const { sandbox, read } = makeSandbox(`{
    _variables: { x: 0 },
    start: { text: "", choices: [{ text: ["a", "b"], nextScene: "end" }] },
    end: { text: "终" }
  }`);
  let threw = "";
  try { read('renderScene("start")'); } catch (e) { threw = e.constructor.name + ": " + e.message; }
  return {
    ok: threw.indexOf("TypeError") >= 0,
    expected: "不是静默降级，而是直接 TypeError（interpolateDisplay 对数组调 .replace）",
    actual: threw || "未抛错"
  };
});

/* ---------- 2. condition: false ---------- */
probe("condition: false 被当作通过（手册 §4 / §20-2）", () => {
  const { read } = makeSandbox(`{ _variables: { x: 0 }, start: { text: "" } }`);
  const got = read("checkCondition(false, { x: 0 })");
  return { ok: got === true, expected: "true（陷阱）", actual: String(got) };
});

/* ---------- 3. 字符串条件引用未注册变量 ---------- */
probe("字符串条件引用未注册变量 → 静默 false（手册 §4）", () => {
  const { read } = makeSandbox(`{ _variables: { x: 0 }, start: { text: "" } }`);
  const got = read('checkCondition("notRegistered >= 1", { x: 0 })');
  return { ok: got === false, expected: "false（控制台另有『条件表达式出错』）", actual: String(got) };
});

/* ---------- 4. 效果对象同算子重复键 ---------- */
probe("同一效果对象写两个 set → 前一个整个丢失（手册 §5）", () => {
  const { read } = makeSandbox(`{ _variables: { a: 0, b: 0 }, start: { text: "" } }`);
  read("initGameState()");
  read("applyEffect({ set: { a: 1 }, set: { b: 2 } })");
  const a = read("gameState.a"), b = read("gameState.b");
  return { ok: a === 0 && b === 2, expected: "a=0（被覆盖丢失）, b=2", actual: "a=" + a + ", b=" + b };
});

/* ---------- 5. rollOnce × 死亡重开 ---------- */
probe("rollOnce：死亡重开 = 新一局 → 重掷（标记随 initGameState 清空）（手册 §11）", () => {
  // _rollOnce 存在 gameState 里，会被 initGameState 重置；用 vm 内全局计数记"掷了几次"，
  // 这样能区分"标记保留（不重掷）"与"重新武装后再掷一次"。
  const { read } = makeSandbox(`{
    _variables: { luck: 0 },
    _rollCount: 0,
    start: {
      text: "",
      onEnter: function (v) { if (rollOnce(v, "grp")) storyData._rollCount++; return {}; },
      choices: [{ text: "走", nextScene: "end" }]
    },
    end: { text: "终" }
  }`);
  read("initGameState()");
  read('renderScene("start")');
  const first = read("storyData._rollCount");
  read("restartRun(true)");   // 死亡重开：清历史/清档 → initGameState() → 重新进 start
  const after = read("storyData._rollCount");
  return {
    ok: first === 1 && after === 2,
    expected: "首次掷 1 次；死亡重开后累计 2 次（重新武装、重掷；刷新续玩/读档则不重掷）",
    actual: "首次累计 " + first + " 次，死亡重开后累计 " + after + " 次"
  };
});

/* ---------- 6. 结局场景的触发器豁免口径 ---------- */
probe("结局豁免：ID 前缀与静态文案都豁免，函数型 text 不豁免（手册 §0-3）", () => {
  const { read } = makeSandbox(`{
    _variables: { hh: 20 },
    _globalTriggers: [{ id: "night", condition: "hh >= 19", targetScene: "过夜", priority: 5 }],
    start: { text: "x" },
    "\u7ed3\u5c40_\u7532": { text: "\u7ed3\u5c40\u6b63\u6587" },
    "\u4e59\u7ed3\u5c40": { text: "\u2014\u2014 \u7ed3\u5c40\uff1a\u4e59" },
    "\u4e19\u7ed3\u5c40": { text: function () { return "\u2014\u2014 \u7ed3\u5c40\uff1a\u4e19"; } },
    "\u8fc7\u591c": { text: "\u591c" }
  }`);
  read("initGameState()");
  // renderScene 不写 currentScene（跳转时才会被 checkGlobalTriggers 改写），
  // 所以用 lastRenderedScene 判断"实际渲染停在哪"。
  const out = ["结局_甲", "乙结局", "丙结局"].map(id => {
    read('lastRenderedScene = ""');
    read('renderScene("' + id + '")');
    return id + "→" + read("lastRenderedScene");
  });
  return {
    ok: out[0] === "结局_甲→结局_甲" && out[1] === "乙结局→乙结局" && out[2].indexOf("过夜") >= 0,
    expected: "前两个停在自身；函数型 text 的丙结局被触发器拉走过夜",
    actual: out.join(" | ")
  };
});

/* ---------- 7. 无 onTimeout 的 QTE 超时 ---------- */
probe("QTE 无 onTimeout：有 choices 时按钮仍在、仅警告；无 choices 过场才卡死（手册 §8.1 / §20-17）", () => {
  const { read, els } = makeSandbox(`{
    _variables: {},
    start: { text: "", qte: { timeout: 30 }, choices: [{ text: "按", nextScene: "end" }] },
    end: { text: "终" }
  }`);
  read("initGameState()");
  read('renderScene("start")');
  const n = els["choices-area"].children.length;
  return {
    ok: n >= 1,
    expected: "按钮仍在（玩家还能点）——『卡死』只发生在无 choices 的过场",
    actual: "选项区按钮数 = " + n
  };
});

/* ---------- 8. 分段文本的段间停留公式 ---------- */
probe("分段停留 = max(1200, 去标签字数×25)（手册 §3.3）", () => {
  const { read } = makeSandbox(`{ _variables: {}, start: { text: ["a"] } }`);
  const consts = read("SEGMENT_MIN_PAUSE + '/' + SEGMENT_MS_PER_CHAR");
  // 纯计算：200 字的一段落 → 5000ms；10 字 → 1200ms（下限）
  const plain200 = "字".repeat(200);
  const got200 = read("Math.max(SEGMENT_MIN_PAUSE, " + 200 + " * SEGMENT_MS_PER_CHAR)");
  const got10 = read("Math.max(SEGMENT_MIN_PAUSE, 10 * SEGMENT_MS_PER_CHAR)");
  return {
    ok: consts === "1200/25" && got200 === 5000 && got10 === 1200,
    expected: "常量 1200/25；200 字 → 5000ms；10 字 → 1200ms（下限生效）",
    actual: "常量 " + consts + "；200 字 → " + got200 + "ms；10 字 → " + got10 + "ms"
  };
});

/* ---------- 9. 记忆闪色与选项渲染的先后 ---------- */
probe("闪色在选项渲染之后播：renderChoices → applyMemoryFlash（手册 §12）", () => {
  const { read } = makeSandbox(`{
    _variables: { _currentSeq: [], _seqPlayed: true, _seqScene: "" },
    _order: [],
    start: {
      text: "",
      onEnter: function (v) { v._currentSeq = ["红", "蓝"]; v._seqPlayed = false; return {}; },
      choices: [{ text: "走", nextScene: "end" }]
    },
    end: { text: "终" }
  }`);
  read("initGameState()");
  // 包一层记录调用顺序（function 声明是全局可写属性，可直接改）
  read(`(function () {
    var rc = renderChoices, af = applyMemoryFlash;
    renderChoices = function () { storyData._order.push("renderChoices"); return rc.apply(null, arguments); };
    applyMemoryFlash = function () { storyData._order.push("applyMemoryFlash"); return af.apply(null, arguments); };
  })()`);
  read('renderScene("start")');
  const order = read("storyData._order.join(' → ')");
  return {
    ok: order === "renderChoices → applyMemoryFlash",
    expected: "renderChoices → applyMemoryFlash（选项先出、闪色随后，不是『选项前』）",
    actual: order
  };
});

/* ---------- 10. 输入型选项在 QTE 场景里的降级 ---------- */
probe("输入型选项放进 QTE 场景 → 不渲染输入框（手册 §0.2 / §9 / §20-18）", () => {
  const { read, els } = makeSandbox(`{
    _variables: { _input: "" },
    start: { text: "", qte: { timeout: 9000, onTimeout: "end" },
             choices: [{ text: "输密码", input: { placeholder: "密码" }, nextScene: "end" }] },
    end: { text: "终" }
  }`);
  read("initGameState()");
  read('renderScene("start")');
  read("clearQTE()");
  const kinds = els["choices-area"].children.map(c => c.className || "(none)");
  return {
    ok: kinds.indexOf("choice-input-container") === -1,
    expected: "QTE 分支只造普通按钮（choice-btn），输入框不出现，_input 永远拿不到值",
    actual: "选项区元素: [" + kinds.join(", ") + "]"
  };
});

/* ---------- 输出 ---------- */
let fail = 0;
console.log("");
console.log("引擎行为探针 · engine.js → 手册断言取证");
console.log("=".repeat(74));
for (const r of results) {
  if (!r.pass) fail++;
  console.log((r.pass ? "[PASS] " : "[FAIL] ") + r.name);
  console.log("       期望: " + r.expected);
  console.log("       观测: " + r.actual);
}
console.log("=".repeat(74));
console.log("共 " + results.length + " 条，PASS " + (results.length - fail) + "，FAIL " + fail +
  "（FAIL = 手册与引擎至少一边需要改）");
process.exit(fail ? 1 : 0);
