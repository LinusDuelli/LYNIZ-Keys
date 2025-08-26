// Minimales, funktionierendes Klavier – unabhängig von AAAKeys.js
document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');

  // UI bauen
  app.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button data-note="C4">C</button>
      <button data-note="D4">D</button>
      <button data-note="E4">E</button>
      <button data-note="F4">F</button>
      <button data-note="G4">G</button>
      <button data-note="A4">A</button>
      <button data-note="B4">H</button>
      <span id="status" style="margin-left:12px">Bereit.</span>
    </div>
  `;

  // Tonerzeugung (WebAudio)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  const freqs = { // einfache Stimmung
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
    G4: 392.00, A4: 440.00, B4: 493.88
  };

  function play(note, dur = 0.25) {
    const freq = freqs[note];
    if (!freq) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.05);
  }

  app.querySelectorAll('button[data-note]').forEach(btn => {
    btn.addEventListener('click', () => {
      const note = btn.getAttribute('data-note');
      play(note);
      const s = document.getElementById('status');
      if (s) s.textContent = ${note} gespielt 🎹;
    });
  });
});
