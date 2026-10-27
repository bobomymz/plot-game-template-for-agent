// ================= engine.js =================
// 母本参考引擎：源自《九三〇来宾须知》实战引擎（ADR-0010）。
// 去项目化补丁仅三处：文件头注释、_meta 覆盖口（存档弹窗/死亡重开文案，见 makeSaveSummary /
// showSaveDialog / appendDeathRestart）。930 侧引擎修复需手动同步回本文件。
// --- DOM 元素 ---
const sceneImage  = document.getElementById("scene-image");
const sceneText   = document.getElementById("scene-text");
const choicesArea = document.getElementById("choices-area");
const restartBtn  = document.getElementById("restart-btn");
const backtrackBtn = document.getElementById("backtrack-btn");
const imageArea   = document.getElementById("image-area");
const zoomBadge   = document.getElementById("zoom-badge");
const imageViewer = document.getElementById("image-viewer");
const imageViewerImg = document.getElementById("image-viewer-img");


// --- 游戏运行状态 ---
let currentScene = "start";
let lastRenderedScene = "";   // 上一次成功渲染的场景ID（用于记录 _lastScene）
let gameState = {};
let historyStack = [];   // 回溯历史 [{ sceneId, gameState }]
// ====== QTE 相关 ======
let qteTimer = null;           // QTE 倒计时定时器句柄
let qteRemaining = 0;         // 剩余时间（秒）
let qteInterval = null;       // UI 更新 interval
let _memFlashTimers = [];    // 记忆闪色定时器列表
// ====== 打字机相关 ======
let typingTimer = null;
let typingCallback = null;
let typingFullText = "";
let typingIsHtml = false;      // 标记当前是否 HTML 模式

function stopTyping() {
  clearQTE();   // 终止任何进行中的 QTE
  clearMemoryFlash(); // 终止记忆闪色动画
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
  if (typingCallback) {
    const cb = typingCallback;
    typingCallback = null;
    cb();
  }
  sceneText.classList.remove("typing");
}

function typeText(element, fullText, speed = 80, onComplete) {
  stopTyping();
  typingFullText = fullText;
  element.innerHTML = "";                  // 统一用 innerHTML 清空
  element.classList.add("typing");

  if (!fullText) {
    stopTyping();
    if (onComplete) onComplete();
    return;
  }

  const hasHtml = /<[^>]+>/.test(fullText);
  typingIsHtml = hasHtml;                  // 记下模式，供 skip 使用

  let i = 0;
  let result = "";
  typingCallback = onComplete;

  typingTimer = setInterval(() => {
    if (i < fullText.length) {

      if (hasHtml && fullText[i] === '<') {
        // === HTML 模式：标签作为整体一次性插入 ===
        let j = i;
        while (j < fullText.length && fullText[j] !== '>') j++;
        if (j < fullText.length) {
          result += fullText.substring(i, j + 1);   // 整个 <...> 一起加入
          i = j + 1;
        } else {
          // 畸形标签（没有 >），当普通字符
          result += fullText[i];
          i++;
        }
      } else {
        // === 普通字符：逐字加入 ===
        result += fullText[i];
        i++;
      }

      element.innerHTML = result;           // 关键：用 innerHTML 渲染

    } else {
      // 打字完毕
      clearInterval(typingTimer);
      typingTimer = null;
      element.classList.remove("typing");
      if (typingCallback) {
        const cb = typingCallback;
        typingCallback = null;
        cb();
      }
    }
  }, speed);
}

// ====== 分段文本 ======
const SEGMENT_MS_PER_CHAR = 25;   // 段间停留：每字毫秒数（仿 travelScene 惯例）
const SEGMENT_MIN_PAUSE = 1200;   // 段间停留：最短下限(ms)
let segmentToken = 0;             // 代际令牌：renderScene 顶部递增，旧分段链路全部作废
let segmentActive = false;        // 分段播放中（含段间停留等待）
let segmentAdvance = null;        // 段间停留时点击文本 → 立即进入下一段
let segmentDwellTimer = null;     // 段间停留定时器

function clearSegments() {
  segmentToken++;
  segmentActive = false;
  segmentAdvance = null;
  if (segmentDwellTimer) { clearTimeout(segmentDwellTimer); segmentDwellTimer = null; }
}

// 分段播放：每段走打字机，打完停留 max(SEGMENT_MIN_PAUSE, 去标签字数*SEGMENT_MS_PER_CHAR)，
// 清空后进下一段；最后一段完成后调用 onComplete（即原有 renderChoices+applyMemoryFlash 回调）。
// 全链路用 token 守卫：切场景后（renderScene 顶部 clearSegments 已 token++），
// 旧链的一切回调（打字完成/停留到期）静默作废，不再碰 DOM、不再调度定时器。
function typeSegments(element, segments, speed, onComplete) {
  clearSegments();   // 保险（正常流程 renderScene 顶部已清过）
  const token = segmentToken;
  segmentActive = true;
  let index = 0;

  function playCurrent() {
    if (token !== segmentToken) return;
    const seg = String(segments[index++]);
    const isLast = index >= segments.length;
    typeText(element, seg, speed, function onSegmentDone() {
      if (token !== segmentToken) return;
      if (isLast) {
        segmentActive = false;
        segmentAdvance = null;
        onComplete();
        return;
      }
      const plain = seg.replace(/<[^>]*>/g, "");
      const pause = Math.max(SEGMENT_MIN_PAUSE, plain.length * SEGMENT_MS_PER_CHAR);
      const proceed = function() {
        if (token !== segmentToken) return;
        segmentDwellTimer = null;
        segmentAdvance = null;
        element.innerHTML = "";
        playCurrent();
      };
      segmentDwellTimer = setTimeout(proceed, pause);
      segmentAdvance = function() {   // 停留期点击 → 立即切段
        if (segmentDwellTimer) { clearTimeout(segmentDwellTimer); segmentDwellTimer = null; }
        proceed();
      };
    });
  }
  playCurrent();
}

sceneText.addEventListener("click", () => {
  // 状态1：正在打字 → 停止打字，立即显示全文
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;

    if (typingIsHtml) {
      sceneText.innerHTML = typingFullText;
    } else {
      sceneText.textContent = typingFullText;
    }

    sceneText.classList.remove("typing");
    if (typingCallback) {
      const cb = typingCallback;
      typingCallback = null;
      cb();
    }
    return;
  }

  // 状态1.5：分段播放的段间停留 → 点击立即进入下一段
  if (segmentActive && typeof segmentAdvance === "function") {
    segmentAdvance();
    return;
  }

  // 状态2：打字已完成 → 切换文本展开/收起
  const textArea = document.getElementById("text-area");
  const choicesArea = document.getElementById("choices-area");
  textArea.classList.toggle("text-expanded");
  choicesArea.classList.toggle("text-expanded");
});

// ====== 工具函数 ======
function initGameState() {
  const defaults = (storyData && storyData._variables) || {};
  // 深拷贝：_variables 里含 Set（记忆集合），浅拷贝会让重启后残留上一局的记忆
  gameState = snapshotState(defaults);
  console.log("【引擎】变量已初始化：", gameState);
}

function applyEffect(effect) {
  if (typeof effect === 'function') {
    effect = effect(gameState);
  }
  if (!effect) return;

  if (effect.set) {
    for (let key in effect.set) gameState[key] = effect.set[key];
  }
  if (effect.add) {
    for (let key in effect.add) {
      if (gameState[key] === undefined) gameState[key] = effect.add[key];
      else gameState[key] += effect.add[key];
    }
  }
  if (effect.mul) {
    for (let key in effect.mul) {
      if (gameState[key] === undefined) gameState[key] = effect.mul[key];
      else gameState[key] *= effect.mul[key];
    }
  }

  clampAll();        // 1. 先用 _caps 粗钳
  applyReactive();   // 2. 计算派生变量 + 执行响应规则
  clampAll();        // 3. 规则可能导致越界，再钳一次
  syncRulesPanel();   // 4. 手册若开着且规则状态变了，立即重绘（定义在 story/rules_ui.js）
}

// 手册面板重绘的单一 hook 点：任何会让 rsRxx 变化的路径最终都经过 applyEffect，
// 或经过 learnRule/verifyRule（两者自带 announceRuleChange 提示，见 story/utils.js）。
// 全部 try/catch 兜住：手册是附属 UI，绝不能因为它把主流程带崩。
//
// ⚠ 函数名必须叫 syncRulesPanel，**不能叫 refreshRulesPanel**：
//   rules_ui.js（先加载）把真正的重绘实现挂在 window.refreshRulesPanel 上；
//   engine.js（后加载）若在这里声明同名的顶层 function refreshRulesPanel，
//   会**覆盖掉** rules_ui 的那份 —— 于是这里的 window.refreshRulesPanel() 调到的就是自己，
//   无限递归 → 栈溢出 → 被 catch 吞掉 → 真正的 syncRulesButton/renderPanel 一次都不跑
//   （症状：领到手册后按钮永远不亮、面板内容永不变）。
//   这个 bug 逃过了全套回归，因为那些测试都打桩、没有哪个加载真 engine.js 去点亮按钮。
function syncRulesPanel() {
  try {
    if (typeof window !== "undefined" && typeof window.refreshRulesPanel === "function") window.refreshRulesPanel();
  } catch (e) { /* 静默：手册渲染失败不该影响游戏 */ }
}

function clampAll() {
  const caps = storyData._caps;
  if (!caps) return;
  for (const key in caps) {
    const cap = caps[key];
    if (cap.min !== undefined && gameState[key] < cap.min) {
      gameState[key] = cap.min;
    }
    if (cap.max !== undefined && gameState[key] > cap.max) {
      gameState[key] = cap.max;
    }
  }
}

// ====== 场景抖动（一次性动画） ======
function triggerShake() {
  const container = document.getElementById("game-container") || document.body;
  // 如果正在抖动，先强制重置
  container.classList.remove("shake");
  void container.offsetWidth;   // 强制回流，让浏览器重置动画
  container.classList.add("shake");

  // 动画结束后自动清理
  container.addEventListener("animationend", function handler() {
    container.classList.remove("shake");
    container.removeEventListener("animationend", handler);
  });
}

// ====== 屏幕特效系统 ======
function applyScreenEffects() {
  const effects = storyData._screenEffects;
  if (!effects || !effects.length) return;

  // 查找或创建遮罩层（只创建一次）
  let overlay = document.getElementById("screen-effect-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "screen-effect-overlay";
    document.body.appendChild(overlay);
  }

  // 收集所有满足条件的特效类名
  const activeClasses = [];
  for (const effect of effects) {
    if (checkCondition(effect.condition, gameState)) {
      activeClasses.push(effect.className);
    }
  }

  // diff 新旧类名，触发生命周期钩子
  const oldClasses = overlay.className;
  const newClasses = activeClasses.join(' ');
  if (oldClasses !== newClasses) {
    // 两阶段：先全部 onDeactivate、再全部 onActivate。
    // 否则轻度→重度（或反向）切换时，新档 onActivate 设的 --zombie-bg
    // 会被旧档 onDeactivate 的 removeProperty 抹掉（钩子是同一 CSS 变量的写/删）。
    for (const effect of effects) {
      const wasActive = oldClasses.indexOf(effect.className) >= 0;
      const nowActive = newClasses.indexOf(effect.className) >= 0;
      if (wasActive && !nowActive && effect.onDeactivate) {
        effect.onDeactivate(overlay);
      }
    }
    for (const effect of effects) {
      const wasActive = oldClasses.indexOf(effect.className) >= 0;
      const nowActive = newClasses.indexOf(effect.className) >= 0;
      if (!wasActive && nowActive && effect.onActivate) {
        effect.onActivate(overlay);
      }
    }
  }

  // 替换类名
  overlay.className = newClasses;

  // 无特效时完全隐藏，避免空层干扰
  overlay.style.display = activeClasses.length === 0 ? 'none' : '';
}

// ====== 状态警告浮层（体力自动下降等非剧情原因的提示） ======
// 用法：在 reactive 规则的 onTrigger 里调用，如 flashStatusWarning("⚠ 体力 -1（饥饿）")
function flashStatusWarning(message) {
  let toast = document.getElementById("status-warning");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "status-warning";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  // 重启动画：先移除 show 再强制回流，最后重新加入，保证连续触发时动画也能重新播放
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
  // 自动隐藏
  if (toast._hideTimer) clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 2000);
}

// ====== 记忆闪色动画 ======
function clearMemoryFlash() {
  _memFlashTimers.forEach(t => clearTimeout(t));
  _memFlashTimers = [];
  const overlay = document.getElementById("screen-effect-overlay");
  if (overlay) {
    overlay.style.background = 'transparent';
    overlay.style.animation = ''; // 恢复 pulse-vignette 等 CSS 动画（闪色期间被禁用，见 applyMemoryFlash）
    // 不再设置 display，交给 applyScreenEffects 统一管理
  }
}

const MEM_FLASH_MS = 600;   // 每色闪烁时长
const MEM_PAUSE_MS = 200;   // 闪烁间隔

// 闪色动画本身要花掉的时长（选项级倒计时与闪色同时启动，故需扣除这段"白给"时间）
function memFlashDuration(vars) {
  if (vars._seqPlayed || !Array.isArray(vars._currentSeq)) return 0;
  return vars._currentSeq.length * (MEM_FLASH_MS + MEM_PAUSE_MS);
}

function applyMemoryFlash(vars) {
  if (!vars._currentSeq || vars._seqPlayed) return false;

  const seq = vars._currentSeq;
  const flashMs = MEM_FLASH_MS;
  const pauseMs = MEM_PAUSE_MS;
  const overlay = document.getElementById("screen-effect-overlay");
  if (!overlay) return false;

  closeImageViewer();   // 闪色播在特效层(z-50)，会被查看器(z-140)盖住；开始播放前自动关闭
  clearMemoryFlash();

  overlay.style.display = 'block';
  overlay.style.transition = 'background 0.05s';
  // 关键：vignette-danger（体力≤1）的 pulse-vignette 动画在 keyframes 里写死 background，
  // CSS 动画优先级高于 inline style，会把闪色的 inline background 压掉导致闪色不可见。
  // 闪色期间禁用 overlay 动画，播完/打断时由下方收尾和 clearMemoryFlash 恢复。
  overlay.style.animation = 'none';

  const colorMap = { '红': 'rgba(255,34,0,0.55)', '蓝': 'rgba(34,102,255,0.55)', '绿': 'rgba(34,204,34,0.55)', '黄': 'rgba(255,204,0,0.55)', '紫': 'rgba(170,68,255,0.55)', '白': 'rgba(255,255,255,0.55)' };

  function flash(index) {
    if (index >= seq.length) {
      overlay.style.background = 'transparent';
      overlay.style.animation = '';  // 恢复暗角脉冲等 CSS 动画（闪色期间被禁用）
      applyScreenEffects();  // 闪色结束后恢复屏幕特效（暗角/雨滴等），不再硬编码 display:none
      vars._seqPlayed = true;
      // 序列不清空：回溯/读档落回本场景时需重播原序列（见 renderScene 的 _seqScene 判定）
      return;
    }
    overlay.style.background = colorMap[seq[index]] || '#ffffff';
    const t1 = setTimeout(() => {
      overlay.style.background = 'transparent';
      const t2 = setTimeout(() => flash(index + 1), pauseMs);
      _memFlashTimers.push(t2);
    }, flashMs);
    _memFlashTimers.push(t1);
  }

  flash(0);
  return true;
}

// ====== 图片查看器（imageZoom 标记场景图点击放大）======
// 门票语义：仅当前场景声明 imageZoom: true 时角标显示、点击可开（角标切换在 renderScene 图片节）。
// 纯 UI 态：不写 gameState、不进存档；换场景（renderScene 开头）与记忆闪色启动时自动关闭。
// 层级：z-140，QTE 条（150）浮在其上——倒计时不暂停，但始终可见（末日不暂停，见 design.md D3）。
const VIEWER_MAX_SCALE = 4;        // 缩放上限（相对 contain-fit 的倍率）
const VIEWER_WHEEL_STEP = 1.15;    // 滚轮每格缩放倍率
const VIEWER_DRAG_THRESHOLD = 5;   // 位移阈值(px)，超过算拖拽、松开不关闭

let viewerOpen = false;
let viewerZoomable = false;        // 当前场景是否带 imageZoom 标记（renderScene 每场景刷新）
let viewerScale = 1;               // 1 = contain 适配屏
let viewerTx = 0, viewerTy = 0;    // 平移量(px)
let viewerPointers = new Map();    // pointerId -> {x, y, downX, downY}
let viewerPinchPrevDist = 0;       // 捏合上一次双指间距（增量式缩放）
let viewerDragMoved = false;

function openImageViewer() {
  if (viewerOpen || !viewerZoomable) return;
  if (!sceneImage.src || sceneImage.style.display === "none") return;
  imageViewerImg.src = sceneImage.src;
  viewerOpen = true;
  viewerScale = 1; viewerTx = 0; viewerTy = 0;
  viewerPointers.clear();
  viewerDragMoved = false;
  imageViewer.style.display = "flex";
  imageViewer.classList.remove("zoomed");
  applyViewerTransform();
}

function closeImageViewer() {
  if (!viewerOpen) return;
  viewerOpen = false;
  viewerPointers.clear();
  imageViewer.style.display = "none";
  imageViewer.classList.remove("zoomed");
}

// 缩放（anchor 为查看器坐标系下的不动点：滚轮光标 / 捏合中点）
function viewerZoomAt(newScale, ax, ay) {
  // 图片尚未排版完成（刚打开、仍在解码）时几何未知，忽略本次手势——
  // 否则按 0 尺寸算出的钳位会把缩放/平移错误归零（通常仅缓存未命中后的第一帧）
  if (imageViewerImg.offsetWidth === 0) return;
  newScale = Math.min(VIEWER_MAX_SCALE, Math.max(1, newScale));
  if (newScale === viewerScale) return;
  const L = imageViewerImg.offsetLeft, T = imageViewerImg.offsetTop;
  // 不动点对应的图片局部坐标（transform-origin 0 0：屏点 = (L,T) + local*scale + (tx,ty)）
  const px = (ax - L - viewerTx) / viewerScale;
  const py = (ay - T - viewerTy) / viewerScale;
  viewerScale = newScale;
  if (viewerScale === 1) {
    viewerTx = 0; viewerTy = 0;    // 回到适配态，由 flexbox 居中
  } else {
    viewerTx = ax - L - px * viewerScale;
    viewerTy = ay - T - py * viewerScale;
    clampViewerPan();
  }
  imageViewer.classList.toggle("zoomed", viewerScale > 1);
  applyViewerTransform();
}

// 平移并钳位：图片边缘不外露背板；不足一屏的维度保持居中
function clampViewerPan() {
  const W = imageViewer.clientWidth, H = imageViewer.clientHeight;
  const L = imageViewerImg.offsetLeft, T = imageViewerImg.offsetTop;
  const w = imageViewerImg.offsetWidth * viewerScale;
  const h = imageViewerImg.offsetHeight * viewerScale;
  if (w <= W) viewerTx = (W - w) / 2 - L;
  else viewerTx = Math.min(-L, Math.max(W - w - L, viewerTx));
  if (h <= H) viewerTy = (H - h) / 2 - T;
  else viewerTy = Math.min(-T, Math.max(H - h - T, viewerTy));
}

function viewerPanBy(dx, dy) {
  if (viewerScale <= 1) return;
  if (imageViewerImg.offsetWidth === 0) return;   // 排版未完成，同 viewerZoomAt
  viewerTx += dx; viewerTy += dy;
  clampViewerPan();
  applyViewerTransform();
}

function applyViewerTransform() {
  imageViewerImg.style.transform =
    "translate(" + viewerTx + "px," + viewerTy + "px) scale(" + viewerScale + ")";
}

// 滚轮缩放（passive:false 才能 preventDefault 阻止页面滚动）
imageViewer.addEventListener("wheel", function (e) {
  if (!viewerOpen) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? VIEWER_WHEEL_STEP : 1 / VIEWER_WHEEL_STEP;
  viewerZoomAt(viewerScale * factor, e.clientX, e.clientY);
}, { passive: false });

// Pointer Events 统一鼠标/触屏：单指拖拽平移、双指捏合缩放、单击关闭
imageViewer.addEventListener("pointerdown", function (e) {
  if (!viewerOpen) return;
  // 捕获失败（如非活动指针）不应中断手势登记——捏合/拖拽比捕获更重要
  try { imageViewer.setPointerCapture(e.pointerId); } catch (err) {}
  viewerPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, downX: e.clientX, downY: e.clientY });
  if (viewerPointers.size === 1) viewerDragMoved = false;
  if (viewerPointers.size === 2) {
    const pts = [...viewerPointers.values()];
    viewerPinchPrevDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
});

imageViewer.addEventListener("pointermove", function (e) {
  if (!viewerOpen || !viewerPointers.has(e.pointerId)) return;
  const p = viewerPointers.get(e.pointerId);
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (Math.hypot(p.x - p.downX, p.y - p.downY) > VIEWER_DRAG_THRESHOLD) viewerDragMoved = true;

  if (viewerPointers.size === 2) {
    // 捏合：以双指中点为不动点，按间距增量缩放
    const pts = [...viewerPointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (viewerPinchPrevDist > 0 && dist > 0) {
      viewerZoomAt(viewerScale * dist / viewerPinchPrevDist, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    }
    viewerPinchPrevDist = dist;
  } else if (viewerPointers.size === 1 && viewerDragMoved) {
    viewerPanBy(dx, dy);
  }
});

function viewerPointerEnd(e) {
  if (!viewerOpen) return;
  const wasSingle = viewerPointers.size === 1 && viewerPointers.has(e.pointerId);
  viewerPointers.delete(e.pointerId);
  viewerPinchPrevDist = 0;
  // 单指按下且未拖拽 → 单击关闭（微信语义）
  if (wasSingle && !viewerDragMoved) closeImageViewer();
}
imageViewer.addEventListener("pointerup", viewerPointerEnd);
imageViewer.addEventListener("pointercancel", viewerPointerEnd);

// Esc 关闭（桌面）；始终监听、打开时才生效，比开关注册更省事
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && viewerOpen) closeImageViewer();
});

// 点击场景图：仅标记场景（门票语义）打开查看器
sceneImage.addEventListener("click", function () {
  if (viewerZoomable) openImageViewer();
});

function checkCondition(condition, variables) {
  if (condition == null || condition === true) return true;
  // ★ 新增：支持函数回调
  if (typeof condition === 'function') {
    return condition(variables);
  }
  if (typeof condition === 'string') {
    try {
      const keys = Object.keys(variables);
      const vals = Object.values(variables);
      const fn = new Function(...keys, `return Boolean(${condition});`);
      return fn(...vals);
    } catch (e) {
      console.error('条件表达式出错:', condition, e);
      return false;
    }
  }

  if (typeof condition === 'object') {
    for (const key in condition) {
      const req = condition[key];
      const val = variables[key];
      if (typeof req === 'object' && req !== null) {
        for (const op in req) {
          const exp = req[op];
          if (op === '>=' && !(val >= exp)) return false;
          if (op === '<=' && !(val <= exp)) return false;
          if (op === '>' && !(val > exp)) return false;
          if (op === '<' && !(val < exp)) return false;
          if (op === '!=' && !(val !== exp)) return false;
          if (op === '==' && !(val === exp)) return false;
        }
      } else {
        if (val !== req) return false;
      }
    }
    return true;
  }

  return true;
}

// ====== 响应式系统 ======
let _reactiveState = {};   // { ruleId: lastTriggerKeyValue }

function evaluateExpr(expr, vars) {
  if (typeof expr === 'function') return expr(vars);
  if (typeof expr === 'string') {
    try {
      const keys = Object.keys(vars);
      const vals = Object.values(vars);
      const fn = new Function(...keys, `return (${expr});`);
      return fn(...vals);
    } catch (e) {
      console.error('表达式错误:', expr, e);
      return undefined;
    }
  }
  return expr;
}

// 只重算派生变量（_reactive.computed），不跑规则。
// 用途：存档 / 回溯两条恢复路径 —— 与 fillMissingDefaults 是同一件事的两半：
//   _variables 里的键靠"填初始值"补，computed 里的键只能靠"重算"补（派生量没有初值可取）。
// ⚠ 恢复路径上不要直接调整个 applyReactive()：那会把饥饿/疲劳规则提前到读档瞬间结算
//   （玩家什么都没做就掉体力）。规则仍按原流程在第一次 applyEffect 时跑，节流记录照旧。
function refreshComputed() {
  const reactive = storyData._reactive;
  if (!reactive || !reactive.computed) return;
  for (const key in reactive.computed) {
    gameState[key] = evaluateExpr(reactive.computed[key], gameState);
  }
}

function applyReactive() {
  const reactive = storyData._reactive;
  if (!reactive) return;

  // --- 1. 计算派生变量 ---
  refreshComputed();

  // --- 2. 执行响应式规则 ---
  if (reactive.rules) {
    for (const rule of reactive.rules) {
      if (!rule.id) {
        console.error('reactive rule 缺少 id', rule);
        continue;
      }

      // 检查 condition
      if (rule.condition != null && !evaluateExpr(rule.condition, gameState)) {
        _reactiveState[rule.id] = undefined;   // 条件不满足时重置记录
        continue;
      }

      // triggerKey 节流：相同 key 值不重复触发
      if (rule.triggerKey !== undefined) {
        const key = evaluateExpr(rule.triggerKey, gameState);
        if (_reactiveState[rule.id] === key) continue;
        _reactiveState[rule.id] = key;
      }

      // 执行效果
      let effectResult;
      if (typeof rule.effect === 'function') {
        effectResult = rule.effect(gameState);
      } else if (rule.effect) {
        // 对象形式的效果直接合并到 gameState
        if (rule.effect.set) {
          for (const k in rule.effect.set) gameState[k] = rule.effect.set[k];
        }
        if (rule.effect.add) {
          for (const k in rule.effect.add) {
            if (gameState[k] === undefined) gameState[k] = rule.effect.add[k];
            else gameState[k] += rule.effect.add[k];
          }
        }
        if (rule.effect.mul) {
          for (const k in rule.effect.mul) {
            if (gameState[k] === undefined) gameState[k] = rule.effect.mul[k];
            else gameState[k] *= rule.effect.mul[k];
          }
        }
      }

      // 触发回调：规则真正生效时调用，用于副作用（如"体力自动下降"的警告提示）
      // effectResult 为函数型 effect 的返回值（如"是否实际上升了追击等级"）
      if (rule.onTrigger) {
        rule.onTrigger(gameState, rule, effectResult);
      }
    }
  }
}

// ====== 全局触发检查 ======
// sceneId 传当前正在渲染的场景（renderScene 内部不给 currentScene 赋值，靠这里传入才准）。
function checkGlobalTriggers(sceneId) {
  if (!storyData._globalTriggers || !storyData._globalTriggers.length) return null;

  // -------- 过程性节点豁免过夜（波波 10-03）--------
  // 「天黑必须过夜」会在玩家进入**任何**场景的瞬间把他拉走，连正在进行的 QTE/闪色战斗也照拉
  // （实测 103 个带 qte 的场景 100% 被吞，战斗整场消失）。所以"正在进行中"的节点要豁免。
  // 判定两种：
  //   ① 场景显式声明 `nightImmune: true` 或 `nightImmune: function(v){...}`（函数形态可批处理，
  //      例：车库九格统一样式 `return !!v._driving`，一条覆盖整个驾驶态）；
  //   ② 场景带 `qte` —— QTE/闪色战斗本身就是"正在进行"，一律豁免（规则统一，不必逐个标）。
  // ⚠ 只豁免 id === "night" 那一条。死亡类触发器（体力耗尽/汞中毒/追兵>=5/Harsh）优先级更高、
  //   且必须生效，否则夜里打架会变成不死身。
  // ⚠ 豁免只是"延后"不是"免疫"：玩家离开豁免场景走进任何普通场景的那一刻照样被拉走，必然收敛。
  // ⚠ 属性写在场景定义里、不进存档 —— 回溯/读档天然正确，不需要任何清理（不像状态变量那样会泄漏）。
  const curScene = storyData[sceneId];
  const nightImmune = !!(curScene && (
    typeof curScene.nightImmune === "function" ? curScene.nightImmune(gameState) : curScene.nightImmune
  )) || !!(curScene && curScene.qte);

  let best = null;
  let bestPriority = -Infinity;

  for (const trigger of storyData._globalTriggers) {
    if (nightImmune && trigger.id === "night") continue;   // 豁免只对天黑这一条生效
    if (checkCondition(trigger.condition, gameState)) {
      const prio = trigger.priority || 0;
      if (prio > bestPriority) {
        best = trigger;
        bestPriority = prio;
      }
    }
  }

  if (best) {
    const resolved = parseRedirectTarget(best.targetScene, gameState);
    if (resolved !== currentScene) {
      return resolved;
    }
  }
  return null;
}

// ====== QTE 状态清理 ======
function clearQTE() {
  if (qteInterval) {
    clearInterval(qteInterval);
    qteInterval = null;
  }
  if (qteTimer) {
    clearTimeout(qteTimer);
    qteTimer = null;
  }
  // 移除可能残留的倒计时 UI
  const oldTimer = document.getElementById("qte-timer");
  if (oldTimer) oldTimer.remove();
}

// ====== 触屏输入补时 ======
// 手机中文输入法（点输入框唤起键盘 → 拼音 → 选字）比物理键盘慢得多，
// 但闪色播放的那几秒是"白给"的，不该跟着放大——所以只对输入型选项、
// 且只对"扣掉闪色时长之后的敲字时间"乘系数，"颜色越多时限越紧"的原设计不变。
// 调这个常量即可调松紧，设为 1 等于关闭该补时。
const TOUCH_INPUT_FACTOR = 1.5;
const IS_TOUCH = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);

// ====== QTE 倒计时浮层（场景级 / 选项级共用；样式见 style.css 的 #qte-timer） ======
function startQteUi(timeoutMs) {
  const timerDiv = document.createElement("div");
  timerDiv.id = "qte-timer";
  timerDiv.innerHTML =
    '<div class="qte-row">' +
      '<span class="qte-label">⚡ 快做决定！</span>' +
      '<div class="qte-track"><div class="qte-progress"></div></div>' +
      '<span class="qte-countdown">' + (timeoutMs / 1000).toFixed(1) + 's</span>' +
    '</div>';
  document.body.appendChild(timerDiv);

  const progressBar   = timerDiv.querySelector(".qte-progress");
  const countdownSpan = timerDiv.querySelector(".qte-countdown");
  const startTime = Date.now();
  const total = timeoutMs;

  qteInterval = setInterval(() => {
    const remaining = Math.max(0, total - (Date.now() - startTime));
    progressBar.style.width = (total > 0 ? (remaining / total) * 100 : 0) + "%";
    countdownSpan.textContent = (remaining / 1000).toFixed(1) + "s";
    if (remaining < 1000) timerDiv.classList.add("qte-urgent");   // 最后 1 秒转警戒色
  }, 100);
}

// ====== 解析跳转目标（支持函数、{变量}、普通字符串） ======
function parseRedirectTarget(target, state) {
  if (typeof target === 'function') {
    const result = target(state);
    // 函数返回值也做 {变量} 插值，与字符串分支保持一致
    return typeof result === "string" ? interpolateDisplay(result, state) : result;
  }
  if (typeof target === 'string') {
    return interpolateDisplay(target, state);
  }
  return target;
}

// ====== 回溯功能 ======
function pushHistory() {
  historyStack.push({
    sceneId: currentScene,
    gameState: snapshotState(gameState),  // 深拷贝（Set 会被正确还原为 Set）
    // 规则节流状态必须随快照走：gameState 回到过去而节流记录留在"未来"的话，
    // 回溯后饥饿/疲劳规则会按错位的 triggerKey 错扣、漏扣体力（同存档要存 reactiveState 的道理）
    reactiveState: Object.assign({}, _reactiveState)
  });
  //backtrackBtn.style.display = 'inline-block';  // 有历史就显示顶部按钮
}

// ====== 回溯落点选择：历史里「最近、且当时有 ≥2 个可行选项」的节点 ======
// 背景（2026-10-01 波波提出）：旧行为一律落到栈顶（上一个节点）。但在链状剧情里，
// 上一个节点往往只有唯一出口——玩家回溯回去只能再点同一条路、原样走回死亡点，回溯等于没用。
// 新行为：从栈顶往下找第一条「当时确实有 ≥2 个选项可选」的历史，落到那里。
//
// ⚠ 必须用【该条历史自带的 gameState 快照】判定，不能用当前 gameState：
//   选项可见性随状态变化（去过一次就没了、要带工具才有），只有当时的状态才知道当时有几个选项。
// ⚠ 判定前先深拷贝一份再求值：choices 是函数时由剧情现场生成，理论上可能带副作用，
//   不能让"数一数有几个选项"这件事污染随后要恢复的快照。

const BACKTRACK_SCAN_CAP = 60;   // 最多往回看多少条历史（越界就退回旧行为，避免长局无谓开销）

// 复刻 renderChoices 的可见性判定（showCondition → condition/elseScene；input 型渲染期不判 condition）
function countSceneChoices(sceneId, state) {
  const scene = storyData && storyData[sceneId];
  if (!scene) return 0;                      // 悬空 ID：视作无选项，跳过
  let cs = scene.choices;
  if (typeof cs === "function") {
    try { cs = cs(state); } catch (e) { return 0; }
  }
  if (!cs || !cs.length) return 0;
  let n = 0;
  for (const c of cs) {
    if (!c) continue;
    if (c.showCondition && !checkCondition(c.showCondition, state)) continue;
    if (!c.input) {
      const ok = checkCondition(c.condition, state);
      if (!ok && c.elseScene === undefined) continue;
    }
    n++;
  }
  return n;
}

// 返回应落到的历史下标；整条历史都是单选项链时返回栈顶（= 旧行为，不至于无处可去）
function findBacktrackIndex() {
  const from = Math.max(0, historyStack.length - BACKTRACK_SCAN_CAP);
  for (let i = historyStack.length - 1; i >= from; i--) {
    const h = historyStack[i];
    if (!h || !h.gameState) continue;
    // 旧档快照可能缺后加的变量键 → 字符串条件抛 ReferenceError → 被判成"不可见"。
    // 先补齐默认值再判（与 applySave/backtrack 对快照的处置一致，只补缺、不覆盖）。
    fillMissingDefaults(h.gameState);
    const probe = snapshotState(h.gameState);
    if (countSceneChoices(h.sceneId, probe) > 1) return i;
  }
  return historyStack.length - 1;
}

function backtrack() {
  if (historyStack.length === 0) return;
  stopTyping();
  clearQTE();   // 终止 QTE
  clearMemoryFlash(); // 终止记忆闪色动画
  const idx = findBacktrackIndex();     // 最近的「有 ≥2 个选项」的历史节点
  const prev = historyStack[idx];
  historyStack.length = idx;            // 落点及其之后的历史全部作废（多余的步数一并丢弃）
  // 回调到旧快照同样要补默认值：栈里可能有读档时带进来的旧项（见 applySave）
  gameState = fillMissingDefaults(prev.gameState);
  // 旧存档的历史项没有 reactiveState：保留当前节流记录比清空安全（清空会让已付过的规则立刻重新武装）
  if (prev.reactiveState) _reactiveState = prev.reactiveState;
  refreshComputed();   // 与 applySave 同理：旧快照缺的派生变量在渲染前补齐
  currentScene = prev.sceneId;

  // 历史清空则隐藏顶部按钮
  if (historyStack.length === 0) {
    backtrackBtn.style.display = 'none';
  }

  // 回溯时跳过 onEnter，避免效果重复触发
  syncRulesPanel();   // 手册已随快照回退，面板若开着要立刻反映回去
  renderRestoredScene(currentScene);   // 内部即 renderScene(sceneId, true)
}

// 显示文本插值：把 {变量名} 替换为 gameState 当前值，并应用 _display 格式化
// （场景 text 与选项 text 共用。parseRedirectTarget 面向场景ID跳转、不做 _display，故不通用）
function interpolateDisplay(text, state) {
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    var val = state[key];
    if (val !== undefined) {
      var fmt = storyData._display && storyData._display[key];
      if (fmt) val = fmt(val);
      return val;
    }
    return match;
  });
}

// 解析选项文本：与场景 text 一致，支持 {变量名} 插值和函数形式（函数返回值同样会做插值）
function resolveChoiceText(choice) {
  var raw = typeof choice.text === "function" ? choice.text(gameState) : (choice.text || "");
  return interpolateDisplay(raw, gameState);
}

// ====== 选项文本：受限 HTML（白名单标签 + 白名单 class）======
// 背景：选项此前一律 textContent（引擎 820/910/969），剧情里写 <span> 会被原样显示成文本。
// 现在放行行内标签，但先用 DOMParser 洗一遍：非白名单标签降级成纯文本（文字不丢、标签丢），
// 非白名单属性全部丢弃。因此 style/script/on* 不可能存活，玩家手写内容（日记本）也进不来。
// ⚠ 新增 class 时必须同时改两处：style.css 的 .类 定义 + 下面的 CHOICE_HTML_CLASSES。
const CHOICE_HTML_TAGS = new Set(["SPAN", "B", "STRONG", "I", "EM", "SMALL", "MARK", "CODE", "BR", "SUB", "SUP"]);
const CHOICE_HTML_CLASSES = new Set([
  "sys", "warn", "crit", "numb",        // 系统/UI
  "sfx", "shout", "rot",                // 声音
  "smell", "think", "mem",              // 感官/叙事
  "leaf", "water", "fire", "dust", "gore", "chem",  // 环境
  "hand", "print", "term", "sign",      // 载体
  "num", "clock", "end",                // 数值/时间/结局
  "death", "memory", "inner"            // 死亡结局 / 显示别名（见 style.css 同节）
]);

function sanitizeInlineHtml(html) {
  const src = html == null ? "" : String(html);
  if (src.indexOf("<") === -1) return src;              // 无标签：走原路径，零开销
  let doc;
  try {
    doc = new DOMParser().parseFromString("<div id='__r'>" + src + "</div>", "text/html");
  } catch (e) {
    return src.replace(/<[^>]*>/g, "");                 // 极端兜底：全剥标签，只留文字
  }
  const root = doc.getElementById("__r");
  if (!root) return src.replace(/<[^>]*>/g, "");

  (function walk(node) {
    const children = Array.prototype.slice.call(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 3) continue;               // 文本节点，保留
      if (child.nodeType !== 1) { child.remove(); continue; }
      if (!CHOICE_HTML_TAGS.has(child.tagName)) {       // 非白名单标签：降级为纯文本
        child.replaceWith(doc.createTextNode(child.textContent));
        continue;
      }
      const attrs = Array.prototype.slice.call(child.attributes);
      for (const a of attrs) {
        if (a.name === "class") {
          const keep = String(a.value).split(/\s+/).filter(c => CHOICE_HTML_CLASSES.has(c));
          if (keep.length) child.setAttribute("class", keep.join(" "));
          else child.removeAttribute("class");
        } else {
          child.removeAttribute(a.name);                // 其余属性（style/on*/src…）全部丢弃
        }
      }
      walk(child);
    }
  })(root);

  return root.innerHTML;
}

// 选项文本统一入口：先插值（resolveChoiceText）再洗标签
function setChoiceText(el, choice) {
  el.innerHTML = sanitizeInlineHtml(resolveChoiceText(choice));
}

// ====== 渲染选项 ======
// 普通选项按钮的统一创建（renderChoices 与黑暗光锥的即时选项共用）：
// 点击链路 = clearQTE → condition 分支 → ackRollOnce → pushHistory → effect → 跳转，与常规选项完全一致
function createChoiceButton(choice) {
  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.innerHTML = sanitizeInlineHtml(resolveChoiceText(choice));   // 受限 HTML（见 sanitizeInlineHtml 注释）

  btn.addEventListener("click", () => {
      clearQTE();   // 安全起见，也清理一下
      const nowCondMet = checkCondition(choice.condition, gameState);
      ackRollOnce(gameState);   // 玩家真正走了这一步 → 把本局掷定过的一次性事实记进历史
      pushHistory();
    if (nowCondMet) {
      if (choice.effect) applyEffect(choice.effect);
      currentScene = parseRedirectTarget(choice.nextScene, gameState);
    } else {
      currentScene = parseRedirectTarget(choice.elseScene, gameState)
                  || parseRedirectTarget(choice.nextScene, gameState);
    }
    renderScene(currentScene);
  });
  return btn;
}

function renderChoices(scene, sceneId) {
  choicesArea.innerHTML = "";

  // 解析 choices：支持函数（每次动态生成）和静态数组
  let _choices = scene.choices;
  if (typeof _choices === 'function') {
    _choices = _choices(gameState);
  }

  // 打乱选项顺序，防止玩家形成肌肉记忆
  // scene.fixedChoices = true 时跳过：选项顺序即空间方位（前后左右），乱序会摧毁方位感
  if (!scene.fixedChoices && _choices && _choices.length > 0) {
    for (let i = _choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_choices[i], _choices[j]] = [_choices[j], _choices[i]];
    }
  }

  // ===== QTE 分支（替换现有 QTE 分支）=====
  const qte = typeof scene.qte === 'function' ? scene.qte(gameState) : scene.qte;
  if (qte) {
    clearQTE();

    // === 动态 timeout：支持字符串表达式 ===
    let timeout = qte.timeout;
    if (typeof timeout === 'string') {
        try {
            const keys = Object.keys(gameState);
            const vals = Object.values(gameState);
            const fn = new Function(...keys, `return Number(${timeout});`);
            timeout = fn(...vals);
        } catch (e) {
            console.error('QTE timeout 表达式错误:', timeout, e);
            timeout = 5000;
        }
    }
    if (!timeout) timeout = 5000; // 兜底
    if (timeout < 0) timeout = 0;

    const onTimeout = qte.onTimeout;
    const hidden = qte.hidden === true;   // 是否隐藏进度条

    // === 仅非隐藏时创建浮层 UI ===
    if (!hidden) {
      startQteUi(timeout);
    }

    // === 超时跳转（隐藏/非隐藏通用） ===
    qteTimer = setTimeout(() => {
      clearQTE();
      if (onTimeout) {
        // 无选项的纯过场节点（travelScene 类：hidden QTE 自动播放）不入历史——
        // 玩家在此没有任何抉择，入档会让回溯落回过场节点并无输入地重走致命路径；
        // 有选项的 QTE 场景照常入档（超时 = 玩家没来得及选，回溯回去重选）
        if (_choices && _choices.length > 0) pushHistory();
        currentScene = parseRedirectTarget(onTimeout, gameState);
        renderScene(currentScene);
      } else {
        console.warn("QTE 超时，但没有定义 onTimeout 场景");
      }
    }, timeout);

    // 渲染选项按钮（排列方向由 style.css 决定：桌面横排 / 手机纵排）
    if (_choices && _choices.length > 0) {
      _choices.forEach(choice => {
        // showCondition 不满足 → 不显示该选项
        if (choice.showCondition && !checkCondition(choice.showCondition, gameState)) return;

        const condMet = checkCondition(choice.condition, gameState);
        if (!condMet && !choice.elseScene) return;

        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.innerHTML = sanitizeInlineHtml(resolveChoiceText(choice));   // 受限 HTML（QTE 内选项）

        btn.addEventListener("click", () => {
          clearQTE();
          const nowCondMet = checkCondition(choice.condition, gameState);
          pushHistory();
          if (nowCondMet) {
            if (choice.effect) applyEffect(choice.effect);
            currentScene = parseRedirectTarget(choice.nextScene, gameState);
          } else {
            currentScene = parseRedirectTarget(choice.elseScene, gameState)
                        || parseRedirectTarget(choice.nextScene, gameState);
          }
          renderScene(currentScene);
        });

        choicesArea.appendChild(btn);
      });
    }

    if (!_choices || _choices.length === 0) {
      // 过场动画（typewriter）纯自动播放，不显示"倒计时中"占位
      if (!qte.typewriter) {
        const noChoiceMsg = document.createElement("p");
        noChoiceMsg.textContent = "……";
        choicesArea.appendChild(noChoiceMsg);
      }
    }

    choicesArea.style.display = "flex";
    return;
  }

  // ===== 原普通 choices 渲染逻辑=====
  // 排列方向由 style.css 决定：桌面横排 / 手机纵排

  if (_choices && _choices.length > 0) {
    let visibleCount = 0;

    _choices.forEach(choice => {
    // showCondition 不满足 → 不显示该选项
    if (choice.showCondition && !checkCondition(choice.showCondition, gameState)) return;

    const hasElse = choice.elseScene !== undefined;

    // 输入型选项的 condition 依赖提交时的 _input，渲染期不检查（可见性由 showCondition 控制）
    if (!choice.input) {
      const condMet = checkCondition(choice.condition, gameState);
      if (!hasElse && !condMet) return;
    }
    visibleCount++;

    // === INPUT 型选项 ===
    if (choice.input) {
      const container = document.createElement("div");
      container.className = "choice-input-container";

      const label = document.createElement("div");
      label.className = "choice-input-label";
      label.innerHTML = sanitizeInlineHtml(resolveChoiceText(choice));   // 受限 HTML（输入型选项标签）
      container.appendChild(label);

      const row = document.createElement("div");
      row.className = "choice-input-row";

      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "choice-input-field";
      if (choice.input.placeholder) inp.placeholder = choice.input.placeholder;
      if (choice.input.maxLength) inp.maxLength = choice.input.maxLength;
      row.appendChild(inp);

      const sbtn = document.createElement("button");
      sbtn.className = "choice-btn choice-input-submit";
      sbtn.textContent = "确认";
      row.appendChild(sbtn);

      container.appendChild(row);
      choicesArea.appendChild(container);
      if (choice.timeout !== undefined && choice.timeoutScene === undefined) {
        container.dataset.choiceTimed = "true";
      }

      const submit = () => {
        // 输入只负责采集：写入 _input，之后与普通按钮完全一致地走 condition 分支
        gameState._input = inp.value.trim();
        clearQTE();
        pushHistory();
        if (checkCondition(choice.condition, gameState)) {
          if (choice.effect) applyEffect(choice.effect);
          currentScene = parseRedirectTarget(choice.nextScene, gameState);
        } else {
          currentScene = parseRedirectTarget(choice.elseScene, gameState)
                      || parseRedirectTarget(choice.nextScene, gameState);
        }
        renderScene(currentScene);
      };

      sbtn.addEventListener("click", submit);
      inp.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
      setTimeout(() => inp.focus(), 50);
      return; // 跳过普通按钮
    }

    const btn = createChoiceButton(choice);

    choicesArea.appendChild(btn);
    if (choice.timeout !== undefined && choice.timeoutScene === undefined) {
      btn.dataset.choiceTimed = "true";
    }
  });

  if (visibleCount === 0) {
    const noChoiceMsg = document.createElement("p");
    noChoiceMsg.textContent = "（没有可行的选择……剧情终止）";
    choicesArea.appendChild(noChoiceMsg);
    appendBacktrackToChoices(scene);
    appendDeathRestart(scene);
  }
  } else {
    const endMsg = document.createElement("p");
    endMsg.className = "end-msg";
    endMsg.textContent = "— 剧 终 —";
    choicesArea.appendChild(endMsg);
    appendBacktrackToChoices(scene);
    appendDeathRestart(scene);
  }

  choicesArea.style.display = "flex";

  // ===== Per-choice QTE（选项级倒计时） =====
  if (!scene.qte && _choices && _choices.length > 0) {
    let timedChoice = null;
    let timedTimeout = 0;

    for (const choice of _choices) {
      if (choice.showCondition && !checkCondition(choice.showCondition, gameState)) continue;
      // 输入型选项的 condition 在提交时才求值，这里不做过滤
      if (!choice.input) {
        const condMet = checkCondition(choice.condition, gameState);
        if (!condMet && !choice.elseScene) continue;
      }

      if (choice.timeout !== undefined) {
        timedChoice = choice;
        let timeout = choice.timeout;
        if (typeof timeout === 'string') {
          try {
            const keys = Object.keys(gameState);
            const vals = Object.values(gameState);
            const fn = new Function(...keys, `return Number(${timeout});`);
            timeout = fn(...vals);
          } catch (e) {
            console.error('Choice timeout 表达式错误:', timeout, e);
            timeout = 5000;
          }
        }
        timedTimeout = Math.max(0, timeout || 5000);
        // 触屏输入补时：只放宽"敲字"这一段
        if (IS_TOUCH && choice.input && TOUCH_INPUT_FACTOR > 1) {
          const flashPart = memFlashDuration(gameState);
          const inputPart = Math.max(0, timedTimeout - flashPart);
          timedTimeout = flashPart + Math.round(inputPart * TOUCH_INPUT_FACTOR);
        }
        break;
      }
    }

    if (timedChoice) {
      clearQTE();
      startQteUi(timedTimeout);

      qteTimer = setTimeout(() => {
        clearQTE();
        if (timedChoice.timeoutScene !== undefined) {
          // 有 timeoutScene → 跳转
          const target = parseRedirectTarget(timedChoice.timeoutScene, gameState);
          if (target) {
            pushHistory();
            currentScene = target;
            renderScene(target);
          }
        } else {
          // 无 timeoutScene → 仅移除该选项，保留其他选项
          const el = choicesArea.querySelector('[data-choice-timed="true"]');
          if (el) {
            el.style.transition = 'opacity 0.6s';
            el.style.opacity = '0';
            setTimeout(() => {
              el.remove();
              if (choicesArea.children.length === 0) {
                const endMsg = document.createElement("p");
                endMsg.textContent = "（你没有及时做出选择…）";
                choicesArea.appendChild(endMsg);
                appendBacktrackToChoices(scene);
                appendDeathRestart(scene);
              }
            }, 600);
          }
        }
      }, timedTimeout);
    }
  }
}

// ====== 掷骰只掷一次（rollOnce：把"一次性事实"钉死在时间线上）======
// 用途：剧情在 onEnter 里掷骰决定一个**本局不再改变的事实**（如"你过去有没有办过校友卡"）。
// 引擎每次 renderScene 都会执行函数型 onEnter，所以裸写 `if (v.x === undefined) v.x = 掷骰()`
// 到不了预期：`_variables` 里的默认值不是 undefined，条件永不成立，骰子一次都不掷
// （2026-10-04 波波报告"每次刷新都是没办过"就是这个坑）。
//
// 语义：按 **rollOnce 组** 记账，同一组内只掷一次。
//   · 回溯 → pushHistory 的快照**不含**该组 → 自动重新武装 → **回溯即可重掷**。
//     这正是我们要的：「你失败了，下辈子注意点」的叙事契约就是允许换一条时间线。
//   · 死亡重开/手动重开 → restartRun 把 gameState 整体重置回 _variables（_rollOnce 不在其中）→
//     组标记清空、重新武装 → **重掷**（重开即新一局；2026-10-27 审校探针实证，旧注释"保留"有误）。
//   · 刷新续玩/读档 → 组标记随存档/快照恢复 → 不重掷，避免刷新即改命。
// 写法：`onEnter: function (v) { if (rollOnce(v, "card")) v._cardLuck = Math.random() < .3 ? 0 : 1; return {}; }`
// ⚠ 掷骰结果变量仍必须注册进 `_variables`，否则依赖它的 showCondition 会静默失效（lint_story 会抓）。
const ROLL_ONCE_KEY = "_rollOnce";
function rollOnce(state, group) {
      if (!state[ROLL_ONCE_KEY] || typeof state[ROLL_ONCE_KEY] !== "object") state[ROLL_ONCE_KEY] = {};
  if (state[ROLL_ONCE_KEY][group]) return false;   // 已掷过
  state[ROLL_ONCE_KEY][group] = true;
  return true;
}

// 把「场景里掷过的一次性事实」记进历史栈顶那份快照。
// 时机：玩家点下选项、pushHistory() **之前**调用——落点的快照就带上了本次掷骰结果。
// 为什么需要：rollOnce 的记账存在快照里，若落点不含它，回溯时快照回退 → 重新武装 → 又掷一次。
//   记上之后，「没回头→刷新→重进」不会重掷，而「回溯到掷骰之前」照样能重掷。
function ackRollOnce(state) {
  const m = state && state[ROLL_ONCE_KEY];
  if (!m || typeof m !== "object") return;
  const top = historyStack[historyStack.length - 1];
  if (!top || !top.gameState) return;
  top.gameState[ROLL_ONCE_KEY] = Object.assign({}, m);
}

// 辅助函数
function appendBacktrackToChoices(scene) {
  if (historyStack.length === 0) return;
  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.style.background = "rgba(180, 140, 60, 0.45)";  // 金色调区分
  btn.style.border = "1px solid rgba(200, 160, 80, 0.5)";
  btn.textContent = scene.backtrack ||
    (storyData._meta && storyData._meta.backtrackText) || "↩ 回溯上一步";
  btn.addEventListener("click", backtrack);
  choicesArea.appendChild(btn);
}

// 死亡重开按钮：deathRestart: true 的死亡结局节点专用（紫色区分于金色回溯）。
// 走 restartRun(true)：死亡计数+1、手册状态落账本，start 场景 onEnter 再回灌。
function appendDeathRestart(scene) {
  if (!scene.deathRestart) return;
  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.style.background = "rgba(90, 60, 120, 0.5)";
  btn.style.border = "1px solid rgba(150, 110, 190, 0.6)";
  btn.textContent = scene.deathRestartText ||
    (storyData._meta && storyData._meta.deathRestartText) || "🌅 重新开始";
  btn.addEventListener("click", function () { restartRun(true); });
  choicesArea.appendChild(btn);
}

// ====== 黑暗光锥（darkSearch：暗图 + 提亮双层 + 遮罩，光照 dwell 发现热点）======
// 数据格式见 docs/templates/引擎语法手册.md「黑暗光锥」节。设计要点：
// · 发现即互动：热点可挂 choice（完整普通选项语义）——照亮瞬间追加渲染到下方
//   选项区（choice-new 入场动画），点击走 createChoiceButton 统一链路；
//   已发现（var=true）的热点，进场景时直接补渲染其选项（按 showCondition 过滤）。
// · 发现即触发：热点可挂 onFound(vars, id) ——照满 dwellMs 识别成功时调用，
//   返回场景 ID 则自动跳转（clearQTE + pushHistory，死亡回溯落回本场景可再触发）。
//   用于"看清即引爆"类节点（如全家仓库：第二只丧尸照亮的瞬间战斗开始）；
//   正常触发后 choice 不再出现（场景已切走），但保留 choice 可作回溯落回时的手动兜底。
// · 光圈与 dwell 累计是纯 UI 态（不进 gameState、不进存档）；已发现态由剧情声明的
//   var 持久化（须先在 _variables 注册），回溯/读档随快照还原，重进场景直接标 ✓。
// · 刻意不做进度环：照没照到东西本身就是玩家的观察课题，进度反馈等于报答案。
// · 光源档自动推断：hasFireTorch（暖色 14%）> hasTorch（18%）> 手机微光（10%+压暗）；
//   darkSearch.light 可覆盖（"torch"/"fire"/"phone"）。手机档光圈最小，且遮罩中央也压
//   一层半透暗（CSS dark-phone）——暗处细字（标语/铭牌）基本不可辨、只够找大件，
//   形成"弱光找路更难"的梯度；电量消耗由剧情在入口扣（照明分级惯例，引擎不管电）。
//   无光源则机制不激活（剧情应已门槛拦住）。
// · 与 imageZoom 互斥（renderScene 图片节强制不显示角标，查看器会全屏亮图穿帮）；
//   与场景级 QTE 可叠加（倒计时不暂停，压力版搜索；onFound 自动跳转会先 clearQTE）。
const DARK_TORCH_R = 0.18;     // 手电光圈半径（占图片显示宽）
const DARK_FIRE_R  = 0.14;     // 火把光圈（小一点，暖色）
const DARK_PHONE_R = 0.10;     // 手机微光光圈（最小；配合遮罩中央压暗层，见 #image-area.dark-phone）
const DARK_MOBILE_DY = -56;    // 触屏光圈中心上移，别让手指盖住光

let darkActive = false;
let darkSpots = [];
let darkDwellMs = 600;
let darkLight = { img: { x: 0, y: 0 }, frame: { x: 0, y: 0 }, active: false };
let darkLoopOn = false;
let darkLastT = 0;
let darkLitLayer = null, darkMask = null;
let darkCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

function ensureDarkLayers() {
  if (darkLitLayer) return;
  darkLitLayer = document.createElement("img");
  darkLitLayer.id = "dark-lit-layer";
  darkMask = document.createElement("div");
  darkMask.id = "dark-mask";
  sceneImage.insertAdjacentElement("afterend", darkLitLayer);
  darkLitLayer.insertAdjacentElement("afterend", darkMask);
}

// 显示几何：镜像 #scene-image 的 object-fit（桌面 cover / 手机 contain），坐标在图片像素空间结算
function darkFit() {
  const W = imageArea.clientWidth, H = imageArea.clientHeight;
  const w = sceneImage.naturalWidth, h = sceneImage.naturalHeight;
  if (!w || !h) return null;
  const contain = getComputedStyle(sceneImage).objectFit === "contain";
  const s = contain ? Math.min(W / w, H / h) : Math.max(W / w, H / h);
  return { W: W, H: H, scale: s, offX: (W - w * s) / 2, offY: (H - h * s) / 2, dW: w * s };
}

function startDarkSearch(scene) {
  const cfg = scene && scene.darkSearch;
  if (!cfg || !Array.isArray(cfg.spots) || !cfg.spots.length) return;
  let tier = typeof cfg.light === "function" ? cfg.light(gameState) : cfg.light;
  if (!tier) tier = gameState.hasFireTorch ? "fire"
    : (gameState.hasTorch ? "torch"
    : ((gameState.hasPhone && gameState.phoneBattery > 0) ? "phone" : ""));
  if (!tier) return;   // 防御：无光源按普通场景渲染（剧情应已用选项门槛拦住进入）
  ensureDarkLayers();
  darkSpots = cfg.spots.map(function (s) {
    return {
      id: s.id || "什么",
      x: +s.x || 0, y: +s.y || 0, r: (s.r != null ? +s.r : 0.10),
      var: s.var || "", decoy: !!s.decoy, choice: s.choice || null,
      onFound: s.onFound || null, acc: 0,
      found: !!(s.var && gameState[s.var])   // 已发现（var 持久化）：不再判定，直接标 ✓
    };
  });
  darkDwellMs = +cfg.dwellMs || 600;
  darkActive = true;
  darkLight.active = false;
  darkLitLayer.src = sceneImage.src;   // 提亮层同图：圈外被遮罩压黑，圈内提亮=照亮
  darkLitLayer.classList.toggle("fire", tier === "fire");
  darkLitLayer.classList.toggle("phone", tier === "phone");
  imageArea.classList.add("dark-searching");
  imageArea.classList.toggle("dark-fire", tier === "fire");
  imageArea.classList.toggle("dark-phone", tier === "phone");
  imageArea.style.setProperty("--lr", "0px");   // 首次移动前光圈收拢，全黑入场
  clearDarkMarkers();
  darkSpots.forEach(function (s) {
    if (!s.found) return;             // 只补渲染已发现热点——未发现的选项必须等照亮
    addDarkMarker(s);
    darkRenderSpotChoice(s, false);   // 已发现热点：选项直接补渲染（无动画）
  });
  darkLastT = 0;
  if (!darkLoopOn) { darkLoopOn = true; requestAnimationFrame(darkLoop); }
  // 触屏+竖屏进场时提示横屏（横屏侧栏布局下图幅约 1.7 倍，找路标/看细节更省力）；
  // 仅提示不强转（浏览器无权锁方向）。matchMedia 现场求值——同一局中旋转不重弹。
  if (darkCoarse && window.matchMedia && window.matchMedia("(orientation: portrait)").matches) {
    flashStatusWarning("🔄 横屏视野更大，建议旋转手机");
  }
}

function closeDarkSearch() {
  darkActive = false;
  darkSpots = [];
  imageArea.classList.remove("dark-searching", "dark-fire", "dark-phone");
  clearDarkMarkers();
}

function darkLoop(t) {
  darkLoopOn = false;
  if (!darkActive) return;
  const dt = darkLastT ? Math.min(t - darkLastT, 250) : 0;   // 切后台回来不补算
  darkLastT = t;
  if (dt > 0 && darkLight.active && sceneImage.naturalWidth) {
    for (const s of darkSpots) {
      if (s.found) continue;
      if (darkInRange(s)) {
        s.acc += dt;
        if (s.acc >= darkDwellMs) { s.found = true; s.acc = 0; darkFind(s); }
      } else {
        s.acc = 0;   // 光圈移出命中圈即清零（spot_picker 同语义）
      }
    }
  }
  darkLoopOn = true;
  requestAnimationFrame(darkLoop);
}

// 光圈中心是否落在热点命中圈内（图片像素空间，r 以图片宽为基准）
function darkInRange(s) {
  const dx = darkLight.img.x - s.x * sceneImage.naturalWidth;
  const dy = darkLight.img.y - s.y * sceneImage.naturalHeight;
  const rr = s.r * sceneImage.naturalWidth;
  return dx * dx + dy * dy <= rr * rr;
}

function darkFind(s) {
  if (s.var) gameState[s.var] = true;   // 直改（同剧情 onEnter 直改惯例），rAF 里不走 applyEffect
  flashStatusWarning("🔦 你看清了——" + s.id);
  addDarkMarker(s);
  darkRenderSpotChoice(s, true);        // 发现即互动：选项带动画追加进下方选项区
  // 发现即触发：onFound 返回场景 ID 则自动跳转（"看清即引爆"类节点）。
  // clearQTE 不带旧倒计时进新场景（否则偷袭场的时限会在战斗里归零杀人）；
  // pushHistory 让死亡回溯落回本场景——已发现态持久，兜底 choice 可手动再触发或撤退。
  if (typeof s.onFound === "function") {
    var target = s.onFound(gameState, s.id);
    if (target) {
      clearQTE();
      pushHistory();
      currentScene = parseRedirectTarget(target, gameState);
      renderScene(currentScene);
    }
  }
}

// 热点互动选项：完整普通选项语义（showCondition/condition/elseScene/effect/nextScene），
// 与 renderChoices 同一套可见性过滤，按钮走 createChoiceButton 统一点击链路
function darkRenderSpotChoice(s, animate) {
  if (!s.choice) return;
  if (s.choice.showCondition && !checkCondition(s.choice.showCondition, gameState)) return;
  if (!s.choice.input && s.choice.elseScene === undefined && !checkCondition(s.choice.condition, gameState)) return;
  const btn = createChoiceButton(s.choice);
  if (animate) btn.classList.add("choice-new");
  choicesArea.appendChild(btn);
  choicesArea.style.display = "flex";   // 保险：场景本身没有常规选项时也把选项区撑开
}

function darkRadius() {
  if (imageArea.classList.contains("dark-fire")) return DARK_FIRE_R;
  if (imageArea.classList.contains("dark-phone")) return DARK_PHONE_R;
  return DARK_TORCH_R;
}

function addDarkMarker(s) {
  if (!s.found) return;
  const el = document.createElement("div");
  el.className = "dark-found-mark";
  el.textContent = "✓ " + s.id;
  positionDarkMarker(el, s);
  imageArea.appendChild(el);
}
function positionDarkMarker(el, s) {
  const f = darkFit();
  if (!f) return;
  el.style.left = (s.x * sceneImage.naturalWidth * f.scale + f.offX) + "px";
  el.style.top = (s.y * sceneImage.naturalHeight * f.scale + f.offY) + "px";
}
function clearDarkMarkers() {
  Array.prototype.forEach.call(imageArea.querySelectorAll(".dark-found-mark"), function (n) { n.remove(); });
}

// 指针驱动光圈：移动/按下=更新位置，离开图片区=暂停累计；触屏中心上移防手指遮挡
function darkPointer(e) {
  if (!darkActive) return;
  const f = darkFit();
  if (!f) return;
  const rect = imageArea.getBoundingClientRect();
  const fx = e.clientX - rect.left;
  const fy = e.clientY - rect.top + (darkCoarse ? DARK_MOBILE_DY : 0);
  darkLight.frame.x = fx; darkLight.frame.y = fy;
  darkLight.img.x = (fx - f.offX) / f.scale;
  darkLight.img.y = (fy - f.offY) / f.scale;
  darkLight.active = true;
  imageArea.style.setProperty("--lx", fx + "px");
  imageArea.style.setProperty("--ly", fy + "px");
  imageArea.style.setProperty("--lr", (darkRadius() * f.dW) + "px");
}
imageArea.addEventListener("pointermove", darkPointer);
imageArea.addEventListener("pointerdown", darkPointer);
imageArea.addEventListener("pointerleave", function () { darkLight.active = false; });
window.addEventListener("resize", function () {
  if (!darkActive) return;
  clearDarkMarkers();
  darkSpots.forEach(addDarkMarker);
  // 旋转/窗口变化后旧光圈坐标已不可信（darkFit 几何全变）：收拢光圈并暂停 dwell 累计，
  // 等下一次 pointermove 用新几何重建位置+半径——避免残留一个错位亮圈、甚至静默错判热点。
  darkLight.active = false;
  imageArea.style.setProperty("--lr", "0px");
});

// ====== 核心渲染 ======
function renderScene(sceneId, skipOnEnter = false, _depth = 0) {
  // 防递归过深
  if (_depth > 3) {
    console.error("全局触发器递归层数过多，已中断");
    return;
  }
  clearSegments();   // 必须在 stopTyping 之前：token 先作废，stopTyping 触发旧分段回调时静默失效
  stopTyping();
  closeImageViewer();   // 换场景（选项/QTE/回溯/重启/全局触发器）一律关闭查看器，单一 hook 点
  closeDarkSearch();    // 光锥层同理：换场景一律卸载（纯 UI 态不进存档）

  // 进入新场景时重置展开状态
  document.getElementById("text-area").classList.remove("text-expanded");
  document.getElementById("choices-area").classList.remove("text-expanded");
  // 内部滚动条回顶（手机端紧凑布局下文字/选项区各自可滚）
  document.getElementById("text-area").scrollTop = 0;
  choicesArea.scrollTop = 0;

  if (!gameState || (Object.keys(gameState).length === 0 && storyData && storyData._variables)) {
    console.warn("【引擎】检测到 gameState 为空，重新初始化变量。");
    initGameState();
  }

  const scene = storyData[sceneId];
  if (!scene) {
    sceneText.textContent = "【错误：找不到场景 " + sceneId + "】";
    choicesArea.innerHTML = "";
    choicesArea.style.display = "none";
    return;
  }

  // 记录上一个场景ID（供目标场景 text 用 _lastScene 差异化承接拾取/事件）
  gameState._lastScene = lastRenderedScene;
  lastRenderedScene = sceneId;

  // 自动记录场景访问次数（回溯时跳过），在onEnter执行之前记录
  if (!skipOnEnter) {
    gameState._visit = gameState._visit || {};
    gameState._visit[sceneId] = (gameState._visit[sceneId] || 0) + 1;
  }

  // 解析进入效果（支持函数模式）
  // ⚠ skipOnEnter 时必须连函数调用一起跳过：函数型 onEnter 普遍带直接改 gameState 的
  // 副作用（transit 回头检测 +ch、updateTime 闭包推进时间/累计疲劳、initMemoryGame 重掷序列等），
  // 只拦 applyEffect 拦不住这些——回溯/读档恢复时副作用会重复执行（曾有回溯落地即再次触发
  // 全局触发器回到死亡节点、疲劳被重复扣档的 bug）。
  const prevSeq = gameState._currentSeq;  // 闪色序列快照（识别本场景是否新生成了序列）
  let enterEffect = scene.onEnter;
  if (typeof enterEffect === "function") {
    enterEffect = skipOnEnter ? null : enterEffect(gameState);
  }

  // 进入效果（回溯时跳过）
  if (enterEffect && !skipOnEnter) {
    applyEffect(enterEffect);
  }

  // 记忆闪色：本场景 onEnter 生成了新序列 → 记录属主场景 ID，
  // 供回溯/读档恢复时判断"这个序列是不是当前场景的"，避免在无关场景误播旧序列
  if (!skipOnEnter && gameState._currentSeq && gameState._currentSeq !== prevSeq) {
    gameState._seqScene = sceneId;
  }

  // 全局触发器：在状态更改后立即检查是否有触发
  // ⚠ 结局场景是终态，不再响应全局触发器——否则夜晚（hh>=19）进入任何过夜死亡结局时，
  // 「天黑必须过夜」触发器（priority 5）会在结局落地瞬间再次命中，把玩家弹回过夜菜单，
  // 结局画面永远不可达（2026-10-01 波波报告：Day2 在自己家过夜本该触发死亡结局，却弹回菜单）。
  // 过夜安全屋不受影响：其 onEnter 先把 hh 拨回 7，触发器本就不会命中。
  // 触发器目标本身是结局的（如 结局-体力耗尽）原本就因 resolved === currentScene 天然豁免，
  // 此守卫补齐其余结局。非「结局」前缀的结局全库仅 4 个且均为静态文案（见
  // tools/night_ending_bounce_selftest.js 的命名检查），第二条判定按静态文案兜底。
  // ⚠派生量兜底下放：车库的 `_garDenTotal` 是 computed 派生量，只在 applyEffect/applySave 里重算；
  // 而密度是在 onEnter 里**直接写** `v[denKey]` 的（不走 applyEffect）→ 默认会滞后一笔，
  // 导致同场景自己的 QTE 时限读到旧密度（点火 surge 全库+9 却给出满时限 8.0s）。
  // 这里在「触发器 + QTE 时限」两处求值之前补一次重算，让两者都拿到最新值。
  // 只重算 computed、不跑 rules（不会提前结算饥饿/疲劳）。
  refreshComputed();

  const isEndingScene = sceneId.startsWith("结局") ||
    (typeof scene.text === "string" && scene.text.includes("—— 结局："));
  if (!isEndingScene) {
    const triggeredScene = checkGlobalTriggers(sceneId);
    if (triggeredScene) {
      currentScene = triggeredScene;
      // 跳过当前场景的渲染，直接跳转至结局
      renderScene(triggeredScene, false, _depth + 1);
      return;
    }
  }

  // ★ 场景抖动（onEnter 中声明 shake: true）
  if (enterEffect && enterEffect.shake && !skipOnEnter) {
    triggerShake();
  }
  // ★ 屏幕特效（根据 _screenEffects 配置自动应用）
  applyScreenEffects();

  // 图片
  let imageSrc = "";
  if (typeof scene.image === "function") {
    imageSrc = scene.image(gameState) || "";
  } else {
    imageSrc = scene.image || "";
  }
  if (imageSrc) {
    sceneImage.src = imageSrc;
    sceneImage.style.display = "block";
  } else {
    sceneImage.style.display = "none";
  }
  // 图片查看器门票：仅标记场景显示角标、允许点击放大（每场景重置，同 showRain 惯例）
  // darkSearch 场景强制不给门票——查看器全屏展示亮图，黑暗当场穿帮
  viewerZoomable = !!scene.imageZoom && !!imageSrc && !scene.darkSearch;
  zoomBadge.style.display = viewerZoomable ? "block" : "none";
  imageArea.classList.toggle("image-zoomable", viewerZoomable);

  choicesArea.style.display = "none";

  let displayText = "";
  let textIsSegmented = false;
  if (typeof scene.text === "function") {
    displayText = scene.text(gameState);          // 把当前状态传给函数
  } else {
    displayText = scene.text || "";
  }
  if (Array.isArray(displayText)) {
    // 分段文本：text 数组（函数返回数组同样生效），每段独立做 {变量} 插值
    textIsSegmented = true;
    displayText = displayText.map(s => interpolateDisplay(String(s), gameState));
    if (displayText.length === 0) { textIsSegmented = false; displayText = ""; }
  } else {
    displayText = interpolateDisplay(displayText, gameState);
  }

  sceneText.style.cssText = '';
  if (scene.style) {
    if (typeof scene.style === 'string') {
      sceneText.style.cssText = scene.style;
    } else if (typeof scene.style === 'object') {
      for (const [prop, val] of Object.entries(scene.style)) {
        const cssProp = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        sceneText.style.setProperty(cssProp, val);
      }
    }
  }

  syncRulesPanel();   // 每个场景走完后同步一次手册（针对不经 applyEffect 的直写 rsRxx）

  const textArea = document.getElementById("text-area");
  // 文本框是否显示？（分段文本：所有段都为空才隐藏）
  const textEmpty = textIsSegmented ? displayText.every(s => s === "") : displayText === "";
  if (textEmpty) {
    textArea.style.visibility = 'hidden';
  } else {
    textArea.style.visibility = 'visible';
  }

  // 回溯/读档（skipOnEnter）落回闪色战斗场景：序列保持原样（时间倒流，答案不变），但重播动画——
  // 否则没记住序列的玩家会被永久卡死。放在全局触发器检查之后，避免重定向到的场景误播。
  if (skipOnEnter && gameState._seqScene === sceneId && Array.isArray(gameState._currentSeq) && gameState._currentSeq.length > 0) {
    gameState._seqPlayed = false;
  }

  const hasQte = typeof scene.qte === 'function' ? scene.qte(gameState) : scene.qte;
  if (textIsSegmented) {
    // 分段文本：逐段打字+停留；最后一段完成后才渲染选项/闪色，QTE 倒计时自此开始。
    // 分段文本总是走打字机节奏（即使场景有 qte 且未声明 typewriter——分段本身就意味着节奏化阅读）
    typeSegments(sceneText, displayText, 80, () => {
      renderChoices(scene, sceneId);
      applyMemoryFlash(gameState);
      startDarkSearch(scene);
    });
  } else if (hasQte && !hasQte.typewriter) {
    // QTE 场景直接显示文字，跳过打字机效果
    sceneText.innerHTML = displayText;
    sceneText.classList.remove("typing");
    renderChoices(scene, sceneId);  // renderChoices 内部会启动倒计时
    startDarkSearch(scene);         // QTE+光锥可叠加：倒计时走着，玩家边搜边被逼
  } else {
    // 无 QTE，或 QTE 声明了 typewriter（过场动画）：走打字机，完成后渲染选项并启动倒计时
    typeText(sceneText, displayText, 80, () => {
      renderChoices(scene, sceneId);
      applyMemoryFlash(gameState);
      startDarkSearch(scene);
    });
  }

  // 自动存档：全局触发器级联时外层会提前 return，只有最终落地的这一层走到这里，
  // 因此玩家每次动作恰好存一次（选项点击 / QTE 超时 / 回溯 / 重启皆经此路径）
  saveGame(sceneId);
}

// ====== 重新开始 ======
// 提取为全局函数：死亡重开按钮（appendDeathRestart）与右上角按钮共用。
// fromDeath=true 走死亡循环：先把本局手册状态 + 死亡计数落账本（跨周目保留），再清局内状态；
// 手动重开（false）只落账本不计数。localStorage 不可用时 persist 内部静默降级，不影响重开。
function restartRun(fromDeath) {
  if (fromDeath === undefined) fromDeath = false;   // 兼容无参调用（如控制台调试）：默认当"手动重开"
  stopTyping();
  clearQTE();   // 终止任何进行中的 QTE
  historyStack = [];          // 清空历史
  backtrackBtn.style.display = 'none';  // 隐藏回溯
  _reactiveState = {};        // 清空规则节流记录
  if (typeof persistRulesLedger === "function" && gameState) {
    if (fromDeath) gameState.deathCount = (gameState.deathCount || 0) + 1;
    persistRulesLedger(gameState);
  }
  clearSave();                // 重启 = 清档（随后 renderScene 会写入全新存档）
  initGameState();
  lastRenderedScene = "";     // 重置上一场景记录，避免旧场景串场
  applyScreenEffects();   // 重置特效
  clearMemoryFlash();     // 终止记忆闪色动画
  currentScene = "start";
  syncRulesPanel();   // 死亡重开已把手册落账并清局内状态，面板若开着要跟着回来
  renderScene(currentScene);
}
restartBtn.addEventListener("click", function () { restartRun(false); });
// 回溯按钮事件绑定
backtrackBtn.addEventListener("click", backtrack);

// ====== 自动存档（localStorage） ======
// 存档键默认按页面路径隔离：file:// 下所有页面共享同一 localStorage，固定键会跨游戏串档
// （曾用固定键 jiusailing_save_v1，930 项目沿用请设 _meta.saveKey 保持旧档延续）。部署后路径会变
// 的项目同样用 storyData._meta.saveKey 固定一个键。
const SAVE_KEY     = (typeof storyData !== "undefined" && storyData._meta && storyData._meta.saveKey) ||
  ("storyengine_save_" + encodeURIComponent(location.pathname));
const SAVE_VERSION = 1;
const HISTORY_CAP  = 30;      // 入档的回溯步数上限（内存中仍是全量）
let storageOk = true;         // 首次读写失败即静默停用（隐私模式/配额满）

// Set 的序列化：JSON 原生不支持 Set，转成 { __set: [...] } 再还原
function setReplacer(k, v) {
  return v instanceof Set ? { __set: Array.from(v) } : v;
}
function setReviver(k, v) {
  return (v && typeof v === "object" && Array.isArray(v.__set)) ? new Set(v.__set) : v;
}
// 深拷贝状态（Set 进出都保持 Set），供存档 / pushHistory / initGameState 共用
function snapshotState(state) {
  return JSON.parse(JSON.stringify(state, setReplacer), setReviver);
}

// 老存档补齐：把 _variables 里新增、而这份状态里还没有的键填回初始值。
// ⚠ 不做这一步会真炸（不是理论风险）：checkCondition 用 new Function(...Object.keys(gameState))
//   求值【字符串条件】，缺键 = 形参不存在 = ReferenceError → 整条条件直接 false，
//   选项凭空消失 + 控制台刷「条件表达式出错」。函数式条件写 vars.xxx 只会安静地拿到
//   undefined，所以症状永远只出现在字符串条件上，别被"只有一条报错"误导成单点 bug。
//   典型路径：续玩旧档 / 回溯到旧快照（两条都绕过 initGameState，拿不到新键）。
// 只补缺失键、不动已有值 —— 所以它是「新增变量」的安全兜底；
// 改字段含义/结构（语义变了，补默认值反而错）仍应把 SAVE_VERSION +1 弃档。
function fillMissingDefaults(state) {
  if (!state || typeof state !== "object") return state;
  const defs = (storyData && storyData._variables) || {};
  for (const key in defs) {
    if (!(key in state)) state[key] = snapshotState(defs[key]);
  }
  return state;
}

// 保存当前进度。在 renderScene 末尾调用——此时 onEnter 已执行、_visit 已累加、全局触发器已级联完毕
function saveGame(sceneId) {
  if (!storageOk) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version:      SAVE_VERSION,
      savedAt:      Date.now(),
      sceneId:      sceneId,
      gameState:    gameState,
      historyStack: historyStack.slice(-HISTORY_CAP),
      reactiveState: _reactiveState      // 规则节流状态，不存会导致恢复后二次扣体力
    }, setReplacer));
  } catch (e) {
    storageOk = false;
    console.warn("【存档】写入失败，本局将不再自动存档：", e);
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    console.warn("【存档】清除失败：", e);
  }
}

// 读取并校验存档；不可用则返回 null（调用方走全新开局）
function loadSave() {
  let saved;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    saved = JSON.parse(raw, setReviver);
  } catch (e) {
    storageOk = false;
    console.warn("【存档】读取失败：", e);
    return null;
  }

  if (!saved || saved.version !== SAVE_VERSION) return null;
  if (!saved.gameState || typeof saved.gameState !== "object") return null;
  if (!saved.sceneId || !storyData[saved.sceneId]) {
    console.warn("【存档】场景已不存在，弃档：", saved.sceneId);
    return null;
  }
  // 剧情改动后可能有历史场景被删除，逐项过滤
  saved.historyStack = (saved.historyStack || []).filter(function (h) {
    return h && h.sceneId && storyData[h.sceneId] && h.gameState;
  });
  return saved;
}

// 把存档写回运行状态（不负责渲染）
function applySave(saved) {
  // fillMissingDefaults：老档缺的新变量在这里补齐（详见该函数上方注释）
  gameState      = fillMissingDefaults(saved.gameState);  // Set 已由 reviver 还原
  historyStack   = saved.historyStack || [];
  // 历史快照同样来自旧档：不补的话从死屏回溯一步就报 ReferenceError
  historyStack.forEach(function (h) { if (h && h.gameState) fillMissingDefaults(h.gameState); });
  _reactiveState = saved.reactiveState || {};
  refreshComputed();   // 旧档里缺的派生变量（如 09-23 新增的 noPainSense/hasDimLight）在这里重算出来
  currentScene   = saved.sceneId;
  // ⚠️ 必须从 gameState._lastScene 恢复：renderScene 会先把 lastRenderedScene 写进
  // gameState._lastScene 再更新自己。若这里填 saved.sceneId，_lastScene 会被覆盖成当前场景，
  // 所有依赖 _lastScene 的承接句全部失效。
  lastRenderedScene = saved.gameState._lastScene || "";
  // 注意：这里不显示右上角"回溯"按钮——正常游玩中它常态隐藏（pushHistory 的显示语句被注释），
  // 回溯入口只有死亡屏的 appendBacktrackToChoices。恢复后保持一致；历史栈照常保留，死亡屏照样可回溯。
}

// 恢复渲染：跳过 onEnter（效果不重复）
function renderRestoredScene(sceneId) {
  renderScene(sceneId, true);
  applyScreenEffects();
}

// 存档摘要（不剧透场景名）
function makeSaveSummary(saved) {
  const v = saved.gameState;
  // 摘要可由 storyData._meta.saveSummary(v) 定制（项目专属日期/计数等）
  if (storyData._meta && typeof storyData._meta.saveSummary === "function")
    return storyData._meta.saveSummary(v);
  return ((v._runNumber || 1) > 1 ? "第 " + v._runNumber + " 周目 · " : "") +
    "停在「" + (saved.sceneId || "start") + "」";
}

// 启动时的存档选择框（append 到 body 末尾，不进 #game-container，避免干扰兄弟选择器）
// 文案可由 storyData._meta 覆盖：title / continueText / newText（缺省回落 document.title）
function showSaveDialog(summary, onContinue, onNew) {
  const meta = storyData._meta || {};
  const dialog = document.createElement("div");
  dialog.id = "save-dialog";
  dialog.innerHTML =
    '<div class="save-dialog-box">' +
      '<div class="save-dialog-title">' + (meta.title || document.title || "继续旅程") + '</div>' +
      '<div class="save-dialog-summary">上次进度：' + summary + '</div>' +
      '<div class="save-dialog-actions">' +
        '<button class="choice-btn" id="save-continue">' + (meta.continueText || "继续上次进度") + '</button>' +
        '<button class="choice-btn" id="save-new">' + (meta.newText || "重新开始") + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(dialog);

  document.getElementById("save-continue").addEventListener("click", function () {
    dialog.remove();
    onContinue();
  });
  document.getElementById("save-new").addEventListener("click", function () {
    dialog.remove();
    onNew();
  });
}

// ====== 图片预加载 ======
function collectImagePaths(storyData) {
  const paths = new Set();

  // 用几组典型游戏时间覆盖 timeImage() 的全部四个时段
  const timeSamples = [
    { hh: 10 },   // morning (7-15)
    { hh: 17 },   // evening (16-18)
    { hh: 20 },   // night (19-22)
    { hh: 2 }     // midnight (23-6)
  ];

  for (const [sceneId, scene] of Object.entries(storyData)) {
    if (!scene || !scene.image) continue;

    if (typeof scene.image === "string") {
      // 静态字符串 → 直接加入
      paths.add(scene.image);
    } else if (typeof scene.image === "function") {
      // 函数 → 用时间采样值尝试解析（覆盖 timeImage 的四个时段分支）
      for (const base of timeSamples) {
        try {
          const result = scene.image(base);
          if (result && typeof result === "string") {
            paths.add(result);
          }
        } catch (e) {
          // 采样值不兼容则跳过
        }
      }
    }
  }

  return Array.from(paths);
}

function preloadImages(onProgress, onComplete) {
  const paths = collectImagePaths(storyData);
  const total = paths.length;

  if (total === 0) {
    if (onComplete) onComplete();
    return;
  }

  let loaded = 0;
  console.log("【预加载】开始预加载 " + total + " 张图片...");

  for (const path of paths) {
    const img = new Image();
    const onDone = function () {
      loaded++;
      if (onProgress) onProgress(loaded, total);
      if (loaded >= total) {
        console.log("【预加载】完成，" + total + " 张图片已缓存。");
        if (onComplete) onComplete();
      }
    };
    img.onload = onDone;
    img.onerror = function () {
      console.warn("【预加载】图片加载失败（可能是路径错误）: " + path);
      onDone();
    };
    img.src = path;
  }
}

// ====== 页面启动 ======
// 预加载 + 首屏渲染。restore=true 时走"恢复存档"渲染（跳过 onEnter、补回遮罩标志）
function startPreload(sceneId, restore) {
  const overlay = document.getElementById("preload-overlay");
  const bar    = document.getElementById("preload-bar");
  const label  = document.getElementById("preload-label");

  const renderFirst = function () {
    syncRulesPanel();   // 读档/新档落地后立刻同步手册状态（面板此刻必然是关的，纯兜底）
    if (restore) renderRestoredScene(sceneId);
    else renderScene(sceneId);
  };

  if (overlay && bar) {
    // 有进度条 UI → 显示进度
    preloadImages(
      function (loaded, total) {
        const pct = Math.round((loaded / total) * 100);
        bar.style.width = pct + "%";
        if (label) label.textContent = "加载资源中… " + pct + "% (" + loaded + "/" + total + ")";
      },
      function () {
        // 预加载完成后淡出遮罩
        overlay.classList.add("preload-done");
        setTimeout(function () {
          overlay.style.display = "none";
        }, 500);
        renderFirst();
      }
    );
  } else {
    // 无 UI → 静默预加载 + 立即渲染（不阻塞游戏）
    preloadImages(null, null);
    renderFirst();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  if (typeof storyData === 'undefined') {
    console.error("【引擎】storyData 未定义！请确保 story.js 在 engine.js 之前加载。");
    sceneText.textContent = "【引擎错误】storyData 未加载。";
    return;
  }
  initGameState();

  // --- 存档检测 → 选择 → 预加载 ---
  const saved = loadSave();
  if (saved) {
    showSaveDialog(
      makeSaveSummary(saved),
      function () {                          // 继续
        applySave(saved);
        startPreload(saved.sceneId, true);
      },
      function () {                          // 从头开始
        clearSave();
        startPreload("start", false);
      }
    );
  } else {
    startPreload("start", false);
  }
});
