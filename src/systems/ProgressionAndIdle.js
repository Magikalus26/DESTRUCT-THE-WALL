import * as THREE from 'three';

const SAVE_KEY = 'destruct_the_wall_save_v1';

export const ACHIEVEMENTS = [
  { id: 'first_hit', title: 'Premier Coup', desc: 'Briser votre premier micro-cube', check: (s) => s.cubesBroken >= 1 },
  { id: 'digger_100', title: 'Tunnelier', desc: 'Briser 100 micro-cubes', check: (s) => s.cubesBroken >= 100 },
  { id: 'demolisher_1000', title: 'Démolisseur', desc: 'Briser 1 000 micro-cubes', check: (s) => s.cubesBroken >= 1000 },
  { id: 'hammer_time', title: 'Force Brute', desc: 'Débloquer le Marteau au terminal', check: (s) => s.unlockedHammer },
  { id: 'firepower', title: 'Puissance de Feu', desc: 'Débloquer le Pistolet', check: (s) => s.unlockedPistol },
  { id: 'drone_squad', title: 'Escouade Automatisée', desc: 'Déployer au moins 2 Drones Foreurs', check: (s) => s.dronesLevel >= 2 },
  { id: 'key_master', title: 'Maître des Clés', desc: 'Trouver les 2 clés cachées dans les murs', check: (s) => s.keyBrass && s.keyAccess },
  { id: 'exterminator', title: 'Survivant des Tunnels', desc: 'Vaincre 5 ennemis embusqués', check: (s) => s.enemiesDefeated >= 5 },
  { id: 'rich_inmate', title: 'Contrebandier', desc: 'Cumuler 5 000 $ de gains totaux', check: (s) => s.totalMoneyEarned >= 5000 },
  { id: 'escaped', title: 'Libre !', desc: 'Percer les 5 enceintes et vous évader', check: (s) => s.escapesCount >= 1 }
];

const BACKPACK_TIERS = [80, 150, 260, 420, 680, 1050, 1550, 2200, 3200];

export class ProgressionAndIdle {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;

    this.state = this._createDefaultState();
    this.dronesGroup = new THREE.Group();
    this.scene.add(this.dronesGroup);
    this.drones = [];
    this.droneTick = 0;

    this.onAchievementUnlocked = null;
    this.onToast = null;
    this.onMoneyGain = null;

    this._loadIfExists();
  }

  _createDefaultState(prestigeLevel = 0, existingRecords = null) {
    return {
      hasActiveSave: false,
      money: 0,
      totalMoneyEarned: 0,
      rubbleCount: 0,
      rubbleValue: 0,
      keyBrass: false,
      keyAccess: false,
      gate1Unlocked: false,
      gate2Unlocked: false,
      unlockedHammer: false,
      unlockedPistol: false,
      equippedWeapon: 'fists',
      // Upgrade levels
      powerLevel: 0,
      radiusLevel: 0,
      cadenceLevel: 0,
      backpackLevel: 0,
      healthLevel: 0,
      dronesLevel: 0, // 0..4 deployed drones
      dronePowerLevel: 0,
      autoCollectLevel: 0, // 0: normal, 1: wide magnet, 2+: auto-sell direct to $
      // Stats & Records
      cubesBroken: 0,
      enemiesDefeated: 0,
      playTimeSeconds: 0,
      currentSection: 'Cellule Centrale - Section 1',
      playerPos: { x: 0, z: 0.35, yaw: 0 },
      soundEnabled: existingRecords ? existingRecords.soundEnabled : true,
      prestigeLevel,
      escapesCount: existingRecords ? existingRecords.escapesCount : 0,
      bestEscapeTime: existingRecords ? existingRecords.bestEscapeTime : null,
      bestCubesRecord: existingRecords ? existingRecords.bestCubesRecord : 0,
      unlockedAchievements: existingRecords ? [...existingRecords.unlockedAchievements] : []
    };
  }

  hasSave() {
    return Boolean(this.state.hasActiveSave);
  }

  startNewGame(isPrestige = false) {
    const prestige = isPrestige ? this.state.prestigeLevel + 1 : this.state.prestigeLevel;
    const records = {
      soundEnabled: this.state.soundEnabled,
      escapesCount: this.state.escapesCount,
      bestEscapeTime: this.state.bestEscapeTime,
      bestCubesRecord: Math.max(this.state.bestCubesRecord, this.state.cubesBroken),
      unlockedAchievements: this.state.unlockedAchievements
    };
    this.state = this._createDefaultState(prestige, records);
    this.state.hasActiveSave = true;
    this.syncDroneMeshes();
    this.save(true);
  }

  _loadIfExists() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.state = { ...this._createDefaultState(), ...parsed.state };
        this.savedBrokenVoxels = Array.isArray(parsed.brokenVoxels) ? parsed.brokenVoxels : [];
        this.syncDroneMeshes();
      }
    } catch {
      // Ignore corrupt storage gracefully
    }
  }

  save(resetBroken = false) {
    try {
      const brokenVoxels = resetBroken ? [] : this.world.exportBrokenVoxels();
      this.savedBrokenVoxels = brokenVoxels;
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          state: this.state,
          brokenVoxels
        })
      );
    } catch {
      // Storage quota exceeded — fallback saving state without voxel delta
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state: this.state, brokenVoxels: [] }));
      } catch {}
    }
  }

  // ---- Derived Gameplay Stats ----
  getPrestigeMultiplier() {
    return 1 + this.state.prestigeLevel * 0.5;
  }

  getBackpackCapacity() {
    const idx = Math.min(BACKPACK_TIERS.length - 1, this.state.backpackLevel);
    return BACKPACK_TIERS[idx];
  }

  getDamageMultiplier() {
    return (1 + this.state.powerLevel * 0.55) * this.getPrestigeMultiplier();
  }

  getImpactRadius() {
    return 0.45 + this.state.radiusLevel * 0.085;
  }

  getCadenceMultiplier() {
    return 1 + this.state.cadenceLevel * 0.14;
  }

  getMaxHp() {
    return 100 + this.state.healthLevel * 25;
  }

  getArmorReduction() {
    return Math.min(0.5, this.state.healthLevel * 0.06);
  }

  getPickupRadius() {
    return 1.45 + this.state.autoCollectLevel * 1.15;
  }

  hasDirectAutoSell() {
    return this.state.autoCollectLevel >= 2;
  }

  getDroneDps() {
    return (5 + this.state.dronePowerLevel * 7) * this.getPrestigeMultiplier();
  }

  // ---- Upgrade Catalog ----
  getUpgradeCatalog() {
    const s = this.state;
    return {
      equipment: [
        {
          id: 'unlock_hammer',
          name: 'Marteau (Claw Hammer)',
          desc: 'Dégâts 12 • Portée 2.8m • Zone élargie',
          level: s.unlockedHammer ? 1 : 0,
          maxLevel: 1,
          cost: 95,
          isWeapon: true,
          weaponId: 'hammer'
        },
        {
          id: 'unlock_pistol',
          name: 'Pistolet tactique',
          desc: 'Dégâts 34 • Portée 14m • Tir balistique à distance',
          level: s.unlockedPistol ? 1 : 0,
          maxLevel: 1,
          cost: 1400,
          isWeapon: true,
          weaponId: 'pistol'
        },
        {
          id: 'power',
          name: 'Puissance de frappe / tir',
          desc: `Multiplicateur actuel : ×${this.getDamageMultiplier().toFixed(2)}`,
          level: s.powerLevel,
          maxLevel: 15,
          cost: Math.round(25 * Math.pow(1.62, s.powerLevel))
        },
        {
          id: 'radius',
          name: "Rayon d'impact (Zone)",
          desc: `Sphère de destruction : ${this.getImpactRadius().toFixed(2)}m`,
          level: s.radiusLevel,
          maxLevel: 8,
          cost: Math.round(45 * Math.pow(1.85, s.radiusLevel))
        },
        {
          id: 'cadence',
          name: "Cadence d'attaque",
          desc: `Vitesse d'enchaînement : ×${this.getCadenceMultiplier().toFixed(2)}`,
          level: s.cadenceLevel,
          maxLevel: 10,
          cost: Math.round(35 * Math.pow(1.72, s.cadenceLevel))
        },
        {
          id: 'backpack',
          name: 'Capacité du Sac à dos',
          desc: `Capacité : ${this.getBackpackCapacity()} gravats`,
          level: s.backpackLevel,
          maxLevel: BACKPACK_TIERS.length - 1,
          cost: Math.round(20 * Math.pow(1.9, s.backpackLevel))
        },
        {
          id: 'health',
          name: 'Santé Max & Armure',
          desc: `${this.getMaxHp()} PV • -${Math.round(this.getArmorReduction() * 100)}% dégâts subis`,
          level: s.healthLevel,
          maxLevel: 8,
          cost: Math.round(50 * Math.pow(1.75, s.healthLevel))
        }
      ],
      automation: [
        {
          id: 'drones',
          name: 'Drones Foreurs autonomes',
          desc: `Déployés : ${s.dronesLevel}/4 drones laser minant devant vous`,
          level: s.dronesLevel,
          maxLevel: 4,
          cost: Math.round(180 * Math.pow(3.2, s.dronesLevel))
        },
        {
          id: 'drone_power',
          name: 'Laser des Drones Foreurs',
          desc: `Puissance laser : ${Math.round(this.getDroneDps())} DPS par drone`,
          level: s.dronePowerLevel,
          maxLevel: 12,
          cost: Math.round(120 * Math.pow(1.8, s.dronePowerLevel))
        },
        {
          id: 'autocollect',
          name: 'Auto-Collecteur & Vente directe',
          desc: s.autoCollectLevel === 0
            ? 'Niv.1 : Aimant longue portée | Niv.2 : Vente directe en $'
            : s.autoCollectLevel === 1
              ? 'Prochain niveau : Vente automatique directe sans borne !'
              : `Vente directe active • Rayon aimant ${this.getPickupRadius().toFixed(1)}m`,
          level: s.autoCollectLevel,
          maxLevel: 4,
          cost: Math.round(160 * Math.pow(2.8, s.autoCollectLevel))
        }
      ]
    };
  }

  buyUpgrade(id) {
    const catalog = this.getUpgradeCatalog();
    const all = [...catalog.equipment, ...catalog.automation];
    const item = all.find((u) => u.id === id);
    if (!item || item.level >= item.maxLevel) return { ok: false, reason: 'maxed' };
    if (this.state.money < item.cost) return { ok: false, reason: 'funds' };

    this.state.money -= item.cost;

    switch (id) {
      case 'unlock_hammer':
        this.state.unlockedHammer = true;
        this.state.equippedWeapon = 'hammer';
        break;
      case 'unlock_pistol':
        this.state.unlockedPistol = true;
        this.state.equippedWeapon = 'pistol';
        break;
      case 'power': this.state.powerLevel++; break;
      case 'radius': this.state.radiusLevel++; break;
      case 'cadence': this.state.cadenceLevel++; break;
      case 'backpack': this.state.backpackLevel++; break;
      case 'health': this.state.healthLevel++; break;
      case 'drones':
        this.state.dronesLevel++;
        this.syncDroneMeshes();
        break;
      case 'drone_power': this.state.dronePowerLevel++; break;
      case 'autocollect': this.state.autoCollectLevel++; break;
      default: return { ok: false };
    }

    this._checkAchievements();
    this.save();
    return { ok: true, item };
  }

  // ---- Economy Events ----
  collectRubble(rawValue, audio) {
    const val = rawValue * this.getPrestigeMultiplier();
    if (this.hasDirectAutoSell()) {
      const dollars = Math.max(1, Math.round(val));
      this.state.money += dollars;
      this.state.totalMoneyEarned += dollars;
      audio.playPickupRubble();
      if (this.onMoneyGain) this.onMoneyGain(dollars, true);
      this._checkAchievements();
      return true;
    }

    const cap = this.getBackpackCapacity();
    if (this.state.rubbleCount >= cap) {
      return false; // Backpack full!
    }

    this.state.rubbleCount = Math.min(cap, this.state.rubbleCount + 1);
    this.state.rubbleValue += val;
    audio.playPickupRubble();
    return true;
  }

  sellBackpack(audio) {
    if (this.state.rubbleCount <= 0) return 0;
    const earned = Math.max(1, Math.round(this.state.rubbleValue));
    this.state.money += earned;
    this.state.totalMoneyEarned += earned;
    this.state.rubbleCount = 0;
    this.state.rubbleValue = 0;
    audio.playSellCash();
    if (this.onMoneyGain) this.onMoneyGain(earned, false);
    this._checkAchievements();
    this.save();
    return earned;
  }

  onPlayerRespawn() {
    // Only lose unsold rubble in backpack; keep money, keys, weapons, upgrades!
    this.state.rubbleCount = 0;
    this.state.rubbleValue = 0;
    this.save();
  }

  collectKey(keyId, label, audio) {
    if (keyId === 'keyBrass') this.state.keyBrass = true;
    if (keyId === 'keyAccess') this.state.keyAccess = true;
    audio.playKeyCollect();
    if (this.onToast) this.onToast(`🔑 ${label} récupérée !`, 'gold');
    this._checkAchievements();
    this.save();
  }

  unlockGate(gateNum) {
    if (gateNum === 1) this.state.gate1Unlocked = true;
    if (gateNum === 2) this.state.gate2Unlocked = true;
    this.save();
  }

  onCubesBroken(count) {
    this.state.cubesBroken += count;
    if (this.state.cubesBroken > this.state.bestCubesRecord) {
      this.state.bestCubesRecord = this.state.cubesBroken;
    }
    this._checkAchievements();
  }

  onEnemyKilled(reward) {
    this.state.enemiesDefeated += 1;
    const dollars = Math.round(reward * this.getPrestigeMultiplier());
    this.state.money += dollars;
    this.state.totalMoneyEarned += dollars;
    if (this.onMoneyGain) this.onMoneyGain(dollars, false);
    this._checkAchievements();
  }

  onEscaped() {
    this.state.escapesCount += 1;
    const t = Math.round(this.state.playTimeSeconds);
    if (this.state.bestEscapeTime === null || t < this.state.bestEscapeTime) {
      this.state.bestEscapeTime = t;
    }
    this._checkAchievements();
    this.save();
  }

  _checkAchievements() {
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const a = ACHIEVEMENTS[i];
      if (!this.state.unlockedAchievements.includes(a.id) && a.check(this.state)) {
        this.state.unlockedAchievements.push(a.id);
        if (this.onAchievementUnlocked) this.onAchievementUnlocked(a);
      }
    }
  }

  // ---- Autonomous 3D Drill Drones ----
  setDronesVisible(flag) {
    this.dronesGroup.visible = Boolean(flag);
  }

  syncDroneMeshes() {
    while (this.drones.length > this.state.dronesLevel) {
      const d = this.drones.pop();
      this.dronesGroup.remove(d.mesh);
      this.dronesGroup.remove(d.laser);
    }

    while (this.drones.length < this.state.dronesLevel) {
      const mesh = this.world._createDroneMesh();
      mesh.scale.setScalar(0.75);
      const laserGeo = new THREE.CylinderGeometry(0.01, 0.014, 1, 6);
      laserGeo.translate(0, 0.5, 0);
      laserGeo.rotateX(Math.PI / 2);
      const laser = new THREE.Mesh(
        laserGeo,
        new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.85 })
      );
      laser.visible = false;
      this.dronesGroup.add(mesh, laser);
      this.drones.push({
        mesh,
        laser,
        pos: new THREE.Vector3(0, 2.0, 0),
        targetHit: null,
        phase: this.drones.length * 1.57
      });
    }
  }

  updateDrones(dt, player, audio) {
    if (this.drones.length === 0) return;

    const time = performance.now() * 0.001;
    const pPos = player.position;
    const fwd = player.getForwardDirection();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

    this.droneTick += dt;
    const shouldDealDamage = this.droneTick >= 0.25;
    if (shouldDealDamage) this.droneTick = 0;

    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      const slotOffset = (i - (this.drones.length - 1) * 0.5) * 0.65;
      const desiredPos = new THREE.Vector3(
        pPos.x + fwd.x * 0.85 + right.x * slotOffset,
        1.85 + Math.sin(time * 2.4 + d.phase) * 0.14,
        pPos.z + fwd.z * 0.85 + right.z * slotOffset
      );

      // Smooth hover following near the player
      d.pos.lerp(desiredPos, Math.min(1, dt * 4.5));
      d.mesh.position.copy(d.pos);

      // Spin quadcopter blades
      const rotors = d.mesh.userData.rotors;
      if (rotors) {
        for (let r = 0; r < rotors.length; r++) rotors[r].rotation.y += dt * 30;
      }

      // Find nearest wall in front of player/drone to mine automatically
      const aimDir = fwd.clone().add(new THREE.Vector3(
        Math.sin(time * 1.6 + d.phase) * 0.22,
        Math.cos(time * 1.3 + d.phase) * 0.18 - 0.12,
        Math.cos(time * 1.6 + d.phase) * 0.22
      )).normalize();

      const hit = this.world.raycast(d.pos, aimDir, 4.8);
      if (hit && hit.mat !== 8 && hit.mat !== 9) {
        d.mesh.lookAt(hit.point);
        d.laser.visible = true;
        d.laser.position.copy(d.pos);
        d.laser.lookAt(hit.point);
        d.laser.scale.set(1, 1, hit.distance);

        if (shouldDealDamage) {
          const dmg = Math.max(1, Math.round(this.getDroneDps() * 0.25));
          const res = this.world.damageSphere(hit.point, 0.34, dmg, true);
          this.world.spawnImpactBurst(hit.point, 0xff5533, 2);
          if (res.brokenCount > 0) {
            this.onCubesBroken(res.brokenCount);
            audio.playDroneLaser();
          }
        }
      } else {
        d.laser.visible = false;
        d.mesh.rotation.y = player.yaw;
      }
    }
  }
}
