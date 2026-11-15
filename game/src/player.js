// Player movement: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders one axis at a time through the shared mover, so a wall
// never swallows the player. Shift walks slow, Ctrl/C crouches, Space jumps.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const SLOW_SPEED = 2.6;
const CROUCH_SPEED = 2.4;
const AIM_SPEED = 3.0;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(mover, spawn) {
  const player = {
    position: new THREE.Vector3(spawn[0], 0, spawn[1]),
    velocity: new THREE.Vector3(),
    yaw: -Math.PI / 2,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    aiming: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
    stepCooldown: 0,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys, frozen) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    player.aiming = keys.has('Mouse2') || false;
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !mover.overlaps(player.position.x, player.position.y, player.position.z, RADIUS, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if ((forward || strafe) && !frozen) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = player.crouching ? CROUCH_SPEED : player.aiming ? AIM_SPEED : slow ? SLOW_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }
    if (keys.has('Space') && player.onGround && !frozen) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;
    player.onGround = mover.move(player.position, player.velocity, dt, RADIUS, player.height);
    player.velocity.y = Math.max(-30, player.velocity.y);
    player.stepCooldown = Math.max(0, player.stepCooldown - dt);
    const speed2d = Math.hypot(player.velocity.x, player.velocity.z);
    if (player.onGround && speed2d > 2.5 && player.stepCooldown === 0) {
      player.stepCooldown = speed2d > 4.5 ? 0.34 : 0.45;
      return true; // footstep this tick
    }
    return false;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
    reset(spawnPoint) {
      player.position.set(spawnPoint[0], 0, spawnPoint[1]);
      player.velocity.set(0, 0, 0);
      player.yaw = -Math.PI / 2;
      player.pitch = 0;
      player.health = 100;
      player.armor = 0;
      player.alive = true;
      player.crouching = false;
      player.height = STAND_HEIGHT;
    },
  };
}
