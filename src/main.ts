/**
 * 九霄入口。
 *
 * 只做三件事：组装一帧的战斗上下文、推进状态机、把结果交给渲染层。
 * 数值在 balance.ts，技能在 skills.ts，关卡形状在 shapes.ts，这里不写裸数字。
 */

import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';
import type { Atlas } from './atlas';
import { Atlas as AtlasCls } from './atlas';
import { Audio, droneHz } from './audio';
import {
  DAO_CLEAR,
  DODGE,
  INVULN_ON_HIT,
  MANA,
  SHARD_PER_LEVEL,
  TIER,
  daoFirstClear,
  xiuForLevelClear,
} from './balance';
import { CHARACTERS, CHAR_ORDER, isUnlocked } from './characters';
import type { Ctx } from './combat';
import { cast, resolveTelegraph, spawnEnemy, updateBolts, updateEnemies, updateFields } from './combat';
import { C, HEIGHT, PLAYER, TERRAIN_PROPS, WIDTH } from './config';
import type { Enemy } from './entities';
import { getHp, getMaxHp } from './entities';
import { keywordSum } from './keywords';
import type { Offer } from './offers';
import { daoToNext, makeOffers, starterChoices } from './offers';
import type { Derived, PlayerState, Slot } from './player';
import { deriveFromSave, makePlayer, outerLevelOf, refill, slotCap, tickPlayer } from './player';
import type { View } from './render';
import { STAT_KEYS, render } from './render';
import { Run } from './run';
import type { LevelPlan } from './routes';
import { planFor, validateRoutes } from './routes';
import type { CharSave } from './save';
import { Saves, availablePoints, capFor, clearedByCharFrom, emptyCharSave, outerLevel, startLevelFor } from './save';
import type { ShapeState } from './shapes';
import { SHAPES, makeState } from './shapes';
import type { CharKey, SpellId } from './skills';
import { BRANCHES, FUSIONS, SPELLS } from './skills';
import { declareOptions, tuned, type Tuning } from './tuning';
import { World } from './world';

export default defineGame({
  id: 'me.nine-heavens',

  async create(ctx: GameContext): Promise<GameInstance> {
    declareOptions(ctx);
    const tune: Tuning = tuned(ctx);
    const audio = new Audio(ctx.audio);

    // 开发期就拦住配置错误，别等玩家打到那一关才发现。
    const routeErrors = validateRoutes();
    if (routeErrors.length) console.error('关卡配置违规：', routeErrors);

    const atlas = new AtlasCls(
      await ctx.assets.image('sprites.png'),
      await ctx.assets.json('manifest.json'),
    );

    const saves = new Saves(
      (k) => ctx.storage.get(k),
      (k, v) => ctx.storage.set(k, v),
    );

    const run = new Run();
    const world = new World();

    // ---- 这一局的可变状态 ----
    let char: CharKey = 'swordsman';
    let derived: Derived = deriveFromSave(saves.char(char));
    let player: PlayerState = makePlayer(ctx, derived);
    let plan: LevelPlan = planFor(char, 0);
    let shape: ShapeState = makeState(plan);
    let enemies: Enemy[] = [];
    let offers: Offer[] = [];
    let cursor = 0;
    let pickedStarters: number[] = [];
    let cutText = '';
    let summary = '';
    let storyChoices: { title: string; blurb: string }[] = [];
    let metaChar: CharKey = 'swordsman';
    let metaCursor = 0;
    /** 本局是否用过金手指。用过的局不记成就。 */
    let tainted = false;
    /** 三选一结束后回到哪个阶段。平时回 playing，过关那一刻触发则回 cleared。 */
    let afterChoice: 'playing' | 'cleared' | 'won' = 'playing';
    /** 本关的场景件（树、坟、石灯）。按关卡定死，不会每帧乱跳。 */
    let props: { frame: string; x: number; y: number }[] = [];
    /** 验收截图用的不死。只在 ?debug=1 时能被打开。 */
    let debugInvincible = false;
    /**
     * 本次按键是否已经被菜单消费。
     * 不加这个，按 J 跳过过场的同一帧里 update() 会再读到 J，
     * 于是刚进关就自动放了一招 —— 道人第 7 关「打他就输」会当场判负。
     */
    let attackConsumed = false;

    const cleared = (): Record<CharKey, number> => clearedByCharFrom(saves);

    // ---- 战斗上下文 ----
    function combat(): Ctx {
      const save = saves.char(char);
      return {
        g: ctx.ctx2d,
        plan,
        levelIndex: plan.n - 1,
        def: CHARACTERS[char],
        charKey: char,
        p: player,
        w: world,
        tune,
        enemies,
        level: derived.level,
        keywordSum: keywordSum(player.keywords),
        damageBonus: derived.damageBonus,
        cooldownCut: derived.cooldownCut,
        speedBonus: derived.speedBonus,
        crit: derived.crit,
        killHeal: derived.killHeal,
        guard: shape.guard,
        exit: null,
        has: (id) => player.keywords.includes(id),
        rand01: () => ctx.random.next(),
        hurt: (amount) => hurtPlayer(amount),
        onKill: (e) => onKill(e),
        sfx: (name, strength) => {
          if (tune.soundOn()) audio.play(name, strength);
        },
        rumble: (s, w, ms) => ctx.rumble(s, w, ms),
      };
    }

    /** 玩家掉血。无敌帧和格挡都在这里，不散落到各处。 */
    function hurtPlayer(amount: number): void {
      if (player.invuln > 0) return;
      if (debugInvincible) return;
      if (tune.immortal()) {
        tainted = true;
        player.invuln = 0.4;
        return;
      }
      let dmg = amount;
      if (player.guard > 0) dmg *= 0.3;
      player.hp -= dmg;
      player.invuln = INVULN_ON_HIT;
      if (char === 'swordsman' && !player.keywords.includes('sword-heart')) {
        player.intent = Math.floor(player.intent / 2);
      }
      if (tune.soundOn()) audio.play('hurt');
      if (tune.shake()) world.addShake(2.5);
      ctx.rumble(0.5, 0.3, 90);
      if (player.hp <= 0) die();
    }

    /** 击杀：给道行、掉碎片、记数。 */
    function onKill(e: Enemy): void {
      const c = combat();
      const dao = Math.round(e.dao * tune.dao(1));
      player.dao += dao;
      run.kills += 1;
      shape.kills += 1;

      // 击杀回血。
      const heal = Math.round(player.maxHp * derived.killHeal);
      player.hp = Math.min(player.maxHp, player.hp + heal);

      if (char === 'daoist') player.mana = Math.min(MANA.max, player.mana + MANA.killRestore);

      // 碎片：掉给一个还没满级的槽。
      const slot = player.slots.findIndex((s) => s.level < slotCap(s));
      if (slot >= 0 && ctx.random.next() < 0.4) {
        world.spawnShard({
          x: e.x, y: e.y, vx: 0, vy: -20, slot, life: 10, taken: false,
          fx: 'spr_shard_gold_0',
        });
      }

      world.burst(e.x, e.y, C.gold, 6, 70, 1);
      if (tune.soundOn()) audio.play('kill');

      // 道行满了就弹三选一。
      if (daoToNext(player) <= 0 && player.picks < 12) openChoice(false);

      void c;
    }

    function die(): void {
      player.hp = 0;
      run.to('dead');
      summary = `到达第 ${run.level} 关 · 击杀 ${run.kills}`;
      if (tune.soundOn()) audio.play('lose');
      audio.stopDrone();
    }

    // ---- 流程 ----

    function beginRun(key: CharKey): void {
      char = key;
      const save = saves.char(key);
      derived = deriveFromSave(save);
      player = makePlayer(ctx, derived);
      offers = starterChoices(key).map((id) => ({
        kind: 'skill' as const,
        spell: id,
        title: SPELLS[id].name,
        blurb: SPELLS[id].blurb,
      }));
      pickedStarters = [];
      cursor = 0;
      run.to('starter');
    }

    function chooseStarter(index: number): void {
      if (pickedStarters.includes(index) || pickedStarters.length >= 2) return;
      pickedStarters.push(index);
      const offer = offers[index];
      if (offer?.kind === 'skill') {
        player.slots.push({
          id: offer.spell, kind: 'base', level: derived.level >= 15 ? 3 : derived.level >= 5 ? 2 : 1,
          branch: null, cd: 0, shards: 0,
        });
      }
      if (pickedStarters.length >= 2) startLevel(startLevelFor(saves.char(char)));
    }

    /**
     * 撒场景件。按关卡 seed 算，同一个关卡每次进去位置一致。
     * 只撒在离中心 70 像素以外，避开出生点和木牌，免得挡视线。
     */
    function makeProps(terrainIndex: number, level: number, key: CharKey): { frame: string; x: number; y: number }[] {
      const kinds = TERRAIN_PROPS[terrainIndex] ?? [];
      if (!kinds.length) return [];

      let seed = (0x9e37 ^ (level * 7919) ^ (key.length * 131)) >>> 0;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const out: { frame: string; x: number; y: number }[] = [];
      for (let i = 0; i < 9; i += 1) {
        const x = 16 + rnd() * (WIDTH - 32);
        const y = 20 + rnd() * (HEIGHT - 40);
        // 出生点周围留空，别一开局就站在树里。
        if (Math.hypot(x - WIDTH / 2, y - HEIGHT / 2) < 58) continue;
        // 出口（RUN 关）和木牌（HOLD 关）前面不放东西。
        if (Math.hypot(x - (WIDTH - 24), y - HEIGHT / 2) < 34) continue;
        if (Math.hypot(x - WIDTH / 2, y - HEIGHT * 0.44) < 30) continue;
        const kind = kinds[Math.floor(rnd() * kinds.length)]!;
        out.push({ frame: `spr_prop_${kind}_0`, x, y });
      }
      return out;
    }

    function startLevel(n: number): void {
      plan = planFor(char, n - 1);
      shape = makeState(plan);
      enemies = [];
      world.clear();
      player.x = WIDTH / 2;
      player.y = HEIGHT / 2;
      cutText = plan.cut;
      props = makeProps(plan.terrain, n, char);
      run.enter(n, derived.level);

      if (tune.soundOn()) audio.setDrone(droneHz(n - 1), n);

      // 看过的过场可跳过。
      const seen = saves.char(char).cleared[n - 1];
      if (seen && tune.skipCutscenes()) enterLevel();
      else run.to('cutscene');
    }

    function enterLevel(): void {
      run.to('playing');
      const c = combat();
      SHAPES[plan.shape].begin(shape, c);
    }

    function openChoice(preferFusion: boolean): void {
      offers = makeOffers(
        { p: player, char, def: CHARACTERS[char], level: derived.level, ownedKeywords: player.keywords },
        () => ctx.random.next(),
        preferFusion,
      );
      cursor = 0;
      run.to('choosing');
    }

    function applyOffer(offer: Offer): void {
      switch (offer.kind) {
        case 'enhance': {
          const slot = player.slots[offer.slotIndex];
          if (slot && slot.level < slotCap(slot)) slot.level += 1;
          break;
        }
        case 'branch': {
          const slot = player.slots[offer.slotIndex];
          if (slot) slot.branch = offer.branch;
          break;
        }
        case 'skill': {
          if (player.slots.length < 3) {
            player.slots.push({ id: offer.spell, kind: 'base', level: 1, branch: null, cd: 0, shards: 0 });
          }
          break;
        }
        case 'fusion': {
          const f = FUSIONS[offer.fusion];
          player.slots = player.slots.filter((s) => !s.branch || !f.needs.includes(s.branch));
          player.slots.push({ id: f.id, kind: 'fusion', level: 1, branch: null, cd: 0, shards: 0 });
          player.fusions += 1;
          break;
        }
        case 'stat':
          applyStatOffer(offer.stat);
          break;
        case 'keyword':
          if (!player.keywords.includes(offer.keyword)) player.keywords.push(offer.keyword);
          break;
      }
      player.picks += 1;
      offers = [];
      // 回到进来之前的阶段：战斗中回 playing，过关那一刻触发则回 cleared。
      const next = afterChoice;
      afterChoice = 'playing';
      run.to(next);
    }

    function applyStatOffer(stat: string): void {
      switch (stat) {
        case 'hp':
          player.maxHp = Math.round(player.maxHp * 1.25);
          player.hp = player.maxHp;
          break;
        case 'damage':
          derived = { ...derived, damageBonus: derived.damageBonus + 0.15 };
          break;
        case 'cooldown':
          derived = { ...derived, cooldownCut: derived.cooldownCut + 0.1 };
          break;
        case 'speed':
          derived = { ...derived, speedBonus: derived.speedBonus + 0.08 };
          break;
        case 'crit':
          derived = { ...derived, crit: derived.crit + 0.08 };
          break;
        case 'killHeal':
          derived = { ...derived, killHeal: derived.killHeal + 0.005 };
          break;
        case 'mana':
          player.mana = Math.min(MANA.max + 20, player.mana + 20);
          break;
      }
    }

    /** 过关结算：给修为、记首通、弹下一关。 */
    function clearLevel(): void {
      const save = saves.char(char);
      const first = !save.cleared[plan.n - 1];
      let xiu = xiuForLevelClear(plan.n);
      if (first) xiu = Math.round(xiu * 1.5);
      else xiu = Math.round(xiu * 0.5);

      player.dao += DAO_CLEAR + (first ? daoFirstClear(plan.n - 1) : 0);

      save.xiu += xiu;
      save.cleared[plan.n - 1] = true;
      save.fusionsMade += player.fusions;
      if (plan.n === 9) save.runsCompleted += 1;
      saves.writeChar(char, save);

      summary = `${first ? '首通' : '重刷'} · 修为 +${xiu.toLocaleString('zh-CN')}`;
      if (tune.soundOn()) audio.play(plan.n === 9 ? 'win' : 'levelup');

      const finished = plan.n >= 9;
      if (finished) audio.stopDrone();

      // 过关道行可能刚好把道行推过门槛。这一下必须当场给选择，
      // 否则要等到下一关第一次击杀才弹 —— 玩家会以为奖励被吞了。
      if (daoToNext(player) <= 0 && player.picks < 12) {
        afterChoice = finished ? 'won' : 'cleared';
        openChoice(false);
        return;
      }

      run.to(finished ? 'won' : 'cleared');
    }

    // ---- 每帧 ----

    function update(dt: number): void {
      audio.setMuted(!tune.soundOn());

      if (run.phase === 'playing') {
        run.tick(dt);
        const c = combat();

        movePlayer(dt);
        tickPlayer(player, CHARACTERS[char], tune, dt, saves.char(char).points.resource);

        if (player.dodgeCd <= 0 && pressedDodge()) dodge();
        if (!attackConsumed && pressedAttack()) {
          const ready = player.slots.find((s) => s.cd <= 0);
          if (ready) cast(c, ready);
        }

        updateEnemies(c, dt);
        updateBolts(c, dt);
        updateFields(c, dt);

        // 预警到点结算一次。
        for (const t of world.telegraphs) {
          if (t.warnLeft <= 0 && !t.fired) {
            t.fired = true;
            resolveTelegraph(c, t);
          }
        }

        absorbShards();
        world.update(dt);

        const outcome = SHAPES[plan.shape].step(shape, c, dt);
        if (outcome === 'clear') clearLevel();
        else if (outcome === 'fail') die();
        else if (outcome === 'rescue-lost') {
          summary = '你差了一步。';
          run.to('cleared');
        } else if (outcome === 'choice') {
          storyChoices = [
            { title: '接受心魔', blurb: '剑意不再掉落，进关气血 -15%' },
            { title: '拒绝心魔', blurb: '受击时剑意只掉四分之一' },
          ];
          cursor = 0;
          run.to('story-choice');
        }
      }
    }

    function movePlayer(dt: number): void {
      const move = ctx.input.p1.move;
      if (move.x !== 0 || move.y !== 0) {
        player.facing.x = move.x;
        player.facing.y = move.y;
      }
      const boost = player.speedBuff > 0 ? player.speedMul : 1;
      const speed = PLAYER.speed * (1 + derived.speedBonus) * boost * tune.moveSpeed(1);
      player.x = clamp(player.x + move.x * speed * dt, PLAYER.padding, WIDTH - PLAYER.padding);
      player.y = clamp(player.y + move.y * speed * dt, PLAYER.padding, HEIGHT - PLAYER.padding);
    }

    function dodge(): void {
      const fx = player.facing.x || 0;
      const fy = player.facing.y || -1;
      const d = Math.hypot(fx, fy) || 1;
      player.x = clamp(player.x + (fx / d) * DODGE.distance, PLAYER.padding, WIDTH - PLAYER.padding);
      player.y = clamp(player.y + (fy / d) * DODGE.distance, PLAYER.padding, HEIGHT - PLAYER.padding);
      player.dodgeCd = DODGE.cooldown;
      player.invuln = Math.max(player.invuln, DODGE.invuln);
      player.dashTrail = 0.4;
      if (tune.soundOn()) audio.play('dash');
    }

    function absorbShards(): void {
      for (let i = world.shards.length - 1; i >= 0; i -= 1) {
        const s = world.shards[i]!;
        if (Math.hypot(player.x - s.x, player.y - s.y) > 14) continue;
        world.shards.splice(i, 1);
        const slot = player.slots[s.slot];
        if (!slot || slot.level >= slotCap(slot)) continue;
        slot.shards += 1;
        if (slot.shards >= SHARD_PER_LEVEL) {
          slot.shards = 0;
          slot.level += 1;
          if (tune.soundOn()) audio.play('levelup');
        }
      }
    }

    // ---- 输入 ----

    function pressedAttack(): boolean {
      return ctx.input.p1.pressed('south') || ctx.input.keyboard.pressed('KeyJ');
    }

    /** 菜单里的攻击键：消费掉这次按键，同一帧里 update() 就不能再拿它放大招。 */
    function menuAttack(): boolean {
      if (!pressedAttack()) return false;
      attackConsumed = true;
      return true;
    }
    function pressedDodge(): boolean {
      return ctx.input.p1.pressed('east') || ctx.input.keyboard.pressed('KeyK');
    }
    function pressedUp(): boolean {
      return ctx.input.p1.pressed('up') || ctx.input.keyboard.pressed('KeyW') || ctx.input.keyboard.pressed('ArrowUp');
    }
    function pressedDown(): boolean {
      return ctx.input.p1.pressed('down') || ctx.input.keyboard.pressed('KeyS') || ctx.input.keyboard.pressed('ArrowDown');
    }
    function pressedLeft(): boolean {
      return ctx.input.p1.pressed('left') || ctx.input.keyboard.pressed('KeyA') || ctx.input.keyboard.pressed('ArrowLeft');
    }
    function pressedRight(): boolean {
      return ctx.input.p1.pressed('right') || ctx.input.keyboard.pressed('KeyD') || ctx.input.keyboard.pressed('ArrowRight');
    }
    function pressedBack(): boolean {
      return ctx.input.p1.pressed('west') || ctx.input.keyboard.pressed('Escape');
    }

    function handleMenus(): void {
      if (run.phase === 'select') {
        if (pressedUp()) cursor = (cursor + CHAR_ORDER.length - 1) % CHAR_ORDER.length;
        if (pressedDown()) cursor = (cursor + 1) % CHAR_ORDER.length;
        if (menuAttack()) {
          const key = CHAR_ORDER[cursor]!;
          if (!isUnlocked(key, cleared()).ok) return;
          metaChar = key;
          metaCursor = 0;
          run.to('meta');
        }
        return;
      }

      if (run.phase === 'meta') {
        if (pressedUp()) metaCursor = (metaCursor + STAT_KEYS.length - 1) % STAT_KEYS.length;
        if (pressedDown()) metaCursor = (metaCursor + 1) % STAT_KEYS.length;
        if (pressedLeft() || pressedRight()) adjustPoint(pressedRight() ? 1 : -1);
        if (menuAttack()) beginRun(metaChar);
        if (pressedBack()) { cursor = CHAR_ORDER.indexOf(metaChar); run.to('select'); }
        return;
      }

      if (run.phase === 'starter') {
        if (pressedUp()) cursor = (cursor + offers.length - 1) % offers.length;
        if (pressedDown()) cursor = (cursor + 1) % offers.length;
        if (menuAttack()) chooseStarter(cursor);
        return;
      }

      if (run.phase === 'cutscene') {
        if (menuAttack()) enterLevel();
        return;
      }

      if (run.phase === 'choosing') {
        if (pressedUp()) cursor = (cursor + offers.length - 1) % Math.max(1, offers.length);
        if (pressedDown()) cursor = (cursor + 1) % Math.max(1, offers.length);
        if (menuAttack()) {
          const offer = offers[cursor];
          if (offer) applyOffer(offer);
        }
        return;
      }

      if (run.phase === 'story-choice') {
        if (pressedUp() || pressedDown()) cursor = cursor === 0 ? 1 : 0;
        if (menuAttack()) {
          const save = saves.char(char);
          save.demonAccepted = cursor === 0;
          if (cursor === 0) {
            player.keywords.push('sword-heart');
            player.maxHp = Math.round(player.maxHp * 0.85);
            player.hp = Math.min(player.hp, player.maxHp);
          }
          saves.writeChar(char, save);
          clearLevel();
        }
        return;
      }

      if (run.phase === 'cleared') {
        if (menuAttack()) startLevel(run.level + 1);
        return;
      }

      if (run.phase === 'dead' || run.phase === 'won') {
        if (menuAttack()) {
          cursor = 0;
          run.reset();
          audio.stopDrone();
        }
      }
    }

    /** 关外加点。点数不够或到上限就不动。 */
    function adjustPoint(dir: number): void {
      const save = saves.char(metaChar);
      const key = STAT_KEYS[metaCursor]!;
      if (dir > 0) {
        if (availablePoints(save) <= 0) return;
        if (save.points[key] >= capFor(key)) return;
        save.points[key] += 1;
      } else if (save.points[key] > 0) {
        save.points[key] -= 1;
      }
      saves.writeChar(metaChar, save);
    }

    function view(): View {
      const all = {} as Record<CharKey, CharSave>;
      for (const k of CHAR_ORDER) all[k] = saves.char(k);
      return {
        g: ctx.ctx2d,
        atlas,
        phase: run.phase,
        char,
        combat: run.isActive ? combat() : null,
        p: player,
        w: world,
        enemies,
        plan,
        shape,
        props,
        offers,
        cursor,
        pickedStarters,
        timeLeft: Math.max(0, plan.seconds - run.elapsed),
        saves: all,
        cleared: cleared(),
        cutText,
        summary,
        storyChoices,
        metaChar,
        metaCursor,
      };
    }

    run.reset();

    // 调试快照：只在 ?debug=1 时挂到 window 上，验收脚本靠它读阶段和存档。
    // 正常游玩时这段完全不执行，游戏逻辑也不依赖它。
    const debugHook = ctx.debug.enabled
      ? (window as unknown as Record<string, unknown>)
      : null;

    function publishDebug(): void {
      if (!debugHook) return;
      const save = saves.char(char);
      debugHook.__nineHeavens = {
        phase: run.phase,
        level: run.level,
        char,
        dao: Math.round(player.dao),
        hp: Math.round(player.hp),
        maxHp: player.maxHp,
        kills: run.kills,
        enemies: enemies.length,
        nearest: enemies.length
          ? Math.round(Math.min(...enemies.map((e) => Math.hypot(e.x - player.x, e.y - player.y))))
          : -1,
        enemyList: enemies.slice(0, 3).map(
          (e) => `${e.def.key}@${Math.round(e.x)},${Math.round(e.y)} hp=${Math.round(getHp(e))}/${Math.round(getMaxHp(e))} v=${Math.round(e.vx)},${Math.round(e.vy)} sp=${e.speed} tel=${e.telegraph.toFixed(1)}`,
        ),
        slots: player.slots.length,
        slotsDetail: player.slots.map((s) => `${s.id}:${s.level}${s.branch ? '/' + s.branch : ''}`),
        picks: player.picks,
        shape: shape.plan.shape,
        shapeScript: shape.script,
        xiu: save.xiu,
        outerLevel: outerLevelOf(save),
        cleared: save.cleared.slice(),
        points: { ...save.points },
        summary,
      };
    }

    if (debugHook) {
      // 验收截图用：只关掉玩家的受伤。正常游玩时这段不执行。
      debugHook.__nineHeavensInvincible = (on: boolean) => {
        debugInvincible = on === true;
      };

      // 验收用的跳关钩子：逐个形状截图，不必真打 27 关。
      // 只在 ?debug=1 时存在，正常游玩时这段不执行。
      debugHook.__nineHeavensJump = (level: number, key: CharKey = char, skipCutscene = true) => {
        char = key;
        const save = saves.char(key);
        derived = deriveFromSave(save);
        player = makePlayer(ctx, derived);
        // 空槽打不了架，给两门基础功法。
        const starters = starterChoices(key).slice(0, 2);
        player.slots = starters.map((id) => ({
          id, kind: 'base' as const, level: 1, branch: null, cd: 0, shards: 0,
        }));
        player.picks = 0;
        startLevel(level);
        if (skipCutscene && run.phase === 'cutscene') enterLevel();
        return `${key} L${level} ${plan.shape}`;
      };
    }

    return {
      update(dt: number) {
        attackConsumed = false;
        handleMenus();
        update(dt);
        publishDebug();
      },
      render() {
        render(view());
      },
      dispose() {
        audio.stopDrone();
      },
    };
  },
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
