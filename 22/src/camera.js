import * as THREE from 'three'
import { restrictPosition, start } from './canyon.js'

const moveKeys = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyQ: 'down', KeyE: 'up',
}
const lookKeys = { KeyI: 'lookUp', KeyK: 'lookDown', KeyJ: 'lookLeft', KeyL: 'lookRight' }
const shifted = { ArrowUp: 'lookUp', ArrowDown: 'lookDown', ArrowLeft: 'lookLeft', ArrowRight: 'lookRight' }

export function keyAction(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  return lookKeys[event.code] || (event.shiftKey && shifted[event.code]) || moveKeys[event.code]
}

export class Explorer {
  constructor(camera, obstacles) {
    this.camera = camera
    this.obstacles = obstacles
    this.held = new Map()
    this.delta = new THREE.Vector3()
    this.velocity = new THREE.Vector3()
    this.reset()
  }

  reset() {
    this.yaw = start.yaw
    this.pitch = start.pitch
    this.goalYaw = this.yaw
    this.goalPitch = this.pitch
    this.camera.position.set(start.x, start.y, start.z)
    this.velocity.set(0, 0, 0)
    this.orient()
  }

  orient() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    this.camera.updateMatrixWorld()
  }

  setInput(key, action) {
    if (action) this.held.set(key, action)
    else this.held.delete(key)
  }

  clear() {
    this.held.clear()
    this.velocity.set(0, 0, 0)
  }

  look(dx, dy) {
    this.goalYaw -= dx
    this.goalPitch = THREE.MathUtils.clamp(this.goalPitch - dy, -1.4, 1.4)
  }

  moveVector(actions, out) {
    const axis = (positive, negative) => Number(actions.has(positive)) - Number(actions.has(negative))
    const x = axis('right', 'left'), y = axis('up', 'down'), z = axis('back', 'forward')
    out.set(x, y * .72, z)
    if (out.lengthSq() > 1) out.normalize()
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw)
    const oldX = out.x
    out.x = cos * oldX + sin * out.z
    out.z = -sin * oldX + cos * out.z
  }

  nudge(action) {
    this.moveVector(new Set([action]), this.delta)
    this.camera.position.addScaledVector(this.delta, .68)
    restrictPosition(this.camera.position, this.obstacles)
    this.orient()
  }

  update(dt, reduced) {
    if (dt <= 0) return false
    const actions = new Set(this.held.values())
    const x = Number(actions.has('lookRight')) - Number(actions.has('lookLeft'))
    const y = Number(actions.has('lookDown')) - Number(actions.has('lookUp'))
    this.look(x * dt * 1.58, y * dt * 1.33)

    let changed = false
    const difference = Math.abs(this.goalYaw - this.yaw) + Math.abs(this.goalPitch - this.pitch)
    if (difference > .00005) {
      const progress = reduced || difference < .001 ? 1 : 1 - Math.exp(-dt * 30)
      this.yaw += (this.goalYaw - this.yaw) * progress
      this.pitch += (this.goalPitch - this.pitch) * progress
      if (Math.abs(this.yaw) > Math.PI * 2) {
        const wrap = Math.sign(this.yaw) * Math.PI * 2
        this.yaw -= wrap
        this.goalYaw -= wrap
      }
      changed = true
    }

    this.moveVector(actions, this.delta)
    this.delta.multiplyScalar(5)
    this.velocity.lerp(this.delta, reduced ? 1 : 1 - Math.exp(-dt * 17))
    if (this.velocity.lengthSq() > .0001) {
      this.camera.position.addScaledVector(this.velocity, dt)
      restrictPosition(this.camera.position, this.obstacles)
      changed = true
    }
    if (changed) this.orient()
    return changed
  }
}
