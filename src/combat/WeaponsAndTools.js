import * as THREE from 'three';

export const WEAPONS = {
  fists: {
    id: 'fists',
    name: 'Poings gantés',
    baseDamage: 2,
    range: 2.2,
    baseCooldown: 0.28,
    radiusBonus: 0,
    kickPitch: 0.032,
    shake: 0.14
  },
  hammer: {
    id: 'hammer',
    name: 'Marteau',
    baseDamage: 12,
    range: 2.8,
    baseCooldown: 0.38,
    radiusBonus: 0.14,
    kickPitch: 0.055,
    shake: 0.25
  },
  pistol: {
    id: 'pistol',
    name: 'Pistolet',
    baseDamage: 34,
    range: 14.0,
    baseCooldown: 0.24,
    radiusBonus: 0.08,
    kickPitch: 0.048,
    shake: 0.22
  }
};

export class WeaponsAndTools {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;

    this.root = new THREE.Group();
    this.camera.add(this.root);

    this.currentWeapon = 'fists';
    this.attackCooldown = 0;
    this.attackAnim = 0; // 1 -> 0
    this.punchSide = 1; // alternates -1 (left) and +1 (right)
    this.swayTime = 0;
    this.menuPoseActive = true;

    this.models = {
      fists: this._buildGlovedFists(),
      hammer: this._buildClawHammer(),
      pistol: this._buildHandgun()
    };

    Object.values(this.models).forEach((m) => this.root.add(m));

    // Muzzle flash light for Pistol
    this.muzzleLight = new THREE.PointLight(0xffb84d, 0, 6);
    this.muzzleLight.position.set(0.24, -0.14, -0.78);
    this.camera.add(this.muzzleLight);
    this.muzzleTimer = 0;

    // Active pistol tracer projectiles
    this.projectiles = [];
    this.projGeo = new THREE.BoxGeometry(0.035, 0.035, 0.26);
    this.projMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });

    this.equip('fists');
  }

  equip(weaponId) {
    if (!this.models[weaponId]) return;
    this.currentWeapon = weaponId;
    for (const [id, group] of Object.entries(this.models)) {
      group.visible = id === weaponId;
    }
    this.attackAnim = 0;
  }

  setMenuPose(active) {
    this.menuPoseActive = Boolean(active);
    if (this.menuPoseActive) {
      // Always showcase the iconic orange/grey gloved fists on the Main Menu (matching IMG_0617.JPG)
      this.models.fists.visible = true;
      this.models.hammer.visible = false;
      this.models.pistol.visible = false;
    } else {
      this.equip(this.currentWeapon);
    }
  }

  getSpec() {
    return WEAPONS[this.currentWeapon];
  }

  /**
   * Executes an attack if off cooldown. Returns impact result info or null if still cooling down.
   */
  tryAttack({ world, player, progression, enemies, audio }) {
    if (this.attackCooldown > 0) return null;

    const spec = this.getSpec();
    const cadenceMult = progression.getCadenceMultiplier();
    this.attackCooldown = Math.max(0.08, spec.baseCooldown / cadenceMult);
    this.attackAnim = 1.0;

    if (this.currentWeapon === 'fists') {
      this.punchSide *= -1;
    }

    const damage = Math.round(spec.baseDamage * progression.getDamageMultiplier());
    const impactRadius = progression.getImpactRadius() + spec.radiusBonus;
    const origin = player.camera.position.clone();
    const dir = player.getForwardDirection();

    player.addKick(spec.kickPitch, spec.shake);

    if (this.currentWeapon === 'pistol') {
      audio.playPistolShot();
      this.muzzleTimer = 0.065;
      this.muzzleLight.intensity = 5.5;
    } else {
      audio.playSwing(this.currentWeapon);
    }

    // 1. Check enemy hit along aim ray first
    const enemyHit = enemies.raycastHit(origin, dir, spec.range, this.currentWeapon === 'pistol' ? 0.34 : 0.45);
    const voxelHit = world.raycast(origin, dir, spec.range);

    // Spawn pistol tracer to nearest target
    if (this.currentWeapon === 'pistol') {
      const endDist = enemyHit && (!voxelHit || enemyHit.distance < voxelHit.distance)
        ? enemyHit.distance
        : (voxelHit ? voxelHit.distance : spec.range);
      const startPos = origin.clone()
        .add(dir.clone().multiplyScalar(0.55))
        .add(new THREE.Vector3(0, -0.1, 0));
      const endPos = origin.clone().add(dir.clone().multiplyScalar(endDist));
      this._spawnTracer(startPos, endPos);
    }

    if (enemyHit && (!voxelHit || enemyHit.distance <= voxelHit.distance + 0.18)) {
      const died = enemies.damageEnemy(enemyHit.enemy, damage, dir, this.currentWeapon === 'hammer' ? 5.2 : 3.2);
      world.spawnImpactBurst(enemyHit.point, 0xef4444, 7);
      if (died) {
        audio.playEnemyDie();
        progression.onEnemyKilled(enemyHit.enemy.reward);
      } else {
        audio.playEnemyHit();
      }
      return { type: 'enemy', enemy: enemyHit.enemy, died };
    }

    if (voxelHit) {
      // Check if it's a locked security gate that the player now has the key for!
      const matDef = voxelHit.mat === 8 || voxelHit.mat === 9 ? voxelHit.mat : 0;
      if (matDef === 8 && progression.state.keyBrass && !progression.state.gate1Unlocked) {
        progression.unlockGate(1);
        world.unlockGate(8);
        audio.playGateUnlock();
        world.spawnImpactBurst(voxelHit.point, 0xfacc15, 16);
        return { type: 'gate_unlocked', gate: 1 };
      }
      if (matDef === 9 && progression.state.keyAccess && !progression.state.gate2Unlocked) {
        progression.unlockGate(2);
        world.unlockGate(9);
        audio.playGateUnlock();
        world.spawnImpactBurst(voxelHit.point, 0x38bdf8, 16);
        return { type: 'gate_unlocked', gate: 2 };
      }

      // Impact sphere centered slightly inside the struck face for crisp tunneling
      const impactCenter = voxelHit.point.clone().sub(voxelHit.normal.clone().multiplyScalar(0.06));
      const res = world.damageSphere(impactCenter, impactRadius, damage, true);

      if (res.hitLockedGate) {
        audio.playHit(res.hitLockedGate.id, this.currentWeapon);
        world.spawnImpactBurst(voxelHit.point, 0xfbbf24, 5);
        return { type: 'locked', keyLabel: res.hitLockedGate.keyLabel };
      }

      if (res.brokenCount > 0) {
        audio.playBreak(res.primaryMat || voxelHit.mat);
        progression.onCubesBroken(res.brokenCount);
      } else if (res.hitCount > 0) {
        audio.playHit(res.primaryMat || voxelHit.mat, this.currentWeapon);
      }
      return { type: 'voxel', ...res, hit: voxelHit };
    }

    return { type: 'miss' };
  }

  _spawnTracer(start, end) {
    const mesh = new THREE.Mesh(this.projGeo, this.projMat);
    mesh.position.copy(start);
    mesh.lookAt(end);
    this.scene.add(mesh);
    const dir = end.clone().sub(start);
    const totalDist = dir.length();
    dir.normalize();
    this.projectiles.push({
      mesh,
      dir,
      traveled: 0,
      maxDist: totalDist,
      speed: 52
    });
  }

  update(dt, isMoving) {
    this.swayTime += dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.attackAnim > 0) {
      this.attackAnim = Math.max(0, this.attackAnim - dt * 4.6);
    }

    // Muzzle flash decay
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) {
        this.muzzleLight.intensity = 0;
        if (this.models.pistol.userData.flash) {
          this.models.pistol.userData.flash.visible = false;
        }
      } else if (this.models.pistol.userData.flash) {
        this.models.pistol.userData.flash.visible = true;
        this.models.pistol.userData.flash.rotation.z += dt * 45;
      }
    }

    // Update tracers
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const step = p.speed * dt;
      p.mesh.position.addScaledVector(p.dir, step);
      p.traveled += step;
      if (p.traveled >= p.maxDist) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // Aspect-adaptive horizontal scale so fists/weapons frame perfectly on both 390x844 portrait and widescreen desktop!
    const aspect = this.camera.aspect || 0.5;
    const xScale = Math.min(1.0, Math.max(0.5, aspect / 0.92));
    const fistScale = aspect < 0.75 ? 0.68 : 0.92;
    this.models.fists.userData.leftFist.scale.setScalar(fistScale);
    this.models.fists.userData.rightFist.scale.setScalar(fistScale);

    // Animate viewmodels
    if (this.menuPoseActive) {
      const breath = Math.sin(this.swayTime * 2.0) * 0.008;
      const lf = this.models.fists.userData.leftFist;
      const rf = this.models.fists.userData.rightFist;
      // Frame both orange/grey gloved fists cleanly at bottom-left and bottom-right like IMG_0617.JPG!
      const menuX = 0.25 * xScale;
      const menuY = aspect < 0.75 ? -0.37 : -0.31;
      lf.position.set(-menuX, menuY + breath, -0.52);
      lf.rotation.set(0.32, 0.44, -0.26);
      rf.position.set(menuX, menuY + breath, -0.52);
      rf.rotation.set(0.32, -0.44, 0.26);
      return;
    }

    const bobAmp = isMoving ? 0.014 : 0.004;
    const bobFreq = isMoving ? 9.5 : 2.1;
    const bobX = Math.cos(this.swayTime * bobFreq * 0.5) * bobAmp;
    const bobY = Math.sin(this.swayTime * bobFreq) * bobAmp;

    // Punch curve (snappy forward lunge, smooth return)
    const swing = Math.sin(this.attackAnim * Math.PI);

    if (this.currentWeapon === 'fists') {
      const lf = this.models.fists.userData.leftFist;
      const rf = this.models.fists.userData.rightFist;
      const lPunch = this.punchSide < 0 ? swing : 0;
      const rPunch = this.punchSide > 0 ? swing : 0;
      const fx = 0.25 * xScale;

      lf.position.set(
        -fx + bobX + lPunch * 0.11,
        -0.31 + bobY + lPunch * 0.11,
        -0.52 - lPunch * 0.28
      );
      lf.rotation.set(0.24 - lPunch * 0.55, 0.36 - lPunch * 0.45, -0.22 + lPunch * 0.35);

      rf.position.set(
        fx + bobX - rPunch * 0.11,
        -0.31 + bobY + rPunch * 0.11,
        -0.52 - rPunch * 0.28
      );
      rf.rotation.set(0.24 - rPunch * 0.55, -0.36 + rPunch * 0.45, 0.22 - rPunch * 0.35);
    } else if (this.currentWeapon === 'hammer') {
      const h = this.models.hammer;
      // Overhead diagonal smash arc
      h.position.set(
        0.27 * xScale + bobX - swing * 0.14,
        -0.26 + bobY + Math.sin(this.attackAnim * Math.PI * 1.3) * 0.14 - swing * 0.08,
        -0.52 - swing * 0.22
      );
      h.rotation.set(
        -0.25 - swing * 1.15,
        -0.28 + swing * 0.45,
        0.22 + swing * 0.35
      );
    } else if (this.currentWeapon === 'pistol') {
      const p = this.models.pistol;
      p.position.set(
        0.22 * xScale + bobX,
        -0.23 + bobY + swing * 0.035,
        -0.48 + swing * 0.11
      );
      p.rotation.set(
        0.04 + swing * 0.32,
        -0.08,
        swing * 0.06
      );
    }
  }

  // ---- Procedural Low-Poly 3D Viewmodels ----
  _buildGlovedFists() {
    const group = new THREE.Group();
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.48, metalness: 0.08 });
    const darkGreyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.25 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x181c22, roughness: 0.7 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99b72, roughness: 0.72 });

    const createOneFist = (mirror) => {
      const g = new THREE.Group();

      // Forearm
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.068, 0.34, 10), skinMat);
      arm.rotation.x = Math.PI * 0.48;
      arm.position.set(0, -0.04, 0.22);
      g.add(arm);

      // Dark wrist cuff + orange strap
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.064, 0.09, 10), trimMat);
      cuff.rotation.x = Math.PI * 0.48;
      cuff.position.set(0, -0.015, 0.09);
      g.add(cuff);

      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.04, 0.04), orangeMat);
      strap.position.set(0, 0.025, 0.09);
      g.add(strap);

      // Orange glove main hand body
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.115, 0.145), orangeMat);
      hand.position.set(0, 0.01, -0.01);
      g.add(hand);

      // Dark grey armored knuckle plate (signature look from IMG_0617.JPG & icon.jpg)
      const knuckleArmor = new THREE.Mesh(new THREE.BoxGeometry(0.142, 0.052, 0.075), darkGreyMat);
      knuckleArmor.position.set(0, 0.048, -0.052);
      g.add(knuckleArmor);

      // Curled fingers
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.029, 0.062, 0.05), orangeMat);
        finger.position.set(-0.045 + i * 0.03, -0.02, -0.088);
        g.add(finger);
      }

      // Thumb wrapped inward
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.042, 0.075), orangeMat);
      thumb.position.set(-mirror * 0.068, 0.012, -0.045);
      thumb.rotation.y = mirror * 0.45;
      g.add(thumb);

      return g;
    };

    const leftFist = createOneFist(-1);
    const rightFist = createOneFist(1);
    group.add(leftFist, rightFist);
    group.userData.leftFist = leftFist;
    group.userData.rightFist = rightFist;
    return group;
  }

  _buildClawHammer() {
    const group = new THREE.Group();
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42, metalness: 0.1 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xb8c4d0, roughness: 0.25, metalness: 0.85 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x52606d, roughness: 0.35, metalness: 0.8 });

    // Gloved hand gripping handle
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.11, 0.12), orangeMat);
    hand.position.set(0, -0.1, 0.02);
    group.add(hand);

    const armor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.06), gripMat);
    armor.position.set(0, -0.07, -0.02);
    group.add(armor);

    // Lower rubber grip
    const lowerGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.22, 10), gripMat);
    lowerGrip.position.set(0, -0.1, 0);
    group.add(lowerGrip);

    // Orange fiberglass shaft (matches icon.jpg!)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.32, 10), orangeMat);
    shaft.position.set(0, 0.12, 0);
    group.add(shaft);

    // Steel hammer neck & body
    const headBody = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.088, 0.13), steelMat);
    headBody.position.set(0, 0.29, -0.02);
    group.add(headBody);

    // Cylindrical striking poll face (front)
    const striker = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.09, 12), steelMat);
    striker.rotation.x = Math.PI / 2;
    striker.position.set(0, 0.29, -0.11);
    group.add(striker);

    // Curved claw prongs (rear)
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.042, 0.11), darkSteelMat);
    claw.position.set(0, 0.275, 0.085);
    claw.rotation.x = 0.42;
    group.add(claw);

    return group;
  }

  _buildHandgun() {
    const group = new THREE.Group();
    const slideMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.32, metalness: 0.78 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.6, metalness: 0.35 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42, metalness: 0.15 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // Slide
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.074, 0.32), slideMat);
    slide.position.set(0, 0.07, -0.08);
    group.add(slide);

    // Orange tactical stripe along slide
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.018, 0.22), accentMat);
    stripe.position.set(0, 0.055, -0.09);
    group.add(stripe);

    // Lower receiver & trigger guard
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.28), frameMat);
    lower.position.set(0, 0.018, -0.06);
    group.add(lower);

    // Grip angled back
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.16, 0.078), frameMat);
    grip.position.set(0, -0.068, 0.04);
    grip.rotation.x = 0.24;
    group.add(grip);

    // Gloved hand around grip
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.09, 0.095), accentMat);
    hand.position.set(0, -0.075, 0.035);
    group.add(hand);

    // Barrel muzzle
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 10), frameMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.072, -0.25);
    group.add(barrel);

    // Glowing iron sights
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.018), glowMat);
    sight.position.set(0, 0.114, -0.22);
    group.add(sight);

    // Muzzle flash star
    const flash = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd166 })
    );
    flash.position.set(0, 0.072, -0.32);
    flash.visible = false;
    group.add(flash);
    group.userData.flash = flash;

    return group;
  }
}
