#!/usr/bin/env node
/**
 * 最小校验脚本（模板母本预置）—— schema 校验 + 图遍历
 *
 * 用法（在仓库根目录执行）：
 *   node tests/story-validation/validate.js                    # 校验 /story/
 *   node tests/story-validation/validate.js <目录>             # 校验指定目录
 *   node tests/story-validation/validate.js --gen-index        # 从 /lore/ 卡生成 /memory/index.json
 *   node tests/story-validation/validate.js tests/story-validation/fixtures/mini   # 冒烟自检（应全绿）
 *
 * 覆盖 CLAUDE.md 阶段 5 共性清单的机器可查项：死路、孤岛、不可达结局、变量闭环、
 * 值域越界（init/结局判据 vs min-max）、死循环（无法抵达任何结局）、文本重复、节奏带宽粗检、
 * 结局表完整性，外加伏笔台账 × 行内注释对账（固定分支/混合）。
 * 路径专属项（联通红线、环秩、回收矩阵等）在阶段 3 于本文件尾部扩展区追加。
 *
 * 阶段 3 扩展点：
 *   - 项目新增节点字段 → checkNodes() 内标有「扩展点」处追加校验；
 *   - 项目改用 ESM/模块导入加载剧情 → 只改 loadStory() 的加载方式，检查逻辑不动；
 *   - 报告存档：node tests/story-validation/validate.js > /tests/reports/<日期>-校验.txt
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const errors = [], warnings = [], notes = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const note = (m) => notes.push(m);

/* ---------- 加载：vm 沙箱执行 .js 对象字面量，与运行引擎无关 ---------- */

function walk(dir, suffix, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, suffix, out);
    else if (name.endsWith(suffix)) out.push(p);
  }
  return out;
}

function runFile(code, filename) {
  // 单文件独立沙箱：取该文件自身定义的节点 key（重复定义检测用）
  const sandbox = { storyData: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename });
  return sandbox;
}

function loadStory(dir) {
  const files = walk(dir, '.js', []);
  const merged = { storyData: {} }; // 合并执行：得到最终全量数据
  vm.createContext(merged);
  const fileOf = {}; // 节点 ID -> 定义文件
  const srcOf = {};  // 文件 -> 源码（伏笔注释对账用）
  const perFile = {}; // 文件 -> 该文件定义的节点 key 集合
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    srcOf[f] = code;
    perFile[f] = new Set(Object.keys(runFile(code, f).storyData));
    vm.runInContext(code, merged, { filename: f });
  }
  const rel = (f) => path.relative(process.cwd(), f);
  for (const [f, keys] of Object.entries(perFile)) {
    for (const id of keys) {
      if (fileOf[id]) err(`节点 ${id}：跨文件重复定义（${rel(fileOf[id])} 与 ${rel(f)}）`);
      else fileOf[id] = f;
    }
  }
  return {
    files, nodes: merged.storyData,
    vars: merged.VARIABLES || null,
    endings: merged.ENDINGS || null,
    fore: merged.FORESHADOW || null,
    fileOf, srcOf,
  };
}

/* ---------- 图结构 ---------- */

function outgoing(nodes, id) {
  // 返回 { targets: [节点ID], dynamic: 0|n }
  const n = nodes[id];
  const out = { targets: [], dynamic: 0 };
  if (!n) return out;
  if (typeof n.next === 'function') out.dynamic++;
  else if (typeof n.next === 'string') out.targets.push(n.next);
  if (Array.isArray(n.choices)) {
    for (const c of n.choices) {
      if (!c) continue;
      if (typeof c.next === 'function') out.dynamic++;
      else if (typeof c.next === 'string') out.targets.push(c.next);
    }
  }
  return out;
}

function reachable(nodes, starts, forward) {
  // forward=true: 从 starts 沿出边可达；false: 沿反向边可达
  const adj = new Map(); // forward ? src->[dst] : dst->[src]
  for (const id of Object.keys(nodes)) {
    for (const t of outgoing(nodes, id).targets) {
      if (!nodes[t]) continue; // 死链已在别处报，不进图
      if (forward) adj.set(id, (adj.get(id) || []).concat(t));
      else adj.set(t, (adj.get(t) || []).concat(id));
    }
  }
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    const cur = queue.shift();
    for (const nx of adj.get(cur) || []) if (!seen.has(nx)) { seen.add(nx); queue.push(nx); }
  }
  return seen;
}

/* ---------- 校验 ---------- */

function checkNodes(L) {
  const { nodes, endings } = L;
  const endingEntries = new Set(endings ? Object.values(endings).map((e) => e.entry_node) : []);
  const nodeIds = new Set(Object.keys(nodes));

  if (!nodeIds.has('start')) err('缺入口节点 start（templates.md §6 约定，可达性检查以它为起点）');

  const textSeen = new Map();
  let dynamicTotal = 0;
  for (const [id, n] of Object.entries(nodes)) {
    if (!n || typeof n !== 'object') { err(`节点 ${id}：不是对象`); continue; }
    if (typeof n.text !== 'string' || !n.text.trim()) err(`节点 ${id}：缺 text`);
    else if (n.text.trim().length >= 6) {
      const key = n.text.trim();
      if (textSeen.has(key)) warn(`文本重复：${id} 与 ${textSeen.get(key)} 的 text 完全相同`);
      else textSeen.set(key, id);
    }
    const hasNext = 'next' in n, hasCh = Array.isArray(n.choices) && n.choices.length > 0;
    if (hasNext && hasCh) err(`节点 ${id}：next 与 choices 并存（二选一）`);
    if (!hasNext && !hasCh && !endingEntries.has(id)) err(`节点 ${id}：死路（无 next/choices，且不是任何结局的 entry_node）`);
    const out = outgoing(nodes, id);
    dynamicTotal += out.dynamic;
    for (const t of out.targets) if (!nodeIds.has(t)) err(`节点 ${id}：指向不存在的节点 ${t}（死链）`);
    if (Array.isArray(n.choices)) {
      n.choices.forEach((c, i) => {
        if (!c || typeof c.text !== 'string' || !c.text.trim()) err(`节点 ${id}：选项 ${i} 缺 text`);
        if (!('next' in c)) err(`节点 ${id}：选项 ${i}（${c && c.text}）缺 next`);
      });
    }
    // 扩展点：项目专属节点字段（如 区域、位置、静态属性）在此追加校验
  }
  if (dynamicTotal) note(`动态路由函数 ${dynamicTotal} 处：按静态引用校验，请人工确认每处有静态兜底路径`);

  if (nodeIds.has('start')) {
    const fwd = reachable(nodes, ['start'], true);
    for (const id of nodeIds) if (!fwd.has(id)) warn(`孤岛节点：${id}（从 start 不可达）`);
    if (endingEntries.size) {
      const back = reachable(nodes, [...endingEntries], false);
      for (const id of nodeIds) if (!back.has(id)) warn(`节点 ${id}：无法抵达任何结局（含全循环陷阱/死循环）`);
    }
  }
}

function checkEndings(L) {
  const { endings, nodes } = L;
  if (!endings) { err('缺结局表（/story/endings.js 未定义 ENDINGS）'); return; }
  const nodeIds = new Set(Object.keys(nodes));
  const ids = Object.keys(endings);
  if (!ids.length) err('结局表为空');
  const startOk = nodeIds.has('start');
  const fwd = startOk ? reachable(nodes, ['start'], true) : new Set();
  for (const [id, e] of Object.entries(endings)) {
    if (!e || typeof e.entry_node !== 'string') { err(`结局 ${id}：缺 entry_node`); continue; }
    if (!nodeIds.has(e.entry_node)) err(`结局 ${id}：entry_node ${e.entry_node} 不存在`);
    else if (startOk && !fwd.has(e.entry_node)) err(`结局 ${id}：entry_node ${e.entry_node} 从 start 不可达`);
    if (!Array.isArray(e.requirements) || !e.requirements.length) warn(`结局 ${id}：无 requirements（无条件结局，确认是有意的）`);
    if (typeof e.priority !== 'number') warn(`结局 ${id}：缺 priority（多结局同时满足时判定次序不明）`);
  }
}

function checkVars(L) {
  const { vars, nodes, endings } = L;
  if (!vars) { err('缺变量表（/story/variables.js 未定义 VARIABLES）'); return; }
  const nodeIds = new Set(Object.keys(nodes));
  const endingIds = new Set(endings ? Object.keys(endings) : []);

  // 收集剧情侧实际读写的变量名
  const usedIn = new Map(); // var -> [节点ID]
  const touch = (name, nid) => usedIn.set(name, (usedIn.get(name) || []).concat(nid));
  for (const [id, n] of Object.entries(nodes)) {
    if (n && n.conditions && typeof n.conditions === 'object')
      for (const k of Object.keys(n.conditions)) touch(k, id);
    const effectObjs = [];
    if (n && n.effects && typeof n.effects === 'object') effectObjs.push(n.effects);
    if (n && Array.isArray(n.choices)) for (const c of n.choices) if (c && c.effects) effectObjs.push(c.effects);
    for (const ef of effectObjs) for (const k of Object.keys(ef)) touch(k, id);
  }

  for (const [name, v] of Object.entries(vars)) {
    if (!v || typeof v !== 'object') { err(`变量 ${name}：不是对象`); continue; }
    for (const field of ['source', 'changes', 'uses', 'endings'])
      if (!Array.isArray(v[field]) || !v[field].length) err(`变量 ${name}：闭环缺失——${field} 为空（来源/变化/用途/结局条件四项闭环）`);
    if (typeof v.init !== 'number') warn(`变量 ${name}：缺 init 数值`);
    if (typeof v.min === 'number' && typeof v.max === 'number') {
      if (v.min > v.max) err(`变量 ${name}：min > max`);
      if (typeof v.init === 'number' && (v.init < v.min || v.init > v.max)) err(`变量 ${name}：init=${v.init} 越出 [${v.min}, ${v.max}] 值域`);
    }
    if (Array.isArray(v.changes)) for (const ch of v.changes)
      if (ch && !nodeIds.has(ch.node)) err(`变量 ${name}：changes 引用不存在的节点 ${ch.node}`);
    if (Array.isArray(v.uses)) for (const u of v.uses) {
      const ref = String(u).split(':')[0];
      if (!nodeIds.has(ref) && !endingIds.has(ref)) err(`变量 ${name}：uses 引用不存在的节点/结局 ${ref}`);
    }
    if (Array.isArray(v.endings)) for (const re of v.endings)
      if (re && !endingIds.has(re.ending)) err(`变量 ${name}：endings 引用不存在的结局 ${re.ending}`);
  }

  for (const [name, at] of usedIn) if (!vars[name]) err(`未声明变量：${name}（在 ${at.join('、')} 中被引用，但 variables.js 无此条目）`);
  for (const name of Object.keys(vars)) if (!usedIn.has(name)) warn(`变量 ${name}：剧情文件中无任何读写（conditions/effects 均未引用）`);

  // 结局判据值域（数值型）
  if (endings && vars) for (const [eid, e] of Object.entries(endings)) {
    if (!e || !Array.isArray(e.requirements)) continue;
    for (const r of e.requirements) {
      if (!r || !vars[r.var]) continue;
      const v = vars[r.var];
      if (typeof r.value === 'number' && typeof v.min === 'number' && typeof v.max === 'number') {
        if (r.value < v.min || r.value > v.max)
          err(`结局 ${eid}：判据 ${r.var} ${r.op || ''} ${r.value} 越出值域 [${v.min}, ${v.max}]（条件永假/永真）`);
      }
    }
  }
}

function checkForeshadow(L) {
  const { fore, nodes, fileOf, srcOf } = L;
  const nodeIds = new Set(Object.keys(nodes));
  // 行内注释里的伏笔 ID（全量收集，供对账）
  const commentIds = new Set();
  for (const src of Object.values(srcOf))
    for (const m of src.matchAll(/伏笔\s*(F\d+)/g)) commentIds.add(m[1]);

  if (!fore) {
    if (commentIds.size) note(`行内注释出现伏笔 ${[...commentIds].join('、')}，但无 /story/foreshadow.js 台账（开放世界路径可不建）`);
    return;
  }
  for (const [id, e] of Object.entries(fore)) {
    if (!e || !e.planted || !nodeIds.has(e.planted.node)) { err(`伏笔 ${id}：埋设节点 ${e && e.planted && e.planted.node} 不存在`); continue; }
    const plantFile = fileOf[e.planted.node];
    if (plantFile && srcOf[plantFile] && !srcOf[plantFile].includes(`伏笔 ${id}`))
      warn(`伏笔 ${id}：埋设节点 ${e.planted.node} 所在文件无「伏笔 ${id}」行内注释（双写失同步）`);
    const recovers = Array.isArray(e.recover) ? e.recover : [];
    for (const r of recovers) if (!nodeIds.has(r.node)) err(`伏笔 ${id}：回收节点 ${r.node} 不存在`);
    const status = e.status || 'planted';
    if (status === 'recovered' && !recovers.length) err(`伏笔 ${id}：status=recovered 但无回收点`);
    if (status === 'planted' && recovers.length) warn(`伏笔 ${id}：已有回收点但 status 仍为 planted，请更新台账`);
    if (status === 'planted') warn(`伏笔 ${id}：未回收（herring 除外）——回收矩阵待补`);
    if (status !== 'herring' && !recovers.length && !/herring/.test(JSON.stringify(e)))
      warn(`伏笔 ${id}：零回收且未标记 herring（阶段 5 门禁项）`);
  }
  for (const id of commentIds) if (!fore[id]) warn(`行内注释的伏笔 ${id} 未登记台账（埋设当场登记，templates.md §6 三规范）`);
}

/* ---------- 节奏带宽粗检（对应阶段 2 门禁「单周目节奏落在 §4 带宽」） ---------- */

// 阈值取 CLAUDE.md §4（15-20/章、15-30/区、每 300-500 字一个选择）的宽容外沿，项目按自身规划调整
const PACING = { minNodes: 10, maxNodes: 40, charsPerChoice: 900, minStoryFiles: 3 };

function checkPacing(L) {
  // 「一章/一区域一文件」约定下以文件为章/区代理；chars 为全文件累计（含未走的并行支线），粗口径
  const byFile = {};
  for (const [id, n] of Object.entries(L.nodes)) {
    const f = L.fileOf[id];
    if (!f) continue;
    const b = byFile[f] || (byFile[f] = { nodes: 0, choices: 0, chars: 0 });
    b.nodes++;
    if (Array.isArray(n.choices) && n.choices.length) b.choices++;
    b.chars += typeof n.text === 'string' ? n.text.length : 0;
  }
  const storyFiles = Object.keys(byFile);
  if (storyFiles.length < PACING.minStoryFiles) return; // 冒烟样例/单章切片不评节奏
  for (const f of storyFiles) {
    const b = byFile[f];
    const rel = path.relative(process.cwd(), f);
    if (b.nodes < PACING.minNodes || b.nodes > PACING.maxNodes)
      warn(`${rel}：${b.nodes} 个节点落出带宽 [${PACING.minNodes}, ${PACING.maxNodes}]（§4：固定分支 15-20/章、开放世界 15-30/区），首尾章/特殊区需自知`);
    if (!b.choices) warn(`${rel}：全文件无选择节点`);
    else if (b.chars / b.choices > PACING.charsPerChoice)
      warn(`${rel}：平均每 ${Math.round(b.chars / b.choices)} 字才到一个选择节点（§4：每 300-500 字一个普通选择，含并行支线粗口径）`);
  }
}

/* ---------- /lore/ 卡 → /memory/index.json（消灭索引双写） ---------- */

function genIndex() {
  const loreDir = path.join(ROOT, 'lore');
  const files = walk(loreDir, '.yaml', []);
  if (!files.length) { console.log('未找到 /lore/ 卡，跳过'); return; }
  const idx = {};
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const pick = (key) => { const m = src.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
    const id = pick('id');
    if (!id) { console.log(`跳过（无 id）：${f}`); continue; }
    const rel = '/' + path.relative(ROOT, f).split(path.sep).join('/');
    const typeFromDir = rel.split('/')[2];
    idx[id] = { type: pick('type') || (typeFromDir === 'characters' ? 'character' : typeFromDir === 'locations' ? 'location' : typeFromDir === 'events' ? 'event' : 'faction'), file: rel, status: pick('status') || 'draft', summary: pick('summary'), tags: [] };
  }
  const memDir = path.join(ROOT, 'memory');
  fs.mkdirSync(memDir, { recursive: true });
  fs.writeFileSync(path.join(memDir, 'index.json'), JSON.stringify(idx, null, 2) + '\n', 'utf8');
  console.log(`已生成 /memory/index.json（${Object.keys(idx).length} 个实体）`);
}

/* ---------- 报告 ---------- */

function report(L) {
  const n = Object.keys(L.nodes).length;
  console.log(`—— 剧情校验报告 ——`);
  console.log(`文件 ${L.files.length} 个 / 节点 ${n} 个 / 结局 ${L.endings ? Object.keys(L.endings).length : 0} 个 / 变量 ${L.vars ? Object.keys(L.vars).length : 0} 个` + (L.fore ? ` / 伏笔 ${Object.keys(L.fore).length} 条` : ''));
  const dump = (title, list) => {
    if (!list.length) return;
    console.log(`\n[${title}] ${list.length}`);
    for (const m of list) console.log(`  - ${m}`);
  };
  dump('错误', errors); dump('警告', warnings); dump('提示', notes);
  console.log(`\n结果：${errors.length ? `✗ ${errors.length} 个错误（须修）` : '✓ 无错误'}${warnings.length ? `，${warnings.length} 个警告` : ''}${notes.length ? `，${notes.length} 个提示` : ''}`);
  if (!errors.length && !warnings.length && !notes.length) console.log('全绿。');
}

function main() {
  if (process.argv.includes('--gen-index')) { genIndex(); return; }
  const dir = path.resolve(process.argv[2] || path.join(ROOT, 'story'));
  if (!fs.existsSync(dir)) { console.log(`未找到剧情目录 ${dir}（阶段 2 建立剧情文件后再跑）`); return; }
  const L = loadStory(dir);
  if (!L.files.length) { console.log(`${dir} 下没有 .js 剧情文件，跳过校验`); return; }
  checkNodes(L);
  checkEndings(L);
  checkVars(L);
  checkForeshadow(L);
  checkPacing(L);
  report(L);
  process.exitCode = errors.length ? 1 : 0;
}

main();
