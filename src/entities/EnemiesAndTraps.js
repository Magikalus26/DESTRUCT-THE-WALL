import * as THREE from 'three';
import { VOXEL_SIZE } from '../world/VoxelWorld.js';

const ENEMY_CONFIG = {
  rat: {
    name: 'Rat muté',
    hp: 16,
    speed: 3.15,
    damage: 9,
    attackRange: 0.72,
    attackCooldown: 0.85,
    radius: 0.22,
    height: 0.36,
    reward: 25
  },
  insect: {
    name: 'Insecte rampant',
    hp: 34,
    speed: 3.4,
    damage: 13,
    attackRange: 0.78,
    attackCooldown: 0.8,
    radius: 0.24,
    height: 0.38,
    reward: 65
  },
  zombie: {
    name: 'Zombie détenu',
    hp: 150,
    speed: 1.75,
    damage: 22,
    attackRange: 1.05,
    attackCooldown: 1.25,
    radius: 0.3,
    height: 1.55,
    reward: 240
  },
  zombie_heavy: {
    name: 'Zombie blindé',
    hp: 360,
    speed: 1.6,
    damage: 32,
    attackRange: 1.15,
    attackCooldown: 1.35,
    radius: 0.34,
    height: 1.65,
    reward: 650
  }
};

export class EnemiesAndTraps {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.enemies = [];
    this.crushers = [];
    this.time = 0;

    this.crusherTexture = this._createHazardTexture();
  }

  clear() {
    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }
    this.enemies.length = 0;
    this.crushers.length = 0;
  }

  populateFromWorld() {
    this.clear();

    // 1. Spawn hidden wall-pocket enemies
    for (let i = 0; i < this.world.enemySpawns.length; i++) {
      const sp = this.world.enemySpawns[i];
      const cfg = ENEMY_CONFIG[sp.type] || ENEMY_CONFIG.rat;
      const mesh = this._createEnemyMesh(sp.type);
      mesh.position.set(sp.x, 0, sp.z);
      this.root.add(mesh);

      this.enemies.push({
        id: i,
        type: sp.type,
        name: cfg.name,
        hp: cfg.hp,
        maxHp: cfg.hp,
        speed: cfg.speed,
        damage: cfg.damage,
        attackRange: cfg.attackRange,
        attackCooldown: cfg.attackCooldown,
        radius: cfg.radius,
        height: cfg.height,
        reward: cfg.reward,
        pos: new THREE.Vector3(sp.x, 0, sp.z),
        vel: new THREE.Vector3(),
        mesh,
        awake: false,
        alive: true,
        hitFlash: 0,
        attackTimer: 0,
        animPhase: Math.random() * 6.28
      });
    }

    // 2. Spawn animated mobile Crusher Traps
    const crusherMat = new THREE.MeshStandardMaterial({
      map: this.crusherTexture,
      roughness: 0.38,
      metalness: 0.62,
      emissive: 0x3b0707,
      emissiveIntensity: 0.35
    });

    for (let i = 0; i < this.world.crusherSpecs.length; i++) {
      const spec = this.world.crusherSpecs[i];
      const geo = new THREE.BoxGeometry(0.68, 1.48, 0.68);
      const mesh = new THREE.Mesh(geo, crusherMat);
      mesh.position.copy(spec.center);

      // Spiked red warning bumper rim
      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 0.22, 0.74),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.4, emissive: 0x7f1d1d, emissiveIntensity: 0.5 })
      );
      mesh.add(bumper);

      this.root.add(mesh);
      this.crushers.push({
        spec,
        mesh,
        pos: spec.center.clone(),
        halfX: 0.36,
        halfY: 0.76,
        halfZ: 0.36
      });
    }
  }

  setVisible(flag) {
    this.root.visible = Boolean(flag);
  }

  /**
   * Ray-vs-capsule/sphere check for FPS weapon hits on enemies.
   */
  raycastHit(origin, dir, maxRange, hitSlack = 0.38) {
    let best = null;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;

      const center = new THREE.Vector3(e.pos.x, e.height * 0.55, e.pos.z);
      const toEnemy = center.clone().sub(origin);
      const proj = toEnemy.dot(dir);
      if (proj < 0 || proj > maxRange) continue;

      const closestPt = origin.clone().addScaledVector(dir, proj);
      const distToRay = closestPt.distanceTo(center);
      const hitRadius = e.radius + hitSlack;

      if (distToRay <= hitRadius) {
        if (!best || proj < best.distance) {
          best = { enemy: e, distance: proj, point: closestPt };
        }
      }
    }
    return best;
  }

  damageEnemy(enemy, amount, knockDir, knockForce = 3.5) {
    if (!enemy || !enemy.alive) return false;
    enemy.hp -= amount;
    enemy.awake = true;
    enemy.hitFlash = 0.14;
    enemy.vel.x += knockDir.x * knockForce;
    enemy.vel.z += knockDir.z * knockForce;

    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.mesh.visible = false;
      return true;
    }
    return false;
  }

  update(dt, player, audio, onPlayerDamaged) {
    this.time += dt;
    const pPos = player.position;

    // 1. Update animated Crusher Blocks
    for (let i = 0; i < this.crushers.length; i++) {
      const c = this.crushers[i];
      const { center, axis, amplitude, speed, phase } = c.spec;
      const offset = Math.sin(this.time * speed + phase) * amplitude;
      c.pos.copy(center);
      if (axis === 'x') c.pos.x += offset;
      else if (axis === 'z') c.pos.z += offset;
      else if (axis === 'y') c.pos.y = Math.max(0.76, center.y + offset);
      c.mesh.position.copy(c.pos);

      // Check player collision with Crusher
      const dx = Math.abs(pPos.x - c.pos.x);
      const dz = Math.abs(pPos.z - c.pos.z);
      const playerMinY = 0;
      const playerMaxY = 1.7;
      const crusherMinY = c.pos.y - c.halfY;
      const crusherMaxY = c.pos.y + c.halfY;
      const yOverlap = playerMaxY > crusherMinY && playerMinY < crusherMaxY;

      if (yOverlap && dx < c.halfX + player.radius * 0.85 && dz < c.halfZ + player.radius * 0.85) {
        const res = player.applyDamage(24, c.pos, 6.2);
        if (res.tookDamage) {
          audio.playPlayerHurt();
          if (onPlayerDamaged) onPlayerDamaged(res, 'Bloc Concasseur');
        }
      }
    }

    // 2. Update Hidden / Chasing Enemies
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;

      const dx = pPos.x - e.pos.x;
      const dz = pPos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);

      // Hit flash visual feedback
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        const flashOn = e.hitFlash > 0;
        e.mesh.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive && !child.userData.isEye) {
            child.material.emissive.setHex(flashOn ? 0xaa2222 : 0x000000);
          }
        });
      }

      if (e.attackTimer > 0) e.attackTimer -= dt;

      if (!e.awake) {
        // Play eerie scratching cue when player is near a sealed enemy pocket
        if (dist < 4.5) {
          audio.playEnemyScratch(1 - dist / 4.5);
          // Check line of sight from enemy to player — if player carved into the pocket, wake up!
          if (dist < 5.5 && this._hasLineOfSight(e.pos, pPos)) {
            e.awake = true;
            audio.playEnemyAlert(e.type);
          }
        }
        // Subtle idle twitch inside pocket
        e.animPhase += dt * 3.0;
        e.mesh.position.y = Math.abs(Math.sin(e.animPhase)) * 0.025;
        continue;
      }

      // Chasing behavior through carved tunnels!
      e.animPhase += dt * (e.type.startsWith('zombie') ? 6.5 : 14.0);
      const dirX = dist > 0.01 ? dx / dist : 0;
      const dirZ = dist > 0.01 ? dz / dist : 0;

      // Face player smoothly
      e.mesh.rotation.y = Math.atan2(dirX, dirZ);

      // Apply velocity + chase steering with sliding voxel collision
      const moveX = (dirX * e.speed + e.vel.x) * dt;
      const moveZ = (dirZ * e.speed + e.vel.z) * dt;
      e.vel.multiplyScalar(Math.exp(-8 * dt));

      if (dist > e.attackRange * 0.72) {
        const nx = e.pos.x + moveX;
        if (!this._enemyCollides(nx, e.pos.z, e.radius, e.height)) {
          e.pos.x = nx;
        }
        const nz = e.pos.z + moveZ;
        if (!this._enemyCollides(e.pos.x, nz, e.radius, e.height)) {
          e.pos.z = nz;
        }
      }

      // Lively scurry / shamble animation
      if (e.type === 'rat' || e.type === 'insect') {
        e.mesh.position.set(e.pos.x, Math.abs(Math.sin(e.animPhase)) * 0.055, e.pos.z);
        e.mesh.rotation.z = Math.sin(e.animPhase) * 0.1;
      } else {
        e.mesh.position.set(e.pos.x, Math.abs(Math.sin(e.animPhase)) * 0.04, e.pos.z);
        e.mesh.rotation.z = Math.sin(e.animPhase * 0.5) * 0.08;
      }

      // Melee bite / strike against player
      if (dist <= e.attackRange && e.attackTimer <= 0) {
        e.attackTimer = e.attackCooldown;
        const res = player.applyDamage(e.damage, e.pos, 3.6);
        if (res.tookDamage) {
          audio.playPlayerHurt();
          if (onPlayerDamaged) onPlayerDamaged(res, e.name);
        }
      }
    }
  }

  _hasLineOfSight(fromPos, playerPos) {
    const start = new THREE.Vector3(fromPos.x, 0.55, fromPos.z);
    const end = new THREE.Vector3(playerPos.x, 1.0, playerPos.z);
    const dir = end.clone().sub(start);
    const dist = dir.length();
    if (dist < 0.2) return true;
    dir.normalize();
    const hit = this.world.raycast(start, dir, dist - 0.15);
    return hit === null;
  }

  _enemyCollides(wx, wz, radius, height) {
    const minGX = Math.floor((wx - radius) / VOXEL_SIZE);
    const maxGX = Math.floor((wx + radius) / VOXEL_SIZE);
    const minGZ = Math.floor((wz - radius) / VOXEL_SIZE);
    const maxGZ = Math.floor((wz + radius) / VOXEL_SIZE);
    const maxGY = Math.min(12, Math.floor((height - 0.05) / VOXEL_SIZE));
    for (let gy = 0; gy <= maxGY; gy++) {
      for (let gz = minGZ; gz <= maxGZ; gz++) {
        for (let gx = minGX; gx <= maxGX; gx++) {
          if (this.world.getVoxelMat(gx, gy, gz) !== 0) return true;
        }
      }
    }
    return false;
  }

  // ---- Procedural Low-Poly 3D Enemy Models ----
  _createEnemyMesh(type) {
    const g = new THREE.Group();
    const eyeMat = new THREE.MeshBasicMaterial({ color: type === 'rat' ? 0xff4d4d : (type === 'insect' ? 0xfacc15 : 0xa3e635) });
    const makeEye = (x, y, z, r = 0.024) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), eyeMat);
      m.position.set(x, y, z);
      m.userData.isEye = true;
      return m;
    };

    if (type === 'rat') {
      const fur = new THREE.MeshStandardMaterial({ color: 0x3b2d36, roughness: 0.9 });
      const earMat = new THREE.MeshStandardMaterial({ color: 0x8f5d6b, roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.36), fur);
      body.position.y = 0.12;
      g.add(body);
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), fur);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, 0.13, 0.24);
      g.add(snout);
      const earL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), earMat);
      earL.position.set(-0.08, 0.24, 0.1);
      const earR = earL.clone();
      earR.position.x = 0.08;
      g.add(earL, earR);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.008, 0.32, 6), earMat);
      tail.rotation.x = Math.PI * 0.45;
      tail.position.set(0, 0.08, -0.3);
      g.add(tail);
      g.add(makeEye(-0.055, 0.16, 0.19, 0.022), makeEye(0.055, 0.16, 0.19, 0.022));
    } else if (type === 'insect') {
      const shell = new THREE.MeshStandardMaterial({ color: 0x223026, roughness: 0.35, metalness: 0.45 });
      const stripe = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.4 });
      const thorax = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.4), shell);
      thorax.position.y = 0.14;
      g.add(thorax);
      const backStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.32), stripe);
      backStripe.position.set(0, 0.22, -0.02);
      g.add(backStripe);
      // 6 skittering legs
      for (let s = -1; s <= 1; s += 2) {
        for (let l = -1; l <= 1; l++) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.03), shell);
          leg.position.set(s * 0.18, 0.08, l * 0.12);
          leg.rotation.z = s * -0.4;
          g.add(leg);
        }
      }
      g.add(makeEye(-0.07, 0.16, 0.21, 0.026), makeEye(0.07, 0.16, 0.21, 0.026));
    } else {
      // Zombie détenu (orange tattered prison jumpsuit + green zombie skin!)
      const isHeavy = type === 'zombie_heavy';
      const skin = new THREE.MeshStandardMaterial({ color: isHeavy ? 0x3f623c : 0x5c7c48, roughness: 0.85 });
      const suit = new THREE.MeshStandardMaterial({ color: isHeavy ? 0x475569 : 0xea580c, roughness: 0.78 });
      const scale = isHeavy ? 1.08 : 1.0;

      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.32 * scale, 0.62, 0.22 * scale), suit);
      legs.position.y = 0.31;
      g.add(legs);

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scale, 0.56, 0.26 * scale), suit);
      torso.position.y = 0.9;
      g.add(torso);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.3, 0.28 * scale), skin);
      head.position.set(0, 1.34, 0.04);
      g.add(head);

      // Outstretched reaching zombie arms
      const armGeo = new THREE.BoxGeometry(0.13 * scale, 0.14 * scale, 0.48 * scale);
      const armL = new THREE.Mesh(armGeo, skin);
      armL.position.set(-0.26 * scale, 1.04, 0.22);
      armL.rotation.x = 0.15;
      const armR = new THREE.Mesh(armGeo, skin);
      armR.position.set(0.26 * scale, 1.04, 0.22);
      armR.rotation.x = 0.15;
      g.add(armL, armR);

      g.add(makeEye(-0.065 * scale, 1.37, 0.185 * scale, 0.028), makeEye(0.065 * scale, 1.37, 0.185 * scale, 0.028));
    }

    return g;
  }

  _createHazardTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(0, 0, 128, 128);
    // Bold industrial diagonal black/yellow hazard bands
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 92, 128, 36);
    ctx.fillStyle = '#18181b';
    for (let x = -40; x < 180; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 92); ctx.lineTo(x + 14, 92); ctx.lineTo(x, 128); ctx.lineTo(x - 14, 128);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 120, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
