export class NightSound {
  context = null;
  active = false;

  async toggle() {
    const enabled = !this.active;
    if (enabled && !this.context) this.create();
    if (!this.context) return false;
    if (enabled) await this.context.resume();
    this.active=enabled;
    const {currentTime}=this.context;
    this.master.gain.cancelScheduledValues(currentTime);
    this.master.gain.setTargetAtTime(enabled ? .24 : 0,currentTime,.18);
    return enabled;
  }

  create() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const c = this.context = new Audio();
    this.master=c.createGain();
    this.master.gain.value=0;
    this.master.connect(c.destination);
    const buffer=c.createBuffer(1,c.sampleRate*4,c.sampleRate);
    const data=buffer.getChannelData(0);
    let brown=0;
    for(let i=0;i<data.length;i++){
      brown=(brown+(Math.random()*2-1)*.028)/1.02;
      const blend=Math.min(1, i/(c.sampleRate*.06),(data.length-1-i)/(c.sampleRate*.06));
      data[i]=brown*2.7*blend;
    }
    const wind=c.createBufferSource();
    wind.buffer=buffer;
    wind.loop=true;
    const pass=c.createBiquadFilter();
    pass.type='lowpass';
    pass.frequency.value=470;
    const gain=c.createGain();
    gain.gain.value=.42;
    wind.connect(pass).connect(gain).connect(this.master);
    wind.start();
    for(const [note,rate,volume] of [[136.9,.11,.026],[205.8,.16,.018],[272.8,.093,.009]]){
      const tone=c.createOscillator(), toneGain=c.createGain(), lfo=c.createOscillator(), depth=c.createGain();
      tone.frequency.value=note;
      toneGain.gain.value=volume*.53;
      lfo.frequency.value=rate;
      depth.gain.value=volume*.39;
      lfo.connect(depth).connect(toneGain.gain);
      tone.connect(toneGain).connect(this.master);
      tone.start(); lfo.start();
    }
    // A quiet, breathing night-insect rhythm.
    const cricket=c.createOscillator(), pulse=c.createOscillator(), lfo=c.createOscillator();
    const chirps=c.createGain(), group=c.createGain(), pulseDepth=c.createGain(), groupDepth=c.createGain();
    cricket.frequency.value=2191;
    pulse.frequency.value=15.7;
    lfo.frequency.value=.30;
    pulseDepth.gain.value=.0021;
    groupDepth.gain.value=.40;
    chirps.gain.value=.0022;
    group.gain.value=.42;
    pulse.connect(pulseDepth).connect(chirps.gain);
    lfo.connect(groupDepth).connect(group.gain);
    cricket.connect(chirps).connect(group).connect(this.master);
    cricket.start(); pulse.start(); lfo.start();
  }

  chime(kind){
    if(!this.active) return;
    const c=this.context;
    const notes=kind==='flower'?[659.25,987.77,1318.51]:[392,587.33];
    for(const [i, frequency] of notes.entries()){
      const t=c.currentTime+i*.10;
      const voice=c.createOscillator(), envelope=c.createGain();
      voice.type='sine';
      voice.frequency.value=frequency;
      envelope.gain.setValueAtTime(.0001,t);
      envelope.gain.exponentialRampToValueAtTime(.11/(i+1),t+.055);
      envelope.gain.exponentialRampToValueAtTime(.0001,t+1.2-i*.12);
      voice.connect(envelope).connect(this.master);
      voice.start(t);
      voice.stop(t+1.24);
    }
  }
}
