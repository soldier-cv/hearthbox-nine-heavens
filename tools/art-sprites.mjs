/**
 * 精灵表：三个角色、全部敌人、特效、UI。
 *
 * 俯视角，背对镜头，左上光源。所有形状先画"能辨认的剪影"，再补 1~2 级明暗。
 * 十六色板之外的颜色会直接抛错（见 Palette.at）。
 */
import { Canvas, Palette, COLORS as K } from './art-core.mjs';

const INK = K.ink;

/** 明暗：左上亮、右下暗。给一个主色，返回 [亮, 主, 暗] 三档。 */
function tone(pal, hex) {
  return {
    hi: pal.at(K.light),
    base: pal.at(hex),
    lo: pal.at(INK),
    // 同色降 alpha 当"暗部"用，不引入新色相
    mid: pal.at(hex, 190),
  };
}

// ---------------------------------------------------------------- 角色

/**
 * 共用骨架：三个角色只差配色与 2~3 个像素的轮廓差异。
 * 只做一套动画，三个角色都能用（art.md 的规定）。
 */
function heroFrames(pal, spec) {
  const { body, trim, hair, back } = spec;
  const b = pal.at(body);
  const bDark = pal.at(body, 175);
  const t = pal.at(trim);
  const h = pal.at(hair);
  const ink = pal.at(INK);
  const hk = pal.at(K.light);

  /** 画一帧。dx/dy 是整体位移，arm 控制手臂摆幅，breath 是呼吸。 */
  const frame = (dx, dy, arm, breath) => {
    const c = new Canvas(16, 16);
    const ox = 5 + dx; // 身体左上角
    const oy = 2 + dy + breath;

    // 影子（脚下 2px）
    const shadow = pal.at(INK, 120);
    c.ellipse(ox + 3, 15, 3, 1, shadow);

    // 头 + 发髻
    c.rect(ox + 1, oy, 5, 4, h);
    c.rect(ox + 3, oy - 2, 2, 2, h); // 发髻
    c.set(ox + 3, oy - 3, h);
    c.set(ox + 2, oy, hk); // 左上一点高光

    // 身体（袍）
    c.rect(ox, oy + 4, 7, 6, b);
    c.rect(ox, oy + 9, 7, 1, bDark);
    // 肩线
    c.rect(ox + 1, oy + 4, 5, 1, pal.at(body, 215));

    // 手臂
    if (arm !== 0) {
      c.rect(ox - 1, oy + 5 + arm, 1, 3, bDark);
      c.rect(ox + 7, oy + 5 - arm, 1, 3, bDark);
    } else {
      c.rect(ox - 1, oy + 5, 1, 3, bDark);
      c.rect(ox + 7, oy + 5, 1, 3, bDark);
    }

    // 腰带
    c.rect(ox, oy + 7, 7, 1, t);

    // 背上的东西（剑 / 拂尘 / 无）
    if (back === 'sword') {
      c.line(ox + 1, oy + 8, ox + 6, oy + 2, pal.at(K.dim));
      c.set(ox + 6, oy + 1, t);
    } else if (back === 'switch') {
      c.line(ox + 5, oy + 3, ox + 8, oy - 2, pal.at(K.dim));
    } else if (back === 'cloak') {
      c.rect(ox + 1, oy + 5, 5, 4, pal.at(INK, 150));
    }

    // 脚
    c.rect(ox + 1, oy + 12, 2, 1, ink);
    c.rect(ox + 4, oy + 12, 2, 1, ink);

    c.outline(pal);
    return c;
  };

  return {
    idle: [frame(0, 0, 0, 0), frame(0, 0, 0, 1)],
    walk: [frame(-1, 0, 1, 0), frame(0, 0, 0, 1), frame(1, 0, -1, 0), frame(0, 0, 0, 1)],
    dodge: [frame(-1, 1, 2, 0), frame(0, 1, 1, 0), frame(1, 1, 0, 0)],
    hit: (() => {
      const c = frame(0, -1, 0, 0);
      // 受击泛白：把身体重新涂成 light
      c.rect(5, 6, 7, 6, pal.at(K.light));
      return [c];
    })(),
  };
}

export const HEROES = {
  swordsman: (pal) =>
    heroFrames(pal, { body: '#9a9ab0', trim: K.gold, hair: K.ink, back: 'sword' }),
  daoist: (pal) =>
    heroFrames(pal, { body: '#2dd4bf', trim: K.dim, hair: K.gray, back: 'switch' }),
  demon: (pal) =>
    heroFrames(pal, { body: '#14141c', trim: K.danger, hair: K.stone, back: 'cloak' }),
};

// ---------------------------------------------------------------- 杂兵

/** 腐尸：不动，佝偻，破烂衣袍。第 1 关。 */
function corpse(pal) {
  const c = new Canvas(16, 16);
  const robe = pal.at('#454560');
  const dark = pal.at('#2c2c3e');
  const skin = pal.at('#9a9ab0', 200);
  c.ellipse(8, 14, 4, 1, pal.at(INK, 120));
  // 佝偻的背
  c.rect(4, 5, 8, 7, robe);
  c.rect(4, 10, 8, 2, dark);
  // 头低垂偏左
  c.rect(3, 3, 5, 4, skin);
  c.set(4, 4, pal.at(INK));
  c.set(6, 4, pal.at(INK));
  // 破布下摆（锯齿）
  for (let i = 0; i < 8; i += 2) c.rect(4 + i, 12, 1, 1 + (i % 4 === 0 ? 1 : 0), dark);
  // 手臂垂下
  c.rect(2, 6, 1, 4, dark);
  c.rect(11, 7, 1, 3, dark);
  c.outline(pal);
  return [c];
}

/** 噬骨鸦：12×12，翅膀抖动。 */
function crow(pal) {
  const body = pal.at('#2c2c3e');
  const wing = pal.at('#454560');
  const eye = pal.at(K.fire);
  const make = (up) => {
    const c = new Canvas(12, 12);
    c.ellipse(6, 7, 2, 2, body);
    c.rect(7, 5, 2, 1, body); // 头
    c.set(9, 5, eye);
    c.set(10, 5, pal.at(K.gold)); // 喙
    if (up) {
      c.line(3, 3, 6, 6, wing);
      c.line(9, 3, 6, 6, wing);
      c.rect(2, 2, 2, 1, wing);
      c.rect(8, 2, 2, 1, wing);
    } else {
      c.line(2, 7, 5, 7, wing);
      c.line(7, 7, 10, 7, wing);
      c.rect(1, 7, 2, 1, wing);
      c.rect(9, 7, 2, 1, wing);
    }
    c.outline(pal);
    return c;
  };
  return [make(true), make(false)];
}

/** 水鬼：半透明（同色降 alpha），长发。 */
function waterGhost(pal) {
  const body = pal.at('#60a5fa', 150);
  const deep = pal.at('#454560', 190);
  const hair = pal.at('#14141c', 200);
  const make = (sway) => {
    const c = new Canvas(16, 16);
    c.ellipse(8 + sway, 5, 2, 2, body);
    c.rect(6 + sway, 3, 1, 1, hair);
    // 长发垂下
    c.line(6 + sway, 6, 5, 12, hair);
    c.line(10 + sway, 6, 11, 12, hair);
    // 身体化成水尾
    c.rect(6 + sway, 7, 4, 4, body);
    c.line(7 + sway, 11, 6, 14, deep);
    c.line(9 + sway, 11, 10, 14, deep);
    c.set(7 + sway, 5, pal.at(K.light, 200));
    c.outline(pal);
    return c;
  };
  return [make(0), make(1)];
}

/** 毒蛇：蜿蜒，3 帧。 */
function snake(pal) {
  const scale = pal.at('#4ade80');
  const belly = pal.at('#2dd4bf', 200);
  const eye = pal.at(K.gold);
  const make = (phase) => {
    const c = new Canvas(16, 16);
    for (let x = 2; x < 14; x += 1) {
      const y = Math.round(8 + Math.sin((x + phase * 2) * 0.9) * 3);
      c.set(x, y, scale);
      c.set(x, y + 1, belly);
    }
    // 头在左
    const hy = Math.round(8 + Math.sin(phase * 1.8) * 3);
    c.rect(1, hy - 1, 3, 3, scale);
    c.set(2, hy - 1, eye);
    c.set(1, hy + 1, pal.at(K.fire)); // 信子
    c.outline(pal);
    return c;
  };
  return [make(0), make(1), make(2)];
}

/** 香火鬼：灰袍，飘，无脚。 */
function incenseGhost(pal) {
  const robe = pal.at('#6b6b88', 225);
  const hem = pal.at('#454560');
  const smoke = pal.at(K.gold, 130);
  const make = (lift) => {
    const c = new Canvas(16, 16);
    c.ellipse(8, 5 - lift, 3, 3, robe);
    c.rect(5, 7 - lift, 6, 6, robe);
    // 散开的下摆
    for (let i = 0; i < 6; i += 1) c.set(5 + i, 13 - lift + (i % 2), hem);
    c.set(7, 4 - lift, pal.at(INK));
    c.set(9, 4 - lift, pal.at(INK));
    // 袖里冒出的香
    c.set(3, 8 - lift, smoke);
    c.set(2, 6 - lift, smoke);
    c.outline(pal);
    return c;
  };
  return [make(0), make(1)];
}

/** 无主飞剑：斜插，剑身有裂。 */
function straySword(pal) {
  const steel = pal.at('#d8d8e8');
  const crack = pal.at('#6b6b88');
  const hilt = pal.at(K.gold);
  const c = new Canvas(16, 16);
  c.line(4, 13, 11, 2, steel);
  c.line(5, 13, 12, 2, steel);
  c.line(7, 10, 9, 7, crack); // 裂纹
  c.rect(3, 12, 4, 1, hilt);
  c.rect(3, 13, 1, 2, hilt);
  c.outline(pal);
  return [c];
}

/** 妄念：半透明剪影，复制玩家轨迹。 */
function delusion(pal) {
  const sil = pal.at('#818cf8', 120);
  const core = pal.at('#0b0b0f', 180);
  const make = (w) => {
    const c = new Canvas(16, 16);
    c.ellipse(8, 4 + w, 3, 3, core);
    c.rect(5, 7 + w, 6, 6, core);
    // 边缘一层淡紫，像没聚焦
    c.rect(4, 6 + w, 1, 7, sil);
    c.rect(11, 6 + w, 1, 7, sil);
    c.set(7, 4 + w, sil);
    c.set(9, 4 + w, sil);
    return c;
  };
  return [make(0), make(1)];
}

/** 山魈：红脸长臂，20×20。 */
function mountainImp(pal) {
  const fur = pal.at('#6b6b88');
  const face = pal.at(K.fire);
  const arm = pal.at('#454560');
  const eye = pal.at(K.gold);
  const make = (crouch) => {
    const c = new Canvas(20, 20);
    c.ellipse(10, 17, 5, 1, pal.at(INK, 120));
    c.rect(6, 6 + crouch, 8, 8, fur);
    c.rect(7, 3 + crouch, 6, 4, face); // 红脸
    c.set(8, 4 + crouch, eye);
    c.set(11, 4 + crouch, eye);
    c.set(9, 6 + crouch, pal.at(INK)); // 嘴
    c.set(10, 6 + crouch, pal.at(INK));
    // 长臂过膝
    c.rect(3, 7 + crouch, 2, 9 - crouch, arm);
    c.rect(15, 7 + crouch, 2, 9 - crouch, arm);
    c.rect(7, 14 + crouch, 2, 2, arm);
    c.rect(11, 14 + crouch, 2, 2, arm);
    c.outline(pal);
    return c;
  };
  return [make(0), make(1), make(2)];
}

/** 坠石：不规则石块。 */
function fallingStone(pal) {
  const rock = pal.at('#454560');
  const hi = pal.at('#6b6b88');
  const c = new Canvas(16, 16);
  c.rect(4, 4, 8, 8, rock);
  c.rect(3, 6, 10, 5, rock);
  c.rect(5, 3, 6, 10, rock);
  c.rect(5, 4, 3, 2, hi); // 左上受光
  c.set(9, 9, pal.at(INK));
  c.outline(pal);
  return [c];
}

/** 天兵：甲胄持戟。 */
function heavenSoldier(pal) {
  const armor = pal.at('#60a5fa');
  const shade = pal.at('#454560');
  const face = pal.at('#9a9ab0');
  const blade = pal.at('#d8d8e8');
  const make = (step) => {
    const c = new Canvas(16, 16);
    c.ellipse(8, 15, 3, 1, pal.at(INK, 120));
    c.rect(5, 6, 6, 6, armor);
    c.rect(5, 10, 6, 2, shade);
    c.rect(6, 2, 4, 4, face);
    c.rect(5, 1, 6, 2, armor); // 盔
    c.set(7, 3, pal.at(INK));
    c.set(9, 3, pal.at(INK));
    // 戟
    c.line(13, 2, 13, 13, shade);
    c.line(12, 1, 14, 3, blade);
    if (step) c.set(4, 13, shade);
    else c.set(11, 13, shade);
    c.outline(pal);
    return c;
  };
  return [make(false), make(true)];
}

/** 剑冢残刃：插在地上，走近才立起来。 */
function brokenBlade(pal) {
  const steel = pal.at('#9a9ab0');
  const dirt = pal.at('#2c2c3e');
  const make = (raised) => {
    const c = new Canvas(16, 16);
    const top = raised ? 1 : 6;
    c.line(6, 13, 8, top, steel);
    c.line(7, 13, 9, top, steel);
    if (raised) c.set(8, top, pal.at(K.light));
    c.rect(4, 12, 8, 3, dirt); // 土堆
    c.outline(pal);
    return c;
  };
  return [make(false), make(true)];
}

/** 尸傀：同门服饰，腐烂，倒下一次会再站起来。24×24。 */
function puppet(pal) {
  const robe = pal.at('#9a9ab0', 235);
  const trim = pal.at('#4ade80', 170);
  const rot = pal.at('#2c2c3e');
  const head = pal.at('#6b6b88');
  const make = (down) => {
    const c = new Canvas(24, 24);
    const oy = down ? 8 : 3;
    c.ellipse(12, 22, 6, 1, pal.at(INK, 120));
    c.rect(8, oy + 6, 8, 11, robe);
    c.rect(8, oy + 6, 8, 1, trim); // 领
    c.rect(8, oy + 12, 8, 1, trim); // 腰
    c.rect(9, oy, 6, 6, head);
    c.set(10, oy + 2, pal.at(INK));
    c.set(13, oy + 2, pal.at(INK));
    // 腐烂的洞
    c.set(11, oy + 14, rot);
    c.set(14, oy + 10, rot);
    c.rect(16, oy + 8, 2, 5, robe);
    c.rect(6, oy + 8, 2, 5, robe);
    if (down) {
      // 倒下：头歪
      c.rect(9, oy + 1, 6, 5, head);
    }
    c.outline(pal);
    return c;
  };
  return [make(false), make(true)];
}

/** 同门：归一门外门服，走得极慢，会跪一次。 */
function sectBrother(pal) {
  const robe = pal.at('#d8d8e8', 235);
  const trim = pal.at('#4ade80');
  const hair = pal.at('#14141c');
  const make = (kneel) => {
    const c = new Canvas(16, 16);
    const oy = kneel ? 4 : 2;
    c.rect(5, oy + 4, 6, 7 - (kneel ? 2 : 0), robe);
    c.rect(5, oy + 7, 6, 1, trim);
    c.rect(6, oy, 4, 4, hair);
    c.rect(4, oy + 5, 1, 4, robe);
    c.rect(11, oy + 5, 1, 4, robe);
    if (kneel) c.rect(5, 13, 6, 2, robe);
    else {
      c.rect(6, 13, 1, 2, hair);
      c.set(9, 13, hair);
    }
    c.outline(pal);
    return c;
  };
  return [make(false), make(true)];
}

/** 山魅：只有上半身，水草缠着。20×20，道人/魔头线。 */
function mountainWraith(pal) {
  const body = pal.at('#2dd4bf', 150);
  const weed = pal.at('#4ade80', 200);
  const eye = pal.at('#f472b6');
  const make = (rise) => {
    const c = new Canvas(20, 20);
    const oy = 6 - rise;
    c.ellipse(10, oy + 3, 3, 3, body);
    c.rect(7, oy + 5, 6, 7, body);
    c.set(9, oy + 2, eye);
    c.set(11, oy + 2, eye);
    // 水草
    c.line(6, oy + 8, 4, oy + 13, weed);
    c.line(13, oy + 7, 16, oy + 12, weed);
    c.line(10, oy + 12, 10, oy + 16, weed);
    // 水面
    c.rect(2, 15, 16, 1, pal.at('#60a5fa', 120));
    c.outline(pal);
    return c;
  };
  return [make(0), make(1), make(2)];
}

// ---------------------------------------------------------------- 精怪

/** 骨僧：僧袍下有骨。20×20。 */
function boneMonk(pal) {
  const robe = pal.at('#f5a524', 200);
  const bone = pal.at('#d8d8e8');
  const hollow = pal.at('#0b0b0f');
  const make = (turn) => {
    const c = new Canvas(20, 20);
    c.ellipse(10, 18, 5, 1, pal.at(INK, 120));
    c.rect(6, 7, 8, 10, robe);
    c.rect(7, 3, 6, 5, bone); // 头骨
    c.set(8, 5, hollow);
    c.set(11, 5, hollow);
    c.rect(9, 7, 2, 1, hollow); // 齿
    // 袍下露出的肋骨
    c.rect(7, 11, 6, 1, bone);
    c.rect(7, 13, 6, 1, bone);
    c.set(6 + turn, 9, bone);
    c.rect(4, 8, 2, 6, robe);
    c.rect(14, 8, 2, 6, robe);
    c.outline(pal);
    return c;
  };
  return [make(0), make(1)];
}

/** 涧蛟仆从：半人半蛟，头部能后仰预警。 */
function jiaoServant(pal) {
  const scale = pal.at('#2dd4bf');
  const fin = pal.at('#60a5fa', 200);
  const eye = pal.at(K.gold);
  const make = (recoil) => {
    const c = new Canvas(16, 16);
    c.ellipse(8, 14, 4, 1, pal.at(INK, 120));
    c.rect(4, 7, 8, 6, scale);
    if (recoil) c.rect(2, 1, 6, 4, scale);
    else c.rect(4, 3, 6, 4, scale);
    c.set(recoil ? 4 : 6, recoil ? 2 : 4, eye);
    // 鳍
    c.line(9, 4, 12, 2, fin);
    c.rect(3, 9, 10, 1, fin);
    c.outline(pal);
    return c;
  };
  return [make(false), make(true)];
}

/** 剑灵：半透明剑形，剑身会亮。 */
function swordSpirit(pal) {
  const blade = pal.at('#d8d8e8', 200);
  const glow = pal.at('#60a5fa', 150);
  const hilt = pal.at('#f5a524');
  const make = (lit) => {
    const c = new Canvas(16, 16);
    c.line(8, 1, 8, 11, blade);
    c.line(7, 3, 7, 11, blade);
    c.line(9, 3, 9, 11, blade);
    if (lit) {
      c.line(6, 2, 6, 12, glow);
      c.line(10, 2, 10, 12, glow);
      c.set(8, 1, pal.at(K.light));
    }
    c.rect(6, 11, 5, 1, hilt);
    c.rect(8, 12, 1, 3, hilt);
    c.outline(pal);
    return c;
  };
  return [make(false), make(true), make(false)];
}

/** 心魔：纯黑剪影，映出你的颜色。 */
function innerDemon(pal) {
  const black = pal.at('#0b0b0f');
  const reflect = pal.at('#c084fc', 165);
  const make = (shown) => {
    const c = new Canvas(16, 16);
    c.ellipse(8, 5, 3, 3, black);
    c.rect(5, 8, 6, 6, black);
    c.rect(4, 9, 1, 4, black);
    c.rect(11, 9, 1, 4, black);
    c.line(6, 14, 5, 16, black);
    c.line(10, 14, 11, 16, black);
    if (shown) {
      // 身上映出一小块你的颜色
      c.rect(7, 9, 2, 2, reflect);
      c.set(7, 4, reflect);
    }
    return c;
  };
  return [make(false), make(true)];
}

/** 雷兽：24×24，角上有电弧。 */
function thunderBeast(pal) {
  const hide = pal.at('#454560');
  const dark = pal.at('#2c2c3e');
  const arc = pal.at('#60a5fa');
  const eye = pal.at(K.gold);
  const make = (zap) => {
    const c = new Canvas(24, 24);
    c.ellipse(12, 21, 7, 1, pal.at(INK, 120));
    c.rect(5, 9, 14, 9, hide);
    c.rect(5, 15, 14, 3, dark);
    c.rect(3, 5, 8, 6, hide); // 头
    c.set(4, 7, eye);
    c.set(6, 7, eye);
    // 两只角
    c.line(4, 5, 2, 1, dark);
    c.line(9, 5, 11, 1, dark);
    if (zap) {
      c.line(2, 1, 4, 2, arc);
      c.line(11, 1, 9, 2, arc);
      c.set(3, 0, arc);
      c.set(10, 0, arc);
    }
    // 腿
    c.rect(6, 18, 2, 3, dark);
    c.rect(16, 18, 2, 3, dark);
    c.outline(pal);
    return c;
  };
  return [make(false), make(true), make(false)];
}

// ---------------------------------------------------------------- 妖将 / Boss

/** 涧中老蛟：长身有鳞，4 帧。32×32。 */
function oldJiao(pal) {
  const scale = pal.at('#2dd4bf');
  const belly = pal.at('#d8d8e8', 210);
  const spine = pal.at('#60a5fa');
  const eye = pal.at(K.fire);
  const fin = pal.at('#818cf8', 200);
  const make = (phase, head) => {
    const c = new Canvas(32, 32);
    // 盘踞的长身：三个弯
    for (let i = 0; i < 26; i += 1) {
      const t = i / 26;
      const y = Math.round(22 - t * 10 + Math.sin(t * 6 + phase) * 3);
      const x = Math.round(4 + t * 22);
      const r = Math.max(1, Math.round(3 - t * 2));
      c.ellipse(x, y, r, r, scale);
      c.set(x, y + r, belly);
      c.set(x, y - r, spine); // 背鳍
    }
    // 头
    const hx = head ? 24 : 26;
    const hy = head ? 6 : 8;
    c.rect(hx, hy, 6, 4, scale);
    c.rect(hx + 5, hy + 1, 2, 2, scale); // 吻
    c.set(hx + 1, hy + 1, eye);
    c.line(hx, hy, hx - 2, hy - 3, fin); // 须
    c.line(hx + 3, hy, hx + 3, hy - 3, spine);
    c.outline(pal);
    return c;
  };
  return [make(0, false), make(1, false), make(2, true), make(3, true)];
}

/** 庙中骨佛：盘坐，腹中有经。48×48。 */
function boneBuddha(pal) {
  const bone = pal.at('#d8d8e8');
  const aged = pal.at('#9a9ab0');
  const hollow = pal.at('#0b0b0f');
  const sutra = pal.at(K.gold);
  const eye = pal.at(K.heaven);
  const make = (openEyes, cracked) => {
    const c = new Canvas(48, 48);
    // 座
    c.rect(8, 38, 32, 6, aged);
    c.rect(6, 42, 36, 3, pal.at('#454560'));
    // 腿（盘坐）
    c.ellipse(24, 36, 14, 4, bone);
    // 身
    c.rect(15, 18, 18, 18, bone);
    c.rect(17, 22, 14, 1, aged); // 肋骨
    c.rect(17, 26, 14, 1, aged);
    c.rect(17, 30, 14, 1, aged);
    // 腹中的经
    c.rect(20, 27, 8, 5, hollow);
    c.rect(21, 28, 6, 3, sutra);
    // 手（结印）
    c.rect(11, 26, 5, 8, bone);
    c.rect(32, 26, 5, 8, bone);
    c.rect(19, 34, 10, 3, bone);
    // 头
    c.ellipse(24, 12, 7, 7, bone);
    c.rect(20, 4, 8, 4, aged); // 肉髻
    if (openEyes) {
      c.rect(19, 11, 3, 2, eye);
      c.rect(26, 11, 3, 2, eye);
    } else {
      c.set(20, 12, hollow);
      c.set(21, 12, hollow);
      c.set(27, 12, hollow);
      c.set(28, 12, hollow);
    }
    c.rect(22, 16, 4, 1, hollow);
    if (cracked) {
      c.line(28, 6, 24, 14, aged); // 裂缝
      c.line(16, 20, 20, 30, aged);
    }
    c.outline(pal);
    return c;
  };
  return [make(false, false), make(false, false), make(false, true), make(true, true), make(true, true), make(true, false)];
}

/** 守栈人：道袍木杖。剑客线他在等死，魔头线他会还手。32×32。 */
function sentinel(pal) {
  const robe = pal.at('#9a9ab0');
  const hem = pal.at('#454560');
  const trim = pal.at(K.wood, 200);
  const staff = pal.at('#f5a524', 220);
  const head = pal.at('#6b6b88');
  const make = (mode) => {
    const c = new Canvas(32, 32);
    c.ellipse(16, 30, 8, 1, pal.at(INK, 120));
    // 长袍到脚，看不见腿
    c.rect(10, 12, 12, 17, robe);
    c.rect(10, 12, 12, 1, trim);
    c.rect(10, 26, 12, 3, hem);
    if (mode === 'lean') c.rect(9, 16, 14, 6, robe);
    // 头，低垂
    c.rect(13, 5, 7, 7, head);
    c.rect(12, 3, 9, 3, pal.at('#d8d8e8', 210)); // 白发
    c.set(14, 8, pal.at(INK));
    // 木杖
    if (mode === 'staff') c.line(25, 4, 23, 29, staff);
    else c.line(26, 10, 24, 29, staff);
    c.outline(pal);
    return c;
  };
  return [make('staff'), make('lean'), make('staff')];
}

/** 双子道人：两个相同的人，各出一帧成对。32×32。 */
function twinDaoists(pal) {
  const robe = pal.at('#818cf8');
  const pale = pal.at('#d8d8e8', 235);
  const face = pal.at('#9a9ab0');
  const one = (x, mirror) => {
    const c = new Canvas(32, 32);
    c.ellipse(x + 5, 30, 5, 1, pal.at(INK, 120));
    c.rect(x, 10, 10, 19, robe);
    c.rect(x, 10, 10, 1, pale);
    c.rect(x + 2, 3, 6, 7, face);
    c.rect(x + 1, 1, 8, 3, pale); // 冠
    c.set(x + 3, 6, pal.at(INK));
    c.set(x + 6, 6, pal.at(INK));
    if (mirror) c.rect(x + 10, 14, 2, 6, robe);
    else c.rect(x - 2, 14, 2, 6, robe);
    return c;
  };
  const pair = (offset) => {
    const c = new Canvas(32, 32);
    c.blit(one(3 + offset, false), 0, 0);
    c.blit(one(17 - offset, true), 0, 0);
    c.outline(pal);
    return c;
  };
  return [pair(0), pair(1), pair(2), pair(1)];
}

/** 雷部残将：甲胄残破。32×32。 */
function thunderGeneral(pal) {
  const armor = pal.at('#60a5fa');
  const broken = pal.at('#454560');
  const glow = pal.at(K.heaven, 190);
  const helm = pal.at('#9a9ab0');
  const make = (phase) => {
    const c = new Canvas(32, 32);
    c.ellipse(16, 30, 8, 1, pal.at(INK, 120));
    c.rect(9, 11, 14, 14, armor);
    // 残破：甲片缺失
    c.set(11, 14, broken);
    c.set(12, 18, broken);
    c.rect(19, 20, 4, 5, broken);
    if (phase > 1) {
      c.set(13, 16, glow);
      c.set(17, 21, glow);
    }
    // 肩
    c.rect(5, 11, 5, 5, armor);
    c.rect(22, 11, 5, 5, armor);
    // 盔
    c.rect(12, 3, 8, 8, helm);
    c.rect(13, 6, 6, 2, pal.at('#0b0b0f'));
    if (phase > 0) c.line(12, 1, 20, 1, glow);
    // 腿
    c.rect(11, 25, 4, 5, broken);
    c.rect(17, 25, 4, 5, broken);
    c.outline(pal);
    return c;
  };
  return [make(0), make(1), make(2)];
}

/** 道：与玩家同形，逐渐透明。48×48。 */
function theTao(pal) {
  const shades = [
    pal.at('#818cf8', 255),
    pal.at('#818cf8', 200),
    pal.at('#c084fc', 170),
    pal.at('#d8d8e8', 150),
    pal.at('#d8d8e8', 110),
    pal.at('#0b0b0f', 200),
  ];
  const make = (i) => {
    const c = new Canvas(48, 48);
    const b = shades[i];
    const halo = pal.at('#c084fc', 80);
    // 盘坐的人形，越来越淡
    c.ellipse(24, 42, 12, 3, b);
    c.rect(19, 20, 10, 20, b);
    c.ellipse(24, 14, 6, 6, b);
    c.rect(14, 24, 4, 12, b);
    c.rect(30, 24, 4, 12, b);
    if (i >= 2) {
      // 身后的光晕
      c.ellipse(24, 24, 18, 20, halo);
      c.rect(19, 20, 10, 20, b);
      c.ellipse(24, 14, 6, 6, b);
    }
    if (i === 5) {
      c.rect(21, 12, 2, 2, pal.at(K.light, 200));
      c.rect(26, 12, 2, 2, pal.at(K.light, 200));
    }
    return c;
  };
  return [0, 1, 2, 3, 4, 5].map(make);
}

// ---------------------------------------------------------------- 掉落物 / 状态

function shard(pal) {
  const make = (hex) => {
    const c = new Canvas(8, 8);
    const v = pal.at(hex);
    c.rect(3, 1, 2, 6, v);
    c.rect(1, 3, 6, 2, v);
    c.set(3, 3, pal.at(K.light));
    return c;
  };
  return {
    thunder: make(K.thunder),
    fire: make(K.fire),
    wood: make(K.wood),
    gold: make(K.gold),
    danger: make(K.danger),
    heaven: make(K.heaven),
  };
}

// ---------------------------------------------------------------- 导出

/** 所有敌人：名字 -> 帧生成函数。 */
export const ENEMY_ART = {
  // 杂兵
  corpse,
  crow,
  waterGhost,
  snake,
  incenseGhost,
  straySword,
  delusion,
  mountainImp,
  fallingStone,
  heavenSoldier,
  brokenBlade,
  puppet,
  sectBrother,
  mountainWraith,
  // 精怪
  boneMonk,
  jiaoServant,
  swordSpirit,
  innerDemon,
  thunderBeast,
  // 妖将 / Boss
  oldJiao,
  boneBuddha,
  sentinel,
  twinDaoists,
  thunderGeneral,
  theTao,
};

export { shard, tone, Canvas, Palette };
