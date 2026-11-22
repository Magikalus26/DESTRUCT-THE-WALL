/**
 * SynthAudio.js
 * 100% Web Audio API procedural synthesizer — zero external audio files.
 * Optimized for Safari iOS unlock-on-gesture and low GC overhead.
 */
export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.volume = 0.72;
    this.humNode = null;
    this.humGain = null;
    this._pickupCombo = 0;
    this._lastPickupTime = 0;
    this._lastScratchTime = 0;
    this._lastDroneTime = 0;
  }

  /**
   * Must be called inside a user touch/click gesture to satisfy Safari iOS autoplay policy.
   */
  unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.enabled ? this.volume : 0;
      this.masterGain.connect(this.ctx.destination);
      this._createNoiseBuffer();
      this._startAmbientHum();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.enabled ? this.volume : 0, now, 0.03);
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx && this.enabled) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
  }

  _createNoiseBuffer() {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 1.2;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  _startAmbientHum() {
    if (!this.ctx || this.humNode) return;
    // Subtle 60Hz fluorescent ceiling tube buzz
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 100;
    osc2.type = 'sine';
    osc2.frequency.value = 50;

    filter.type = 'bandpass';
    filter.frequency.value = 180;
    filter.Q.value = 3.0;

    gain.gain.value = 0.014;

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc2.start();
    this.humNode = { osc, osc2 };
    this.humGain = gain;
  }

  _canPlay() {
    return Boolean(this.enabled && this.ctx && this.ctx.state === 'running');
  }

  _playNoiseBurst(duration, freq, q, gainVal, filterType = 'bandpass', startDelay = 0) {
    if (!this._canPlay() || !this.noiseBuffer) return;
    const now = this.ctx.currentTime + startDelay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, now);
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(now, Math.random() * 0.4, duration + 0.02);
  }

  _playTone(freqStart, freqEnd, duration, type = 'sine', gainVal = 0.2, startDelay = 0) {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime + startDelay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playUiClick() {
    this.unlock();
    if (!this._canPlay()) return;
    this._playTone(540, 290, 0.065, 'triangle', 0.16);
    this._playNoiseBurst(0.03, 2200, 1.5, 0.06, 'highpass');
  }

  playSwing(weaponType = 'fists') {
    if (!this._canPlay()) return;
    if (weaponType === 'fists') {
      this._playNoiseBurst(0.09, 420, 1.1, 0.12, 'bandpass');
    } else if (weaponType === 'hammer') {
      this._playNoiseBurst(0.14, 300, 0.9, 0.18, 'lowpass');
      this._playTone(180, 95, 0.11, 'sine', 0.09);
    }
  }

  playHit(materialId, weaponType = 'fists') {
    if (!this._canPlay()) return;
    const jitter = 0.9 + Math.random() * 0.2;
    const isHammer = weaponType === 'hammer';

    if (materialId === 8 || materialId === 9) {
      // Locked security grate — metallic rejection clang
      this._playTone(620 * jitter, 410 * jitter, 0.22, 'square', 0.14);
      this._playTone(930 * jitter, 880 * jitter, 0.18, 'triangle', 0.1);
      this._playNoiseBurst(0.08, 3200, 4.0, 0.14, 'bandpass');
      return;
    }

    switch (materialId) {
      case 1: // Plaster & Red Brick
        this._playNoiseBurst(0.09, 950 * jitter, 1.2, 0.25, 'bandpass');
        this._playTone(145 * jitter, 58, 0.09, 'triangle', isHammer ? 0.28 : 0.22);
        break;
      case 2: // Grey Stone
      case 6: // Key Ore 1
        this._playNoiseBurst(0.11, 1550 * jitter, 2.0, 0.24, 'bandpass');
        this._playTone(210 * jitter, 85, 0.1, 'triangle', 0.24);
        if (materialId === 6) {
          this._playTone(1320 * jitter, 1760 * jitter, 0.12, 'sine', 0.11);
        }
        break;
      case 3: // Dark Reinforced Concrete
        this._playNoiseBurst(0.12, 680 * jitter, 1.4, 0.26, 'bandpass');
        this._playTone(115 * jitter, 46, 0.13, 'sawtooth', 0.18);
        break;
      case 4: // Volcanic Rock & Crystals
      case 7: // Key Ore 2
        this._playNoiseBurst(0.11, 2100 * jitter, 2.8, 0.22, 'bandpass');
        this._playTone(880 * jitter, 1280 * jitter, 0.13, 'sine', 0.12);
        this._playTone(135 * jitter, 55, 0.11, 'triangle', 0.2);
        break;
      case 5: // Heavy Industrial Armor
      default:
        this._playTone(460 * jitter, 240 * jitter, 0.15, 'sawtooth', 0.14);
        this._playTone(840 * jitter, 520 * jitter, 0.12, 'square', 0.09);
        this._playNoiseBurst(0.09, 2800 * jitter, 3.2, 0.2, 'bandpass');
        break;
    }

    if (isHammer) {
      // Extra metallic ping on hammer strike
      this._playTone(1150 * jitter, 720 * jitter, 0.08, 'triangle', 0.09);
    }
  }

  playBreak(materialId) {
    if (!this._canPlay()) return;
    const jitter = 0.88 + Math.random() * 0.24;
    // Crisp shatter crunch
    this._playNoiseBurst(0.16, (materialId >= 4 ? 1900 : 1050) * jitter, 0.9, 0.28, 'bandpass');
    this._playNoiseBurst(0.11, 2600 * jitter, 1.6, 0.14, 'highpass', 0.025);
    this._playTone(125 * jitter, 42, 0.14, 'triangle', 0.24);
    if (materialId === 4 || materialId === 6 || materialId === 7) {
      this._playTone(1100 * jitter, 1650 * jitter, 0.14, 'sine', 0.12, 0.01);
    }
  }

  playPistolShot() {
    if (!this._canPlay()) return;
    const jitter = 0.94 + Math.random() * 0.12;
    this._playNoiseBurst(0.14, 1400 * jitter, 0.7, 0.36, 'bandpass');
    this._playNoiseBurst(0.06, 4000, 1.2, 0.24, 'highpass');
    this._playTone(230 * jitter, 45, 0.12, 'sawtooth', 0.28);
  }

  playPickupRubble() {
    if (!this._canPlay()) return;
    const now = performance.now();
    if (now - this._lastPickupTime < 50) return;
    if (now - this._lastPickupTime < 280) {
      this._pickupCombo = Math.min(12, this._pickupCombo + 1);
    } else {
      this._pickupCombo = 0;
    }
    this._lastPickupTime = now;

    const baseFreq = 460 + this._pickupCombo * 38;
    this._playTone(baseFreq, baseFreq * 1.38, 0.065, 'sine', 0.12);
  }

  playSellCash() {
    if (!this._canPlay()) return;
    // Classic bright cash register cha-ching
    this._playTone(1318.5, 1318.5, 0.09, 'triangle', 0.18, 0);
    this._playTone(1975.5, 2093.0, 0.24, 'sine', 0.22, 0.075);
    this._playTone(2637.0, 2637.0, 0.2, 'triangle', 0.12, 0.085);
    this._playNoiseBurst(0.05, 5200, 2.0, 0.08, 'highpass', 0.06);
  }

  playKeyCollect() {
    if (!this._canPlay()) return;
    const notes = [587.3, 880, 1174.7, 1760];
    notes.forEach((n, idx) => {
      this._playTone(n, n * 1.02, 0.22, 'triangle', 0.18, idx * 0.07);
    });
  }

  playGateUnlock() {
    if (!this._canPlay()) return;
    this._playTone(160, 75, 0.35, 'sawtooth', 0.22, 0);
    this._playNoiseBurst(0.32, 600, 1.4, 0.18, 'bandpass', 0.05);
    this._playTone(523.25, 783.99, 0.16, 'sine', 0.16, 0.22);
    this._playTone(1046.5, 1046.5, 0.25, 'triangle', 0.18, 0.35);
  }

  playUpgradeBuy() {
    if (!this._canPlay()) return;
    this._playTone(440, 660, 0.08, 'triangle', 0.16, 0);
    this._playTone(660, 880, 0.12, 'triangle', 0.18, 0.06);
    this._playTone(880, 1320, 0.18, 'sine', 0.16, 0.12);
  }

  playError() {
    if (!this._canPlay()) return;
    this._playTone(185, 130, 0.14, 'sawtooth', 0.14, 0);
  }

  playEnemyScratch(proximity = 0.5) {
    if (!this._canPlay()) return;
    const now = performance.now();
    if (now - this._lastScratchTime < 750) return;
    this._lastScratchTime = now;
    const vol = Math.max(0.02, Math.min(0.14, proximity * 0.13));
    this._playNoiseBurst(0.05, 2900, 3.2, vol, 'bandpass', 0);
    this._playNoiseBurst(0.045, 3400, 3.8, vol * 0.85, 'bandpass', 0.07);
    this._playNoiseBurst(0.04, 2600, 2.8, vol * 0.7, 'bandpass', 0.14);
  }

  playEnemyAlert(type = 'rat') {
    if (!this._canPlay()) return;
    if (type === 'rat') {
      this._playTone(1550, 920, 0.11, 'sawtooth', 0.12, 0);
      this._playTone(1700, 1180, 0.09, 'triangle', 0.1, 0.08);
    } else if (type === 'insect') {
      for (let i = 0; i < 3; i++) {
        this._playTone(900 + i * 180, 1400, 0.04, 'square', 0.09, i * 0.045);
      }
    } else {
      // Zombie inmate groan
      this._playTone(140, 82, 0.36, 'sawtooth', 0.18, 0);
      this._playTone(195, 112, 0.3, 'triangle', 0.12, 0.03);
    }
  }

  playEnemyHit() {
    if (!this._canPlay()) return;
    this._playNoiseBurst(0.08, 900, 1.2, 0.2, 'bandpass');
    this._playTone(260, 110, 0.09, 'sawtooth', 0.16);
  }

  playEnemyDie() {
    if (!this._canPlay()) return;
    this._playTone(320, 70, 0.24, 'sawtooth', 0.2);
    this._playNoiseBurst(0.16, 1200, 1.0, 0.22, 'bandpass', 0.02);
  }

  playPlayerHurt() {
    if (!this._canPlay()) return;
    this._playTone(130, 48, 0.22, 'sawtooth', 0.28);
    this._playNoiseBurst(0.14, 420, 0.8, 0.24, 'lowpass');
  }

  playDroneLaser() {
    if (!this._canPlay()) return;
    const now = performance.now();
    if (now - this._lastDroneTime < 220) return;
    this._lastDroneTime = now;
    this._playTone(860 + Math.random() * 140, 620, 0.08, 'sine', 0.045);
  }

  playEscapeFanfare() {
    if (!this._canPlay()) return;
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    chord.forEach((f, i) => {
      this._playTone(f, f * 1.005, 0.65, 'triangle', 0.16, i * 0.09);
    });
  }
}
