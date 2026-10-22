import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';
import { CONFIG as C } from './config';
import { Run } from './run';
import {
  BRANCHES,
  FUSIONS,
  SPELLS,
  availableFusions,
  cooldownOf,
  fusionMultiplier,
  levelMultiplier,
  type BranchId,
  type FusionId,
  type SpellId,
} from './skills';
import { declareOptions, tuned, type Tuning } from './tuning';

/**
 * 九霄：像素修仙 Roguelike。
 *
 * 核心动词是**进化**，不是打怪。打怪只是进化的燃料。
 *
 * 三层技能结构见 docs/skills.md：
 *   基础法术(1-5 级) → 进阶分支(二选一，不可逆) → 两个分支融合
 *
 * 九个境界关卡见 docs/levels.md。
 */

interface Enemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  size: number;
  kind: keyof typeof ENEMY_KINDS;
  /** 灼烧剩余秒数。 */
  burn: number;
  /** 减速剩余秒数。 */
  slow: number;
  /** 定身剩余秒数。 */
  rooted: number;
}

interface Shard {
  x: number;
  y: number;
  /** 属于哪个法术。 */
  spell: SpellId;
  life: number;
}

/** 屏幕上飞行的法术弹。 */
interface Bolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  /** 剩余存活秒数。 */
  life: number;
  /** 作用半径，0 表示单体。 */
  radius: number;
  color: string;
}

interface DamageNumber {
  x: number;
  y: number;
  value: number;
  life: number;
}

/** 敌人种类。数值来自 docs/systems.md。 */
const ENEMY_KINDS = {
  dummy: { name: '木桩妖', hp: 40, damage: 8, speed: 0, size: 14, color: '#454560' },
  fox: { name: '野狐', hp: 20, damage: 10, speed: 120, size: 12, color: '#f5a524' },
  golem: { name: '石傀', hp: 80, damage: 14, speed: 40, size: 18, color: '#6b6b88' },
  bat: { name: '蝠群', hp: 8, damage: 6, speed: 160, size: 8, color: '#9a9ab0' },
  guard: { name: '守炉童子', hp: 30, damage: 12, speed: 30, size: 12, color: '#ff6b35' },
  sword: { name: '剑灵', hp: 25, damage: 16, speed: 180, size: 12, color: '#d8d8e8' },
  shadow: { name: '心魔', hp: 60, damage: 14, speed: 85, size: 12, color: '#14141c' },
  crawler: { name: '虚空爬行者', hp: 45, damage: 14, speed: 100, size: 14, color: '#818cf8' },
  thunderBeast: { name: '雷兽', hp: 90, damage: 20, speed: 80, size: 18, color: '#60a5fa' },
  soldier: { name: '天兵', hp: 35, damage: 14, speed: 110, size: 12, color: '#2dd4bf' },
} as const;

/** 每层用哪些敌人。索引 0 对应第 1 层。 */
const LEVEL_ENEMIES: (keyof typeof ENEMY_KINDS)[][] = [
  ['dummy', 'fox'],
  ['golem', 'bat'],
  ['guard', 'bat'],
  ['sword', 'bat'],
  ['shadow'],
  ['crawler', 'guard'],
  ['golem', 'sword'],
  ['thunderBeast', 'soldier'],
  ['thunderBeast', 'soldier'],
];

/** 一个已学会的法术槽。 */
interface Slot {
  /** 基础法术 id，或融合 id。 */
  id: SpellId | FusionId;
  kind: 'base' | 'fusion';
  level: number;
  /** 已经选的分支（基础法术才有）。 */
  branch: BranchId | null;
  /** 距下次可放的剩余秒数。 */
  cooldown: number;
  /** 累计碎片数。 */
  shards: number;
}

export default defineGame({
  id: 'me.nine-heavens',

  async create(ctx: GameContext): Promise<GameInstance> {
    declareOptions(ctx);
    const tune: Tuning = tuned(ctx);

    const saved = ctx.storage.get<{ deepest: number; fusions: number }>('progress');
    let deepest = saved?.deepest ?? 0;
    let fusionsMade = saved?.fusions ?? 0;

    const run = new Run();

    // ---- 玩家 ----
    const player = {
      x: C.width * C.player.spawnX,
      y: C.height * C.player.spawnY,
      hp: 100,
      maxHp: 100,
      /** 闪避剩余冷却。 */
      dodgeCd: 0,
      /** 受击无敌剩余。 */
      invuln: 0,
      /** 加速剩余秒数。 */
      speedBoost: 0,
      /** 面朝方向，用于出手。 */
      facing: { x: 0, y: -1 },
    };

    // ---- 世界 ----
    let enemies: Enemy[] = [];
    const shards: Shard[] = [];
    const bolts: Bolt[] = [];
    const numbers: DamageNumber[] = [];
    let spawnTimer = 0;
    let elapsedTotal = 0;

    // ---- 技能 ----
    let slots: Slot[] = [];
    /** 待选的三张卡。 */
    let offers: Offer[] = [];
    /** 开局时的法术三选二。 */
    let starterChoices: SpellId[] = [];

    // ---- 当前层配置 ----
    let levelDuration = C.levelSeconds[0] as number;
    let levelColor: string = C.colors.wood;

    function currentLevelIndex(): number {
      return Math.min(C.realms.length - 1, Math.max(0, run.level - 1));
    }

    function levelDurationOf(level: number): number {
      return C.levelSeconds[Math.min(level, C.levelSeconds.length) - 1] ?? 120;
    }

    // ---------- 初始化一局 ----------
    function startRun(): void {
      run.reset();
      player.hp = 100;
      player.maxHp = 100;
      player.dodgeCd = 0;
      player.invuln = 0;
      player.speedBoost = 0;
      player.x = C.width * C.player.spawnX;
      player.y = C.height * C.player.spawnY;

      slots = [];
      enemies = [];
      shards.length = 0;
      bolts.length = 0;
      numbers.length = 0;
      elapsedTotal = 0;
      spawnTimer = 0;

      // 开局给三个选择，玩家选两个
      const pool: SpellId[] = ['palm-thunder', 'fire-seal', 'ice-art', 'wood-art', 'gold-body', 'wind-art'];
      starterChoices = pickRandom(pool, 3);
      run.phase = 'menu';
    }

    function chooseStarter(spell: SpellId): void {
      if (slots.length >= 2) return;
      if (slots.some((s) => s.id === spell)) return;
      slots.push({ id: spell, kind: 'base', level: 1, branch: null, cooldown: 0, shards: 0 });

      if (slots.length >= 2) {
        beginLevel(1);
        return;
      }

      // 选完一个之后，光标自动跳到下一个还没选的法术上。
      // 否则玩家会停在一个"已选中"的项上，再按确认没反应，以为卡住了。
      const nextIndex = starterChoices.findIndex(
        (id, i) => i > menuCursor && !slots.some((s) => s.id === id),
      );
      if (nextIndex >= 0) {
        menuCursor = nextIndex;
      } else {
        const anyFree = starterChoices.findIndex((id) => !slots.some((s) => s.id === id));
        if (anyFree >= 0) menuCursor = anyFree;
      }
    }

    function beginLevel(level: number): void {
      run.enterLevel(level);
      levelDuration = levelDurationOf(level);
      levelColor = LEVEL_COLORS[level - 1] ?? C.colors.wood;
      enemies = [];
      bolts.length = 0;
      numbers.length = 0;
      spawnTimer = 0;
      player.x = C.width * C.player.spawnX;
      player.y = C.height * C.player.spawnY;

      // 记录最深境界
      if (level > deepest) {
        deepest = level;
        ctx.storage.set('progress', { deepest, fusions: fusionsMade });
      }
    }

    // ---------- 战斗 ----------
    function spawnEnemy(): void {
      const kinds = LEVEL_ENEMIES[currentLevelIndex()] ?? ['dummy'];
      const kind = kinds[ctx.random.int(0, kinds.length)] ?? 'dummy';
      const def = ENEMY_KINDS[kind];
      const hpScale = 1 + (run.level - 1) * 0.25;

      let x = 0;
      let y = 0;

      if (def.speed === 0) {
        // 不会动的敌人必须生成在画面内，否则它永远停在屏幕外，
        // 玩家看不到也打不到。
        x = ctx.random.float(40, C.width - 40);
        y = ctx.random.float(40, C.height - 40);
      } else {
        // 会动的从边缘进来，不直接压在玩家脸上。
        const edge = ctx.random.int(0, 4);
        if (edge === 0) {
          x = ctx.random.float(0, C.width);
          y = -12;
        } else if (edge === 1) {
          x = C.width + 12;
          y = ctx.random.float(0, C.height);
        } else if (edge === 2) {
          x = ctx.random.float(0, C.width);
          y = C.height + 12;
        } else {
          x = -12;
          y = ctx.random.float(0, C.height);
        }
      }

      enemies.push({
        x,
        y,
        hp: Math.round(def.hp * hpScale * tune.enemyHp(1)),
        maxHp: Math.round(def.hp * hpScale * tune.enemyHp(1)),
        damage: def.damage,
        speed: def.speed,
        size: def.size,
        kind,
        burn: 0,
        slow: 0,
        rooted: 0,
      });
    }

    /** 找到最近的敌人。 */
    function nearestEnemy(x: number, y: number, maxDist: number): Enemy | null {
      let best: Enemy | null = null;
      let bestDist = maxDist * maxDist;
      for (const e of enemies) {
        const dx = e.x - x;
        const dy = e.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      return best;
    }

    /** 对一个敌人造成伤害，附带飘字。 */
    function hitEnemy(enemy: Enemy, rawDamage: number): void {
      const dmg = Math.max(1, Math.round(rawDamage));
      enemy.hp -= dmg;
      numbers.push({ x: enemy.x, y: enemy.y - enemy.size / 2, value: dmg, life: 0.7 });
    }

    function damageAt(x: number, y: number, radius: number, damage: number, element: string): void {
      for (const e of enemies) {
        const dx = e.x - x;
        const dy = e.y - y;
        if (dx * dx + dy * dy > (radius + e.size / 2) ** 2) continue;
        hitEnemy(e, damage);
        if (element === 'fire') e.burn = Math.max(e.burn, 3);
        if (element === 'ice') e.slow = Math.max(e.slow, 2);
        if (element === 'wood') e.rooted = Math.max(e.rooted, 1);
      }
    }

    /** 施放一个槽里的法术。 */
    function cast(slot: Slot): void {
      if (slot.cooldown > 0) return;

      const target = nearestEnemy(player.x, player.y, 160);
      if (!target) return;

      const baseDamage = slot.kind === 'base'
        ? BRANCHES[slot.branch as BranchId]?.damage ?? SPELLS[slot.id as SpellId].damage
        : FUSIONS[slot.id as FusionId].damage;

      const mult = slot.kind === 'base' && slot.branch
        ? 1
        : slot.kind === 'fusion'
          ? fusionMultiplier(slot.level)
          : levelMultiplier(slot.level);

      const dmg = tune.damage(baseDamage * mult);
      const range = slot.kind === 'base'
        ? BRANCHES[slot.branch as BranchId]?.range ?? SPELLS[slot.id as SpellId].range
        : 60;

      const element = slot.kind === 'base'
        ? BRANCHES[slot.branch as BranchId]?.element ?? SPELLS[slot.id as SpellId].element
        : FUSIONS[slot.id as FusionId].element;

      // 直接结算，不飞弹。像素画面里飞弹会看不清。
      if (range >= 100) {
        // 远程单体
        hitEnemy(target, dmg);
        if (element === 'fire') target.burn = Math.max(target.burn, 3);
        if (element === 'ice') target.slow = Math.max(target.slow, 2);
        bolts.push({
          x: player.x,
          y: player.y,
          vx: (target.x - player.x) / 0.08,
          vy: (target.y - player.y) / 0.08,
          damage: 0,
          life: 0.08,
          radius: 0,
          color: ELEMENT_COLOR[element] ?? C.colors.thunder,
        });
      } else {
        // 近身范围
        damageAt(target.x, target.y, range, dmg, element);
      }

      const baseCd = slot.kind === 'base'
        ? BRANCHES[slot.branch as BranchId]?.cooldown ?? SPELLS[slot.id as SpellId].cooldown
        : FUSIONS[slot.id as FusionId].cooldown;
      slot.cooldown = cooldownOf(baseCd, 0);
    }

    // ---------- 掉落与选择 ----------
    function dropShard(x: number, y: number): void {
      // 从玩家已有法术里随机一个
      const bases = slots.filter((s) => s.kind === 'base');
      if (bases.length === 0) return;
      const slot = bases[ctx.random.int(0, bases.length)];
      if (!slot) return;
      shards.push({ x, y, spell: slot.id as SpellId, life: 12 });
    }

    function takeShard(shard: Shard): void {
      const slot = slots.find((s) => s.id === shard.spell);
      if (!slot) return;

      slot.shards += 1;

      // 已选过分支的法术，碎片只用来加深（最多到 5 级）
      if (slot.branch) {
        if (slot.level < 5) slot.level += 1;
        return;
      }

      // 还没满 5 级：升一级
      if (slot.level < 5) {
        slot.level += 1;
        // 刚好升到 5 级时弹分支选择
        if (slot.level === 5) openBranchChoice(slot);
        return;
      }

      // 已经是 5 级但没选分支（比如上次打开了但没选完）：再弹一次
      openBranchChoice(slot);
    }

    /** 打开两选一：进阶分支。 */
    function openBranchChoice(slot: Slot): void {
      const spell = SPELLS[slot.id as SpellId];
      offers = spell.branches.map((id) => ({
        kind: 'branch' as const,
        branchId: id,
        title: BRANCHES[id].name,
        desc: BRANCHES[id].blurb,
      }));
      run.openChoice();
    }

    function openFusionChoice(): void {
      const owned = slots.filter((s) => s.branch).map((s) => s.branch as BranchId);
      const fusions = availableFusions(owned);
      if (fusions.length === 0) return;

      offers = fusions.slice(0, 3).map((f) => ({
        kind: 'fusion' as const,
        fusionId: f.id,
        title: f.name,
        desc: f.blurb,
      }));
      run.openChoice();
    }

    function applyOffer(offer: Offer): void {
      if (offer.kind === 'branch') {
        const slot = slots.find((s) => s.id === (BRANCHES[offer.branchId].from as SpellId));
        if (slot) slot.branch = offer.branchId;
      } else if (offer.kind === 'fusion') {
        const fusion = FUSIONS[offer.fusionId];
        // 移掉两个前置
        slots = slots.filter((s) => !s.branch || !fusion.needs.includes(s.branch));
        slots.push({
          id: fusion.id,
          kind: 'fusion',
          level: 1,
          branch: null,
          cooldown: 0,
          shards: 0,
        });
        fusionsMade += 1;
        ctx.storage.set('progress', { deepest, fusions: fusionsMade });
      } else if (offer.kind === 'shard') {
        for (const slot of slots) {
          if (slot.branch) continue;
          slot.shards += 1;
          if (slot.level < 5) slot.level += 1;
        }
      } else if (offer.kind === 'heal') {
        player.hp = Math.min(player.maxHp, player.hp + 40);
      } else if (offer.kind === 'maxhp') {
        player.maxHp += 15;
        player.hp = player.maxHp;
      }

      offers = [];
      run.closeChoice();
    }

    // ---------- 每帧更新 ----------
    function update(dt: number): void {
      if (run.phase === 'menu') return;
      if (run.phase === 'choosing') return;
      if (run.phase === 'dead' || run.phase === 'won') return;

      elapsedTotal += dt;

      // 计时
      if (run.tick(dt, levelDuration)) {
        // 过关
        if (run.level >= 9) {
          run.win();
          return;
        }
        run.openChoice();
        openLevelClearOffers();
        return;
      }

      // 玩家移动
      const move = ctx.input.p1.move;
      if (move.x !== 0 || move.y !== 0) {
        player.facing.x = move.x;
        player.facing.y = move.y;
      }

      const speed = 85 * tune.moveSpeed(1) * (player.speedBoost > 0 ? 1.8 : 1);
      player.x += move.x * speed * dt;
      player.y += move.y * speed * dt;

      const pad = C.world.padding;
      player.x = Math.min(C.width - pad, Math.max(pad, player.x));
      player.y = Math.min(C.height - pad, Math.max(pad, player.y));

      if (player.speedBoost > 0) player.speedBoost -= dt;
      if (player.dodgeCd > 0) player.dodgeCd -= dt;
      if (player.invuln > 0) player.invuln -= dt;

      // 出手：动手柄 A 或键盘 J
      if (ctx.input.p1.pressed('south') || ctx.input.keyboard.pressed('KeyJ')) {
        for (const slot of slots) cast(slot);
      }

      // 冷却
      for (const slot of slots) {
        if (slot.cooldown > 0) slot.cooldown -= dt;
      }

      // 生成敌人
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const gap = Math.max(0.9, 3.0 - run.level * 0.15);
        spawnTimer = gap;
        spawnEnemy();
      }

      // 敌人行为
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const e = enemies[i];
        if (!e) continue;

        if (e.burn > 0) {
          e.burn -= dt;
          hitEnemy(e, 3 * dt * 60 * 0.05);
        }
        if (e.slow > 0) e.slow -= dt;
        if (e.rooted > 0) e.rooted -= dt;

        if (e.hp <= 0) {
          enemies.splice(i, 1);
          run.kills += 1;
          if (ctx.random.next() < 0.3) dropShard(e.x, e.y);
          continue;
        }

        // 朝玩家走
        if (e.rooted <= 0 && e.speed > 0) {
          const dx = player.x - e.x;
          const dy = player.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          const speedMul = e.slow > 0 ? 0.6 : 1;
          e.x += (dx / len) * e.speed * speedMul * dt;
          e.y += (dy / len) * e.speed * speedMul * dt;
        }

        // 碰撞玩家
        const dist = Math.hypot(player.x - e.x, player.y - e.y);
        if (dist < (e.size + C.player.size) / 2 && player.invuln <= 0) {
          if (!ctx.options.enabled('immortal')) {
            player.hp -= e.damage;
          }
          player.invuln = 0.8;
          if (player.hp <= 0) {
            player.hp = 0;
            run.die();
            return;
          }
        }
      }

      // 碎片
      for (let i = shards.length - 1; i >= 0; i -= 1) {
        const s = shards[i];
        if (!s) continue;
        s.life -= dt;
        if (s.life <= 0) {
          shards.splice(i, 1);
          continue;
        }
        if (Math.hypot(player.x - s.x, player.y - s.y) < 12) {
          shards.splice(i, 1);
          takeShard(s);
          // takeShard 可能弹出分支选择，此时本帧不该继续跑逻辑。
          if (run.phase !== 'level') return;
        }
      }

      // 弹与飘字
      for (let i = bolts.length - 1; i >= 0; i -= 1) {
        const b = bolts[i];
        if (!b) continue;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0) bolts.splice(i, 1);
      }
      for (let i = numbers.length - 1; i >= 0; i -= 1) {
        const n = numbers[i];
        if (!n) continue;
        n.y -= 20 * dt;
        n.life -= dt;
        if (n.life <= 0) numbers.splice(i, 1);
      }
    }

    function openLevelClearOffers(): void {
      // 过关先看能不能融合。能融合时优先展示——那是玩家最想要的东西。
      const owned = slots.filter((s) => s.branch).map((s) => s.branch as BranchId);
      const fusions = availableFusions(owned);
      if (fusions.length > 0) {
        offers = fusions.slice(0, 3).map((f) => ({
          kind: 'fusion' as const,
          fusionId: f.id,
          title: f.name,
          desc: f.blurb,
        }));
        return;
      }

      // 否则三选一：碎片 / 回气 / 淬体
      offers = [
        { kind: 'shard' as const, title: '灵石', desc: '未定型的法术各得一块碎片。' },
        { kind: 'heal' as const, title: '回气', desc: '恢复 40 点气血。' },
        { kind: 'maxhp' as const, title: '淬体', desc: '气血上限 +15，并回满。' },
      ];
    }

    // ---------- 渲染 ----------
    function render(): void {
      const g = ctx.ctx2d;

      g.fillStyle = C.colors.bgDark;
      g.fillRect(0, 0, C.width, C.height);

      // 地面
      g.fillStyle = C.colors.bg;
      g.fillRect(0, 0, C.width, C.height);
      g.fillStyle = C.colors.floor;
      for (let y = 0; y < C.height; y += 16) {
        for (let x = 0; x < C.width; x += 16) {
          if ((x / 16 + y / 16) % 2 === 0) g.fillRect(x, y, 16, 16);
        }
      }

      // 层色光晕
      g.fillStyle = levelColor;
      g.globalAlpha = 0.08;
      g.fillRect(0, 0, C.width, C.height);
      g.globalAlpha = 1;

      if (run.phase === 'menu') {
        renderMenu(g);
        return;
      }

      // 碎片
      for (const s of shards) {
        g.fillStyle = ELEMENT_COLOR[SPELLS[s.spell].element] ?? C.colors.text;
        const bob = Math.sin(elapsedTotal * 6) * 1.5;
        g.fillRect(s.x - 2, s.y - 2 + bob, 4, 4);
      }

      // 敌人
      for (const e of enemies) {
        const def = ENEMY_KINDS[e.kind];
        g.fillStyle = e.burn > 0 ? C.colors.fire : def.color;
        g.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
        // 血条
        if (e.hp < e.maxHp) {
          g.fillStyle = C.colors.bgDark;
          g.fillRect(e.x - e.size / 2, e.y - e.size / 2 - 4, e.size, 2);
          g.fillStyle = C.colors.danger;
          g.fillRect(e.x - e.size / 2, e.y - e.size / 2 - 4, (e.hp / e.maxHp) * e.size, 2);
        }
      }

      // 弹
      for (const b of bolts) {
        g.fillStyle = b.color;
        g.fillRect(b.x - 1, b.y - 1, 2, 2);
      }

      // 玩家
      const half = C.player.size / 2;
      g.fillStyle = player.invuln > 0 ? C.colors.text : C.colors.gold;
      g.fillRect(player.x - half, player.y - half, C.player.size, C.player.size);
      // 面朝方向的小点
      g.fillStyle = C.colors.bgDark;
      g.fillRect(player.x + player.facing.x * 3 - 1, player.y + player.facing.y * 3 - 1, 2, 2);

      // 飘字
      if (ctx.options.enabled('damage-numbers')) {
        g.font = '8px monospace';
        for (const n of numbers) {
          g.fillStyle = C.colors.text;
          g.fillText(String(n.value), n.x - 4, n.y);
        }
      }

      // HUD
      renderHud(g);

      if (run.phase === 'choosing') renderOffers(g);
      if (run.phase === 'dead') renderEnd(g, '道消', C.colors.danger);
      if (run.phase === 'won') renderEnd(g, '飞升', C.colors.heaven);
    }

    function renderMenu(g: CanvasRenderingContext2D): void {
      g.fillStyle = C.colors.text;
      g.font = '12px monospace';
      g.fillText(`选择法术 ${slots.length}/2`, 96, 24);

      starterChoices.forEach((id, i) => {
        const spell = SPELLS[id];
        const y = 40 + i * 40;
        const picked = slots.some((s) => s.id === id);
        const focused = i === menuCursor;

        g.fillStyle = picked ? C.colors.gold : focused ? C.colors.text : C.colors.gray;
        g.fillRect(50, y, 220, 34);

        g.fillStyle = C.colors.bgDark;
        g.font = '12px monospace';
        g.fillText(spell.name, 60, y + 14);
        g.font = '8px monospace';
        g.fillText(spell.blurb, 60, y + 27);
      });

      g.fillStyle = C.colors.textDim;
      g.font = '8px monospace';
      g.fillText('方向键选择 / 攻击键确认', 78, 172);
    }

    function renderHud(g: CanvasRenderingContext2D): void {
      // 气血
      g.fillStyle = C.colors.bgDark;
      g.fillRect(8, 8, 64, 5);
      g.fillStyle = C.colors.danger;
      g.fillRect(8, 8, Math.max(0, (player.hp / player.maxHp) * 64), 5);

      // 境界与时间
      g.fillStyle = C.colors.text;
      g.font = '8px monospace';
      g.fillText(`${C.realms[currentLevelIndex()]} ${run.level}/9`, 8, 22);
      g.fillText(`${run.timeLeft(levelDuration)}s`, C.width - 30, 22);

      // 法术槽
      slots.forEach((slot, i) => {
        const x = C.width / 2 - 32 + i * 22;
        const y = C.height - 22;
        const color = slot.kind === 'fusion'
          ? C.colors.heaven
          : ELEMENT_COLOR[SPELLS[slot.id as SpellId].element] ?? C.colors.gray;

        g.fillStyle = C.colors.bgDark;
        g.fillRect(x, y, 20, 20);
        g.fillStyle = color;
        g.fillRect(x + 2, y + 2, 16, 16);

        // 冷却遮罩
        if (slot.cooldown > 0) {
          g.fillStyle = 'rgba(11,11,15,0.7)';
          g.fillRect(x + 2, y + 2, 16, 16);
        }

        // 等级点
        g.fillStyle = C.colors.bgDark;
        for (let lv = 0; lv < Math.min(5, slot.level); lv += 1) {
          g.fillRect(x + 2 + lv * 3, y + 16, 2, 2);
        }
      });
    }

    function renderOffers(g: CanvasRenderingContext2D): void {
      g.fillStyle = 'rgba(11,11,15,0.85)';
      g.fillRect(0, 0, C.width, C.height);

      g.fillStyle = C.colors.text;
      g.font = '12px monospace';
      g.fillText('三选一', 130, 24);

      offers.forEach((offer, i) => {
        const y = 44 + i * 42;
        g.fillStyle = C.colors.bg;
        g.fillRect(40, y, 240, 34);
        g.fillStyle = C.colors.gold;
        g.fillRect(40, y, 3, 34);

        g.fillStyle = C.colors.text;
        g.font = '12px monospace';
        g.fillText(offer.title, 52, y + 14);
        g.fillStyle = C.colors.textDim;
        g.font = '8px monospace';
        g.fillText(offer.desc, 52, y + 26);
      });
    }

    function renderEnd(g: CanvasRenderingContext2D, title: string, color: string): void {
      g.fillStyle = 'rgba(11,11,15,0.88)';
      g.fillRect(0, 0, C.width, C.height);

      g.fillStyle = color;
      g.font = '16px monospace';
      g.fillText(title, (C.width - g.measureText(title).width) / 2, 70);

      g.fillStyle = C.colors.textDim;
      g.font = '8px monospace';
      g.fillText(`到达第 ${run.level} 层 · 击杀 ${run.kills}`, 90, 92);
      g.fillText('按攻击键重来', 118, 110);
    }

    // ---------- 输入：选择界面 ----------
    /** 菜单光标，选法术与三选一共用。 */
    let menuCursor = 0;

    function handleChoiceInput(): void {
      const confirm =
        ctx.input.p1.pressed('south') || ctx.input.keyboard.pressed('KeyJ');
      const up =
        ctx.input.p1.pressed('up') ||
        ctx.input.keyboard.pressed('KeyW') ||
        ctx.input.keyboard.pressed('ArrowUp');
      const down =
        ctx.input.p1.pressed('down') ||
        ctx.input.keyboard.pressed('KeyS') ||
        ctx.input.keyboard.pressed('ArrowDown');

      if (run.phase === 'menu') {
        if (starterChoices.length === 0) return;
        if (up) menuCursor = (menuCursor - 1 + starterChoices.length) % starterChoices.length;
        if (down) menuCursor = (menuCursor + 1) % starterChoices.length;
        if (confirm) {
          const chosen = starterChoices[menuCursor];
          if (chosen) chooseStarter(chosen);
        }
        return;
      }

      if (run.phase === 'choosing') {
        const count = Math.max(1, offers.length);
        if (up) menuCursor = (menuCursor - 1 + count) % count;
        if (down) menuCursor = (menuCursor + 1) % count;
        if (confirm) {
          const picked = offers[menuCursor] ?? offers[0];
          if (picked) applyOffer(picked);
          menuCursor = 0;
        }
        return;
      }

      if (run.phase === 'dead' || run.phase === 'won') {
        if (confirm) {
          menuCursor = 0;
          startRun();
        }
      }
    }

    startRun();

    return {
      update(dt: number) {
        handleChoiceInput();
        update(dt);
      },
      render() {
        render();
      },
      dispose() {
        ctx.storage.set('progress', { deepest, fusions: fusionsMade });
      },
    };
  },
});

/** 每层的环境色。索引 0 对应第 1 层。 */
const LEVEL_COLORS = [
  '#4ade80',
  '#6b6b88',
  '#f5a524',
  '#9a9ab0',
  '#d8d8e8',
  '#818cf8',
  '#c084fc',
  '#60a5fa',
  '#c084fc',
];

const ELEMENT_COLOR: Record<string, string> = {
  thunder: '#60a5fa',
  fire: '#ff6b35',
  ice: '#2dd4bf',
  wood: '#4ade80',
  metal: '#f5a524',
  wind: '#9a9ab0',
};

type Offer =
  | { kind: 'branch'; branchId: BranchId; title: string; desc: string }
  | { kind: 'fusion'; fusionId: FusionId; title: string; desc: string }
  | { kind: 'shard'; title: string; desc: string }
  | { kind: 'heal'; title: string; desc: string }
  | { kind: 'maxhp'; title: string; desc: string };

function pickRandom<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}
