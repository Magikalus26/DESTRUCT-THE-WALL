import * as THREE from 'three';

export const VOXEL_SIZE = 0.25;
export const GRID_Y = 13; // 13 * 0.25 = 3.25m ceiling
export const HALF_SPAN = 72; // gx, gz in [-72, 71]
export const GRID_X = HALF_SPAN * 2; // 144
export const GRID_Z = HALF_SPAN * 2; // 144
export const CELL_MIN = -8; // Starting cell [-8..7] = 16 voxels = 4.00m
export const CELL_MAX = 7;

export const CHUNK_SIZE = 8;
export const CHUNKS_X = GRID_X / CHUNK_SIZE; // 18
export const CHUNKS_Z = GRID_Z / CHUNK_SIZE; // 18

export const MATERIALS = {
  1: { id: 1, name: 'Plâtre & Brique rouge', ring: 1, hp: 3, value: 1, color: 0xb94732, rubbleColor: 0xc24d36 },
  2: { id: 2, name: 'Pierre grise & Parpaings', ring: 2, hp: 14, value: 4, color: 0x828c96, rubbleColor: 0x8e98a2 },
  3: { id: 3, name: 'Béton armé sombre', ring: 3, hp: 55, value: 12, color: 0x4b535d, rubbleColor: 0x57616d },
  4: { id: 4, name: 'Roche volcanique & Cristaux', ring: 4, hp: 220, value: 40, color: 0x3b2d42, rubbleColor: 0x6a3ea1 },
  5: { id: 5, name: 'Blindage industriel', ring: 5, hp: 900, value: 150, color: 0x54626f, rubbleColor: 0x768796 },
  6: { id: 6, name: 'Amas brillant (Clé laiton)', ring: 2, hp: 12, value: 10, color: 0xd9a838, rubbleColor: 0xf7c948 },
  7: { id: 7, name: 'Cristal brillant (Clé accès)', ring: 4, hp: 180, value: 85, color: 0x48b8d0, rubbleColor: 0x6be5ff },
  8: { id: 8, name: 'Grille verrouillée', ring: 2, hp: 99999, value: 0, color: 0x6f7780, lockedBy: 'keyBrass', keyLabel: 'Clé en laiton requise' },
  9: { id: 9, name: 'Blindage verrouillé', ring: 4, hp: 99999, value: 0, color: 0x4c5664, lockedBy: 'keyAccess', keyLabel: "Clé d'accès requise" }
};

export const RING_DEFINITIONS = [
  { ring: 1, min: 1, max: 5, mat: 1, label: 'Enceinte 1 — Brique' },
  { ring: 2, min: 12, max: 17, mat: 2, label: 'Enceinte 2 — Pierre' },
  { ring: 3, min: 25, max: 31, mat: 3, label: 'Enceinte 3 — Béton armé' },
  { ring: 4, min: 38, max: 45, mat: 4, label: 'Enceinte 4 — Roche volcanique' },
  { ring: 5, min: 53, max: 61, mat: 5, label: 'Enceinte 5 — Blindage' }
];

const MAX_INSTANCES_PER_MAT = 4500;
const MAX_CRACK_INSTANCES = 500;
const MAX_RUBBLE = 280;
const MAX_SPARKS = 120;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export class VoxelWorld {
  constructor(scene) {
    this.scene = scene;
    this.totalCells = GRID_X * GRID_Y * GRID_Z;
    this.gridMat = new Uint8Array(this.totalCells);
    this.gridHp = new Uint16Array(this.totalCells);
    this.gridMaxHp = new Uint16Array(this.totalCells);
    this.gridVariant = new Uint8Array(this.totalCells);
    this.exposedFlags = new Uint8Array(this.totalCells);

    // Track broken voxels relative to initial generation for compact localStorage save
    this.brokenSet = new Set();
    // Recently hit voxels vibrating visually
    this.shakingVoxels = new Map(); // idx -> { timer, intensity }
    // Damaged voxels that need crack overlay
    this.damagedSet = new Set();

    // Spatial chunked exposed lists
    this.chunks = new Array(CHUNKS_X * CHUNKS_Z);
    for (let i = 0; i < this.chunks.length; i++) {
      this.chunks[i] = new Set();
    }

    this.lastPlayerChunkX = 999;
    this.lastPlayerChunkZ = 999;
    this.meshDirty = true;

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // Metadata filled during world build
    this.enemySpawns = [];
    this.crusherSpecs = [];
    this.depositPads = [];
    this.terminalPos = new THREE.Vector3(-1.42, 0, 1.42);
    this.keyPickups = []; // { id, pos, mesh, collected }

    // Procedural materials & InstancedMeshes
    this.textures = this._createProceduralTextures();
    this.instancedMeshes = {};
    this._initInstancedMeshes();
    this._initCrackMesh();
    this._initRubblePool();
    this._initSparkPool();
    this._initStaticEnvironment();
    this._initMenuDiorama();

    this.menuDioramaActive = true;
    this.menuTime = 0;
  }

  // ---- Coordinate helpers ----
  static ringDist(gx, gz) {
    const dx = gx < CELL_MIN ? CELL_MIN - gx : (gx > CELL_MAX ? gx - CELL_MAX : 0);
    const dz = gz < CELL_MIN ? CELL_MIN - gz : (gz > CELL_MAX ? gz - CELL_MAX : 0);
    return dx > dz ? dx : dz;
  }

  static inBounds(gx, gy, gz) {
    return (
      gy >= 0 && gy < GRID_Y &&
      gx >= -HALF_SPAN && gx < HALF_SPAN &&
      gz >= -HALF_SPAN && gz < HALF_SPAN
    );
  }

  static toIndex(gx, gy, gz) {
    const ix = gx + HALF_SPAN;
    const iz = gz + HALF_SPAN;
    return (gy * GRID_Z + iz) * GRID_X + ix;
  }

  static fromIndex(idx) {
    const ix = idx % GRID_X;
    const rem = (idx - ix) / GRID_X;
    const iz = rem % GRID_Z;
    const gy = (rem - iz) / GRID_Z;
    return { gx: ix - HALF_SPAN, gy, gz: iz - HALF_SPAN };
  }

  static gridToWorld(gx, gy, gz, out = new THREE.Vector3()) {
    return out.set(
      (gx + 0.5) * VOXEL_SIZE,
      (gy + 0.5) * VOXEL_SIZE,
      (gz + 0.5) * VOXEL_SIZE
    );
  }

  static worldToGrid(x, y, z) {
    return {
      gx: Math.floor(x / VOXEL_SIZE),
      gy: Math.floor(y / VOXEL_SIZE),
      gz: Math.floor(z / VOXEL_SIZE)
    };
  }

  static chunkKey(gx, gz) {
    const cx = Math.floor((gx + HALF_SPAN) / CHUNK_SIZE);
    const cz = Math.floor((gz + HALF_SPAN) / CHUNK_SIZE);
    return cz * CHUNKS_X + cx;
  }

  getVoxelMat(gx, gy, gz) {
    if (!VoxelWorld.inBounds(gx, gy, gz)) return 0;
    return this.gridMat[VoxelWorld.toIndex(gx, gy, gz)];
  }

  isSolid(gx, gy, gz) {
    if (gy < 0 || gy >= GRID_Y) return true;
    if (!VoxelWorld.inBounds(gx, gy, gz)) return false;
    return this.gridMat[VoxelWorld.toIndex(gx, gy, gz)] !== 0;
  }

  getSectionLabel(worldX, worldZ) {
    const gx = Math.floor(worldX / VOXEL_SIZE);
    const gz = Math.floor(worldZ / VOXEL_SIZE);
    const d = VoxelWorld.ringDist(gx, gz);
    if (d === 0) return 'Cellule Centrale - Section 1';
    if (d <= 5) return 'Enceinte 1 - Brique Rouge';
    if (d <= 11) return 'Cavité 1 - Couloir Nord/Sud';
    if (d <= 17) return 'Enceinte 2 - Pierre Grise';
    if (d <= 24) return 'Cavité 2 - Grille Sécurité';
    if (d <= 31) return 'Enceinte 3 - Béton Armé';
    if (d <= 37) return 'Cavité 3 - Zone Concasseurs';
    if (d <= 45) return 'Enceinte 4 - Roche Volcanique';
    if (d <= 52) return 'Cavité 4 - Sas Blindé';
    if (d <= 61) return 'Enceinte 5 - Blindage Extérieur';
    return 'Extérieur — Liberté !';
  }

  isOutside(worldX, worldZ) {
    const gx = Math.floor(worldX / VOXEL_SIZE);
    const gz = Math.floor(worldZ / VOXEL_SIZE);
    return VoxelWorld.ringDist(gx, gz) >= 62;
  }

  getMaxRingReached(worldX, worldZ) {
    const gx = Math.floor(worldX / VOXEL_SIZE);
    const gz = Math.floor(worldZ / VOXEL_SIZE);
    const d = VoxelWorld.ringDist(gx, gz);
    if (d >= 53) return 5;
    if (d >= 38) return 4;
    if (d >= 25) return 3;
    if (d >= 12) return 2;
    return 1;
  }

  // ---- World Generation ----
  generate(savedBrokenList = null, unlockedGates = { gate1: false, gate2: false }, collectedKeys = { keyBrass: false, keyAccess: false }) {
    this.gridMat.fill(0);
    this.gridHp.fill(0);
    this.gridMaxHp.fill(0);
    this.gridVariant.fill(0);
    this.exposedFlags.fill(0);
    this.brokenSet.clear();
    this.damagedSet.clear();
    this.shakingVoxels.clear();
    this.enemySpawns = [];
    this.crusherSpecs = [];

    for (let i = 0; i < this.chunks.length; i++) {
      this.chunks[i].clear();
    }

    // Deterministic hash for subtle material variation
    const hash3 = (x, y, z) => {
      let n = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
      n = (n ^ (n >> 13)) * 1274126177;
      return ((n ^ (n >> 16)) >>> 0) / 4294967295;
    };

    // 1. Fill the 5 concentric micro-voxel rings + 2 security gates
    for (let gz = -HALF_SPAN; gz < HALF_SPAN; gz++) {
      for (let gx = -HALF_SPAN; gx < HALF_SPAN; gx++) {
        const d = VoxelWorld.ringDist(gx, gz);
        let mat = 0;
        if (d >= 1 && d <= 5) mat = 1;
        else if (d >= 12 && d <= 17) mat = 2;
        else if (d === 24 && !unlockedGates.gate1) mat = 8;
        else if (d >= 25 && d <= 31) mat = 3;
        else if (d >= 38 && d <= 45) mat = 4;
        else if (d === 52 && !unlockedGates.gate2) mat = 9;
        else if (d >= 53 && d <= 61) mat = 5;

        if (mat === 0) continue;

        const matDef = MATERIALS[mat];
        for (let gy = 0; gy < GRID_Y; gy++) {
          const idx = VoxelWorld.toIndex(gx, gy, gz);
          this.gridMat[idx] = mat;
          this.gridHp[idx] = matDef.hp;
          this.gridMaxHp[idx] = matDef.hp;
          // Subtle variant 0..255
          let v = Math.floor(hash3(gx, gy, gz) * 255);
          // Give the North inner face of cell 1 a cool weathered plaster/stone patch like IMG_0617.JPG
          if (mat === 1 && gz === -9 && gx >= -4 && gx <= 3 && gy >= 2 && gy <= 10) {
            if (((gx + gy) & 1) === 0 || hash3(gx * 3, gy, gz) > 0.58) {
              v = 250; // special grey-plaster brick tint
            }
          }
          this.gridVariant[idx] = v;
        }
      }
    }

    // 2. Carve Key 1 (Brass Key) hidden glittering cluster in Enceinte 2 (North-East sector, easily noticeable sparkle from Cavité 1)
    this._carveKeyCache(4, -22, 6, 'keyBrass', collectedKeys.keyBrass);
    // 3. Carve Key 2 (Access Key) hidden crystal cluster in Enceinte 4 (North-West sector, glistening cyan from Cavité 3)
    this._carveKeyCache(-8, -48, 7, 'keyAccess', collectedKeys.keyAccess);

    // 4. Carve Hidden Enemy Pockets inside rings 2, 3, 4, 5
    // Rats in Ring 2
    this._carveEnemyPocket(-12, -22, 'rat', 1);
    this._carveEnemyPocket(22, 2, 'rat', 1);
    this._carveEnemyPocket(-4, 21, 'rat', 1);
    this._carveEnemyPocket(-23, 6, 'rat', 1);
    // Insects (packs of 2) in Ring 3
    this._carveEnemyPocket(8, -36, 'insect', 2);
    this._carveEnemyPocket(35, -8, 'insect', 2);
    this._carveEnemyPocket(-10, 35, 'insect', 2);
    this._carveEnemyPocket(-36, 12, 'insect', 2);
    // Inmate Zombies in Ring 4
    this._carveEnemyPocket(12, -50, 'zombie', 1);
    this._carveEnemyPocket(49, 10, 'zombie', 1);
    this._carveEnemyPocket(-14, 49, 'zombie', 1);
    this._carveEnemyPocket(-50, -10, 'zombie', 1);
    // Heavy Zombies in Ring 5
    this._carveEnemyPocket(0, -64, 'zombie_heavy', 1);
    this._carveEnemyPocket(63, 0, 'zombie_heavy', 1);
    this._carveEnemyPocket(0, 63, 'zombie_heavy', 1);
    this._carveEnemyPocket(-64, 0, 'zombie_heavy', 1);

    // 5. Carve Crusher Trap Channels in Enceinte 3 & Enceinte 5 (sliding metallic red crushers!)
    this._carveCrusherTrack(0, -36, 'x', 5, 1.35);
    this._carveCrusherTrack(35, 0, 'z', 5, 1.45);
    this._carveCrusherTrack(0, 35, 'x', 5, 1.35);
    this._carveCrusherTrack(-36, 0, 'z', 5, 1.45);
    // Vertical & horizontal crushers in Enceinte 5
    this._carveCrusherTrack(-12, -64, 'y', 3, 1.5);
    this._carveCrusherTrack(63, -12, 'y', 3, 1.5);
    this._carveCrusherTrack(12, 63, 'x', 5, 1.65);
    this._carveCrusherTrack(-64, 12, 'z', 5, 1.65);

    // 6. Apply saved broken voxels if loading a game
    if (Array.isArray(savedBrokenList) && savedBrokenList.length > 0) {
      for (let i = 0; i < savedBrokenList.length; i++) {
        const idx = savedBrokenList[i];
        if (idx >= 0 && idx < this.totalCells) {
          this.gridMat[idx] = 0;
          this.gridHp[idx] = 0;
          this.brokenSet.add(idx);
        }
      }
    }

    // 7. Compute initial exposed voxel surface sets per chunk
    this._rebuildAllExposedChunks();
    this.lastPlayerChunkX = 999;
    this.lastPlayerChunkZ = 999;
    this.meshDirty = true;

    // Reset dynamic pools
    this._resetRubbleAndSparks();
  }

  _carveKeyCache(cx, cz, oreMatId, keyId, alreadyCollected) {
    const oreDef = MATERIALS[oreMatId];
    // Wrap a 5x6x5 glittering ore cluster around a hollow 2x4x2 center holding the Key
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let gy = 1; gy <= 6; gy++) {
          const gx = cx + dx;
          const gz = cz + dz;
          if (!VoxelWorld.inBounds(gx, gy, gz)) continue;
          const idx = VoxelWorld.toIndex(gx, gy, gz);
          const isCenter = Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && gy >= 2 && gy <= 4 && (Math.abs(dx) + Math.abs(dz) <= 1);
          if (isCenter) {
            this.gridMat[idx] = 0;
            this.gridHp[idx] = 0;
          } else if (this.gridMat[idx] !== 0) {
            this.gridMat[idx] = oreMatId;
            this.gridHp[idx] = oreDef.hp;
            this.gridMaxHp[idx] = oreDef.hp;
          }
        }
      }
    }

    // Also paint a small 2x2 glittering tell on the inner surface of the ring facing the corridor so player can spot it!
    const innerZ = cz < 0 ? cz + 3 : cz - 3;
    for (let dx = -1; dx <= 1; dx++) {
      for (let gy = 3; gy <= 5; gy++) {
        const gx = cx + dx;
        if (VoxelWorld.inBounds(gx, gy, innerZ)) {
          const idx = VoxelWorld.toIndex(gx, gy, innerZ);
          if (this.gridMat[idx] !== 0) {
            this.gridMat[idx] = oreMatId;
            this.gridHp[idx] = oreDef.hp;
            this.gridMaxHp[idx] = oreDef.hp;
          }
        }
      }
    }

    const pos = VoxelWorld.gridToWorld(cx, 3, cz);
    this._setupKeyPickup(keyId, pos, alreadyCollected);
  }

  _carveEnemyPocket(cx, cz, enemyType, count) {
    // Carve a sealed hollow chamber inside the wall (leaving at least 1 outer/inner skin layer intact)
    const halfW = enemyType.startsWith('zombie') ? 2 : 1;
    const topY = enemyType.startsWith('zombie') ? 8 : 5;
    for (let dx = -halfW; dx <= halfW; dx++) {
      for (let dz = -halfW; dz <= halfW; dz++) {
        for (let gy = 0; gy <= topY; gy++) {
          const gx = cx + dx;
          const gz = cz + dz;
          if (!VoxelWorld.inBounds(gx, gy, gz)) continue;
          const idx = VoxelWorld.toIndex(gx, gy, gz);
          this.gridMat[idx] = 0;
          this.gridHp[idx] = 0;
        }
      }
    }
    const worldPos = VoxelWorld.gridToWorld(cx, 0, cz);
    worldPos.y = 0;
    for (let i = 0; i < count; i++) {
      const offsetX = count > 1 ? (i === 0 ? -0.22 : 0.22) : 0;
      this.enemySpawns.push({
        type: enemyType,
        x: worldPos.x + offsetX,
        z: worldPos.z,
        gx: cx,
        gz: cz
      });
    }
  }

  _carveCrusherTrack(cx, cz, axis, halfLen, speed) {
    // Carve a visible mechanical track recessed inside the wall
    const minX = axis === 'x' ? cx - halfLen : cx - 1;
    const maxX = axis === 'x' ? cx + halfLen : cx + 1;
    const minZ = axis === 'z' ? cz - halfLen : cz - 1;
    const maxZ = axis === 'z' ? cz + halfLen : cz + 1;
    const minY = 0;
    const maxY = axis === 'y' ? 11 : 7;

    for (let gx = minX; gx <= maxX; gx++) {
      for (let gz = minZ; gz <= maxZ; gz++) {
        for (let gy = minY; gy <= maxY; gy++) {
          if (!VoxelWorld.inBounds(gx, gy, gz)) continue;
          const idx = VoxelWorld.toIndex(gx, gy, gz);
          this.gridMat[idx] = 0;
          this.gridHp[idx] = 0;
        }
      }
    }

    const center = VoxelWorld.gridToWorld(cx, axis === 'y' ? 5 : 3, cz);
    this.crusherSpecs.push({
      center,
      axis,
      amplitude: (halfLen - 1.2) * VOXEL_SIZE,
      speed,
      phase: (cx * 0.37 + cz * 0.21)
    });
  }

  _checkExposed(gx, gy, gz) {
    const idx = VoxelWorld.toIndex(gx, gy, gz);
    if (this.gridMat[idx] === 0) return false;
    // Check 6 cardinal neighbors
    if (gx > -HALF_SPAN && this.gridMat[idx - 1] === 0) return true;
    if (gx < HALF_SPAN - 1 && this.gridMat[idx + 1] === 0) return true;
    if (gz > -HALF_SPAN && this.gridMat[idx - GRID_X] === 0) return true;
    if (gz < HALF_SPAN - 1 && this.gridMat[idx + GRID_X] === 0) return true;
    if (gy > 0 && this.gridMat[idx - GRID_X * GRID_Z] === 0) return true;
    if (gy < GRID_Y - 1 && this.gridMat[idx + GRID_X * GRID_Z] === 0) return true;
    return false;
  }

  _updateVoxelExposure(gx, gy, gz) {
    if (!VoxelWorld.inBounds(gx, gy, gz)) return;
    const idx = VoxelWorld.toIndex(gx, gy, gz);
    const ck = VoxelWorld.chunkKey(gx, gz);
    const nowExposed = this._checkExposed(gx, gy, gz);
    if (nowExposed && !this.exposedFlags[idx]) {
      this.exposedFlags[idx] = 1;
      this.chunks[ck].add(idx);
      this.meshDirty = true;
    } else if (!nowExposed && this.exposedFlags[idx]) {
      this.exposedFlags[idx] = 0;
      this.chunks[ck].delete(idx);
      this.meshDirty = true;
    }
  }

  _rebuildAllExposedChunks() {
    for (let i = 0; i < this.chunks.length; i++) {
      this.chunks[i].clear();
    }
    this.exposedFlags.fill(0);

    for (let gy = 0; gy < GRID_Y; gy++) {
      for (let gz = -HALF_SPAN; gz < HALF_SPAN; gz++) {
        for (let gx = -HALF_SPAN; gx < HALF_SPAN; gx++) {
          const idx = VoxelWorld.toIndex(gx, gy, gz);
          if (this.gridMat[idx] === 0) continue;
          if (this._checkExposed(gx, gy, gz)) {
            this.exposedFlags[idx] = 1;
            this.chunks[VoxelWorld.chunkKey(gx, gz)].add(idx);
          }
        }
      }
    }
  }

  unlockGate(gateMatId) {
    let removed = 0;
    for (let gy = 0; gy < GRID_Y; gy++) {
      for (let gz = -HALF_SPAN; gz < HALF_SPAN; gz++) {
        for (let gx = -HALF_SPAN; gx < HALF_SPAN; gx++) {
          const idx = VoxelWorld.toIndex(gx, gy, gz);
          if (this.gridMat[idx] === gateMatId) {
            this.gridMat[idx] = 0;
            this.gridHp[idx] = 0;
            if (this.exposedFlags[idx]) {
              this.exposedFlags[idx] = 0;
              this.chunks[VoxelWorld.chunkKey(gx, gz)].delete(idx);
            }
            removed++;
            // Expose neighbors
            this._updateVoxelExposure(gx - 1, gy, gz);
            this._updateVoxelExposure(gx + 1, gy, gz);
            this._updateVoxelExposure(gx, gy, gz - 1);
            this._updateVoxelExposure(gx, gy, gz + 1);
          }
        }
      }
    }
    this.meshDirty = true;
    return removed;
  }

  // ---- Fast 3D DDA Voxel Raycast ----
  raycast(origin, dir, maxDist = 4.0) {
    let x = Math.floor(origin.x / VOXEL_SIZE);
    let y = Math.floor(origin.y / VOXEL_SIZE);
    let z = Math.floor(origin.z / VOXEL_SIZE);

    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    const tDeltaX = dir.x !== 0 ? Math.abs(VOXEL_SIZE / dir.x) : 1e9;
    const tDeltaY = dir.y !== 0 ? Math.abs(VOXEL_SIZE / dir.y) : 1e9;
    const tDeltaZ = dir.z !== 0 ? Math.abs(VOXEL_SIZE / dir.z) : 1e9;

    const nextVoxelBoundaryX = (x + (stepX > 0 ? 1 : 0)) * VOXEL_SIZE;
    const nextVoxelBoundaryY = (y + (stepY > 0 ? 1 : 0)) * VOXEL_SIZE;
    const nextVoxelBoundaryZ = (z + (stepZ > 0 ? 1 : 0)) * VOXEL_SIZE;

    let tMaxX = dir.x !== 0 ? (nextVoxelBoundaryX - origin.x) / dir.x : 1e9;
    let tMaxY = dir.y !== 0 ? (nextVoxelBoundaryY - origin.y) / dir.y : 1e9;
    let tMaxZ = dir.z !== 0 ? (nextVoxelBoundaryZ - origin.z) / dir.z : 1e9;

    let dist = 0;
    let nx = 0, ny = 0, nz = 0;

    for (let i = 0; i < 120; i++) {
      if (dist > maxDist) return null;

      if (VoxelWorld.inBounds(x, y, z)) {
        const idx = VoxelWorld.toIndex(x, y, z);
        const mat = this.gridMat[idx];
        if (mat !== 0) {
          const hitPoint = new THREE.Vector3(
            origin.x + dir.x * dist,
            origin.y + dir.y * dist,
            origin.z + dir.z * dist
          );
          return {
            gx: x,
            gy: y,
            gz: z,
            idx,
            mat,
            hp: this.gridHp[idx],
            maxHp: this.gridMaxHp[idx],
            distance: dist,
            point: hitPoint,
            normal: new THREE.Vector3(nx, ny, nz)
          };
        }
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        dist = tMaxX;
        tMaxX += tDeltaX;
        x += stepX;
        nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        dist = tMaxY;
        tMaxY += tDeltaY;
        y += stepY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        dist = tMaxZ;
        tMaxZ += tDeltaZ;
        z += stepZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }

  // ---- Spherical Micro-Cube Impact Damage ----
  damageSphere(center, radius, damage, spawnRubble = true) {
    const minX = Math.max(-HALF_SPAN, Math.floor((center.x - radius) / VOXEL_SIZE));
    const maxX = Math.min(HALF_SPAN - 1, Math.floor((center.x + radius) / VOXEL_SIZE));
    const minY = Math.max(0, Math.floor((center.y - radius) / VOXEL_SIZE));
    const maxY = Math.min(GRID_Y - 1, Math.floor((center.y + radius) / VOXEL_SIZE));
    const minZ = Math.max(-HALF_SPAN, Math.floor((center.z - radius) / VOXEL_SIZE));
    const maxZ = Math.min(HALF_SPAN - 1, Math.floor((center.z + radius) / VOXEL_SIZE));

    const rSq = radius * radius;
    let brokenCount = 0;
    let hitCount = 0;
    let primaryMat = 0;
    let hitLockedGate = null;

    for (let gy = minY; gy <= maxY; gy++) {
      const wy = (gy + 0.5) * VOXEL_SIZE;
      const dy = wy - center.y;
      for (let gz = minZ; gz <= maxZ; gz++) {
        const wz = (gz + 0.5) * VOXEL_SIZE;
        const dz = wz - center.z;
        for (let gx = minX; gx <= maxX; gx++) {
          const wx = (gx + 0.5) * VOXEL_SIZE;
          const dx = wx - center.x;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > rSq) continue;

          const idx = VoxelWorld.toIndex(gx, gy, gz);
          const mat = this.gridMat[idx];
          if (mat === 0) continue;

          const matDef = MATERIALS[mat];
          if (matDef.lockedBy) {
            hitLockedGate = matDef;
            continue;
          }

          if (primaryMat === 0) primaryMat = mat;
          hitCount++;

          // Smooth falloff so edge cubes take slightly less damage for natural organic tunnels
          const distRatio = Math.sqrt(distSq) / Math.max(0.01, radius);
          const falloff = 1.0 - distRatio * 0.35;
          const dmg = Math.max(1, Math.round(damage * falloff));

          if (this.gridHp[idx] <= dmg) {
            // Destroy micro-cube!
            this.gridMat[idx] = 0;
            this.gridHp[idx] = 0;
            this.brokenSet.add(idx);
            this.damagedSet.delete(idx);
            this.shakingVoxels.delete(idx);

            if (this.exposedFlags[idx]) {
              this.exposedFlags[idx] = 0;
              this.chunks[VoxelWorld.chunkKey(gx, gz)].delete(idx);
            }

            // Reveal 6 neighbors
            this._updateVoxelExposure(gx - 1, gy, gz);
            this._updateVoxelExposure(gx + 1, gy, gz);
            this._updateVoxelExposure(gx, gy - 1, gz);
            this._updateVoxelExposure(gx, gy + 1, gz);
            this._updateVoxelExposure(gx, gy, gz - 1);
            this._updateVoxelExposure(gx, gy, gz + 1);

            if (spawnRubble) {
              this._spawnRubbleFromCube(wx, wy, wz, matDef);
            }
            this._spawnSparks(wx, wy, wz, matDef.rubbleColor || matDef.color, 3);
            brokenCount++;
            this.meshDirty = true;
          } else {
            this.gridHp[idx] -= dmg;
            this.damagedSet.add(idx);
            this.shakingVoxels.set(idx, { timer: 0.16, intensity: 0.018 });
            this.meshDirty = true;
            if (Math.random() < 0.35) {
              this._spawnSparks(wx, wy, wz, matDef.rubbleColor || matDef.color, 1);
            }
          }
        }
      }
    }

    return { brokenCount, hitCount, primaryMat, hitLockedGate };
  }

  // ---- Instanced Rendering ----
  _initInstancedMeshes() {
    const geom = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);

    for (const key of Object.keys(MATERIALS)) {
      const id = Number(key);
      const tex = this.textures[id];
      const matParams = {
        map: tex,
        roughness: id === 5 || id === 8 || id === 9 ? 0.42 : 0.85,
        metalness: id === 5 || id === 8 || id === 9 ? 0.52 : 0.08
      };
      if (id === 6) {
        matParams.emissive = new THREE.Color(0x664400);
        matParams.emissiveIntensity = 0.65;
      } else if (id === 7) {
        matParams.emissive = new THREE.Color(0x004c66);
        matParams.emissiveIntensity = 0.7;
      } else if (id === 4) {
        matParams.emissive = new THREE.Color(0x1f0b2e);
        matParams.emissiveIntensity = 0.35;
      }

      const material = new THREE.MeshStandardMaterial(matParams);
      const mesh = new THREE.InstancedMesh(geom, material, MAX_INSTANCES_PER_MAT);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Initialize instanceColor buffer
      mesh.setColorAt(0, new THREE.Color(0xffffff));
      this.rootGroup.add(mesh);
      this.instancedMeshes[id] = mesh;
    }
  }

  _initCrackMesh() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(10, 8, 8, 0.92)';
    ctx.lineCap = 'round';

    const drawCrack = (pts, width) => {
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    };

    drawCrack([[16, 14], [42, 46], [62, 60], [92, 98], [116, 114]], 4.5);
    drawCrack([[62, 60], [88, 42], [110, 20]], 3.2);
    drawCrack([[42, 46], [24, 78], [14, 110]], 3.0);
    drawCrack([[62, 60], [54, 96], [42, 118]], 2.6);
    drawCrack([[88, 42], [112, 64]], 2.2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geom = new THREE.BoxGeometry(VOXEL_SIZE * 1.022, VOXEL_SIZE * 1.022, VOXEL_SIZE * 1.022);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });
    this.crackMesh = new THREE.InstancedMesh(geom, mat, MAX_CRACK_INSTANCES);
    this.crackMesh.count = 0;
    this.crackMesh.frustumCulled = false;
    this.crackMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rootGroup.add(this.crackMesh);
  }

  _initRubblePool() {
    const geom = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.12 });
    this.rubbleMesh = new THREE.InstancedMesh(geom, mat, MAX_RUBBLE);
    this.rubbleMesh.count = 0;
    this.rubbleMesh.frustumCulled = false;
    this.rubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rubbleMesh.setColorAt(0, new THREE.Color(0xffffff));
    this.rootGroup.add(this.rubbleMesh);

    this.rubbleItems = [];
    this.rubbleCursor = 0;
  }

  _initSparkPool() {
    const geom = new THREE.BoxGeometry(0.032, 0.032, 0.032);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.sparkMesh = new THREE.InstancedMesh(geom, mat, MAX_SPARKS);
    this.sparkMesh.count = 0;
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparkMesh.setColorAt(0, new THREE.Color(0xffaa33));
    this.rootGroup.add(this.sparkMesh);

    this.sparks = [];
  }

  _resetRubbleAndSparks() {
    this.rubbleItems.length = 0;
    this.sparks.length = 0;
    this.rubbleMesh.count = 0;
    this.sparkMesh.count = 0;
  }

  _spawnRubbleFromCube(wx, wy, wz, matDef) {
    // 2 to 3 tiny physical 0.08m debris chunks per broken micro-cube
    const count = 2 + (Math.random() < 0.45 ? 1 : 0);
    // Split cube value across pieces so total value matches matDef.value
    const valPerPiece = matDef.value / count;

    for (let i = 0; i < count; i++) {
      const item = {
        x: wx + (Math.random() - 0.5) * 0.14,
        y: Math.max(0.06, wy + (Math.random() - 0.5) * 0.14),
        z: wz + (Math.random() - 0.5) * 0.14,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 1.0 + Math.random() * 2.0,
        vz: (Math.random() - 0.5) * 2.4,
        rx: Math.random() * 6.28,
        ry: Math.random() * 6.28,
        rvx: (Math.random() - 0.5) * 9,
        rvy: (Math.random() - 0.5) * 9,
        color: matDef.rubbleColor || matDef.color,
        value: valPerPiece,
        age: 0
      };

      if (this.rubbleItems.length < MAX_RUBBLE) {
        this.rubbleItems.push(item);
      } else {
        this.rubbleItems[this.rubbleCursor % MAX_RUBBLE] = item;
        this.rubbleCursor++;
      }
    }
  }

  _spawnSparks(wx, wy, wz, colorHex, count = 4) {
    for (let i = 0; i < count; i++) {
      const s = {
        x: wx + (Math.random() - 0.5) * 0.1,
        y: wy + (Math.random() - 0.5) * 0.1,
        z: wz + (Math.random() - 0.5) * 0.1,
        vx: (Math.random() - 0.5) * 3.8,
        vy: 0.6 + Math.random() * 2.6,
        vz: (Math.random() - 0.5) * 3.8,
        life: 0.25 + Math.random() * 0.22,
        maxLife: 0.47,
        color: colorHex
      };
      if (this.sparks.length < MAX_SPARKS) {
        this.sparks.push(s);
      } else {
        this.sparks[Math.floor(Math.random() * MAX_SPARKS)] = s;
      }
    }
  }

  spawnImpactBurst(pos, colorHex = 0xffae33, count = 6) {
    this._spawnSparks(pos.x, pos.y, pos.z, colorHex, count);
  }

  // ---- Procedural Canvas Textures ----
  _createProceduralTextures() {
    const textures = {};

    const makeTex = (drawFn) => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');
      drawFn(ctx, 128);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      return tex;
    };

    const addNoise = (ctx, size, alpha = 0.08) => {
      for (let i = 0; i < 420; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const v = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
        ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
    };

    // 1: Plaster & Red Brick
    textures[1] = makeTex((ctx, s) => {
      ctx.fillStyle = '#53352c';
      ctx.fillRect(0, 0, s, s);
      // 2x2 crisp brick courses
      const rows = 2;
      const rowH = s / rows;
      for (let r = 0; r < rows; r++) {
        const offset = r % 2 === 0 ? 0 : s * 0.35;
        for (let col = -1; col < 3; col++) {
          const x = col * (s * 0.55) + offset;
          const y = r * rowH;
          const grad = ctx.createLinearGradient(x, y, x, y + rowH);
          grad.addColorStop(0, '#c8583e');
          grad.addColorStop(0.55, '#a8422d');
          grad.addColorStop(1, '#843120');
          ctx.fillStyle = grad;
          ctx.fillRect(x + 4, y + 4, s * 0.55 - 8, rowH - 8);
          ctx.strokeStyle = 'rgba(255,190,150,0.16)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 5, y + 5, s * 0.55 - 10, rowH - 10);
        }
      }
      addNoise(ctx, s, 0.09);
      ctx.strokeStyle = 'rgba(20,12,10,0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(1, 1, s - 2, s - 2);
    });

    // 2: Grey Stone & Cinderblocks
    textures[2] = makeTex((ctx, s) => {
      ctx.fillStyle = '#586068';
      ctx.fillRect(0, 0, s, s);
      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#9aa3ac');
      grad.addColorStop(0.5, '#7e8790');
      grad.addColorStop(1, '#626a73');
      ctx.fillStyle = grad;
      ctx.fillRect(4, 4, s - 8, s - 8);
      ctx.strokeStyle = '#40474f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
      ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s / 2);
      ctx.stroke();
      addNoise(ctx, s, 0.11);
      ctx.strokeStyle = 'rgba(20,24,28,0.45)';
      ctx.strokeRect(2, 2, s - 4, s - 4);
    });

    // 3: Dark Reinforced Concrete
    textures[3] = makeTex((ctx, s) => {
      ctx.fillStyle = '#3d444d';
      ctx.fillRect(0, 0, s, s);
      // Formwork streaks + rebar bolts
      ctx.fillStyle = '#4d5560';
      ctx.fillRect(5, 5, s - 10, s - 10);
      ctx.fillStyle = 'rgba(25,30,36,0.35)';
      ctx.fillRect(0, 38, s, 6);
      ctx.fillRect(0, 88, s, 6);
      // Corner form holes
      ctx.fillStyle = '#252a30';
      [[20, 20], [108, 20], [20, 108], [108, 108]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      });
      addNoise(ctx, s, 0.12);
      ctx.strokeStyle = 'rgba(12,15,19,0.6)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, s - 4, s - 4);
    });

    // 4: Volcanic Rock & Glowing Crystals
    textures[4] = makeTex((ctx, s) => {
      ctx.fillStyle = '#292130';
      ctx.fillRect(0, 0, s, s);
      addNoise(ctx, s, 0.14);
      // Volcanic crystal veins
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(14, 24); ctx.lineTo(54, 62); ctx.lineTo(108, 42);
      ctx.moveTo(54, 62); ctx.lineTo(74, 114);
      ctx.stroke();
      ctx.strokeStyle = '#ff7b3b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 26); ctx.lineTo(54, 62); ctx.lineTo(106, 44);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(10,6,14,0.65)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, s - 4, s - 4);
    });

    // 5: Heavy Industrial Steel Armor
    textures[5] = makeTex((ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#788896');
      grad.addColorStop(0.5, '#546370');
      grad.addColorStop(1, '#394550');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#263038';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, s - 8, s - 8);
      // Rivets
      ctx.fillStyle = '#9db0c0';
      [[18, 18], [110, 18], [18, 110], [110, 110], [64, 18], [64, 110]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      });
      // Diagonal brushed sheen
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(10, 118); ctx.lineTo(118, 10); ctx.stroke();
      addNoise(ctx, s, 0.06);
    });

    // 6: Shimmering Brass Key Ore
    textures[6] = makeTex((ctx, s) => {
      ctx.fillStyle = '#7e7d78';
      ctx.fillRect(0, 0, s, s);
      addNoise(ctx, s, 0.1);
      ctx.fillStyle = '#facc15';
      [[24, 30, 26, 18], [72, 22, 32, 24], [38, 76, 44, 24], [84, 82, 24, 24]].forEach(([x, y, w, h]) => {
        ctx.fillRect(x, y, w, h);
      });
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(32, 34, 12, 8);
      ctx.fillRect(78, 28, 14, 10);
      ctx.fillRect(48, 82, 20, 10);
      ctx.strokeStyle = '#3f3520';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, s - 4, s - 4);
    });

    // 7: Shimmering Access Key Crystal Ore
    textures[7] = makeTex((ctx, s) => {
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(0, 0, s, s);
      addNoise(ctx, s, 0.1);
      ctx.fillStyle = '#38bdf8';
      [[20, 24, 28, 26], [76, 30, 30, 24], [40, 74, 38, 30]].forEach(([x, y, w, h]) => {
        ctx.fillRect(x, y, w, h);
      });
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(28, 30, 12, 10);
      ctx.fillRect(82, 36, 14, 10);
      ctx.fillRect(50, 82, 18, 12);
      ctx.strokeStyle = '#142030';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, s - 4, s - 4);
    });

    // 8: Security Gate 1 (Brass Key Lock Grate)
    textures[8] = makeTex((ctx, s) => {
      ctx.fillStyle = '#1f262e';
      ctx.fillRect(0, 0, s, s);
      // Heavy steel vertical bars
      for (let x = 14; x < s; x += 28) {
        const g = ctx.createLinearGradient(x, 0, x + 12, 0);
        g.addColorStop(0, '#4b5563');
        g.addColorStop(0.5, '#cbd5e1');
        g.addColorStop(1, '#374151');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, 12, s);
      }
      // Yellow caution lock crossbar
      ctx.fillStyle = '#eab308';
      ctx.fillRect(0, 52, s, 24);
      ctx.fillStyle = '#18181b';
      for (let x = -20; x < s + 20; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, 52); ctx.lineTo(x + 12, 52); ctx.lineTo(x + 2, 76); ctx.lineTo(x - 10, 76);
        ctx.closePath(); ctx.fill();
      }
    });

    // 9: Security Gate 2 (Access Key Heavy Seal)
    textures[9] = makeTex((ctx, s) => {
      ctx.fillStyle = '#1e2430';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, s - 12, s - 12);
      // Glowing cyan/red security lock stripes
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(14, 54, s - 28, 20);
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(46, 46, 36, 36);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(64, 60, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(61, 64, 6, 12);
    });

    return textures;
  }

  // ---- Static Floor, Ceiling, Neons, Deposit Pads, Terminal & Outdoor Freedom Zone ----
  _initStaticEnvironment() {
    // Procedural concrete floor texture
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const fctx = floorCanvas.getContext('2d');
    fctx.fillStyle = '#555d66';
    fctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      const v = Math.random() > 0.5 ? 255 : 0;
      fctx.fillStyle = `rgba(${v},${v},${v},0.06)`;
      fctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    fctx.strokeStyle = 'rgba(20,25,30,0.38)';
    fctx.lineWidth = 3;
    fctx.strokeRect(2, 2, 252, 252);
    fctx.beginPath(); fctx.moveTo(128, 0); fctx.lineTo(128, 256); fctx.moveTo(0, 128); fctx.lineTo(256, 128); fctx.stroke();

    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(22, 22);
    floorTex.colorSpace = THREE.SRGBColorSpace;

    // Indoor prison floor covering all 5 enclosures (radius ~17.5m -> 35m x 35m)
    const prisonSize = 35;
    const floorGeo = new THREE.PlaneGeometry(prisonSize, prisonSize);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.06 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    this.rootGroup.add(floorMesh);

    // Outdoor sunlit ground beyond Enceinte 5 (grass/courtyard extending to 120m)
    const outdoorFloorGeo = new THREE.RingGeometry(17.2, 75, 48);
    const outdoorFloorMat = new THREE.MeshStandardMaterial({ color: 0x5c8f47, roughness: 0.95 });
    const outdoorFloor = new THREE.Mesh(outdoorFloorGeo, outdoorFloorMat);
    outdoorFloor.rotation.x = -Math.PI / 2;
    outdoorFloor.position.y = -0.02;
    this.rootGroup.add(outdoorFloor);

    // Industrial Ceiling slab strictly over prison footprint (stops at Enceinte 5 outer wall so daylight pours in!)
    const ceilGeo = new THREE.PlaneGeometry(34.5, 34.5);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x262d35, roughness: 0.95, metalness: 0.15 });
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.y = GRID_Y * VOXEL_SIZE;
    this.rootGroup.add(ceilMesh);

    // Ceiling Neon Light Fixture in the Starting Cell (faithful to IMG_0617.JPG)
    this._createNeonFixture(0, GRID_Y * VOXEL_SIZE - 0.62, -1.35, true);

    // Atmospheric corridor fluorescent strips in intermediate cavities (offset by +8 half-cell!)
    const ringRadii = [
      (8 + 8.5) * VOXEL_SIZE,
      (8 + 20.5) * VOXEL_SIZE,
      (8 + 34.5) * VOXEL_SIZE,
      (8 + 48.5) * VOXEL_SIZE
    ];
    ringRadii.forEach((r, idx) => {
      const tint = idx === 2 ? 0xff7b6b : 0x9cf6ff;
      this._createCorridorStrip(0, -r, 0, tint);
      this._createCorridorStrip(0, r, 0, tint);
      this._createCorridorStrip(-r, 0, Math.PI / 2, tint);
      this._createCorridorStrip(r, 0, Math.PI / 2, tint);
    });

    // Green Diegetic Deposit/Sell Pads (in starting cell + intermediate cavities)
    this._createDepositPad(0, 1.12);
    this._createDepositPad(0, -ringRadii[0]);
    this._createDepositPad(0, ringRadii[1]);
    this._createDepositPad(0, -ringRadii[2]);
    this._createDepositPad(0, -ringRadii[3]);

    // Diegetic Upgrade Terminal Kiosk in the back-left corner of the Starting Cell
    this._createTerminalKiosk(this.terminalPos.x, this.terminalPos.z);

    // Outdoor Daylight Sun Beacon Posts around the perimeter beyond Enceinte 5
    const sunBeaconGeo = new THREE.CylinderGeometry(0.18, 0.25, 6, 8);
    const sunBeaconMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.28 });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const beam = new THREE.Mesh(sunBeaconGeo, sunBeaconMat);
      beam.position.set(Math.cos(ang) * 20, 3, Math.sin(ang) * 20);
      this.rootGroup.add(beam);
    }
  }

  _createNeonFixture(x, y, z, primary = false) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.08, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x2c343d, roughness: 0.5, metalness: 0.6 })
    );
    group.add(housing);

    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xc2faff });
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.055, 0.1), tubeMat);
    tube.position.y = -0.05;
    group.add(tube);

    // Hanging struts
    const strutGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6);
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x1a1f24 });
    [-0.55, 0.55].forEach((sx) => {
      const st = new THREE.Mesh(strutGeo, strutMat);
      st.position.set(sx, 0.08, 0);
      group.add(st);
    });

    if (primary) {
      this.cellNeonTubeMat = tubeMat;
      this.cellNeonLight = new THREE.PointLight(0xb8f4ff, 4.2, 9.5, 1.5);
      this.cellNeonLight.position.set(0, -0.25, 0);
      group.add(this.cellNeonLight);
    }

    this.rootGroup.add(group);
  }

  _createCorridorStrip(x, z, rotY, colorHex) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.05, 0.12),
      new THREE.MeshBasicMaterial({ color: colorHex })
    );
    strip.position.set(x, GRID_Y * VOXEL_SIZE - 0.04, z);
    strip.rotation.y = rotY;
    this.rootGroup.add(strip);
  }

  _createDepositPad(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0.01, z);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.58, 24),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    group.add(disc);

    // Subtle vertical holographic sell cylinder
    const halo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.35, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.position.y = 0.18;
    group.add(halo);

    this.rootGroup.add(group);
    this.depositPads.push({ x, z, radius: 0.72, group, halo });
  }

  _createTerminalKiosk(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.PI * 0.25;

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 1.35, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: 0.45, metalness: 0.6 })
    );
    base.position.y = 0.675;
    group.add(base);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    screen.position.set(0, 1.02, 0.195);
    group.add(screen);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.08, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.3 })
    );
    trim.position.y = 1.38;
    group.add(trim);

    this.terminalKioskGroup = group;
    this.rootGroup.add(group);
  }

  // ---- Physical 3D Key Pickups ----
  _createKeyMesh(colorHex, emissiveHex) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: emissiveHex,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.85
    });

    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.025, 8, 16), mat);
    bow.position.y = 0.09;
    group.add(bow);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), mat);
    shaft.position.y = -0.06;
    group.add(shaft);

    const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.025), mat);
    tooth1.position.set(0.04, -0.12, 0);
    group.add(tooth1);

    const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.025), mat);
    tooth2.position.set(0.032, -0.16, 0);
    group.add(tooth2);

    // Glowing halo sphere
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 10),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.2, depthWrite: false })
    );
    group.add(halo);

    return group;
  }

  _setupKeyPickup(id, pos, alreadyCollected) {
    // Remove old if regenerating
    const existingIdx = this.keyPickups.findIndex((k) => k.id === id);
    if (existingIdx !== -1) {
      this.rootGroup.remove(this.keyPickups[existingIdx].mesh);
      this.keyPickups.splice(existingIdx, 1);
    }

    const isBrass = id === 'keyBrass';
    const mesh = this._createKeyMesh(isBrass ? 0xfacc15 : 0x38bdf8, isBrass ? 0xaa7700 : 0x0369a1);
    mesh.position.copy(pos);
    mesh.visible = !alreadyCollected;
    this.rootGroup.add(mesh);

    this.keyPickups.push({
      id,
      label: isBrass ? 'Clé en laiton' : "Clé d'accès",
      pos: pos.clone(),
      mesh,
      collected: Boolean(alreadyCollected)
    });
  }

  // ---- Menu Diorama Props (ultra-faithful to IMG_0617.JPG!) ----
  _initMenuDiorama() {
    this.menuGroup = new THREE.Group();

    // 1. Left & Right dark wall breach cutouts with glowing eyes peeking out of the shadows!
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x050608 });
    const leftAlcove = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.92), darkMat);
    leftAlcove.position.set(-1.96, 1.35, -1.05);
    this.menuGroup.add(leftAlcove);

    const rightAlcove = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.92), darkMat);
    rightAlcove.position.set(1.96, 1.35, -1.05);
    this.menuGroup.add(rightAlcove);

    // Peeking eyes & silhouettes inside Left Breach (Mutated Rat + Zombie)
    const eyeYellow = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const eyeRed = new THREE.MeshBasicMaterial({ color: 0xff6b4a });
    const eyeGreen = new THREE.MeshBasicMaterial({ color: 0xa3e635 });
    const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);

    this.menuEyes = [];
    const addPeeker = (x, y, z, headColor, eyeMat, scale = 1) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.14 * scale, 10, 10),
        new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.9 })
      );
      g.add(head);
      const e1 = new THREE.Mesh(eyeGeo, eyeMat);
      const e2 = new THREE.Mesh(eyeGeo, eyeMat);
      const dir = x < 0 ? 1 : -1;
      e1.position.set(dir * 0.11 * scale, 0.02 * scale, -0.05 * scale);
      e2.position.set(dir * 0.11 * scale, 0.02 * scale, 0.05 * scale);
      g.add(e1, e2);
      this.menuGroup.add(g);
      this.menuEyes.push({ group: g, baseY: y, phase: Math.random() * 6.28 });
    };

    // Left breach: rat on top, zombie below
    addPeeker(-1.86, 1.56, -1.06, 0x3b2f34, eyeRed, 0.85);
    addPeeker(-1.84, 1.12, -1.04, 0x4b5349, eyeYellow, 1.05);
    // Right breach: glowing eyes on top, green zombie below
    addPeeker(1.86, 1.62, -1.06, 0x1a1d20, eyeGreen, 0.78);
    addPeeker(1.84, 1.12, -1.02, 0x456b38, eyeYellow, 1.08);

    // 2. Floor Gold Coins & Brass Key (matching IMG_0617.JPG!)
    const coinGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.025, 16);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0x7c5800,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.85
    });
    const coinPositions = [
      [-1.12, 0.05, -0.75, 0.3],
      [-0.86, 0.06, -1.18, 0.15],
      [1.05, 0.05, -1.05, -0.25],
      [0.62, 0.04, -0.55, 0.5]
    ];
    this.menuCoins = [];
    coinPositions.forEach(([cx, cy, cz, rz]) => {
      const c = new THREE.Mesh(coinGeo, coinMat);
      c.position.set(cx, cy, cz);
      c.rotation.z = Math.PI * 0.5 + rz;
      this.menuGroup.add(c);
      this.menuCoins.push(c);
    });

    const floorKey = this._createKeyMesh(0xfacc15, 0x996600);
    floorKey.position.set(0.95, 0.09, -0.45);
    floorKey.rotation.set(Math.PI / 2, 0.4, 0.6);
    floorKey.scale.setScalar(0.95);
    this.menuGroup.add(floorKey);
    this.menuFloorKey = floorKey;

    // 3. Scattered floating/floor brick chunks for dynamic depth
    const brickGeo = new THREE.BoxGeometry(0.12, 0.09, 0.1);
    const brickMat = new THREE.MeshStandardMaterial({ color: 0xb64530, roughness: 0.85 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7e8790, roughness: 0.85 });
    this.menuFloatingBricks = [];
    const brickCoords = [
      [-1.18, 0.08, -0.35], [-1.35, 0.42, -1.4], [1.18, 0.08, -0.65],
      [1.32, 0.55, -1.3], [-0.92, 2.25, -1.1], [0.88, 2.38, -1.15],
      [-1.42, 1.82, -0.9], [1.36, 1.74, -0.85]
    ];
    brickCoords.forEach(([bx, by, bz], i) => {
      const b = new THREE.Mesh(brickGeo, i % 3 === 0 ? stoneMat : brickMat);
      b.position.set(bx, by, bz);
      b.rotation.set(i * 0.7, i * 1.1, i * 0.5);
      this.menuGroup.add(b);
      this.menuFloatingBricks.push({ mesh: b, baseY: by, phase: i * 1.3 });
    });

    // 4. Hovering Orange/Grey Drill Drone on Upper-Right shooting a Red Laser Beam!
    const drone = this._createDroneMesh();
    drone.position.set(0.92, 1.98, -1.12);
    drone.rotation.y = -0.38;
    this.menuGroup.add(drone);
    this.menuDrone = drone;

    // Red Laser Beam from Menu Drone to front wall
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.88
    });
    const laserGeo = new THREE.CylinderGeometry(0.012, 0.018, 1.0, 8);
    laserGeo.translate(0, 0.5, 0);
    laserGeo.rotateX(Math.PI / 2);
    this.menuLaser = new THREE.Mesh(laserGeo, laserMat);
    this.menuGroup.add(this.menuLaser);

    this.menuLaserGlow = new THREE.PointLight(0xff3b3b, 2.0, 2.5);
    this.menuGroup.add(this.menuLaserGlow);

    this.rootGroup.add(this.menuGroup);
  }

  _createDroneMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.16, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35, metalness: 0.45 })
    );
    g.add(body);

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.08, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 })
    );
    chassis.position.y = -0.06;
    g.add(chassis);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.065, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -0.02, -0.2);
    g.add(lens);

    const emitter = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff6b6b })
    );
    emitter.position.set(0, -0.02, -0.26);
    g.add(emitter);

    const rotors = [];
    const armGeo = new THREE.BoxGeometry(0.46, 0.025, 0.035);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 });
    const arm1 = new THREE.Mesh(armGeo, armMat);
    arm1.rotation.y = Math.PI * 0.25;
    arm1.position.y = 0.06;
    const arm2 = new THREE.Mesh(armGeo, armMat);
    arm2.rotation.y = -Math.PI * 0.25;
    arm2.position.y = 0.06;
    g.add(arm1, arm2);

    const ringGeo = new THREE.TorusGeometry(0.11, 0.014, 6, 16);
    const bladeGeo = new THREE.BoxGeometry(0.19, 0.008, 0.025);
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });

    [[-0.17, 0.17], [0.17, 0.17], [-0.17, -0.17], [0.17, -0.17]].forEach(([rx, rz]) => {
      const guard = new THREE.Mesh(ringGeo, armMat);
      guard.rotation.x = Math.PI / 2;
      guard.position.set(rx, 0.09, rz);
      g.add(guard);

      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(rx, 0.095, rz);
      g.add(blade);
      rotors.push(blade);
    });

    g.userData.rotors = rotors;
    return g;
  }

  setMenuDiorama(active) {
    this.menuDioramaActive = Boolean(active);
    this.menuGroup.visible = this.menuDioramaActive;
    // Hide central deposit pad during menu so floor matches IMG_0617.JPG cleanly
    if (this.depositPads[0]) {
      this.depositPads[0].group.visible = !this.menuDioramaActive;
    }
    if (this.terminalKioskGroup) {
      this.terminalKioskGroup.visible = !this.menuDioramaActive;
    }
    this.meshDirty = true;
  }

  // ---- Per-Frame Update ----
  update(dt, playerPos, pickupRadius, onCollectRubble, onCollectKey) {
    this.menuTime += dt;

    // 1. Flickering ceiling fluorescent neon
    if (this.cellNeonLight && this.cellNeonTubeMat) {
      const flicker =
        Math.sin(this.menuTime * 27) * Math.sin(this.menuTime * 7.3) > 0.94
          ? 0.45
          : 0.92 + Math.sin(this.menuTime * 5.2) * 0.08;
      this.cellNeonLight.intensity = 4.2 * flicker;
      this.cellNeonTubeMat.color.setRGB(0.75 * flicker + 0.15, 0.98 * flicker, 1.0 * flicker);
    }

    // 2. Menu diorama animation
    if (this.menuDioramaActive) {
      this._updateMenuDiorama(dt);
    } else {
      // Animate deposit pads subtly
      for (let i = 0; i < this.depositPads.length; i++) {
        this.depositPads[i].halo.material.opacity = 0.12 + Math.sin(this.menuTime * 3.2 + i) * 0.06;
      }

      // Animate & collect physical keys
      for (let i = 0; i < this.keyPickups.length; i++) {
        const kp = this.keyPickups[i];
        if (kp.collected) continue;
        kp.mesh.rotation.y += dt * 1.9;
        kp.mesh.position.y = kp.pos.y + Math.sin(this.menuTime * 2.8 + i) * 0.07;

        const dx = playerPos.x - kp.pos.x;
        const dz = playerPos.z - kp.pos.z;
        if (dx * dx + dz * dz < 1.05 * 1.05) {
          kp.collected = true;
          kp.mesh.visible = false;
          if (onCollectKey) onCollectKey(kp.id, kp.label);
        }
      }
    }

    // 3. Update vibrating damaged voxels
    if (this.shakingVoxels.size > 0) {
      for (const [idx, s] of this.shakingVoxels.entries()) {
        s.timer -= dt;
        if (s.timer <= 0) {
          this.shakingVoxels.delete(idx);
        }
      }
      this.meshDirty = true;
    }

    // 4. Rebuild visible InstancedMeshes around player chunk when needed
    const pChunkX = Math.floor((Math.floor(playerPos.x / VOXEL_SIZE) + HALF_SPAN) / CHUNK_SIZE);
    const pChunkZ = Math.floor((Math.floor(playerPos.z / VOXEL_SIZE) + HALF_SPAN) / CHUNK_SIZE);
    if (this.meshDirty || pChunkX !== this.lastPlayerChunkX || pChunkZ !== this.lastPlayerChunkZ) {
      this.lastPlayerChunkX = pChunkX;
      this.lastPlayerChunkZ = pChunkZ;
      this._rebuildVisibleInstancedMeshes(pChunkX, pChunkZ);
      this.meshDirty = false;
    }

    // 5. Update physical bouncing rubble & vacuum pickup
    this._updateRubble(dt, playerPos, pickupRadius, onCollectRubble);

    // 6. Update spark particles
    this._updateSparks(dt);
  }

  _updateMenuDiorama(dt) {
    const t = this.menuTime;
    // Peeking creatures breathe subtly
    for (let i = 0; i < this.menuEyes.length; i++) {
      const e = this.menuEyes[i];
      e.group.position.y = e.baseY + Math.sin(t * 2.1 + e.phase) * 0.035;
    }
    // Coins gleam
    for (let i = 0; i < this.menuCoins.length; i++) {
      this.menuCoins[i].rotation.y += dt * 1.1;
    }
    // Floating shards drift gently
    for (let i = 0; i < this.menuFloatingBricks.length; i++) {
      const fb = this.menuFloatingBricks[i];
      if (fb.baseY > 0.25) {
        fb.mesh.position.y = fb.baseY + Math.sin(t * 1.6 + fb.phase) * 0.06;
        fb.mesh.rotation.x += dt * 0.35;
        fb.mesh.rotation.y += dt * 0.4;
      }
    }
    // Hovering drill drone + red laser sweep onto front brick wall
    if (this.menuDrone) {
      this.menuDrone.position.set(
        0.68 + Math.sin(t * 1.4) * 0.06,
        1.88 + Math.cos(t * 2.2) * 0.05,
        -0.92
      );
      this.menuDrone.rotation.z = Math.sin(t * 1.4) * 0.06;
      const rotors = this.menuDrone.userData.rotors;
      for (let i = 0; i < rotors.length; i++) rotors[i].rotation.y += dt * 28;

      const start = new THREE.Vector3(
        this.menuDrone.position.x - 0.05,
        this.menuDrone.position.y - 0.05,
        this.menuDrone.position.z - 0.14
      );
      const target = new THREE.Vector3(
        0.12 + Math.sin(t * 1.9) * 0.32,
        1.05 + Math.cos(t * 1.3) * 0.22,
        -1.98
      );
      const dist = start.distanceTo(target);
      this.menuLaser.position.copy(start);
      this.menuLaser.lookAt(target);
      this.menuLaser.scale.set(1, 1, dist);
      this.menuLaserGlow.position.copy(target).add(new THREE.Vector3(0, 0, 0.14));

      if (Math.random() < 0.35) {
        this._spawnSparks(target.x, target.y, target.z + 0.05, 0xff8833, 1);
      }
    }
  }

  _rebuildVisibleInstancedMeshes(centerCX, centerCZ) {
    const counts = {};
    for (const k of Object.keys(this.instancedMeshes)) counts[k] = 0;
    let crackCount = 0;

    // 2 chunks (~4m) in Menu diorama for ultra-crisp 60 FPS; 5 chunks (~10m) in gameplay (beyond fog horizon)
    const ACTIVE_RADIUS = this.menuDioramaActive ? 2 : 5;
    const minCX = Math.max(0, centerCX - ACTIVE_RADIUS);
    const maxCX = Math.min(CHUNKS_X - 1, centerCX + ACTIVE_RADIUS);
    const minCZ = Math.max(0, centerCZ - ACTIVE_RADIUS);
    const maxCZ = Math.min(CHUNKS_Z - 1, centerCZ + ACTIVE_RADIUS);

    for (let cz = minCZ; cz <= maxCZ; cz++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const set = this.chunks[cz * CHUNKS_X + cx];
        if (set.size === 0) continue;

        for (const idx of set) {
          const mat = this.gridMat[idx];
          if (mat === 0) continue;
          const mesh = this.instancedMeshes[mat];
          const c = counts[mat];
          if (c >= MAX_INSTANCES_PER_MAT) continue;

          const { gx, gy, gz } = VoxelWorld.fromIndex(idx);
          let wx = (gx + 0.5) * VOXEL_SIZE;
          let wy = (gy + 0.5) * VOXEL_SIZE;
          let wz = (gz + 0.5) * VOXEL_SIZE;

          // Vibration offset if recently hit
          const shake = this.shakingVoxels.get(idx);
          if (shake) {
            wx += (Math.random() - 0.5) * shake.intensity;
            wy += (Math.random() - 0.5) * shake.intensity;
            wz += (Math.random() - 0.5) * shake.intensity;
          }

          _dummy.position.set(wx, wy, wz);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          mesh.setMatrixAt(c, _dummy.matrix);

          // Instance color tint: subtle natural brick/stone variation + darkening on damage
          const variant = this.gridVariant[idx];
          const maxHp = this.gridMaxHp[idx] || 1;
          const hpRatio = this.gridHp[idx] / maxHp;

          if (mat === 1 && variant === 250) {
            // Weathered grey plaster-stone brick patch on the starting wall (like IMG_0617.JPG)
            _color.setRGB(0.68, 0.72, 0.76);
          } else {
            const shade = 0.88 + (variant / 255) * 0.22;
            _color.setRGB(shade, shade, shade);
          }

          if (hpRatio < 1) {
            const dmgShade = 0.58 + hpRatio * 0.42;
            _color.multiplyScalar(dmgShade);
            if (shake) {
              _color.offsetHSL(0, 0.08, 0.16);
            }
            if (crackCount < MAX_CRACK_INSTANCES) {
              this.crackMesh.setMatrixAt(crackCount, _dummy.matrix);
              crackCount++;
            }
          }

          mesh.setColorAt(c, _color);
          counts[mat] = c + 1;
        }
      }
    }

    for (const k of Object.keys(this.instancedMeshes)) {
      const m = this.instancedMeshes[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    this.crackMesh.count = crackCount;
    this.crackMesh.instanceMatrix.needsUpdate = true;
  }

  _updateRubble(dt, playerPos, pickupRadius, onCollectRubble) {
    let writeIdx = 0;
    const prSq = pickupRadius * pickupRadius;
    const collectSq = 0.48 * 0.48;

    for (let i = 0; i < this.rubbleItems.length; i++) {
      const r = this.rubbleItems[i];
      r.age += dt;
      if (r.age > 35) continue;

      const dx = playerPos.x - r.x;
      const dy = (playerPos.y - 0.55) - r.y;
      const dz = playerPos.z - r.z;
      const distSq = dx * dx + dz * dz;

      if (!this.menuDioramaActive && distSq < prSq) {
        // Magnetic suction into backpack
        const dist = Math.sqrt(distSq + dy * dy) || 0.01;
        const pull = 10.5;
        r.vx += (dx / dist) * pull * dt * 3.5;
        r.vy += (dy / dist) * pull * dt * 3.5;
        r.vz += (dz / dist) * pull * dt * 3.5;
        r.vx *= 0.88;
        r.vy *= 0.88;
        r.vz *= 0.88;

        if (distSq < collectSq) {
          const accepted = onCollectRubble ? onCollectRubble(r.value) : true;
          if (accepted) continue; // sucked into backpack!
        }
      } else {
        // Gravity + bounce
        r.vy -= 14.0 * dt;
      }

      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;

      if (r.y < 0.04) {
        r.y = 0.04;
        r.vy = -r.vy * 0.34;
        r.vx *= 0.72;
        r.vz *= 0.72;
        if (Math.abs(r.vy) < 0.25) r.vy = 0;
      }

      r.rx += r.rvx * dt;
      r.ry += r.rvy * dt;
      r.rvx *= 0.96;
      r.rvy *= 0.96;

      this.rubbleItems[writeIdx] = r;
      _dummy.position.set(r.x, r.y, r.z);
      _dummy.rotation.set(r.rx, r.ry, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      this.rubbleMesh.setMatrixAt(writeIdx, _dummy.matrix);
      _color.setHex(r.color);
      this.rubbleMesh.setColorAt(writeIdx, _color);
      writeIdx++;
    }

    this.rubbleItems.length = writeIdx;
    this.rubbleMesh.count = writeIdx;
    this.rubbleMesh.instanceMatrix.needsUpdate = true;
    if (this.rubbleMesh.instanceColor) this.rubbleMesh.instanceColor.needsUpdate = true;
  }

  _updateSparks(dt) {
    let writeIdx = 0;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vy -= 9.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.02) {
        s.y = 0.02;
        s.vy *= -0.4;
      }
      const scale = Math.max(0.15, s.life / s.maxLife);
      this.sparks[writeIdx] = s;
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(scale, scale, scale);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(writeIdx, _dummy.matrix);
      _color.setHex(s.color);
      this.sparkMesh.setColorAt(writeIdx, _color);
      writeIdx++;
    }
    this.sparks.length = writeIdx;
    this.sparkMesh.count = writeIdx;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  isOnDepositPad(x, z) {
    for (let i = 0; i < this.depositPads.length; i++) {
      const p = this.depositPads[i];
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz <= p.radius * p.radius) return true;
    }
    return false;
  }

  isNearTerminal(x, z) {
    const dx = x - this.terminalPos.x;
    const dz = z - this.terminalPos.z;
    return dx * dx + dz * dz <= 1.25 * 1.25;
  }

  exportBrokenVoxels() {
    return Array.from(this.brokenSet);
  }
}
