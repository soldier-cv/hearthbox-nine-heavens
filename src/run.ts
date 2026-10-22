/**
 * 一次修行的状态机。
 *
 * 为什么需要它：最常见的 bug 是"状态乱了"——死了还能出手、
 * 结算时还在刷怪、暂停时倒计时还在跑。用显式状态机挡掉这类问题。
 *
 * 六个状态：
 * - level：正在打某一层
 * - levelClear：过关，等玩家确认
 * - choosing：三选一（升级、分支、融合）
 * - dead：气血归零
 * - won：打完第九层
 * - menu：开局前的法术三选二
 */
export type Phase = 'menu' | 'level' | 'levelClear' | 'choosing' | 'dead' | 'won';

export class Run {
  phase: Phase = 'menu';
  /** 当前层，1 起算。 */
  level = 1;
  /** 本层已过时间，秒。 */
  elapsed = 0;
  /** 本次修行总共击杀。 */
  kills = 0;

  /** 进入某一层。 */
  enterLevel(level: number): void {
    this.level = level;
    this.elapsed = 0;
    this.phase = 'level';
  }

  /** 每帧推进。返回本帧是否过关。 */
  tick(dt: number, duration: number): boolean {
    if (this.phase !== 'level') return false;

    this.elapsed += dt;
    if (this.elapsed >= duration) {
      this.phase = 'levelClear';
      return true;
    }
    return false;
  }

  get remaining(): number {
    return 0;
  }

  /** 本层剩余秒数（需要外部传时长，因为每层不同）。 */
  timeLeft(duration: number): number {
    return Math.max(0, Math.ceil(duration - this.elapsed));
  }

  /** 打开三选一。 */
  openChoice(): void {
    this.phase = 'choosing';
  }

  /** 选完继续。 */
  closeChoice(): void {
    this.phase = this.level > 0 ? 'level' : 'menu';
  }

  /** 玩家阵亡。 */
  die(): void {
    if (this.phase === 'won') return;
    this.phase = 'dead';
  }

  /** 通关。 */
  win(): void {
    this.phase = 'won';
  }

  get isPlaying(): boolean {
    return this.phase === 'level';
  }

  reset(): void {
    this.phase = 'menu';
    this.level = 1;
    this.elapsed = 0;
    this.kills = 0;
  }
}
