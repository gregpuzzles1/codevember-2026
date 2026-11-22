const pitches = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81]
const noteNames = ['C', 'D', 'E', 'G', 'A']
const maxVoices = 8
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

export function voiceFor(point, side, span) {
  const step = clamp(Math.floor(point.y * .78 + .8 + Math.sin(point.z * .34) * .8), 0, pitches.length - 1)
  const midi = pitches[step]
  return {
    name: noteNames[step % 5] + (Math.floor(midi / 12) - 1),
    hz: 440 * 2 ** ((midi - 69) / 12),
    brightness: clamp(.47 + .2 * Math.sin(point.z * .42 + side * 1.45) + point.y * .026, .22, .91),
    spacing: clamp(.152 + span * .0117 + .018 * Math.sin(point.z * .2), .19, .38),
  }
}

function makeImpulse(context) {
  const length = Math.floor(context.sampleRate * 2.1)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let seed = 58237 + channel * 91517
    let previous = 0
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const white = seed / 2147483648 - 1
      previous = .64 * previous + .36 * white
      const t = i / context.sampleRate
      data[i] = (.65 * previous + .35 * white) * Math.min(t / .036, 1) * (1 - i / length) ** 3.6
    }
  }
  return buffer
}

export class CanyonAudio {
  constructor() {
    this.enabled = false
    this.volume = .64
    this.voices = new Set()
  }

  async unlock() {
    if (!this.context || this.context.state === 'closed') {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) throw new Error('Web Audio unavailable')
      this.context = new AudioContext()
      this.buildGraph()
    }
    if (this.context.state !== 'running') await this.context.resume()
    if (this.context.state !== 'running') throw new Error('Audio is suspended')
  }

  buildGraph() {
    const ctx = this.context
    this.mix = ctx.createGain()
    this.master = ctx.createGain()
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -13
    compressor.knee.value = 12
    compressor.ratio.value = 9
    compressor.attack.value = .003
    compressor.release.value = .23
    this.master.gain.value = this.enabled ? this.volume ** 1.25 * .77 : 0
    this.mix.connect(compressor).connect(this.master).connect(ctx.destination)

    this.reverb = ctx.createConvolver()
    this.reverb.buffer = makeImpulse(ctx)
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = 3400
    const level = ctx.createGain()
    level.gain.value = .64
    this.reverb.connect(air).connect(level).connect(this.mix)
  }

  setEnabled(value) {
    this.enabled = value
    this.updateGain()
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1)
    this.updateGain()
  }

  updateGain() {
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume ** 1.25 * .77 : 0, this.context.currentTime, .024)
  }

  play(note, pan, distance) {
    const ctx = this.context
    if (!this.enabled || ctx?.state !== 'running' || this.voices.size >= maxVoices) return

    const time = ctx.currentTime + .008
    const bus = ctx.createGain()
    bus.gain.value = clamp(1.1 - distance * .015, .34, .95)
    const nodes = [bus]
    const oscillators = []
    const partials = [
      { ratio: 1, level: .26, length: .71, attack: .026 },
      { ratio: 2.006, level: .059 * (note.brightness + .58), length: .44, attack: .019 },
      { ratio: 2.99, level: .035 * note.brightness, length: .25, attack: .012 },
      { ratio: 4.18, level: .019 * note.brightness, length: .14, attack: .009 },
    ]
    for (const partial of partials) {
      const osc = ctx.createOscillator()
      const envelope = ctx.createGain()
      const end = time + partial.length
      osc.type = 'sine'
      osc.frequency.value = note.hz * partial.ratio
      envelope.gain.setValueAtTime(0, time)
      envelope.gain.linearRampToValueAtTime(partial.level, time + partial.attack)
      envelope.gain.exponentialRampToValueAtTime(.00015, end)
      envelope.gain.linearRampToValueAtTime(0, end + .03)
      osc.connect(envelope).connect(bus)
      osc.start(time)
      osc.stop(end + .045)
      oscillators.push(osc)
      nodes.push(osc, envelope)
    }

    const route = (input, amount, position) => {
      const gain = ctx.createGain()
      gain.gain.value = amount
      input.connect(gain)
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner()
        panner.pan.value = clamp(position, -.92, .92)
        gain.connect(panner).connect(this.mix)
        nodes.push(panner)
      } else {
        gain.connect(this.mix)
      }
      nodes.push(gain)
    }
    route(bus, 1, pan)
    const directWet = ctx.createGain()
    directWet.gain.value = .32
    bus.connect(directWet).connect(this.reverb)
    nodes.push(directWet)

    const reflectionTimes = [1, 1.91, 2.86, 3.89]
    const reflectionLevels = [.62, .39, .24, .14]
    for (let i = 0; i < reflectionTimes.length; i++) {
      const delay = ctx.createDelay(1.6)
      delay.delayTime.value = note.spacing * reflectionTimes[i]
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 4400 / (1 + i * .46)
      filter.Q.value = .18
      bus.connect(delay).connect(filter)
      const reflectedPan = (i % 2 ? .61 : -.8) * pan + (i % 2 ? -.15 : .19)
      route(filter, reflectionLevels[i], reflectedPan)
      const wet = ctx.createGain()
      wet.gain.value = reflectionLevels[i] * .54
      filter.connect(wet).connect(this.reverb)
      nodes.push(delay, filter, wet)
    }

    const voice = { nodes, oscillators, timer: 0 }
    this.voices.add(voice)
    const endTime = time + .82 + note.spacing * reflectionTimes.at(-1)
    const cleanup = () => {
      // Give queued reflections time on the audio clock even if the document was suspended.
      if (ctx.state === 'suspended' || ctx.state === 'interrupted' || (ctx.state === 'running' && ctx.currentTime < endTime)) {
        voice.timer = window.setTimeout(cleanup, 500)
        return
      }
      this.release(voice)
    }
    voice.timer = window.setTimeout(cleanup, (endTime - time + .15) * 1000)
  }

  release(voice) {
    clearTimeout(voice.timer)
    voice.nodes.forEach(node => node.disconnect())
    this.voices.delete(voice)
  }

  dispose() {
    for (const voice of this.voices) {
      for (const oscillator of voice.oscillators) {
        try { oscillator.stop() } catch { /* Voice has already stopped. */ }
      }
      this.release(voice)
    }
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {})
  }
}
