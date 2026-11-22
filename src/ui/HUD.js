import { ACHIEVEMENTS } from '../systems/ProgressionAndIdle.js';
import { MATERIALS } from '../world/VoxelWorld.js';

function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

function formatTime(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SVG_KEY_GOLD = `
<svg class="key-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M15.5 3.5a5 5 0 0 0-4.7 6.7L3.5 17.5V21h3.5v-2h2v-2h2l1.8-1.8a5 5 0 1 0 2.7-11.7Z" fill="#facc15" stroke="#11151c" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="16.5" cy="7.5" r="1.6" fill="#11151c"/>
</svg>`;

const SVG_KEY_SILVER = `
<svg class="key-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M15.5 3.5a5 5 0 0 0-4.7 6.7L3.5 17.5V21h3.5v-2h2v-2h2l1.8-1.8a5 5 0 1 0 2.7-11.7Z" fill="#cbd5e1" stroke="#11151c" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="16.5" cy="7.5" r="1.6" fill="#11151c"/>
</svg>`;

const SVG_HAMMER = `
<svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <path d="M23.5 6.5c-3.2-1.8-7.4-1.5-10.2.8l2.6 2.6c1.5-.7 3.2-.6 4.5.3l-12 12c-1 1-1 2.7 0 3.7l1.6 1.6c1 1 2.7 1 3.7 0l12-12 2.2 2.2c.8.8 2.1.8 2.9 0l2.1-2.1c.8-.8.8-2.1 0-2.9l-6.2-6.2c-.8-.8-2.1-.8-3.2 0Z" fill="#ffffff" stroke="#11151c" stroke-width="2.2" stroke-linejoin="round"/>
</svg>`;

const SVG_TERM_ICON = `
<svg viewBox="0 0 38 38" fill="none" aria-hidden="true">
  <circle cx="14" cy="15" r="5.5" fill="#ffffff" stroke="#11151c" stroke-width="2"/>
  <path d="M14 5.5v3M14 21.5v3M4.5 15h3M20.5 15h3M7.3 8.3l2.1 2.1M18.6 19.6l2.1 2.1M20.7 8.3l-2.1 2.1M9.4 19.6l-2.1 2.1" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <circle cx="14" cy="15" r="2.6" fill="#f59c08" stroke="#11151c" stroke-width="1.5"/>
  <rect x="17" y="25" width="4.5" height="8" rx="1" fill="#ffffff" stroke="#11151c" stroke-width="1.6"/>
  <rect x="23" y="21" width="4.5" height="12" rx="1" fill="#ffffff" stroke="#11151c" stroke-width="1.6"/>
  <rect x="29" y="16" width="4.5" height="17" rx="1" fill="#ffffff" stroke="#11151c" stroke-width="1.6"/>
</svg>`;

const SVG_GEAR = `
<svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <path d="M14 4v3M14 21v3M4 14h3M21 14h3M6.9 6.9l2.1 2.1M19 19l2.1 2.1M21.1 6.9L19 9M9 19l-2.1 2.1" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="14" cy="14" r="6.2" fill="#ffffff" stroke="#11151c" stroke-width="1.8"/>
  <circle cx="14" cy="14" r="2.7" fill="#3b74a2" stroke="#11151c" stroke-width="1.6"/>
</svg>`;

const SVG_SPEAKER_ON = `
<svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <path d="M5 11h4.5L15 6.5v15L9.5 17H5a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 5 11Z" fill="#ffffff" stroke="#11151c" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M18.5 10.2a5.2 5.2 0 0 1 0 7.6M21.3 7.5a8.8 8.8 0 0 1 0 13" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

const SVG_SPEAKER_OFF = `
<svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <path d="M5 11h4.5L15 6.5v15L9.5 17H5a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 5 11Z" fill="#ffffff" stroke="#11151c" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M18.5 10.5l6 7M24.5 10.5l-6 7" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;

const SVG_FIST_BTN = `
<svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <path d="M7 11c0-1.6 1.2-2.8 2.8-2.8h1.5V7.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5v.7h1.2c1.4 0 2.5 1.1 2.5 2.5v1.3h.5c1.4 0 2.5 1.1 2.5 2.5V18c0 3.3-2.7 6-6 6h-5.2c-2.9 0-5.3-2.3-5.3-5.2V11Z" fill="#ffffff" stroke="#11151c" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

/**
 * Massive Cracked Stone & Orange Metallic Title SVG matching IMG_0617.JPG
 */
const SVG_MAIN_LOGO = `
<svg class="logo-svg" viewBox="0 0 420 158" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DESTRUCT THE WALL">
  <defs>
    <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffd04d"/>
      <stop offset="46%" stop-color="#ff7c16"/>
      <stop offset="100%" stop-color="#c93506"/>
    </linearGradient>
    <linearGradient id="gradSteel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eef3f7"/>
      <stop offset="48%" stop-color="#a2aeb8"/>
      <stop offset="100%" stop-color="#5d6770"/>
    </linearGradient>
    <filter id="extrudeShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="6" stdDeviation="1" flood-color="#0b0d12" flood-opacity="0.96"/>
    </filter>
  </defs>

  <!-- DESTRUCT (Orange Cracked Relief) -->
  <g filter="url(#extrudeShadow)">
    <text x="210" y="70" text-anchor="middle" font-family="'Russo One','Oswald',Impact,sans-serif" font-size="68" font-weight="900" letter-spacing="2" fill="url(#gradOrange)" stroke="#12151b" stroke-width="7" paint-order="stroke fill">DESTRUCT</text>
    <!-- Procedural surface cracks etched across DESTRUCT -->
    <path d="M52 24l6 14-4 12 7 12M118 68l5-16 8-8M188 22l-5 15 6 14-4 17M264 66l-7-14 6-11-5-16M336 24l8 16-6 14 5 11" stroke="#18120e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>

  <!-- THE WALL (Steel Stone Cracked Relief) -->
  <g filter="url(#extrudeShadow)">
    <text x="210" y="138" text-anchor="middle" font-family="'Russo One','Oswald',Impact,sans-serif" font-size="68" font-weight="900" letter-spacing="2.5" fill="url(#gradSteel)" stroke="#12151b" stroke-width="7.5" paint-order="stroke fill">THE WALL</text>
    <!-- Procedural cracks etched across THE WALL -->
    <path d="M64 92l8 15-5 14 6 13M138 136l6-17-7-14M236 90l-6 18 8 12-5 16M314 137l7-14 10-8-4-18" stroke="#161b22" stroke-width="2.3" fill="none" stroke-linecap="round"/>
  </g>
</svg>
`;

export class HUD {
  constructor(rootEl, callbacks) {
    this.root = rootEl;
    this.cb = callbacks;
    this.activeTerminalTab = 'equipment';
    this.isAttackHeld = false;
    this.joyTouchId = null;
    this.joyCenter = { x: 0, y: 0 };

    this._renderScaffold();
    this._bindEvents();
  }

  _renderScaffold() {
    this.root.innerHTML = `
      <!-- 1. MAIN MENU (IMG_0617.JPG) -->
      <section id="menu-screen" class="menu-screen">
        <header class="menu-topbar">
          <div class="menu-resources">
            <div class="res-money"><span class="dollar-badge">$</span> <span id="menu-money">$0</span></div>
            <div class="res-bag" id="menu-bag">Sac: 0/80</div>
            <div class="res-keys">
              <span id="menu-key-brass" title="Clé en laiton">${SVG_KEY_GOLD}</span>
              <span id="menu-key-access" title="Clé d'accès">${SVG_KEY_SILVER}</span>
            </div>
          </div>
          <div class="menu-top-right">
            <button id="btn-quit-top" class="btn-quit-top" type="button">QUITTER</button>
            <button id="btn-sound-top" class="btn-sound-top" type="button">SON ON/OFF</button>
          </div>
        </header>

        <div class="menu-logo-wrap">
          ${SVG_MAIN_LOGO}
          <div class="menu-subtitle">L'ÉVASION COMMENCE ICI</div>
        </div>

        <nav class="menu-actions" aria-label="Menu Principal">
          <button id="btn-play" class="arcade-btn btn-play" type="button">
            ${SVG_HAMMER}
            <span>JOUER</span>
          </button>

          <button id="btn-continue" class="arcade-btn btn-continue" type="button">
            <span class="lbl-main">CONTINUER</span>
            <span class="lbl-sub">(PARTIE EN COURS)</span>
            <span id="continue-section" class="lbl-loc">Cellule Centrale - Section 1</span>
          </button>

          <button id="btn-menu-terminal" class="arcade-btn btn-terminal" type="button">
            ${SVG_TERM_ICON}
            <span class="lbl-stack">
              <span class="lbl-top">TERMINAL /</span>
              <span class="lbl-bot">AMÉLIORATIONS</span>
            </span>
          </button>

          <div class="options-double-frame">
            <div class="options-double-row">
              <button id="btn-options" class="sub-arcade-btn sub-btn-gear" type="button" aria-label="Options">
                ${SVG_GEAR}
              </button>
              <button id="btn-sound-toggle" class="sub-arcade-btn sub-btn-sound" type="button" aria-label="Activer ou couper le son">
                ${SVG_SPEAKER_ON}
              </button>
            </div>
            <div class="options-double-label">OPTIONS / SON</div>
          </div>

          <button id="btn-achievements" class="arcade-btn btn-achievements" type="button">
            SUCCÈS / CLASSEMENT
          </button>
        </nav>
      </section>

      <!-- 2. IN-GAME HUD -->
      <section id="hud-layer" class="hud-layer hidden">
        <div class="hud-top">
          <div class="hud-stats-card">
            <img class="hud-game-badge" src="./assets/icon.jpg" alt="DESTRUCT THE WALL" />
            <div class="hud-stats-lines">
              <div class="hud-money" id="hud-money">$0</div>
              <div class="hud-bag" id="hud-bag">
                <span id="hud-bag-text">Sac: 0/80</span>
                <span class="hud-keys-inline">
                  <span id="hud-key-brass">${SVG_KEY_GOLD}</span>
                  <span id="hud-key-access">${SVG_KEY_SILVER}</span>
                </span>
              </div>
            </div>
          </div>

          <div class="hud-top-actions">
            <button id="btn-hud-terminal" class="hud-pill-btn hud-pill-term" type="button">TERMINAL</button>
            <button id="btn-hud-menu" class="hud-pill-btn hud-pill-menu" type="button">MENU</button>
          </div>
        </div>

        <div class="hud-subbar">
          <div class="hp-wrap">
            <div id="hud-hp-fill" class="hp-fill"></div>
            <div id="hud-hp-text" class="hp-text">100 / 100 PV</div>
          </div>
          <div id="hud-zone" class="zone-badge">Cellule Centrale - Section 1</div>
        </div>

        <div class="reticle-wrap">
          <div id="reticle-crosshair" class="reticle-crosshair">
            <div class="reticle-dot"></div>
          </div>
          <div id="reticle-info" class="reticle-info">
            <span id="reticle-label">Brique rouge</span>
            <div id="reticle-hp-bar" class="reticle-hp-bar">
              <div id="reticle-hp-fill" class="reticle-hp-fill"></div>
            </div>
          </div>
        </div>

        <div id="action-hint" class="action-hint">Zone de vente active</div>

        <div class="touch-controls">
          <div id="joystick-zone" class="joystick-zone" aria-label="Stick de déplacement">
            <div id="joystick-knob" class="joystick-knob"></div>
          </div>

          <div class="right-controls">
            <div class="weapon-bar">
              <button id="wep-fists" class="weapon-chip active" type="button">POINGS</button>
              <button id="wep-hammer" class="weapon-chip locked" type="button">MARTEAU</button>
              <button id="wep-pistol" class="weapon-chip locked" type="button">PISTOLET</button>
            </div>
            <button id="btn-attack" class="btn-attack" type="button">
              ${SVG_FIST_BTN}
              <span id="btn-attack-lbl">FRAPPER</span>
            </button>
          </div>
        </div>

        <div class="desktop-hint">ZQSD / WASD : Bouger • Clic-glisser : Regarder • Espace / Bouton : Frapper • E : Terminal</div>
      </section>

      <!-- 3. MODAL BACKDROP (Terminal / Options / Achievements / Confirm / Escape) -->
      <div id="modal-backdrop" class="modal-backdrop hidden">
        <div class="modal-card" id="modal-card"></div>
      </div>

      <!-- 4. OVERLAYS -->
      <div id="damage-vignette" class="damage-vignette"></div>
      <div id="float-layer" class="float-layer"></div>
      <div id="toast-container" class="toast-container"></div>
    `;

    // Cache refs
    this.el = {
      menu: this.root.querySelector('#menu-screen'),
      hud: this.root.querySelector('#hud-layer'),
      modalBackdrop: this.root.querySelector('#modal-backdrop'),
      modalCard: this.root.querySelector('#modal-card'),
      menuMoney: this.root.querySelector('#menu-money'),
      menuBag: this.root.querySelector('#menu-bag'),
      menuKeyBrass: this.root.querySelector('#menu-key-brass'),
      menuKeyAccess: this.root.querySelector('#menu-key-access'),
      btnContinue: this.root.querySelector('#btn-continue'),
      continueSection: this.root.querySelector('#continue-section'),
      btnSoundTop: this.root.querySelector('#btn-sound-top'),
      btnSoundToggle: this.root.querySelector('#btn-sound-toggle'),

      hudMoney: this.root.querySelector('#hud-money'),
      hudBag: this.root.querySelector('#hud-bag'),
      hudBagText: this.root.querySelector('#hud-bag-text'),
      hudKeyBrass: this.root.querySelector('#hud-key-brass'),
      hudKeyAccess: this.root.querySelector('#hud-key-access'),
      hudHpFill: this.root.querySelector('#hud-hp-fill'),
      hudHpText: this.root.querySelector('#hud-hp-text'),
      hudZone: this.root.querySelector('#hud-zone'),

      reticleCrosshair: this.root.querySelector('#reticle-crosshair'),
      reticleInfo: this.root.querySelector('#reticle-info'),
      reticleLabel: this.root.querySelector('#reticle-label'),
      reticleHpBar: this.root.querySelector('#reticle-hp-bar'),
      reticleHpFill: this.root.querySelector('#reticle-hp-fill'),
      actionHint: this.root.querySelector('#action-hint'),

      joyZone: this.root.querySelector('#joystick-zone'),
      joyKnob: this.root.querySelector('#joystick-knob'),
      btnAttack: this.root.querySelector('#btn-attack'),
      btnAttackLbl: this.root.querySelector('#btn-attack-lbl'),
      wepFists: this.root.querySelector('#wep-fists'),
      wepHammer: this.root.querySelector('#wep-hammer'),
      wepPistol: this.root.querySelector('#wep-pistol'),

      damageVignette: this.root.querySelector('#damage-vignette'),
      floatLayer: this.root.querySelector('#float-layer'),
      toastContainer: this.root.querySelector('#toast-container')
    };
  }

  _bindEvents() {
    // Menu buttons
    this.root.querySelector('#btn-play').addEventListener('click', () => this.cb.onNewGameClick());
    this.el.btnContinue.addEventListener('click', () => {
      if (!this.el.btnContinue.disabled) this.cb.onContinueGame();
    });
    this.root.querySelector('#btn-menu-terminal').addEventListener('click', () => this.cb.onOpenTerminal());
    this.root.querySelector('#btn-options').addEventListener('click', () => this.cb.onOpenOptions());
    this.el.btnSoundToggle.addEventListener('click', () => this.cb.onToggleSound());
    this.el.btnSoundTop.addEventListener('click', () => this.cb.onToggleSound());
    this.root.querySelector('#btn-achievements').addEventListener('click', () => this.cb.onOpenAchievements());
    this.root.querySelector('#btn-quit-top').addEventListener('click', () => this.cb.onOpenOptions(true));

    // HUD buttons
    this.root.querySelector('#btn-hud-terminal').addEventListener('click', () => this.cb.onOpenTerminal());
    this.root.querySelector('#btn-hud-menu').addEventListener('click', () => this.cb.onReturnToMenu());

    this.el.wepFists.addEventListener('click', () => this.cb.onSelectWeapon('fists'));
    this.el.wepHammer.addEventListener('click', () => this.cb.onSelectWeapon('hammer'));
    this.el.wepPistol.addEventListener('click', () => this.cb.onSelectWeapon('pistol'));

    // Hold-to-attack button (touch + mouse)
    const startAtk = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isAttackHeld = true;
      this.el.btnAttack.classList.add('pressed');
      this.cb.onAttackTrigger();
    };
    const endAtk = (e) => {
      if (e) e.stopPropagation();
      this.isAttackHeld = false;
      this.el.btnAttack.classList.remove('pressed');
    };
    this.el.btnAttack.addEventListener('touchstart', startAtk, { passive: false });
    this.el.btnAttack.addEventListener('touchend', endAtk, { passive: false });
    this.el.btnAttack.addEventListener('touchcancel', endAtk, { passive: false });
    this.el.btnAttack.addEventListener('mousedown', startAtk);
    window.addEventListener('mouseup', () => {
      if (this.isAttackHeld) endAtk();
    });

    // Virtual Analog Joystick (Multi-touch safe!)
    const maxR = 42;
    const updateJoy = (clientX, clientY) => {
      const dx = clientX - this.joyCenter.x;
      const dy = clientY - this.joyCenter.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(maxR, dist);
      const ang = Math.atan2(dy, dx);
      const ox = Math.cos(ang) * clamped;
      const oy = Math.sin(ang) * clamped;
      this.el.joyKnob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      this.cb.onJoystickMove(ox / maxR, -oy / maxR);
    };

    const resetJoy = () => {
      this.joyTouchId = null;
      this.el.joyKnob.style.transform = 'translate(-50%, -50%)';
      this.cb.onJoystickMove(0, 0);
    };

    this.el.joyZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = this.el.joyZone.getBoundingClientRect();
      this.joyCenter.x = rect.left + rect.width / 2;
      this.joyCenter.y = rect.top + rect.height / 2;
      const t = e.changedTouches[0];
      this.joyTouchId = t.identifier;
      updateJoy(t.clientX, t.clientY);
    }, { passive: false });

    this.el.joyZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joyTouchId) {
          updateJoy(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    const endJoyTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joyTouchId) {
          resetJoy();
          break;
        }
      }
    };
    this.el.joyZone.addEventListener('touchend', endJoyTouch, { passive: true });
    this.el.joyZone.addEventListener('touchcancel', endJoyTouch, { passive: true });

    // Mouse drag support for desktop joystick testing
    let joyMouseDown = false;
    this.el.joyZone.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      joyMouseDown = true;
      const rect = this.el.joyZone.getBoundingClientRect();
      this.joyCenter.x = rect.left + rect.width / 2;
      this.joyCenter.y = rect.top + rect.height / 2;
      updateJoy(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (joyMouseDown) updateJoy(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (joyMouseDown) {
        joyMouseDown = false;
        resetJoy();
      }
    });

    // Close modal when clicking backdrop outside card
    this.el.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.el.modalBackdrop) {
        this.cb.onCloseModal();
      }
    });
  }

  // ---- View State Switching ----
  showMenu(progression) {
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.closeModal();
    this.syncMenuState(progression);
  }

  showGameplay(progression, player) {
    this.el.menu.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.closeModal();
    this.syncHudState(progression, player);
  }

  closeModal() {
    this.el.modalBackdrop.classList.add('hidden');
    this.el.modalCard.innerHTML = '';
  }

  // ---- Dynamic Data Sync ----
  syncMenuState(progression) {
    const s = progression.state;
    const cap = progression.getBackpackCapacity();
    this.el.menuMoney.textContent = formatMoney(s.money);
    this.el.menuBag.textContent = `Sac: ${s.rubbleCount}/${cap}`;

    const setKeyVis = (wrapper, owned) => {
      const svg = wrapper.querySelector('svg');
      if (svg) svg.classList.toggle('locked', !owned);
    };
    setKeyVis(this.el.menuKeyBrass, s.keyBrass);
    setKeyVis(this.el.menuKeyAccess, s.keyAccess);

    // Continue button enabled only if save exists
    const hasSave = progression.hasSave();
    this.el.btnContinue.disabled = !hasSave;
    this.el.continueSection.textContent = hasSave ? s.currentSection : 'Aucune sauvegarde';

    this.syncSoundButtons(s.soundEnabled);
  }

  syncSoundButtons(enabled) {
    this.el.btnSoundTop.textContent = enabled ? 'SON ON/OFF' : 'SON OFF';
    this.el.btnSoundTop.classList.toggle('off', !enabled);
    this.el.btnSoundToggle.classList.toggle('muted', !enabled);
    this.el.btnSoundToggle.innerHTML = enabled ? SVG_SPEAKER_ON : SVG_SPEAKER_OFF;
  }

  syncHudState(progression, player) {
    const s = progression.state;
    const cap = progression.getBackpackCapacity();
    this.el.hudMoney.textContent = formatMoney(s.money);

    const isFull = !progression.hasDirectAutoSell() && s.rubbleCount >= cap;
    this.el.hudBagText.textContent = progression.hasDirectAutoSell()
      ? 'Auto-Vente $'
      : (isFull ? `SAC PLEIN (${cap}/${cap})` : `Sac: ${s.rubbleCount}/${cap}`);
    this.el.hudBag.classList.toggle('full', isFull);

    const setKeyVis = (wrapper, owned) => {
      const svg = wrapper.querySelector('svg');
      if (svg) svg.classList.toggle('locked', !owned);
    };
    setKeyVis(this.el.hudKeyBrass, s.keyBrass);
    setKeyVis(this.el.hudKeyAccess, s.keyAccess);

    // Health bar
    const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
    this.el.hudHpFill.style.width = `${hpPct}%`;
    this.el.hudHpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp} PV`;
    this.el.hudZone.textContent = s.currentSection;

    // Weapons
    this.el.wepFists.classList.toggle('active', s.equippedWeapon === 'fists');
    this.el.wepHammer.classList.toggle('active', s.equippedWeapon === 'hammer');
    this.el.wepHammer.classList.toggle('locked', !s.unlockedHammer);
    this.el.wepPistol.classList.toggle('active', s.equippedWeapon === 'pistol');
    this.el.wepPistol.classList.toggle('locked', !s.unlockedPistol);

    this.el.btnAttackLbl.textContent = s.equippedWeapon === 'pistol' ? 'TIRER' : 'FRAPPER';
  }

  updateReticle(voxelHit, enemyHit, progression) {
    if (enemyHit) {
      const e = enemyHit.enemy;
      this.el.reticleInfo.classList.add('visible');
      this.el.reticleInfo.classList.remove('locked');
      this.el.reticleLabel.textContent = `${e.name} • ${Math.max(0, Math.ceil(e.hp))}/${e.maxHp} PV`;
      this.el.reticleHpBar.style.display = 'block';
      this.el.reticleHpFill.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
      return;
    }

    if (voxelHit) {
      const matDef = MATERIALS[voxelHit.mat];
      this.el.reticleInfo.classList.add('visible');
      if (matDef && matDef.lockedBy) {
        const hasKey = Boolean(progression.state[matDef.lockedBy]);
        this.el.reticleInfo.classList.add('locked');
        this.el.reticleLabel.textContent = hasKey
          ? `🔓 Frapper pour déverrouiller !`
          : `🔑 ${matDef.keyLabel}`;
        this.el.reticleHpBar.style.display = 'none';
      } else if (matDef) {
        this.el.reticleInfo.classList.remove('locked');
        this.el.reticleLabel.textContent = `${matDef.name} • ${voxelHit.hp}/${voxelHit.maxHp} PV`;
        this.el.reticleHpBar.style.display = 'block';
        this.el.reticleHpFill.style.width = `${Math.max(0, (voxelHit.hp / voxelHit.maxHp) * 100)}%`;
      }
      return;
    }

    this.el.reticleInfo.classList.remove('visible');
  }

  pulseReticle() {
    this.el.reticleCrosshair.classList.add('hit');
    clearTimeout(this._reticleTimer);
    this._reticleTimer = setTimeout(() => {
      this.el.reticleCrosshair.classList.remove('hit');
    }, 90);
  }

  setActionHint(text) {
    if (text) {
      this.el.actionHint.textContent = text;
      this.el.actionHint.classList.add('visible');
    } else {
      this.el.actionHint.classList.remove('visible');
    }
  }

  flashDamage() {
    this.el.damageVignette.classList.add('active');
    clearTimeout(this._dmgTimer);
    this._dmgTimer = setTimeout(() => {
      this.el.damageVignette.classList.remove('active');
    }, 240);
  }

  spawnFloatingCash(amount) {
    const el = document.createElement('div');
    el.className = 'float-cash';
    el.textContent = `+${formatMoney(amount)}`;
    el.style.left = `${46 + Math.random() * 8}%`;
    this.el.floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1080);
  }

  showToast(message, variant = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${variant}`;
    el.textContent = message;
    this.el.toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  // ---- MODALS ----
  openTerminalModal(progression) {
    this.el.modalBackdrop.classList.remove('hidden');
    const catalog = progression.getUpgradeCatalog();
    const list = this.activeTerminalTab === 'equipment' ? catalog.equipment : catalog.automation;

    const rowsHtml = list.map((u) => {
      const isMax = u.level >= u.maxLevel;
      const canAfford = progression.state.money >= u.cost;
      const btnText = isMax ? 'MAX' : formatMoney(u.cost);
      const lvlLabel = u.maxLevel === 1
        ? (isMax ? 'Débloqué' : 'Verrouillé')
        : `Niv. ${u.level} / ${u.maxLevel}`;
      return `
        <div class="upgrade-item">
          <div class="upgrade-info">
            <div class="upgrade-name">${u.name}</div>
            <div class="upgrade-desc">${u.desc}</div>
            <div class="upgrade-lvl">${lvlLabel}</div>
          </div>
          <button
            class="btn-buy ${isMax ? 'maxed' : ''}"
            data-buy-id="${u.id}"
            type="button"
            ${isMax || !canAfford ? 'disabled' : ''}
          >${btnText}</button>
        </div>
      `;
    }).join('');

    this.el.modalCard.innerHTML = `
      <div class="modal-header">
        <div class="modal-title-group">
          <img class="modal-icon-img" src="./assets/icon.jpg" alt="Icone" />
          <div class="modal-title">TERMINAL D'AMÉLIORATIONS</div>
        </div>
        <button class="modal-close" id="modal-close-btn" type="button">✕</button>
      </div>
      <div class="modal-tabs">
        <button class="modal-tab ${this.activeTerminalTab === 'equipment' ? 'active' : ''}" data-tab="equipment" type="button">ÉQUIPEMENT & JOUEUR</button>
        <button class="modal-tab ${this.activeTerminalTab === 'automation' ? 'active' : ''}" data-tab="automation" type="button">AUTOMATISATION</button>
      </div>
      <div class="modal-money-bar">
        <span>Solde disponible</span>
        <strong>${formatMoney(progression.state.money)}</strong>
      </div>
      <div class="modal-body">${rowsHtml}</div>
    `;

    this.el.modalCard.querySelector('#modal-close-btn').addEventListener('click', () => this.cb.onCloseModal());
    this.el.modalCard.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTerminalTab = btn.dataset.tab;
        this.cb.onUiClick();
        this.openTerminalModal(progression);
      });
    });
    this.el.modalCard.querySelectorAll('[data-buy-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.cb.onBuyUpgrade(btn.dataset.buyId);
      });
    });
  }

  openAchievementsModal(progression) {
    this.el.modalBackdrop.classList.remove('hidden');
    const s = progression.state;
    const unlockedCount = s.unlockedAchievements.length;

    const achHtml = ACHIEVEMENTS.map((a) => {
      const ok = s.unlockedAchievements.includes(a.id);
      return `
        <div class="ach-row ${ok ? 'unlocked' : ''}">
          <div class="ach-badge">${ok ? '🏆' : '🔒'}</div>
          <div class="upgrade-info">
            <div class="upgrade-name">${a.title}</div>
            <div class="upgrade-desc">${a.desc}</div>
          </div>
        </div>
      `;
    }).join('');

    this.el.modalCard.innerHTML = `
      <div class="modal-header">
        <div class="modal-title-group">
          <img class="modal-icon-img" src="./assets/icon.jpg" alt="Icone" />
          <div class="modal-title">SUCCÈS & RECORDS</div>
        </div>
        <button class="modal-close" id="modal-close-btn" type="button">✕</button>
      </div>
      <div class="modal-body">
        <div class="records-grid">
          <div class="record-box">
            <div class="record-val">${s.cubesBroken.toLocaleString('fr-FR')}</div>
            <div class="record-lbl">Cubes brisés</div>
          </div>
          <div class="record-box">
            <div class="record-val">${s.enemiesDefeated}</div>
            <div class="record-lbl">Ennemis vaincus</div>
          </div>
          <div class="record-box">
            <div class="record-val">${s.bestEscapeTime !== null ? formatTime(s.bestEscapeTime) : '--:--'}</div>
            <div class="record-lbl">Record d'évasion</div>
          </div>
          <div class="record-box">
            <div class="record-val">${unlockedCount} / ${ACHIEVEMENTS.length}</div>
            <div class="record-lbl">Succès • Prestige +${s.prestigeLevel}</div>
          </div>
        </div>
        ${achHtml}
      </div>
    `;

    this.el.modalCard.querySelector('#modal-close-btn').addEventListener('click', () => this.cb.onCloseModal());
  }

  openOptionsModal(progression, audio, player, isQuitPrompt = false) {
    this.el.modalBackdrop.classList.remove('hidden');
    const s = progression.state;

    this.el.modalCard.innerHTML = `
      <div class="modal-header">
        <div class="modal-title-group">
          <img class="modal-icon-img" src="./assets/icon.jpg" alt="Icone" />
          <div class="modal-title">${isQuitPrompt ? 'CRÉDITS & SESSION' : 'OPTIONS & SON'}</div>
        </div>
        <button class="modal-close" id="modal-close-btn" type="button">✕</button>
      </div>
      <div class="modal-body">
        <div class="opt-row">
          <span>Effets sonores (Web Audio)</span>
          <button id="opt-toggle-sound" class="btn-buy" type="button">${s.soundEnabled ? 'ACTIF' : 'COUPÉ'}</button>
        </div>
        <div class="opt-row">
          <span>Volume principal</span>
          <input id="opt-volume" class="opt-slider" type="range" min="0" max="100" value="${Math.round(audio.volume * 100)}" />
        </div>
        <div class="opt-row">
          <span>Sensibilité caméra</span>
          <input id="opt-sens" class="opt-slider" type="range" min="15" max="90" value="${Math.round(player.sensitivity * 10000)}" />
        </div>
        <div class="credits-box">
          <img src="./assets/icon.jpg" alt="DESTRUCT THE WALL" />
          <div class="credits-text">
            <strong>DESTRUCT THE WALL</strong><br/>
            Jeu d'évasion incrémental FPS en micro-voxels WebGL / Three.js.<br/>
            Optimisé pour Safari iOS (PWA écran d'accueil) & Desktop.<br/>
            <em>Sauvegarde automatique active dans localStorage.</em>
          </div>
        </div>
        <button id="opt-reset-save" class="arcade-btn" style="background:linear-gradient(180deg,#ef4444,#991b1b);padding:10px;font-size:14px;" type="button">
          RÉINITIALISER LA SAUVEGARDE
        </button>
      </div>
    `;

    this.el.modalCard.querySelector('#modal-close-btn').addEventListener('click', () => this.cb.onCloseModal());
    this.el.modalCard.querySelector('#opt-toggle-sound').addEventListener('click', () => {
      this.cb.onToggleSound();
      this.openOptionsModal(progression, audio, player, isQuitPrompt);
    });
    this.el.modalCard.querySelector('#opt-volume').addEventListener('input', (e) => {
      audio.setVolume(Number(e.target.value) / 100);
    });
    this.el.modalCard.querySelector('#opt-sens').addEventListener('input', (e) => {
      player.sensitivity = Number(e.target.value) / 10000;
    });
    this.el.modalCard.querySelector('#opt-reset-save').addEventListener('click', () => {
      this.cb.onResetSave();
    });
  }

  openConfirmNewGameModal() {
    this.el.modalBackdrop.classList.remove('hidden');
    this.el.modalCard.innerHTML = `
      <div class="modal-header">
        <div class="modal-title-group">
          <img class="modal-icon-img" src="./assets/icon.jpg" alt="Icone" />
          <div class="modal-title">NOUVELLE PARTIE ?</div>
        </div>
        <button class="modal-close" id="modal-close-btn" type="button">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13.5px;color:#e2e8f0;line-height:1.45;text-align:center;">
          Une partie en cours est déjà sauvegardée. Voulez-vous recommencer depuis la cellule de départ ? (Vos succès et records seront conservés.)
        </p>
        <button id="confirm-yes" class="arcade-btn btn-play" style="font-size:18px;padding:11px;" type="button">OUI, NOUVELLE PARTIE</button>
        <button id="confirm-no" class="arcade-btn btn-continue" style="font-size:15px;padding:10px;" type="button">ANNULER</button>
      </div>
    `;
    this.el.modalCard.querySelector('#modal-close-btn').addEventListener('click', () => this.cb.onCloseModal());
    this.el.modalCard.querySelector('#confirm-no').addEventListener('click', () => this.cb.onCloseModal());
    this.el.modalCard.querySelector('#confirm-yes').addEventListener('click', () => this.cb.onConfirmNewGame());
  }

  openEscapeVictoryModal(progression) {
    this.el.modalBackdrop.classList.remove('hidden');
    const s = progression.state;
    this.el.modalCard.innerHTML = `
      <div class="modal-header">
        <div class="modal-title-group">
          <img class="modal-icon-img" src="./assets/icon.jpg" alt="Icone" />
          <div class="modal-title">ÉVASION RÉUSSIE !</div>
        </div>
      </div>
      <div class="modal-body">
        <p style="font-size:14px;color:#fef08a;text-align:center;font-weight:700;line-height:1.4;">
          ☀️ Vous avez percé les 5 enceintes de DESTRUCT THE WALL et retrouvé la lumière du jour !
        </p>
        <div class="records-grid">
          <div class="record-box">
            <div class="record-val">${formatTime(s.playTimeSeconds)}</div>
            <div class="record-lbl">Temps total</div>
          </div>
          <div class="record-box">
            <div class="record-val">${s.cubesBroken.toLocaleString('fr-FR')}</div>
            <div class="record-lbl">Cubes détruits</div>
          </div>
          <div class="record-box">
            <div class="record-val">${s.enemiesDefeated}</div>
            <div class="record-lbl">Ennemis vaincus</div>
          </div>
          <div class="record-box">
            <div class="record-val">×${(1 + (s.prestigeLevel + 1) * 0.5).toFixed(1)}</div>
            <div class="record-lbl">Bonus Prestige+</div>
          </div>
        </div>
        <button id="esc-prestige" class="arcade-btn btn-play" style="font-size:17px;padding:11px;" type="button">NOUVELLE PARTIE+ (PRESTIGE)</button>
        <button id="esc-continue" class="arcade-btn btn-continue" style="font-size:15px;padding:10px;" type="button">CONTINUER À EXPLORER</button>
      </div>
    `;

    this.el.modalCard.querySelector('#esc-prestige').addEventListener('click', () => this.cb.onStartPrestige());
    this.el.modalCard.querySelector('#esc-continue').addEventListener('click', () => this.cb.onContinueAfterEscape());
  }
}
