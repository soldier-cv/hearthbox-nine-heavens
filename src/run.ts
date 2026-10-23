/**
 * 一局修行的状态机。
 *
 * 为什么需要它：最常见的 bug 是"状态乱了" —— 死了还能出手、结算时还在刷怪、
 * 选卡时倒计时还在跑。用显式状态机 + 单一 tick 入口挡掉这类问题。
 *
 * 状态：
 *   select      选人
 *   meta        关外（看等级、分修为点）
 *   starter     开局三选二
 *   cutscene    过场（一屏文字）
 *   playing     正在打这一关
 *   choosing    三选一 / 分支二选一 / 融合
 *   choice      剧情分岔（剑客第 5 关接受/拒绝心魔）
 *   grant       剧情节点给东西
 *   dead        气血归零
 *   cleared     过了一关
 *   won         走完九关
 */

export type Phase =
  | 'select'
  | 'roll'
  | 'meta'
  | 'points'
  | 'starter'
  | 'cutscene'
  | 'playing'
  | 'choosing'
  | 'story-choice'
  | 'grant'
  | 'dead'
  | 'cleared'
  | 'won';

/** 只有这几种状态下，世界还在推进。 */
const ACTIVE: Phase[] = ['playing'];

export class Run {
  phase: Phase = 'select';
  /** 当前关卡，1 起。 */
  level = 1;
  /** 本关已过时间。 */
  elapsed = 0;
  /** 本关击杀数（SWARM 的数目目标用）。 */
  kills = 0;
  /** 本关开始时的关外等级快照（避免一局中途升级改变参考一击）。 */
  outerLevelAtStart = 1;

  get isActive(): boolean {
    return ACTIVE.includes(this.phase);
  }

  enter(level: number, outerLevel: number): void {
    this.level = level;
    this.elapsed = 0;
    this.kills = 0;
    this.outerLevelAtStart = outerLevel;
    this.phase = 'playing';
  }

  /** 每帧推进时间。返回是否到点（形状自己决定到点算不算过）。 */
  tick(dt: number): void {
    if (this.phase !== 'playing') return;
    this.elapsed += dt;
  }

  to(p: Phase): void {
    this.phase = p;
  }

  /** 这一局是否还在"没打完"的状态（用来决定能否重开）。 */
  get finished(): boolean {
    return this.phase === 'dead' || this.phase === 'won';
  }

  reset(): void {
    this.phase = 'select';
    this.level = 1;
    this.elapsed = 0;
    this.kills = 0;
  }
}
