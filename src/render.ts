/**
 * 渲染层。只画，不改状态。
 *
 * 所有实体按中心定位，尺寸向下取整，避免像素被拉伸（art.md）。
 * 中文一律 12px，数字用 8px。超过六位数的伤害缩写，战斗飘字不带千分位。
 */

import type { Atlas } from './atlas';
import { bar, drawAt, drawCentered, fillGround, groupNumber, shortNumber, text, vignette, wash } from './atlas';
import { C, HEIGHT, REALMS, TERRAIN_COLOR, TERRAINS, WIDTH, groundFrame } from './config';
import type { Enemy } from './entities';
import { getHp, getMaxHp, tierColor } from './entities';
import type { Offer } from './offers';
import { daoToNext } from './offers';
import type { PlayerState, Slot } from './player';
import { slotRuntime } from './player';
import type { LevelPlan } from './routes';
import type { ShapeState } from './shapes';
import { SHAPES } from './shapes';
import type { CharKey, SpellId } from './skills';
import { CHAR_NAMES, CHAR_VERBS, SPELLS } from './skills';
import type { CharDef } from './characters';
import { CHARACTERS, CHAR_ORDER, isUnlocked } from './characters';
import type { World } from './world';
import type { CharSave } from './save';
import { APT_NAMES, APT_ORDER, NEUTRAL_APT, outerStats, type Apt } from './balance';
import { ATTR_LINES, GONGFA } from './outer';

/** 一帧渲染需要的全部只读数据。 */
export interface View {
  g: CanvasRenderingContext2D;
  atlas: Atlas;
  phase: string;
  /** 当前角色。 */
  char: CharKey | null;
  /** 真实战斗上下文。形状的 paint 要读它上面的守护物和敌人。 */
  combat: import('./combat').Ctx | null;
  p: PlayerState | null;
  w: World;
  enemies: Enemy[];
  plan: LevelPlan | null;
  shape: ShapeState | null;
  /** 本关的场景件。画在地面之上、实体之下。 */
  props: { frame: string; x: number; y: number }[];
  /** 三选一 / 分支的候选。 */
  offers: Offer[];
  /** 菜单光标。 */
  cursor: number;
  /** 开局三选二已选的下标。 */
  pickedStarters: number[];
  /** 本关剩余秒数。 */
  timeLeft: number;
  /** 关外存档（选人与关外界面用）。 */
  saves: Record<CharKey, CharSave>;
  cleared: Record<CharKey, number>;
  /** 过场文字。 */
  cutText: string;
  /** 结算摘要。 */
  summary: string;
  /** 剧情选择的两张卡。 */
  storyChoices: { title: string; blurb: string }[];
  /** 关外界面里正在看哪个角色。 */
  metaChar: CharKey;
  /** 关外界面光标行。 */
  metaCursor: number;
  /** 关外栏位：属性 / 功法谱。 */
  metaTab: 'attr' | 'gongfa';
  /** 功法谱滚动窗口起点。 */
  metaTop: number;
  /** 还能花的悟道点。 */
  metaPoints: number;
  /** 道基（关外等级）。 */
  metaLevel: number;
  /** 三块测灵石的结果。null = 还没测。 */
  stones: Apt[] | null;
  /** 选中第几块。 */
  stonePick: number;
  /** 自动选卡还剩几秒。0 = 这一次由玩家决定。 */
  autoChoiceIn: number;
}


/** 角色对应的槽图标。 */
function slotFrame(char: CharKey, fusion: boolean): string {
  if (fusion) return 'spr_ui_slotFusion_0';
  if (char === 'daoist') return 'spr_ui_slotFinger_0';
  if (char === 'demon') return 'spr_ui_slotBlood_0';
  return 'spr_ui_slotSword_0';
}

/** 角色待机帧。 */
function heroFrame(char: CharKey, anim: number, moving: boolean): string {
  const state = moving ? 'walk' : 'idle';
  const frames = moving ? 4 : 2;
  const idx = Math.floor(anim * (moving ? 8 : 3)) % frames;
  return `spr_hero_${char}_${state}_${idx}`;
}

function enemyFrame(e: Enemy): string {
  const n = Math.max(1, e.def.frames);
  const idx = e.def.fps > 0 ? Math.floor(e.anim * e.def.fps) % n : 0;
  return `${e.def.art}_${idx}`;
}

/** 主入口。 */
export function render(v: View): void {
  const g = v.g;
  // 浏览器会在 drawImage 之后把 imageSmoothingEnabled 重置回 true，
  // 而平台只在初始化时设过一次。像素图集里有半透明像素（影子、残影），
  // 不每帧重新关掉，缩放时边缘就会被插值糊掉。
  g.imageSmoothingEnabled = false;
  g.save();
  if (v.w.shake > 0) g.translate(v.w.shakeX, v.w.shakeY);

  g.fillStyle = C.void;
  g.fillRect(0, 0, WIDTH, HEIGHT);

  switch (v.phase) {
    case 'select':
      paintSelect(v);
      break;
    case 'roll':
      paintRoll(v);
      break;
    case 'meta':
      paintMeta(v);
      break;
    default:
      paintWorld(v);
      break;
  }

  g.restore();
}

/** 选人界面。 */
function paintSelect(v: View): void {
  const g = v.g;
  fillGround(g, v.atlas, groundFrame(0));
  wash(g, C.void, 0.55);

  text(g, '九 霄', WIDTH / 2, 22, C.gold);
  text(g, '三个修士，一座被灭门的山', WIDTH / 2, 38, C.dim);

  CHAR_ORDER.forEach((key, i) => {
    const def = CHARACTERS[key];
    const y = 52 + i * 38;
    const focused = i === v.cursor;
    const lock = isUnlocked(key, v.cleared);

    g.fillStyle = focused ? C.floor : C.bg;
    g.fillRect(30, y, 260, 34);
    g.fillStyle = lock.ok ? def.color : C.stone;
    g.fillRect(30, y, 3, 34);

    drawCentered(g, v.atlas, `spr_hero_${key}_idle_0`, 52, y + 17);

    g.fillStyle = lock.ok ? C.light : C.gray;
    g.font = '12px monospace';
    g.textAlign = 'left';
    g.fillText(CHAR_NAMES[key], 68, y + 15);
    g.fillStyle = C.dim;
    g.fillText(lock.ok ? `${CHAR_VERBS[key]} · ${def.tagline}` : lock.need, 68, y + 29);
  });

  text(g, '方向键选择   J 确认', WIDTH / 2, 172, C.dim, false);
}

/** 百分比，带正负号。零点几的差值不显示成 +0%。 */
function fmtPct(v: number): string {
  const n = Math.round(v * 100);
  if (n === 0) return '±0%';
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
}

/** 面板：暗底 + 细边。文字压在花哨的地面上会看不清。 */
function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = 'rgba(11,11,15,0.8)';
  g.fillRect(x, y, w, h);
  g.fillStyle = C.stone;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}

/** 测天资。新角色的第一屏：三块测灵石，择其一。 */
function paintRoll(v: View): void {
  const g = v.g;
  fillGround(g, v.atlas, groundFrame(0));
  wash(g, C.void, 0.74);

  text(g, '测 天 资', WIDTH / 2, 20, C.gold);

  if (!v.stones) {
    text(g, '三块测灵石，各显一相', WIDTH / 2, 38, C.dim);
    panel(g, 40, 64, 240, 58);
    text(g, 'J 测石', WIDTH / 2, 88, C.light);
    text(g, '灵石只认一次，看过便知', WIDTH / 2, 110, C.dim);
    return;
  }

  text(g, '三块测灵石，择其一', WIDTH / 2, 36, C.dim);

  const COLS = [168, 216, 264];
  const STONE_NAMES = ['甲', '乙', '丙'];

  // 选中的那一列先铺底，再写字。
  g.fillStyle = C.floor;
  g.fillRect(COLS[v.stonePick]! - 34, 54, 44, 72);

  g.font = '12px monospace';
  g.textAlign = 'right';
  STONE_NAMES.forEach((name, i) => {
    g.fillStyle = i === v.stonePick ? C.gold : C.gray;
    g.fillText(name, COLS[i]!, 48);
  });

  APT_ORDER.forEach((key, r) => {
    const y = 70 + r * 16;
    g.textAlign = 'left';
    g.fillStyle = C.dim;
    g.fillText(APT_NAMES[key].name, 40, y);

    g.textAlign = 'right';
    v.stones!.forEach((apt, i) => {
      g.fillStyle = i === v.stonePick ? C.light : C.gray;
      g.fillText(String(apt[key]), COLS[i]!, y);
    });
  });

  const picked = v.stones[v.stonePick]!;
  const top = outerStats(picked, 30);
  g.textAlign = 'center';
  g.fillStyle = C.dim;
  g.fillText(`三十重  气血 ${groupNumber(top.maxHp)}   伤害 ${fmtPct(top.damageBonus)}`, WIDTH / 2, 144);
  g.fillText(`暴击 ${Math.round(top.crit * 100)}%   移速 ${fmtPct(top.speedBonus)}   冷却 ${fmtPct(top.cooldownCut)}`, WIDTH / 2, 158);
  g.textAlign = 'left';

  text(g, '← → 换石    J 定下', WIDTH / 2, 174, C.dim);
}

/**
 * 关外界面：左边点属性，右边买功法，两个都是悟道点。
 *
 * 一屏放不下 12 门功法，所以右边是 6 行的滚动窗口（META_GONGFA_ROWS）。
 */
export const META_GONGFA_ROWS = 6;

function paintMeta(v: View): void {
  const g = v.g;
  const save = v.saves[v.metaChar];
  const apt = save.apt ?? NEUTRAL_APT;

  fillGround(g, v.atlas, groundFrame(0));
  wash(g, C.void, 0.72);

  text(g, CHAR_NAMES[v.metaChar], WIDTH / 2, 14, CHARACTERS[v.metaChar].color);
  g.font = '12px monospace';
  g.textAlign = 'center';
  g.fillStyle = C.dim;
  g.fillText(`道基 ${v.metaLevel} 重   悟道点 ${v.metaPoints}   修为 ${groupNumber(save.xiu)}`, WIDTH / 2, 28);
  g.fillStyle = C.gray;
  g.fillText(`体魄 ${apt.body}   灵机 ${apt.spirit}   身法 ${apt.agility}   杀伐 ${apt.power}`, WIDTH / 2, 42);
  g.textAlign = 'left';

  // 两块暗底：文字压在花哨的地面上会看不清。
  g.fillStyle = 'rgba(11,11,15,0.78)';
  g.fillRect(6, 50, 118, 106);
  g.fillRect(128, 50, 186, 106);

  // ---- 左：属性 ----
  ATTR_LINES.forEach((line, i) => {
    const y = 64 + i * 18;
    const focused = v.metaTab === 'attr' && i === v.metaCursor;
    if (focused) { g.fillStyle = C.floor; g.fillRect(8, y - 11, 114, 16); }

    const val = save.attrs[line.key] ?? 0;
    g.font = '12px monospace';
    g.textAlign = 'left';
    g.fillStyle = val > 0 ? C.light : C.gray;
    g.fillText(line.name, 12, y);

    // 五个点：亮一颗就是一级。
    for (let n = 0; n < line.max; n += 1) {
      g.fillStyle = n < val ? C.gold : C.stone;
      g.fillRect(46 + n * 8, y - 6, 5, 4);
    }
    g.font = '8px monospace';
    g.fillStyle = C.dim;
    g.textAlign = 'right';
    g.fillText(`${val}/${line.max}`, 118, y);
    g.textAlign = 'left';
  });

  // ---- 右：功法谱 ----
  const list = GONGFA[v.metaChar];
  const top = v.metaTop;
  for (let row = 0; row < META_GONGFA_ROWS; row += 1) {
    const idx = top + row;
    if (idx >= list.length) break;
    const gf = list[idx]!;
    const y = 64 + row * 17;
    const focused = v.metaTab === 'gongfa' && idx === v.metaCursor;
    const owned = save.learned.includes(gf.id);

    if (focused) { g.fillStyle = C.floor; g.fillRect(130, y - 11, 182, 15); }

    g.font = '12px monospace';
    g.textAlign = 'left';
    g.fillStyle = owned ? C.dim : gf.kind === 'passive' ? C.ice : C.light;
    g.fillText(gf.name, 134, y);

    g.textAlign = 'right';
    if (owned) {
      g.fillStyle = C.gold;
      g.fillRect(304, y - 7, 5, 5);
    } else {
      g.font = '8px monospace';
      g.fillStyle = v.metaPoints >= gf.cost ? C.gold : C.gray;
      g.fillText(String(gf.cost), 310, y);
    }
    g.textAlign = 'left';
  }

  // 选中项的说明。功法谱里这一行决定"买它值不值"。
  if (v.metaTab === 'gongfa') {
    const gf = list[v.metaCursor];
    if (gf) text(g, gf.blurb, WIDTH / 2, 166, C.gray);
  } else {
    const line = ATTR_LINES[v.metaCursor];
    if (line) text(g, `${line.name}：每点 ${Math.round(line.per * 100)}% ${line.blurb}`, WIDTH / 2, 166, C.gray);
  }

  text(g, '←→ 换栏   ↑↓ 选   J 买   K 出发   U 返回', WIDTH / 2, 177, C.dim, false);
}

/** 战斗与各种覆盖层。 */
function paintWorld(v: View): void {
  const g = v.g;
  const plan = v.plan;

  // 地面
  fillGround(g, v.atlas, groundFrame(plan ? plan.terrain : 0));
  if (plan) wash(g, TERRAIN_COLOR[TERRAINS[plan.terrain] ?? ''] ?? C.wood, 0.08);

  // 场景件：树、坟、石灯。画在形状自己的场地之前，木牌才压得住它们。
  for (const prop of v.props) {
    if (v.atlas.has(prop.frame)) drawCentered(g, v.atlas, prop.frame, prop.x, prop.y);
  }

  // 形状自己的场地（木牌、香炉、坟）。用真实战斗上下文，
  // 否则 begin 里算出来的守护物位置和血量会丢。
  if (v.shape && v.combat) {
    SHAPES[v.shape.plan.shape].paint(v.shape, v.combat, v.atlas);
  }

  paintWorldObjects(v);

  // 暗角：把视线收到场地中间。画在实体之后、HUD 之前，不压 UI。
  vignette(g);

  // 选卡和过场是全屏界面，角色、血条、技能槽都不画，避免透出来。
  const overlay = v.phase === 'cutscene' || v.phase === 'starter' || v.phase === 'choosing'
    || v.phase === 'story-choice' || v.phase === 'dead' || v.phase === 'won' || v.phase === 'cleared';
  if (v.p && v.char && !overlay) {
    paintPlayer(v);
    paintHud(v);
  }

  if (v.phase === 'cutscene') paintCutscene(v);
  if (v.phase === 'starter') paintStarter(v);
  if (v.phase === 'choosing') paintOffers(v);
  if (v.phase === 'story-choice') paintStory(v);
  if (v.phase === 'dead' || v.phase === 'won' || v.phase === 'cleared') paintEnd(v);
}

function paintWorldObjects(v: View): void {
  const g = v.g;
  const w = v.w;

  // 地面领域
  for (const f of w.fields) {
    if (v.atlas.has(f.fx)) drawCentered(g, v.atlas, f.fx, f.x, f.y);
  }

  // 预警：收缩的圈 / 线。
  for (const t of w.telegraphs) {
    if (!v.atlas.has(t.fx)) continue;
    g.save();
    g.globalAlpha = t.warnLeft > 0 ? 0.5 + 0.5 * Math.sin(w.t * 12) : 0.3;
    if (t.kind === 'line') {
      const dx = t.x2 - t.x;
      const dy = t.y2 - t.y;
      const len = Math.hypot(dx, dy) || 1;
      g.translate((t.x + t.x2) / 2, (t.y + t.y2) / 2);
      g.rotate(Math.atan2(dy, dx));
      drawCentered(g, v.atlas, t.fx, 0, 0, len / 48);
    } else {
      const shrink = t.warnTotal > 0 ? Math.max(0.3, t.warnLeft / t.warnTotal) : 1;
      drawCentered(g, v.atlas, t.fx, t.x, t.y, shrink);
    }
    g.restore();
  }

  // 敌人
  for (const e of v.enemies) {
    const frame = enemyFrame(e);
    if (!v.atlas.has(frame)) continue;
    g.save();
    if (e.flash > 0) g.globalAlpha = 0.4;
    if (!e.killable) g.globalAlpha = 0.55;
    drawCentered(g, v.atlas, frame, e.x, e.y);
    g.restore();

    // 血条：只给精英和 Boss，杂兵太多会糊成一片。
    if (e.def.tier !== 'mob' && getHp(e) < getMaxHp(e)) {
      const wdt = Math.min(40, e.def.size * 2);
      bar(g, e.x - wdt / 2, e.y - e.def.size / 2 - 4, wdt, 2, getHp(e) / getMaxHp(e), tierColor(e.def.tier));
    }
  }

  // 碎片
  for (const s of w.shards) {
    if (v.atlas.has(s.fx)) {
      const bob = Math.sin(w.t * 6 + s.x) * 1.5;
      drawCentered(g, v.atlas, s.fx, s.x, s.y + bob);
    }
  }

  // 血珠 / 灵珠。bob 相位错开，不然一堆珠子会同步跳动。
  for (const o of w.orbs) {
    const frame = o.kind === 'heal' ? 'spr_fx_healLeaf_0' : 'spr_shard_heaven_0';
    if (!v.atlas.has(frame)) continue;
    const bob = Math.sin(w.t * 5 + o.x * 0.7) * 2;
    drawCentered(g, v.atlas, frame, o.x, o.y + bob);
  }

  // 飞行弹
  for (const b of w.bolts) {
    if (b.fx && v.atlas.has(b.fx)) drawCentered(g, v.atlas, b.fx, b.x, b.y);
  }

  // 粒子
  for (const p of w.particles) {
    g.fillStyle = p.color;
    g.globalAlpha = Math.max(0, p.life * 2);
    g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    g.globalAlpha = 1;
  }

  // 飘字
  for (const f of w.floaters) {
    g.fillStyle = f.heal ? C.wood : f.crit ? C.gold : C.light;
    g.font = '8px monospace';
    g.textAlign = 'left';
    g.fillText(f.value === 0 ? '—' : shortNumber(f.value), Math.round(f.x), Math.round(f.y));
  }
}

function paintPlayer(v: View): void {
  const g = v.g;
  const p = v.p!;
  const char = v.char!;
  const moving = p.facing.x !== 0 || p.facing.y !== 0;

  if (p.dashTrail > 0 && v.atlas.has('spr_fx_afterimage_0')) {
    g.save();
    g.globalAlpha = 0.4;
    drawCentered(g, v.atlas, 'spr_fx_afterimage_0', p.x, p.y);
    g.restore();
  }

  g.save();
  if (p.invuln > 0) g.globalAlpha = 0.5;
  drawCentered(g, v.atlas, heroFrame(char, p.anim, moving), p.x, p.y);
  g.restore();

  // 面朝方向的小点
  g.fillStyle = C.ink;
  g.fillRect(Math.round(p.x + p.facing.x * 4 - 1), Math.round(p.y + p.facing.y * 4 - 1), 2, 2);
}

function paintHud(v: View): void {
  const g = v.g;
  const p = v.p!;
  const plan = v.plan;

  // 浅色地形（双生洞、雷池）上白字完全看不清，HUD 必须自带衬底。
  g.fillStyle = 'rgba(11,11,15,0.62)';
  g.fillRect(0, 0, 132, 50);
  g.fillRect(WIDTH - 46, 0, 46, 24);

  bar(g, 6, 6, 60, 4, p.hp / p.maxHp, C.danger);
  if (v.char === 'daoist') bar(g, 6, 12, 60, 3, p.mana / Math.max(1, p.resMax), C.thunder);
  if (v.char === 'demon') bar(g, 6, 12, 60, 3, p.demon / 100, C.heaven);

  g.fillStyle = C.light;
  g.font = '12px monospace';
  g.textAlign = 'left';
  const realm = plan ? REALMS[plan.n - 1] : '';
  g.fillText(`${realm} ${plan?.n ?? 0}/9`, 6, 28);
  g.textAlign = 'right';
  g.fillText(`余 ${Math.ceil(v.timeLeft)} 秒`, WIDTH - 6, 28);
  g.textAlign = 'left';

  // 道行。中文 12px，一个字大约 12 像素宽，数字跟在后面单独画，
  // 否则「道行」和数字会叠在同一块上。
  const next = daoToNext(p);
  g.font = '12px monospace';
  g.textAlign = 'left';
  if (next !== Infinity) {
    g.fillStyle = C.dim;
    // 这个字号下中文被当成半宽，两个字只占 24 像素，数字会叠上来。
    // 逐字按 12 像素排，数字跟在真正的字宽后面。
    g.fillText('道', 6, 44);
    g.fillText('行', 18, 44);
    g.fillText(shortNumber(p.dao), 32, 44);
  } else {
    g.fillStyle = C.gold;
    g.fillText('圆满', 6, 44);
  }

  // 技能槽
  p.slots.forEach((slot, i) => paintSlot(v, slot, i));
}

function paintSlot(v: View, slot: Slot, i: number): void {
  const g = v.g;
  const x = WIDTH / 2 - 34 + i * 24;
  const y = HEIGHT - 24;
  const rt = slotRuntime(slot);
  const frame = slotFrame(v.char!, slot.kind === 'fusion');

  if (v.atlas.has(frame)) drawAt(g, v.atlas, frame, x, y);

  if (slot.cd > 0 && rt.cooldown > 0) {
    const h = Math.round(20 * (slot.cd / rt.cooldown));
    g.fillStyle = 'rgba(11,11,15,0.65)';
    g.fillRect(x, y + 20 - h, 20, h);
  }

  // 等级点
  g.fillStyle = C.gold;
  for (let lv = 0; lv < Math.min(5, slot.level); lv += 1) g.fillRect(x + 2 + lv * 3, y + 18, 2, 1);
}

/** 菜单遮罩。必须是不透明底，半透明会把底下的血条和技能槽透出来。 */
function dim(g: CanvasRenderingContext2D): void {
  g.fillStyle = C.void;
  g.fillRect(0, 0, WIDTH, HEIGHT);
}

function paintCutscene(v: View): void {
  const g = v.g;
  dim(g);
  const plan = v.plan;
  if (plan) {
    text(g, `第${plan.n}境 · ${REALMS[plan.n - 1]}`, WIDTH / 2, 60, C.gold);
    text(g, TERRAINS[plan.terrain] ?? '', WIDTH / 2, 78, C.light);
    text(g, v.cutText, WIDTH / 2, 104, C.dim);
  }
  text(g, 'J 继续', WIDTH / 2, 150, C.gray, false);
  if (v.autoChoiceIn > 0) text(g, `自动继续 ${v.autoChoiceIn.toFixed(1)} 秒`, WIDTH / 2, 164, C.gray, false);
}

function paintStarter(v: View): void {
  const g = v.g;
  dim(g);
  text(g, `选择功法 ${v.pickedStarters.length}/2`, WIDTH / 2, 18, C.light);

  v.offers.forEach((offer, i) => {
    const y = 26 + i * 40;
    const focused = i === v.cursor;
    const picked = v.pickedStarters.includes(i);
    g.fillStyle = picked ? C.gold : focused ? C.floor : C.bg;
    g.fillRect(36, y, 248, 38);
    g.fillStyle = C.ink;
    g.font = '12px monospace';
    g.textAlign = 'left';
    g.fillText(offer.title, 46, y + 16);
    g.fillStyle = picked ? C.ink : C.dim;
    g.fillText(offer.blurb, 46, y + 32);
  });

  text(g, '方向键选择   J 确认', WIDTH / 2, 172, C.dim, false);
  if (v.autoChoiceIn > 0) {
    text(g, `自动选功法 ${v.autoChoiceIn.toFixed(1)} 秒`, WIDTH / 2, 158, C.gray, false);
  }
}

function paintOffers(v: View): void {
  const g = v.g;
  dim(g);
  const title = v.offers.length === 1
    ? '定 路'
    : v.offers.some((o) => o.kind === 'branch') ? '择 路' : '参 悟';
  text(g, title, WIDTH / 2, 20, C.gold);

  v.offers.forEach((offer, i) => {
    const y = 32 + i * 46;
    const focused = i === v.cursor;
    g.fillStyle = focused ? C.floor : C.bg;
    g.fillRect(28, y, 264, 42);
    g.fillStyle = C.gold;
    g.fillRect(28, y, 3, 42);
    g.fillStyle = C.light;
    g.font = '12px monospace';
    g.textAlign = 'left';
    g.fillText(offer.title, 40, y + 16);
    g.fillStyle = C.dim;
    g.fillText(offer.blurb, 40, y + 32);
  });

  // 自动参悟的倒计时。玩家一按方向键，这一行就消失 —— 说明被他接管了。
  if (v.autoChoiceIn > 0) {
    text(g, `自动参悟 ${v.autoChoiceIn.toFixed(1)} 秒`, WIDTH / 2, 176, C.gray, false);
  }
}

function paintStory(v: View): void {
  const g = v.g;
  dim(g);
  text(g, '心魔', WIDTH / 2, 30, C.heaven);
  v.storyChoices.forEach((c, i) => {
    const y = 50 + i * 50;
    const focused = i === v.cursor;
    g.fillStyle = focused ? C.floor : C.bg;
    g.fillRect(40, y, 240, 40);
    g.fillStyle = C.light;
    g.font = '12px monospace';
    g.textAlign = 'left';
    g.fillText(c.title, 50, y + 16);
    g.fillStyle = C.dim;
    g.fillText(c.blurb, 50, y + 31);
  });
}

function paintEnd(v: View): void {
  const g = v.g;
  dim(g);
  const title = v.phase === 'won' ? '飞升' : v.phase === 'cleared' ? '过关' : '道消';
  const color = v.phase === 'dead' ? C.danger : v.phase === 'won' ? C.heaven : C.gold;
  text(g, title, WIDTH / 2, 70, color);
  text(g, v.summary, WIDTH / 2, 96, C.dim);
  text(g, v.phase === 'cleared' ? 'J 继续' : 'J 重来', WIDTH / 2, 120, C.gray, false);
  if (v.phase === 'cleared' && v.autoChoiceIn > 0) {
    text(g, `自动继续 ${v.autoChoiceIn.toFixed(1)} 秒`, WIDTH / 2, 136, C.gray, false);
  }
}

export type { SpellId };
