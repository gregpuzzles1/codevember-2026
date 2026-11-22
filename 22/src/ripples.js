import * as THREE from 'three'
import { echoPoints, ripplePoint } from './canyon.js'

const segments = 42
const count = 12
const TAU = Math.PI * 2

export class Ripples {
  constructor(scene) {
    this.items = []
    this.point = new THREE.Vector3()
    this.a = new THREE.Vector3()
    this.b = new THREE.Vector3()
    this.c = new THREE.Vector3()
    this.d = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      const position = new THREE.BufferAttribute(new Float32Array(segments * 18), 3)
      position.setUsage(THREE.DynamicDrawUsage)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', position)
      const material = new THREE.MeshBasicMaterial({
        color: '#ffd895', transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      mesh.renderOrder = 5
      mesh.visible = false
      scene.add(mesh)
      this.items.push({ mesh, position, end: -1 })
    }
  }

  add(point, side, normal, time, duration, strength, size, reduced) {
    const entry = this.items.reduce((oldest, item) => item.end < oldest.end ? item : oldest)
    Object.assign(entry, { point: point.clone(), side, start: time, end: time + duration, duration, strength, size, reduced })
    entry.mesh.visible = false
    if (!side) {
      const n = normal.clone().normalize()
      const basis = Math.abs(n.y) < .92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      entry.tangent = basis.cross(n).normalize()
      entry.bitangent = n.clone().cross(entry.tangent)
      entry.point.addScaledVector(n, .035)
    }
  }

  strike({ point, side, normal }, time, spacing, reduced) {
    this.add(point, side, normal, time, reduced ? .8 : 1.13, .79, side ? 1.32 : .63, reduced)
    if (reduced) return
    this.add(point, side, normal, time + .14, 1.02, .50, side ? 1.20 : .59, false)
    if (side) {
      echoPoints(point, side).forEach((echo, i) => {
        this.add(echo.point, echo.side, normal, time + spacing * (i * .91 + 1), 1.13, .48 - .13 * i, .95 - .15 * i, false)
      })
    }
  }

  getPoint(item, angle, radius, result) {
    if (item.side) return ripplePoint(item.point, item.side, angle, radius, result)
    result.copy(item.point).addScaledVector(item.tangent, Math.cos(angle) * radius)
      .addScaledVector(item.bitangent, Math.sin(angle) * radius)
    return true
  }

  draw(item, progress) {
    const radius = item.reduced ? .40 : .10 + item.size * progress ** .67
    const halfWidth = item.reduced ? .021 : .028 - progress * .012
    let vertex = 0
    const push = point => item.position.setXYZ(vertex++, point.x, point.y, point.z)
    for (let i = 0; i < segments; i++) {
      const angle = TAU * i / segments, next = TAU * (i + 1) / segments
      if (!this.getPoint(item, angle, radius - halfWidth, this.a) ||
          !this.getPoint(item, angle, radius + halfWidth, this.b) ||
          !this.getPoint(item, next, radius - halfWidth, this.c) ||
          !this.getPoint(item, next, radius + halfWidth, this.d)) continue
      push(this.a); push(this.b); push(this.c)
      push(this.b); push(this.d); push(this.c)
    }
    item.position.needsUpdate = true
    item.mesh.geometry.setDrawRange(0, vertex)
    item.mesh.material.opacity = item.reduced ? .58 * (1 - progress * .47) : item.strength * (1 - progress) ** 1.2
  }

  update(time) {
    let changed = false
    for (const item of this.items) {
      if (time < item.start || time >= item.end || item.end < 0) {
        if (item.mesh.visible) {
          item.mesh.visible = false
          changed = true
        }
        continue
      }
      item.mesh.visible = true
      this.draw(item, (time - item.start) / item.duration)
      changed = true
    }
    return changed
  }
}
