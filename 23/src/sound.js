export function wireSound(button, label) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let context;
  let output;
  let enabled = false;
  if (!AudioContext) return () => {};

  button.hidden = false;
  button.addEventListener('click', async () => {
    enabled = !enabled;
    if (!context) {
      try {
        context = new AudioContext();
        output = context.createGain();
        output.gain.value = .76;
        output.connect(context.destination);
      } catch {
        enabled = false;
      }
    }
    if (enabled) {
      try {
        await context.resume();
      } catch {
        enabled = false;
      }
    }
    if (output) output.gain.setTargetAtTime(enabled ? .76 : 0, context.currentTime, .025);
    button.setAttribute('aria-pressed', String(enabled));
    label.textContent = enabled ? 'Sound on' : 'Sound off';
  });

  return index => {
    if (!enabled || context?.state !== 'running') return;
    const now = context.currentTime;
    const pitch = [87, 71, 47][index];
    const length = [.44, .56, .95][index];
    for (const harmonic of [1, 2]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = harmonic === 1 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(pitch * harmonic * 1.36, now);
      oscillator.frequency.exponentialRampToValueAtTime(pitch * harmonic, now + .088);
      oscillator.frequency.exponentialRampToValueAtTime(pitch * harmonic * .69, now + length);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(harmonic === 1 ? .14 : .024, now + .031);
      gain.gain.exponentialRampToValueAtTime(.0001, now + length);
      oscillator.connect(gain).connect(output);
      oscillator.start(now);
      oscillator.stop(now + length + .02);
    }
  };
}
