import * as THREE from 'three'
import { CanyonAudio, voiceFor } from './audio.js'
import { Explorer, keyAction } from './camera.js'
import { canyonSpan, createCanyon, representativePoint } from './canyon.js'
import { Ripples } from './ripples.js'
import './style.css'

const get = id => document.getElementById(id)
const stage = get('stage')
const reset = get('reset')
const aim = get('aim-button')
const reticle = get('reticle')
const activity = get('activity')
const activityText = get('activity-text')
const help = get('help')
const helpToggle = get('help-toggle')
const motion = get('reduced-motion')
const movement = get('movement')
const showControls = get('show-controls')
const compass = get('compass')
const bearing = get('bearing')
const sound = get('sound')
const volume = get('volume')
const fallback = get('fallback')
const status = get('status')
const touch = matchMedia('(pointer: coarse)')
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)')
const narrow = matchMedia('(max-width: 760px)')
const audio = new CanyonAudio()

let world
let keyboardAim = false
let touchOverride = null
let motionOverride = null
let reduced = prefersReduced.matches
let mutedByChoice = false
let soundRequest = 0
let noticeTimer

function instructions() {
  return fallback.hidden ? 'Touch the canyon walls to make them sing.' : 'Choose a chime to hear the canyon.'
}

function notice(text, ringing = false) {
  clearTimeout(noticeTimer)
  activityText.textContent = text
  if (ringing && activity.classList.contains('is-ringing')) {
    activity.classList.remove('is-ringing')
    void activity.offsetWidth
  }
  activity.classList.toggle('is-ringing', ringing)
  noticeTimer = setTimeout(() => {
    activityText.textContent = instructions()
    activity.classList.remove('is-ringing')
  }, ringing ? 1550 : 2700)
}

function announce(text) {
  status.textContent = text
}

function showSound(enabled) {
  sound.setAttribute('aria-pressed', String(enabled))
  get('sound-icon').setAttribute('href', enabled ? '#i-sound' : '#i-muted')
  get('sound-text').textContent = enabled ? 'Sound on' : 'Sound off'
}

async function enableSound(request) {
  try {
    await audio.unlock()
    if (request !== soundRequest || mutedByChoice) return false
    audio.setEnabled(true)
    showSound(true)
    sound.title = 'Toggle sound'
    return true
  } catch {
    if (request !== soundRequest) return false
    audio.setEnabled(false)
    showSound(false)
    const noticeLabel = 'Audio is unavailable. Activate Sound to try again.'
    sound.title = noticeLabel
    notice(noticeLabel)
    announce(noticeLabel)
    return false
  }
}

sound.addEventListener('click', () => {
  const request = ++soundRequest
  if (audio.enabled) {
    mutedByChoice = true
    audio.setEnabled(false)
    showSound(false)
    announce('Sound off.')
  } else {
    mutedByChoice = false
    void enableSound(request).then(enabled => {
      if (enabled && request === soundRequest) announce('Sound on.')
    })
  }
})

volume.addEventListener('input', () => {
  const value = Number(volume.value)
  volume.style.setProperty('--volume', value + '%')
  audio.setVolume(value / 100)
})

function setHelp(open) {
  help.hidden = !open
  helpToggle.setAttribute('aria-expanded', String(open))
  if (open) world?.explorer.clear()
}

helpToggle.addEventListener('click', () => setHelp(help.hidden))
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !help.hidden) {
    setHelp(false)
    helpToggle.focus()
  }
})
document.addEventListener('pointerdown', event => {
  if (!help.hidden && !help.contains(event.target) && !helpToggle.contains(event.target)) setHelp(false)
})

function syncMotion() {
  reduced = motionOverride ?? prefersReduced.matches
  motion.checked = reduced
  document.documentElement.classList.toggle('reduced', reduced)
}
motion.addEventListener('change', () => {
  motionOverride = motion.checked
  syncMotion()
})
prefersReduced.addEventListener('change', syncMotion)
syncMotion()

function syncPad() {
  const hasView = !!world && !stage.hidden
  const enabled = hasView && (touchOverride ?? touch.matches)
  showControls.checked = enabled
  movement.hidden = !enabled
  compass.hidden = !hasView || enabled
  document.documentElement.classList.toggle('touch-controls', enabled)
  if (!enabled && movement.contains(document.activeElement)) stage.focus()
  if (!enabled) world?.explorer.clear()
}
showControls.addEventListener('change', () => {
  touchOverride = showControls.checked
  syncPad()
})
touch.addEventListener('change', syncPad)

function setAim(enabled) {
  keyboardAim = !!world && enabled
  reticle.hidden = !keyboardAim
  world?.markDirty()
}

aim.addEventListener('click', () => {
  setHelp(false)
  stage.focus({ preventScroll: true })
  setAim(true)
  notice('Aim at stone. Press Enter or Space.')
})

reset.addEventListener('click', () => {
  if (!world) return
  world.explorer.clear()
  world.explorer.reset()
  world.markDirty()
  announce('View reset.')
})

async function strike(hit, sampleButton) {
  const span = canyonSpan(hit.point.z, hit.point.y)
  const voice = voiceFor(hit.point, hit.side ?? 0, span)
  const camera = world?.camera
  const offset = camera ? hit.point.clone().sub(camera.position) : null
  const distance = offset?.length() ?? 3
  const yaw = world?.explorer.yaw ?? 0
  const pan = offset ? (offset.x * Math.cos(yaw) - offset.z * Math.sin(yaw)) / Math.max(distance, 1) : .15
  world?.ripples.strike(hit, performance.now() / 1000, voice.spacing, reduced)
  world?.markDirty()
  notice('Chime ' + voice.name, true)
  announce('Chime ' + voice.name + '.')
  if (sampleButton) {
    sampleButton.classList.add('is-ringing')
    setTimeout(() => sampleButton.classList.remove('is-ringing'), 430)
  }

  const request = soundRequest
  if (!mutedByChoice && (!audio.enabled || audio.context?.state !== 'running')) {
    if (!(await enableSound(request))) return
  }
  if (request === soundRequest) audio.play(voice, pan, distance)
}

for (const button of document.querySelectorAll('[data-chime]')) {
  button.addEventListener('click', () => void strike(representativePoint(Number(button.dataset.chime)), button))
}

function installInputs(view) {
  const { explorer } = view
  let gesture
  let pointerFocus = false
  const controller = new AbortController()
  const signal = controller.signal
  const on = (node, event, callback, options = {}) => node.addEventListener(event, callback, { ...options, signal })

  on(stage, 'pointerdown', event => {
    if (event.button !== 0 || gesture) return
    pointerFocus = true
    stage.focus({ preventScroll: true })
    pointerFocus = false
    setAim(false)
    gesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, dragged: false }
    stage.setPointerCapture(event.pointerId)
  })
  on(stage, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
    if (!gesture.dragged && distance > (event.pointerType === 'touch' ? 9 : 5)) {
      gesture.dragged = true
      stage.classList.add('dragging')
    }
    if (gesture.dragged) {
      const factor = event.pointerType === 'touch' ? .0065 : .00445
      explorer.look((event.clientX - gesture.x) * factor, (event.clientY - gesture.y) * factor)
    }
    gesture.x = event.clientX
    gesture.y = event.clientY
  })
  function terminate(event, allowStrike) {
    if (!gesture || event.pointerId !== gesture.id) return
    const finalDistance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
    const asTap = allowStrike && !gesture.dragged && finalDistance <= (event.pointerType === 'touch' ? 9 : 5)
    gesture = null
    stage.classList.remove('dragging')
    if (asTap) {
      const hit = view.pick(event.clientX, event.clientY)
      if (hit) void strike(hit)
    }
  }
  on(stage, 'pointerup', event => terminate(event, true))
  on(stage, 'pointercancel', event => terminate(event, false))
  on(stage, 'lostpointercapture', event => terminate(event, false))
  on(stage, 'focus', () => { if (!pointerFocus) setAim(true) })
  on(stage, 'blur', () => {
    setAim(false)
    explorer.clear()
  })
  on(stage, 'keydown', event => {
    if (event.target !== stage) return
    const action = keyAction(event)
    if (action) {
      event.preventDefault()
      setAim(true)
      explorer.setInput(event.code, action)
    } else if ((event.code === 'Enter' || event.code === 'Space') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      if (event.repeat) return
      setAim(true)
      const hit = view.pick()
      if (hit) void strike(hit)
      else {
        notice('Aim the center marker at a canyon wall.')
        announce('Aim at a canyon wall.')
      }
    }
  })
  on(window, 'keyup', event => explorer.setInput(event.code, null))
  on(window, 'blur', () => explorer.clear())
  on(document, 'visibilitychange', () => {
    if (document.hidden) explorer.clear()
    else view.markDirty()
  })

  movement.querySelectorAll('button').forEach(button => {
    const action = button.dataset.move
    const pointerKey = id => 'pointer-' + id
    const stop = event => explorer.setInput(pointerKey(event.pointerId), null)
    on(button, 'pointerdown', event => {
      if (event.button !== 0) return
      // Resolve any stage blur before setting the new movement input.
      button.focus({ preventScroll: true })
      button.setPointerCapture(event.pointerId)
      explorer.nudge(action)
      explorer.setInput(pointerKey(event.pointerId), action)
      view.markDirty()
    })
    on(button, 'pointerup', stop)
    on(button, 'pointercancel', stop)
    on(button, 'lostpointercapture', stop)
    on(button, 'click', event => {
      if (event.detail !== 0 || event.pointerType) return
      explorer.nudge(action)
      view.markDirty()
    })
  })

  return () => controller.abort()
}

function createWorld() {
  const mobile = touch.matches || narrow.matches
  const renderer = new THREE.WebGLRenderer({
    antialias: true, powerPreference: mobile ? 'default' : 'high-performance',
  })
  try {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = .99
    renderer.setClearColor('#d3a58d')
    renderer.domElement.setAttribute('aria-hidden', 'true')
    stage.append(renderer.domElement)
    stage.hidden = false

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, .15, 240)
    const landscape = createCanyon(scene, mobile)
    const explorer = new Explorer(camera, landscape.obstacles)
    const ripples = new Ripples(scene)
    const raycaster = new THREE.Raycaster()
    raycaster.far = 130
    const pointer = new THREE.Vector2()
    const normalMatrix = new THREE.Matrix3()
    const pickables = [...landscape.walls, landscape.ground]
    let frame = 0, last = 0, lastAim = 0
    let dirty = true
    let contextLost = false
    let restoreTimer
    let inputCleanup

    function resize() {
      const width = stage.clientWidth || window.innerWidth
      const height = stage.clientHeight || window.innerHeight
      const aspect = width / Math.max(1, height)
      camera.aspect = aspect
      camera.fov = THREE.MathUtils.lerp(67, 55, THREE.MathUtils.smoothstep(aspect, .43, 1))
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.35 : 1.65, Math.sqrt(2800000 / (width * height))))
      renderer.setSize(width, height, false)
      dirty = true
    }

    function pick(x, y) {
      if (contextLost) return
      const bounds = stage.getBoundingClientRect()
      pointer.set(x === undefined ? 0 : (x - bounds.left) / bounds.width * 2 - 1,
        y === undefined ? 0 : 1 - (y - bounds.top) / bounds.height * 2)
      raycaster.setFromCamera(pointer, camera)
      const [hit] = raycaster.intersectObjects(pickables, false)
      if (!hit?.face || hit.object === landscape.ground) return
      const normal = hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
      if (normal.dot(raycaster.ray.direction) > 0) normal.negate()
      const side = Math.abs(normal.x) > .37 ? hit.object.userData.side : undefined
      return { point: hit.point, side, normal }
    }

    function frameLoop(now) {
      frame = requestAnimationFrame(frameLoop)
      if (contextLost || document.hidden) {
        last = 0
        return
      }
      const dt = last ? Math.min((now - last) / 1000, .045) : 0
      last = now
      const moved = explorer.update(dt, reduced)
      const ringing = ripples.update(now / 1000)
      if (keyboardAim && (dirty || moved) && now - lastAim > 100) {
        reticle.classList.toggle('on-wall', !!pick())
        lastAim = now
      }
      if (dirty || moved || ringing) {
        const degrees = (Math.round(-THREE.MathUtils.radToDeg(explorer.yaw)) + 360) % 360
        const formatted = String(degrees).padStart(3, '0') + '°'
        if (bearing.textContent !== formatted) {
          bearing.textContent = formatted
          compass.style.setProperty('--bearing', -degrees + 'deg')
        }
        renderer.render(scene, camera)
        dirty = false
      }
    }

    function onContextLost(event) {
      event.preventDefault()
      contextLost = true
      explorer.clear()
      clearTimeout(restoreTimer)
      restoreTimer = setTimeout(() => {
        if (!contextLost) return
        showFallback('The 3D view lost its graphics connection. Reload to retry, or play a chime below.')
        syncPad()
        reset.disabled = true
        aim.disabled = true
      }, 1400)
      announce('The 3D view is paused while graphics recover.')
    }

    function onContextRestored() {
      contextLost = false
      clearTimeout(restoreTimer)
      scene.traverse(object => { if (object.shadow) object.shadow.needsUpdate = true })
      stage.hidden = false
      fallback.hidden = true
      document.documentElement.classList.remove('graphics-fallback')
    activityText.textContent = instructions()
      reset.disabled = false
      aim.disabled = false
      showControls.disabled = false
      resize()
      syncPad()
      announce('The 3D view is back.')
    }

    function destroy() {
      cancelAnimationFrame(frame)
      clearTimeout(restoreTimer)
      window.removeEventListener('resize', resize)
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
      inputCleanup?.()
      const geometries = new Set(), materials = new Set()
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry)
        if (object.material) materials.add(object.material)
        object.shadow?.dispose()
        if (object.isInstancedMesh) object.dispose()
      })
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => material.dispose())
      renderer.dispose()
    }

    const view = { camera, explorer, ripples, pick, destroy, markDirty: () => { dirty = true } }
    resize()
    renderer.render(scene, camera)
    inputCleanup = installInputs(view)
    window.addEventListener('resize', resize)
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)
    frame = requestAnimationFrame(frameLoop)
    return view
  } catch (error) {
    renderer.dispose()
    renderer.domElement.remove()
    throw error
  }
}

function showFallback(text) {
  stage.hidden = true
  fallback.hidden = false
  movement.hidden = true
  compass.hidden = true
  reticle.hidden = true
  showControls.disabled = true
  document.documentElement.classList.remove('touch-controls')
  document.documentElement.classList.add('graphics-fallback')
  if (text) get('fallback-message').textContent = text
  activityText.textContent = instructions()
}

try {
  world = createWorld()
  reset.disabled = false
  aim.disabled = false
  syncPad()
} catch (error) {
  console.warn('The 3D canyon could not start.', error)
  showFallback()
}

window.addEventListener('pagehide', event => {
  if (event.persisted) return
  world?.destroy()
  audio.dispose()
})
