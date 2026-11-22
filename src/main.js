import * as THREE from 'three';
import { VoxelWorld } from './world/VoxelWorld.js';
import { PlayerController } from './player/PlayerController.js';
import { WeaponsAndTools } from './combat/WeaponsAndTools.js';
import { EnemiesAndTraps } from './entities/EnemiesAndTraps.js';
import { ProgressionAndIdle } from './systems/ProgressionAndIdle.js';
import { SynthAudio } from './audio/SynthAudio.js';
import { HUD } from './ui/HUD.js';

class DestructTheWallApp {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.uiRoot = document.getElementById('ui-root');

    this.state = 'MENU'; // MENU | PLAYING | TERMINAL | OPTIONS | ACHIEVEMENTS | CONFIRM_NEW | ESCAPED
    this.returnState = 'MENU';
    this.hasTriggeredEscapeThisRun = false;
    this.autoSaveTimer = 0;
    this.hudSyncTimer = 0;
    this.spaceHeld = false;
    this.lastTime = performance.now();
    this.menuClock = 0;

    this._initThree();
    this._initModules();
    this._bindGlobalEvents();

    // Generate preview world immediately so the Main Menu 3D cell renders live at 60 FPS
    this._prepareWorldFromSave();
    this._enterMenu();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initThree() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.indoorBg = new THREE.Color(0x0d121a);
    this.outdoorBg = new THREE.Color(0x88c9f2);
    this.scene.background = this.indoorBg.clone();
    this.scene.fog = new THREE.FogExp2(0x0d121a, 0.105);

    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(
      aspect < 0.75 ? 86 : 72,
      aspect,
      0.08,
      95
    );
    this.scene.add(this.camera);

    // Industrial Ambient & Hemisphere Lighting
    this.hemiLight = new THREE.HemisphereLight(0xb5dfff, 0x3b261d, 0.85);
    this.scene.add(this.hemiLight);

    // Warm directional sunlight (intensifies dramatically when breaking out of Enceinte 5)
    this.sunLight = new THREE.DirectionalLight(0xfff1cc, 0.45);
    this.sunLight.position.set(16, 26, -18);
    this.scene.add(this.sunLight);

    // Player subtle helmet worklight so deep carved micro-voxel tunnels remain super readable
    this.headLight = new THREE.PointLight(0xffeedd, 1.9, 8.5, 1.6);
    this.headLight.position.set(0, -0.05, 0.15);
    this.camera.add(this.headLight);
  }

  _initModules() {
    this.audio = new SynthAudio();
    this.world = new VoxelWorld(this.scene);
    this.player = new PlayerController(this.camera, this.world, this.canvas);
    this.weapons = new WeaponsAndTools(this.camera, this.scene);
    this.enemies = new EnemiesAndTraps(this.scene, this.world);
    this.progression = new ProgressionAndIdle(this.scene, this.world);

    this.audio.setEnabled(this.progression.state.soundEnabled);

    this.progression.onAchievementUnlocked = (ach) => {
      this.audio.playKeyCollect();
      this.hud.showToast(`🏆 Succès débloqué : ${ach.title} !`, 'gold');
    };
    this.progression.onToast = (msg, variant) => this.hud.showToast(msg, variant);
    this.progression.onMoneyGain = (amount, subtle) => {
      if (!subtle || amount >= 4) {
        this.hud.spawnFloatingCash(amount);
      }
    };

    this.hud = new HUD(this.uiRoot, {
      onNewGameClick: () => {
        this.audio.playUiClick();
        if (this.progression.hasSave()) {
          this.returnState = 'MENU';
          this.state = 'CONFIRM_NEW';
          this.hud.openConfirmNewGameModal();
        } else {
          this._startFreshGame(false);
        }
      },
      onConfirmNewGame: () => {
        this.audio.playUiClick();
        this._startFreshGame(false);
      },
      onContinueGame: () => {
        this.audio.playUiClick();
        this._continueSavedGame();
      },
      onOpenTerminal: () => {
        this.audio.playUiClick();
        this._openModal('TERMINAL');
      },
      onOpenOptions: (isQuitPrompt = false) => {
        this.audio.playUiClick();
        this._openModal('OPTIONS', isQuitPrompt);
      },
      onOpenAchievements: () => {
        this.audio.playUiClick();
        this._openModal('ACHIEVEMENTS');
      },
      onToggleSound: () => {
        this.audio.unlock();
        const next = !this.progression.state.soundEnabled;
        this.progression.state.soundEnabled = next;
        this.audio.setEnabled(next);
        if (next) this.audio.playUiClick();
        this.hud.syncSoundButtons(next);
        this.progression.save();
      },
      onCloseModal: () => {
        this.audio.playUiClick();
        this._closeModal();
      },
      onReturnToMenu: () => {
        this.audio.playUiClick();
        this._saveCurrentPlayerState();
        this._enterMenu();
      },
      onSelectWeapon: (weaponId) => {
        this.audio.unlock();
        if (weaponId === 'hammer' && !this.progression.state.unlockedHammer) {
          this.audio.playError();
          this.hud.showToast('Débloquez le Marteau dans le Terminal !', 'info');
          return;
        }
        if (weaponId === 'pistol' && !this.progression.state.unlockedPistol) {
          this.audio.playError();
          this.hud.showToast('Débloquez le Pistolet dans le Terminal !', 'info');
          return;
        }
        this.audio.playUiClick();
        this.progression.state.equippedWeapon = weaponId;
        this.weapons.equip(weaponId);
        this.hud.syncHudState(this.progression, this.player);
      },
      onAttackTrigger: () => {
        this.audio.unlock();
        if (this.state === 'PLAYING') {
          this._performAttack();
        }
      },
      onJoystickMove: (x, y) => {
        this.player.setJoystickInput(x, y);
      },
      onBuyUpgrade: (id) => {
        this.audio.unlock();
        const res = this.progression.buyUpgrade(id);
        if (res.ok) {
          this.audio.playUpgradeBuy();
          this._applyPlayerProgressionStats();
          this.weapons.equip(this.progression.state.equippedWeapon);
          this.hud.openTerminalModal(this.progression);
          this.hud.syncMenuState(this.progression);
          this.hud.syncHudState(this.progression, this.player);
        } else {
          this.audio.playError();
        }
      },
      onResetSave: () => {
        this.audio.playUiClick();
        localStorage.removeItem('destruct_the_wall_save_v1');
        this.progression.state = this.progression._createDefaultState();
        this.progression.savedBrokenVoxels = [];
        this.progression.syncDroneMeshes();
        this._prepareWorldFromSave();
        this._enterMenu();
        this.hud.showToast('Sauvegarde réinitialisée.', 'info');
      },
      onStartPrestige: () => {
        this.audio.playUpgradeBuy();
        this._startFreshGame(true);
      },
      onContinueAfterEscape: () => {
        this.audio.playUiClick();
        this.state = 'PLAYING';
        this.hud.closeModal();
        this.player.setControlsEnabled(true);
      },
      onUiClick: () => this.audio.playUiClick()
    });
  }

  _bindGlobalEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = Math.max(1, window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(w, h, false);
    });

    // Unlock Web Audio on very first touch/click anywhere (Safari iOS requirement)
    const unlockOnce = () => {
      this.audio.unlock();
      window.removeEventListener('touchstart', unlockOnce);
      window.removeEventListener('mousedown', unlockOnce);
    };
    window.addEventListener('touchstart', unlockOnce, { passive: true });
    window.addEventListener('mousedown', unlockOnce, { passive: true });

    // Desktop keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        if (this.state === 'PLAYING') {
          e.preventDefault();
          this.spaceHeld = true;
          this._performAttack();
        }
      } else if (e.code === 'KeyE') {
        if (this.state === 'PLAYING') {
          this.audio.playUiClick();
          this._openModal('TERMINAL');
        } else if (this.state === 'TERMINAL') {
          this._closeModal();
        }
      } else if (e.code === 'Escape') {
        if (this.state === 'TERMINAL' || this.state === 'OPTIONS' || this.state === 'ACHIEVEMENTS' || this.state === 'CONFIRM_NEW') {
          this._closeModal();
        } else if (this.state === 'PLAYING') {
          this._saveCurrentPlayerState();
          this._enterMenu();
        }
      } else if (this.state === 'PLAYING') {
        if (e.code === 'Digit1') this.hud.cb.onSelectWeapon('fists');
        if (e.code === 'Digit2') this.hud.cb.onSelectWeapon('hammer');
        if (e.code === 'Digit3') this.hud.cb.onSelectWeapon('pistol');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceHeld = false;
    });

    // Reliable Safari iOS auto-save on backgrounding / closing
    const persistNow = () => {
      if (this.progression.hasSave()) {
        this._saveCurrentPlayerState();
      }
    };
    window.addEventListener('pagehide', persistNow);
    window.addEventListener('beforeunload', persistNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistNow();
    });
  }

  _prepareWorldFromSave() {
    const s = this.progression.state;
    this.world.generate(
      this.progression.savedBrokenVoxels || null,
      { gate1: s.gate1Unlocked, gate2: s.gate2Unlocked },
      { keyBrass: s.keyBrass, keyAccess: s.keyAccess }
    );
    this.enemies.populateFromWorld();
    this._applyPlayerProgressionStats();
    this.weapons.equip(s.equippedWeapon || 'fists');
    this.progression.syncDroneMeshes();
  }

  _applyPlayerProgressionStats() {
    this.player.applyStats(
      this.progression.getMaxHp(),
      this.progression.getArmorReduction()
    );
  }

  _enterMenu() {
    this.state = 'MENU';
    this.spaceHeld = false;
    this.hud.isAttackHeld = false;
    this.player.setControlsEnabled(false);
    this.world.setMenuDiorama(true);
    this.enemies.setVisible(false);
    this.progression.setDronesVisible(false);
    this.weapons.setMenuPose(true);
    this.hud.showMenu(this.progression);
  }

  _startFreshGame(isPrestige = false) {
    this.hasTriggeredEscapeThisRun = false;
    this.progression.startNewGame(isPrestige);
    this.world.generate(null, { gate1: false, gate2: false }, { keyBrass: false, keyAccess: false });
    this.enemies.populateFromWorld();
    this._applyPlayerProgressionStats();
    this.player.resetToCell(0, 0);
    this.weapons.equip('fists');
    this._enterGameplay();
    if (isPrestige) {
      this.hud.showToast(`🔥 Prestige +${this.progression.state.prestigeLevel} actif (×${this.progression.getPrestigeMultiplier().toFixed(1)} gains & dégâts) !`, 'gold');
    } else {
      this.hud.showToast('Creusez dans n’importe quelle direction pour vous évader !', 'info');
    }
  }

  _continueSavedGame() {
    this.hasTriggeredEscapeThisRun = false;
    this._prepareWorldFromSave();
    const pos = this.progression.state.playerPos || { x: 0, z: 0.35, yaw: 0 };
    this.player.setPosition(pos.x, pos.z, pos.yaw || 0);
    this._enterGameplay();
  }

  _enterGameplay() {
    this.state = 'PLAYING';
    this.world.setMenuDiorama(false);
    this.enemies.setVisible(true);
    this.progression.setDronesVisible(true);
    this.weapons.setMenuPose(false);
    this.player.setControlsEnabled(true);
    this.hud.showGameplay(this.progression, this.player);
  }

  _openModal(modalType, extraFlag = false) {
    this.returnState = this.state === 'PLAYING' ? 'PLAYING' : 'MENU';
    this.state = modalType;
    this.player.setControlsEnabled(false);
    this.spaceHeld = false;
    this.hud.isAttackHeld = false;

    if (modalType === 'TERMINAL') {
      this.hud.openTerminalModal(this.progression);
    } else if (modalType === 'ACHIEVEMENTS') {
      this.hud.openAchievementsModal(this.progression);
    } else if (modalType === 'OPTIONS') {
      this.hud.openOptionsModal(this.progression, this.audio, this.player, extraFlag);
    }
  }

  _closeModal() {
    this.hud.closeModal();
    this.state = this.returnState;
    if (this.state === 'PLAYING') {
      this.player.setControlsEnabled(true);
      this.hud.syncHudState(this.progression, this.player);
    } else {
      this.hud.syncMenuState(this.progression);
    }
  }

  _saveCurrentPlayerState() {
    const s = this.progression.state;
    s.playerPos = {
      x: Number(this.player.position.x.toFixed(2)),
      z: Number(this.player.position.z.toFixed(2)),
      yaw: Number(this.player.yaw.toFixed(3))
    };
    s.currentSection = this.world.getSectionLabel(this.player.position.x, this.player.position.z);
    this.progression.save();
  }

  _performAttack() {
    const res = this.weapons.tryAttack({
      world: this.world,
      player: this.player,
      progression: this.progression,
      enemies: this.enemies,
      audio: this.audio
    });
    if (!res) return;

    if (res.type === 'voxel' && (res.hitCount > 0 || res.brokenCount > 0)) {
      this.hud.pulseReticle();
    } else if (res.type === 'enemy') {
      this.hud.pulseReticle();
      if (res.died) {
        this.hud.showToast(`💀 ${res.enemy.name} éliminé !`, 'gold');
      }
    } else if (res.type === 'locked') {
      this.hud.showToast(`🔒 ${res.keyLabel} ! Cherchez l'amas brillant dans l'enceinte précédente.`, 'gold');
    } else if (res.type === 'gate_unlocked') {
      this.hud.showToast(`🔓 Grille de sécurité ${res.gate} déverrouillée !`, 'gold');
    }
  }

  // ---- Main Game Loop ----
  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.menuClock += dt;

    if (this.state === 'MENU' || (this.returnState === 'MENU' && this.state !== 'PLAYING')) {
      this.player.setMenuPose(this.menuClock);
      this.world.update(dt, this.camera.position, 0, null, null);
      this.weapons.update(dt, false);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'PLAYING') {
      this.progression.state.playTimeSeconds += dt;

      // Continuous attack while holding Fire/Punch button or Spacebar
      if (this.hud.isAttackHeld || this.spaceHeld) {
        this._performAttack();
      }

      this.player.update(dt);
      this.weapons.update(dt, this.player.isMoving);

      // Update Voxel World, Rubble Vacuum & Keys
      this.world.update(
        dt,
        this.player.position,
        this.progression.getPickupRadius(),
        (val) => this.progression.collectRubble(val, this.audio),
        (keyId, label) => this.progression.collectKey(keyId, label, this.audio)
      );

      // Update Autonomous Drill Drones
      this.progression.updateDrones(dt, this.player, this.audio);

      // Update Hidden Wall Enemies & Crusher Traps
      this.enemies.update(dt, this.player, this.audio, (dmgRes, sourceName) => {
        this.hud.flashDamage();
        if (dmgRes.died) {
          this.progression.onPlayerRespawn();
          this.player.resetToCell(0, 0);
          this.hud.showToast(`☠️ Vaincu par ${sourceName} ! Réapparition en cellule (gravats perdus).`, 'danger');
        }
      });

      // Diegetic Green Deposit Pad automatic selling
      const onPad = this.world.isOnDepositPad(this.player.position.x, this.player.position.z);
      if (onPad && this.progression.state.rubbleCount > 0) {
        const earned = this.progression.sellBackpack(this.audio);
        if (earned > 0) {
          this.hud.showToast(`💵 Gravats vendus : +$${earned.toLocaleString('en-US')} !`, 'gold');
        }
      }

      // Contextual Action Hint
      if (this.world.isNearTerminal(this.player.position.x, this.player.position.z)) {
        this.hud.setActionHint('📟 Terminal à portée — Ouvrez TERMINAL pour améliorer');
      } else if (onPad) {
        this.hud.setActionHint('🟢 Zone de dépôt verte — Vente automatique active');
      } else if (!this.progression.hasDirectAutoSell() && this.progression.state.rubbleCount >= this.progression.getBackpackCapacity()) {
        this.hud.setActionHint('🎒 Sac plein ! Revenez sur une zone verte pour vendre');
      } else {
        this.hud.setActionHint('');
      }

      // Contextual Center Reticle raycast
      const aimOrigin = this.camera.position;
      const aimDir = this.player.getForwardDirection();
      const spec = this.weapons.getSpec();
      const enemyLook = this.enemies.raycastHit(aimOrigin, aimDir, spec.range, 0.32);
      const voxelLook = this.world.raycast(aimOrigin, aimDir, Math.max(3.5, spec.range));
      this.hud.updateReticle(
        voxelLook,
        enemyLook && (!voxelLook || enemyLook.distance <= voxelLook.distance) ? enemyLook : null,
        this.progression
      );

      // Smooth Daylight Transition when breaching Enceinte 5!
      const isOut = this.world.isOutside(this.player.position.x, this.player.position.z);
      const targetBg = isOut ? this.outdoorBg : this.indoorBg;
      const targetFog = isOut ? 0.014 : 0.105;
      this.scene.background.lerp(targetBg, dt * 2.5);
      this.scene.fog.color.copy(this.scene.background);
      this.scene.fog.density += (targetFog - this.scene.fog.density) * dt * 2.5;
      this.sunLight.intensity += ((isOut ? 2.6 : 0.45) - this.sunLight.intensity) * dt * 2.5;

      // Trigger Escape Victory when stepping into freedom outside Enceinte 5!
      if (isOut && !this.hasTriggeredEscapeThisRun) {
        this.hasTriggeredEscapeThisRun = true;
        this.progression.onEscaped();
        this.audio.playEscapeFanfare();
        this.state = 'ESCAPED';
        this.player.setControlsEnabled(false);
        this.hud.openEscapeVictoryModal(this.progression);
      }

      // Periodic HUD refresh (10 Hz) & Auto-Save (every 10s)
      this.hudSyncTimer += dt;
      if (this.hudSyncTimer >= 0.1) {
        this.hudSyncTimer = 0;
        this.progression.state.currentSection = this.world.getSectionLabel(
          this.player.position.x,
          this.player.position.z
        );
        this.hud.syncHudState(this.progression, this.player);
      }

      this.autoSaveTimer += dt;
      if (this.autoSaveTimer >= 10.0) {
        this.autoSaveTimer = 0;
        this._saveCurrentPlayerState();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__destructApp = new DestructTheWallApp();
});
