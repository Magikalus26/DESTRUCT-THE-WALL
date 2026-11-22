import * as THREE from 'three';
import { VOXEL_SIZE, GRID_Y } from '../world/VoxelWorld.js';

export class PlayerController {
  constructor(camera, world, domElement) {
    this.camera = camera;
    this.world = world;
    this.domElement = domElement;

    this.position = new THREE.Vector3(0, 1.65, 0.0);
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();

    this.yaw = 0; // 0 faces -Z (North brick wall)
    this.pitch = 0;

    this.eyeHeight = 1.65;
    this.radius = 0.35; // combat & pickup radius
    this.collisionHalfWidth = 0.22; // allows gliding cleanly through 2x7 micro-cube tunnels (0.50m x 1.75m)
    this.bodyHeight = 1.70;
    this.moveSpeed = 3.45;

    // Health & Survival
    this.maxHp = 100;
    this.hp = 100;
    this.armorReduction = 0; // 0..0.5
    this.timeSinceHurt = 10;
    this.invulnTimer = 0;

    // Camera feedback
    this.shakeTrauma = 0;
    this.kickPitch = 0;
    this.kickZ = 0;
    this.walkBobPhase = 0;
    this.isMoving = false;
    this.sensitivity = 0.0042;

    // Input state
    this.keys = new Set();
    this.joyInput = { x: 0, y: 0 }; // x: strafe (-1..1), y: forward (-1..1)
    this.pointerLocked = false;
    this.activeLookTouchId = null;
    this.lastLookX = 0;
    this.lastLookY = 0;
    this.isMouseDragging = false;
    this.controlsEnabled = false;

    this._bindInputs();
  }

  resetToCell(yaw = 0, pitch = 0) {
    this.position.set(0, this.eyeHeight, 0.0);
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.hp = this.maxHp;
    this.timeSinceHurt = 10;
    this.invulnTimer = 0.5;
    this._applyCameraTransform(0);
  }

  setPosition(x, z, yaw = 0) {
    this.position.set(x, this.eyeHeight, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.knockback.set(0, 0, 0);
    this._applyCameraTransform(0);
  }

  setControlsEnabled(flag) {
    this.controlsEnabled = Boolean(flag);
    if (!this.controlsEnabled) {
      this.keys.clear();
      this.joyInput.x = 0;
      this.joyInput.y = 0;
      this.activeLookTouchId = null;
      this.isMouseDragging = false;
      if (document.pointerLockElement === this.domElement) {
        document.exitPointerLock?.();
      }
    }
  }

  setJoystickInput(x, y) {
    this.joyInput.x = Math.max(-1, Math.min(1, x));
    this.joyInput.y = Math.max(-1, Math.min(1, y));
  }

  addKick(pitchAmount = 0.045, shakeAmount = 0.16) {
    this.kickPitch = Math.min(0.16, this.kickPitch + pitchAmount);
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + shakeAmount);
  }

  applyDamage(rawDamage, sourcePos = null, knockStrength = 3.2) {
    if (this.invulnTimer > 0) return { tookDamage: false, died: false };
    const finalDmg = Math.max(1, Math.round(rawDamage * (1 - this.armorReduction)));
    this.hp = Math.max(0, this.hp - finalDmg);
    this.timeSinceHurt = 0;
    this.invulnTimer = 0.45;
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + 0.55);

    if (sourcePos) {
      const dx = this.position.x - sourcePos.x;
      const dz = this.position.z - sourcePos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.knockback.x += (dx / len) * knockStrength;
      this.knockback.z += (dz / len) * knockStrength;
    }

    return { tookDamage: true, damage: finalDmg, died: this.hp <= 0 };
  }

  applyStats(maxHp, armorReduction) {
    const oldMax = this.maxHp;
    this.maxHp = maxHp;
    this.armorReduction = armorReduction;
    if (maxHp > oldMax) {
      this.hp = Math.min(this.maxHp, this.hp + (maxHp - oldMax));
    }
  }

  getForwardDirection(out = new THREE.Vector3()) {
    const cosPitch = Math.cos(this.pitch);
    return out.set(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch
    ).normalize();
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (!this.controlsEnabled) return;
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // Desktop Mouse Look (PointerLock on click or drag fallback)
    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.controlsEnabled || e.button !== 0) return;
      this.isMouseDragging = true;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.controlsEnabled) return;
      if (this.pointerLocked) {
        this.yaw -= e.movementX * this.sensitivity * 0.65;
        this.pitch -= e.movementY * this.sensitivity * 0.65;
        this._clampPitch();
      } else if (this.isMouseDragging) {
        const dx = e.clientX - this.lastLookX;
        const dy = e.clientY - this.lastLookY;
        this.lastLookX = e.clientX;
        this.lastLookY = e.clientY;
        this.yaw -= dx * this.sensitivity * 0.9;
        this.pitch -= dy * this.sensitivity * 0.9;
        this._clampPitch();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
    });

    // Touch-Look on the WebGL canvas (works seamlessly alongside left-side virtual joystick and right-side attack button!)
    this.domElement.addEventListener('touchstart', (e) => {
      if (!this.controlsEnabled) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (this.activeLookTouchId === null) {
          this.activeLookTouchId = t.identifier;
          this.lastLookX = t.clientX;
          this.lastLookY = t.clientY;
          break;
        }
      }
    }, { passive: true });

    this.domElement.addEventListener('touchmove', (e) => {
      if (!this.controlsEnabled || this.activeLookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.activeLookTouchId) {
          const dx = t.clientX - this.lastLookX;
          const dy = t.clientY - this.lastLookY;
          this.lastLookX = t.clientX;
          this.lastLookY = t.clientY;
          this.yaw -= dx * this.sensitivity * 1.15;
          this.pitch -= dy * this.sensitivity * 1.05;
          this._clampPitch();
          break;
        }
      }
    }, { passive: true });

    const endTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.activeLookTouchId) {
          this.activeLookTouchId = null;
          break;
        }
      }
    };
    this.domElement.addEventListener('touchend', endTouch, { passive: true });
    this.domElement.addEventListener('touchcancel', endTouch, { passive: true });
  }

  _clampPitch() {
    const limit = Math.PI * 0.44;
    if (this.pitch > limit) this.pitch = limit;
    if (this.pitch < -limit) this.pitch = -limit;
  }

  update(dt) {
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    this.timeSinceHurt += dt;

    // Out-of-combat passive regeneration
    if (this.controlsEnabled && this.timeSinceHurt > 4.0 && this.hp > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + dt * 5.0);
    }

    if (!this.controlsEnabled) {
      return;
    }

    // Gather movement input (AZERTY ZQSD + QWERTY WASD + Arrow keys + Mobile Virtual Joystick)
    let moveForward = this.joyInput.y;
    let moveRight = this.joyInput.x;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

    // Clamp diagonal vector length
    const mag = Math.hypot(moveForward, moveRight);
    if (mag > 1) {
      moveForward /= mag;
      moveRight /= mag;
    }

    // Forward/Right horizontal basis from yaw
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const vx = (-sinY * moveForward + cosY * moveRight) * this.moveSpeed + this.knockback.x;
    const vz = (-cosY * moveForward - sinY * moveRight) * this.moveSpeed + this.knockback.z;

    // Decay knockback smoothly
    const kbDecay = Math.exp(-8.5 * dt);
    this.knockback.x *= kbDecay;
    this.knockback.z *= kbDecay;

    // Sliding AABB collision against micro-voxels (separate X then Z)
    const nextX = this.position.x + vx * dt;
    if (!this._collidesAt(nextX, this.position.z)) {
      this.position.x = nextX;
    }
    const nextZ = this.position.z + vz * dt;
    if (!this._collidesAt(this.position.x, nextZ)) {
      this.position.z = nextZ;
    }

    // Keep player within reasonable outdoor yard boundary
    const maxCoord = 24.0;
    this.position.x = Math.max(-maxCoord, Math.min(maxCoord, this.position.x));
    this.position.z = Math.max(-maxCoord, Math.min(maxCoord, this.position.z));

    this.isMoving = mag > 0.1;
    if (this.isMoving) {
      this.walkBobPhase += dt * (8.5 + mag * 3.0);
    }

    // Decay camera kick & trauma
    this.kickPitch *= Math.exp(-16 * dt);
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.2);

    this._applyCameraTransform(dt);
  }

  _collidesAt(wx, wz) {
    const hw = this.collisionHalfWidth;
    const minGX = Math.floor((wx - hw) / VOXEL_SIZE);
    const maxGX = Math.floor((wx + hw) / VOXEL_SIZE);
    const minGZ = Math.floor((wz - hw) / VOXEL_SIZE);
    const maxGZ = Math.floor((wz + hw) / VOXEL_SIZE);
    // Check player vertical span: from ankle (y = 0.08m) up to top of head (y = 1.70m, i.e. 7 micro-cubes tall)
    const minGY = 0;
    const maxGY = Math.min(GRID_Y - 1, Math.floor((this.bodyHeight - 0.04) / VOXEL_SIZE));

    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gz = minGZ; gz <= maxGZ; gz++) {
        for (let gx = minGX; gx <= maxGX; gx++) {
          if (this.world.getVoxelMat(gx, gy, gz) !== 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  _applyCameraTransform() {
    const bobY = this.isMoving ? Math.sin(this.walkBobPhase) * 0.032 : 0;
    const bobX = this.isMoving ? Math.cos(this.walkBobPhase * 0.5) * 0.018 : 0;

    const shake = this.shakeTrauma * this.shakeTrauma;
    const sx = (Math.random() - 0.5) * shake * 0.08;
    const sy = (Math.random() - 0.5) * shake * 0.08;

    this.camera.position.set(
      this.position.x + bobX + sx,
      this.eyeHeight + bobY + sy,
      this.position.z
    );

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.kickPitch + (Math.random() - 0.5) * shake * 0.04;
    this.camera.rotation.z = (Math.random() - 0.5) * shake * 0.025;
  }

  setMenuPose(time) {
    // Faithful IMG_0617.JPG camera pose inside the brick cell facing the North brick wall
    this.camera.position.set(
      Math.sin(time * 0.45) * 0.025,
      1.38 + Math.sin(time * 0.9) * 0.015,
      1.76
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      0.02 + Math.cos(time * 0.7) * 0.006,
      Math.sin(time * 0.35) * 0.02,
      0
    );
  }
}
