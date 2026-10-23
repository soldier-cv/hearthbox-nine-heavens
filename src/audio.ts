/**
 * 音效：全部用 WebAudio 现场合成，不加载音频文件。
 *
 * 为什么不走 assets/：十六色板像素游戏的音效本来就是方波和噪声，
 * 合成比塞 ogg 更省包体，而且能随伤害倍率实时改变音高与音量——
 * 调手感的时候"数字够不够大"这件事，一半是靠听的。
 */

import type { AudioApi } from '@hearthbox/sdk';

/** 一段可复用的短音。 */
export type SfxName =
  | 'hit'
  | 'crit'
  | 'kill'
  | 'hurt'
  | 'cast'
  | 'levelup'
  | 'pick'
  | 'boss'
  | 'win'
  | 'lose'
  | 'ui'
  | 'dash'
  | 'warn';

export class Audio {
  private api: AudioApi;
  /** 节流：同一种音在这么短时间内不重复播，免得 100 个怪一起死炸耳。 */
  private last = new Map<SfxName, number>();
  private muted = false;

  /** 用平台的时钟，不用 performance.now，这样暂停 / 慢放时音效能跟上。 */
  private clock = () => this.api.ctx.currentTime;

  constructor(api: AudioApi) {
    this.api = api;
  }

  setMuted(v: boolean): void {
    this.muted = v;
  }

  /** 噪声源，打击感全靠它。 */
  private noise(dur: number, gain: number, filterHz: number, q: number): void {
    const ctx = this.api.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = filterHz;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(flt).connect(g).connect(this.api.sfx);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  /** 一个振荡器滑音。 */
  private tone(
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    dur: number,
    gain: number,
    delay = 0,
  ): void {
    const ctx = this.api.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.api.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  play(name: SfxName, strength = 1): void {
    if (this.muted) return;
    const now = this.clock();
    const gap: Record<SfxName, number> = {
      hit: 0.03, crit: 0.05, kill: 0.04, hurt: 0.12, cast: 0.04,
      levelup: 0.2, pick: 0.08, boss: 0.3, win: 0.5, lose: 0.5,
      ui: 0.06, dash: 0.1, warn: 0.15,
    };
    const prev = this.last.get(name) ?? -1;
    if (now - prev < gap[name]) return;
    this.last.set(name, now);

    const s = Math.max(0.3, Math.min(1.6, strength));
    switch (name) {
      case 'hit':
        // 短促的中频噪声 + 一点低频肉感。像素游戏最忌讳"啪"得太脆。
        this.noise(0.05, 0.16 * s, 1800, 1.2);
        this.tone('triangle', 220, 120, 0.06, 0.10 * s);
        break;
      case 'crit':
        // 暴击必须明显更响、更高，玩家才知道倍率生效了。
        this.noise(0.08, 0.22 * s, 3200, 1.6);
        this.tone('square', 880, 330, 0.10, 0.12 * s);
        this.tone('square', 1320, 440, 0.08, 0.06 * s, 0.01);
        break;
      case 'kill':
        this.noise(0.11, 0.16, 900, 0.9);
        this.tone('triangle', 300, 80, 0.13, 0.09);
        break;
      case 'hurt':
        this.noise(0.09, 0.2, 620, 0.8);
        this.tone('sawtooth', 170, 70, 0.16, 0.13);
        break;
      case 'cast':
        this.tone('sine', 520, 900, 0.07, 0.07 * s);
        break;
      case 'warn':
        // 预警音：两声，提醒"要来了"，但不抢打击音的位置。
        this.tone('square', 1200, 1200, 0.03, 0.05);
        this.tone('square', 1200, 1200, 0.03, 0.05, 0.07);
        break;
      case 'dash':
        this.noise(0.07, 0.1, 2600, 2.0);
        this.tone('sine', 300, 700, 0.09, 0.05);
        break;
      case 'levelup':
        this.tone('square', 523, 523, 0.09, 0.1);
        this.tone('square', 659, 659, 0.09, 0.1, 0.08);
        this.tone('square', 784, 784, 0.16, 0.12, 0.16);
        break;
      case 'pick':
        this.tone('square', 700, 1000, 0.06, 0.09);
        break;
      case 'boss':
        this.tone('sawtooth', 110, 55, 0.6, 0.16);
        this.noise(0.5, 0.12, 320, 0.6);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((hz, i) => this.tone('square', hz, hz, 0.22, 0.11, i * 0.13));
        break;
      case 'lose':
        [440, 349, 262, 196].forEach((hz, i) => this.tone('triangle', hz, hz * 0.9, 0.3, 0.12, i * 0.15));
        break;
      case 'ui':
        this.tone('square', 900, 900, 0.03, 0.05);
        break;
    }
  }

  /**
   * 关内背景低音。用两个失谐的振荡器做一个持续的低鸣，
   * 随关卡主色换频率——玩家说不出为什么，但会感觉"这一关不一样"。
   */
  private droneNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  setDrone(baseHz: number | null, level: number): void {
    this.stopDrone();
    if (baseHz === null || this.muted) return;
    const ctx = this.api.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.035;
    master.connect(this.api.music);
    for (const [detune, type] of [[1, 'sine'], [1.5, 'triangle'], [2.01, 'sine']] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = baseHz * detune * (1 + level * 0.02);
      const g = ctx.createGain();
      g.gain.value = detune === 1 ? 0.7 : 0.3;
      osc.connect(g).connect(master);
      osc.start();
      this.droneNodes.push({ osc, gain: g });
    }
  }

  stopDrone(): void {
    for (const n of this.droneNodes) {
      try {
        n.osc.stop();
      } catch {
        // 已经停了
      }
      n.osc.disconnect();
      n.gain.disconnect();
    }
    this.droneNodes = [];
  }
}

/** 关卡编号 -> 低鸣基频。低音越往下，越压迫。 */
export function droneHz(levelIndex: number): number {
  const scale = [110, 103.8, 98, 92.5, 87.3, 82.4, 77.8, 73.4, 65.4];
  return scale[Math.min(8, levelIndex)] ?? 110;
}
