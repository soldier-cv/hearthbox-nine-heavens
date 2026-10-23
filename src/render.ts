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
import { outerLevel } from './save';
import { APT_NAMES, APT_ORDER, NEUTRAL_APT, outerStats, type Apt, type OuterStats } from './balance';

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
  /** 关外加点光标。 */
  metaCursor: number;
  /** 掷天资的当前结果。null = 还没掷。 */
  rollResult: Apt | null;
  /** 还能掷几次。 */
  rollLeft: number;
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

  text(g, '方向键选择  攻击键确认', WIDTH / 2, 172, C.dim, false);
}

/** 百分比，带正负号。零点几的差值不显示成 +0%。 */
function fmtPct(v: number): string {
  const n = Math.round(v * 100);
  if (n === 0) return '±0%';
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
}

/** 天资对应的派生说明（一行以内，装得下才写得下）。 */
function aptNote(key: (typeof APT_ORDER)[number], s: OuterStats): string {
  switch (key) {
    case 'body':
      return `气血 ${groupNumber(s.maxHp)}`;
    case 'spirit':
      return `灵力 ×${s.resourceMul.toFixed(2)} 冷却 ${fmtPct(s.cooldownCut)}`;
    case 'agility':
      return `移速 ${fmtPct(s.speedBonus)}`;
    case 'power':
      return `伤害 ${fmtPct(s.damageBonus)} 暴击 ${Math.round(s.crit * 100)}%`;
  }
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

/** 掷天资。新角色的第一屏。 */
function paintRoll(v: View): void {
  const g = v.g;
  fillGround(g, v.atlas, groundFrame(0));
  wash(g, C.void, 0.74);

  text(g, '天 资', WIDTH / 2, 22, C.gold);
  text(g, '下面是练到三十级的样子', WIDTH / 2, 40, C.dim);

  const apt = v.rollResult;
  if (!apt) {
    panel(g, 40, 68, 240, 56);
    text(g, 'J 掷骰', WIDTH / 2, 90, C.light);
    text(g, '掷出来才知道你是什么料', WIDTH / 2, 112, C.dim);
    return;
  }

  panel(g, 24, 50, 272, 92);

  const top = outerStats(apt, 30);
  APT_ORDER.forEach((key, i) => {
    const y = 72 + i * 20;
    g.fillStyle = C.light;
    g.font = '12px monospace';
    g.textAlign = 'left';
    g.fillText(APT_NAMES[key].name, 36, y);

    g.fillStyle = C.gold;
    g.textAlign = 'right';
    g.fillText(String(apt[key]), 112, y);

    g.fillStyle = C.dim;
    g.textAlign = 'left';
    g.fillText(aptNote(key, top), 126, y);
  });

  const left = v.rollLeft;
  if (left > 0) {
    text(g, `J 重掷（还剩 ${left} 次）    K 定下`, WIDTH / 2, 158, C.light);
  } else {
    text(g, '次数用完了，K 定下', WIDTH / 2, 158, C.gray);
  }
  text(g, '定下之后不再变动', WIDTH / 2, 174, C.dim);
}

/** 关外界面：看天资、分修为点。 */
function paintMeta(v: View): void {
  const g = v.g;
  const save = v.saves[v.metaChar];
  const lv = outerLevel(save);
  const apt = save.apt ?? NEUTRAL_APT;
  const stats = outerStats(apt, lv.level);

  fillGround(g, v.atlas, groundFrame(0));
  wash(g, C.void, 0.66);

  text(g, CHAR_NAMES[v.metaChar], WIDTH / 2, 16, CHARACTERS[v.metaChar].color);
  g.fillStyle = C.dim;
  g.font = '12px monospace';
  g.textAlign = 'center';
  g.fillText(`关外 ${lv.level} 级  修为 ${groupNumber(save.xiu)}`, WIDTH / 2, 32);
  g.textAlign = 'left';

  // 天资决定起点，也决定每级涨多快。这一屏只读。
  panel(g, 24, 40, 272, 84);
  APT_ORDER.forEach((key, i) => {
    const y = 58 + i * 19;
    g.fillStyle = C.light;
    g.font = '12px monospace';
    g.textAlign = 'left';
    g.fillText(APT_NAMES[key].name, 36, y);

    g.fillStyle = C.gold;
    g.textAlign = 'right';
    g.fillText(String(apt[key]), 108, y);

    g.fillStyle = C.dim;
    g.textAlign = 'left';
    g.fillText(aptNote(key, stats), 122, y);
  });

  const top = outerStats(apt, 30);
  g.fillStyle = C.gray;
  g.font = '12px monospace';
  g.textAlign = 'center';
  g.fillText(`30 级  气血 ${groupNumber(top.maxHp)}  伤害 ${fmtPct(top.damageBonus)}`, WIDTH / 2, 148);
  g.fillText(`暴击 ${Math.round(top.crit * 100)}%  移速 ${fmtPct(top.speedBonus)}  冷却 ${fmtPct(top.cooldownCut)}`, WIDTH / 2, 162);
  g.textAlign = 'left';

  text(g, 'J 出发   U 返回', WIDTH / 2, 176, C.dim, false);
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
  g.fillText(`${Math.ceil(v.timeLeft)}s`, WIDTH - 6, 28);
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
  text(g, '攻击键继续', WIDTH / 2, 150, C.gray, false);
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

  text(g, '方向键选择  攻击键确认', WIDTH / 2, 172, C.dim, false);
}

function paintOffers(v: View): void {
  const g = v.g;
  dim(g);
  text(g, v.offers.some((o) => o.kind === 'branch') ? '二选一' : '三选一', WIDTH / 2, 20, C.gold);

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
  text(g, v.phase === 'cleared' ? '攻击键继续' : '攻击键重来', WIDTH / 2, 120, C.gray, false);
}

export type { SpellId };
