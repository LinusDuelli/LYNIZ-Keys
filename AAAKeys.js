<link rel="manifest" href="/manifest.json">
// ===== Utils & Data =====
const KEY_NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const ALL_SCALES = {
  "Major (Ionisch)": [0,2,4,5,7,9,11],
  "Natural Minor (Äolisch)": [0,2,3,5,7,8,10],
  "Harmonic Minor": [0,2,3,5,7,8,11],
  "Melodic Minor (up)": [0,2,3,5,7,9,11],
  "Dorian": [0,2,3,5,7,9,10],
  "Phrygian": [0,1,3,5,7,8,10],
  "Lydian": [0,2,4,6,7,9,11],
  "Mixolydian": [0,2,4,5,7,9,10],
  "Locrian": [0,1,3,5,6,8,10],
  "Major Pentatonic": [0,2,4,7,9],
  "Minor Pentatonic": [0,3,5,7,10],
  "Blues": [0,3,5,6,7,10],
  "Whole Tone": [0,2,4,6,8,10],
  "Diminished (H-W)": [0,1,3,4,6,7,9,10],
  "Diminished (W-H)": [0,2,3,5,6,8,9,11]
};
const KEY_OPT = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const selKey = document.createElement('select');
const selScale = document.createElement('select');

// ===== Storage =====
function _canStore(){ try{ const k='__t'+Math.random(); localStorage.setItem(k,'1'); localStorage.removeItem(k); return true; }catch{ return false; } }
function loadJSON(k,f){ try{ const v=_canStore()?localStorage.getItem(k):null; return v?JSON.parse(v):f; }catch{ return f; } }
function saveJSON(k,v){ try{ _canStore() && localStorage.setItem(k, JSON.stringify(v)); }catch{} }

// ===== Audio =====
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx, master, limiter;
let pitchRange = 2; // ± semitones
let modAmount = 0; // 0..100
function ensureCtx(){
  if(actx) return;
  actx = new AudioCtx();
  master = actx.createGain(); master.gain.value=0.9;
  limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -8; limiter.knee.value = 30; limiter.ratio.value = 12; 
  limiter.attack.value = 0.003; limiter.release.value = 0.25;
  master.connect(limiter).connect(actx.destination);
}
document.addEventListener('pointerdown', ()=>{ try{ ensureCtx(); if(actx.state==='suspended') actx.resume(); }catch{} }, {once:true});
document.addEventListener('keydown', ()=>{ try{ ensureCtx(); if(actx.state==='suspended') actx.resume(); }catch{} }, {once:true});

function midiToFreq(m){ return 440*Math.pow(2,(m-69)/12); }
function velToGain(v){ return Math.pow(v/127,1.5)*0.55; }

// ===== Keyboard Layout =====
const kb = document.getElementById('kb');
const WHITE_PCS = [0,2,4,5,7,9,11];
const BLACK_PCS = [1,3,6,8,10]; // C#, D#, F#, G#, A#
let baseOct = 4, currentRange = 3;
const octLbl = document.getElementById('octLbl');

function buildKeyboard(range=3){
  kb.innerHTML='';
  const W = 56; const B = 36; // widths
  for(let o=0; o<range; o++){
    // whites
    for(let i=0;i<7;i++){
      const midi = 12*(baseOct+o) + WHITE_PCS[i];
      const el = document.createElement('div');
      el.className='white key'; el.dataset.midi=midi; el.style.left = ((o*7+i)*W)+'px'; el.style.width=W+'px';
      el.innerHTML = `<span class="note-lbl">${noteName(midi)}</span>`;
      kb.appendChild(el);
    }
    // blacks
    const blackPos = [0,1,3,4,5];
    const blackOffset = [1,3,6,8,10];
    for(let j=0;j<blackPos.length;j++){
      const idx = blackPos[j];
      const midi = 12*(baseOct+o) + blackOffset[j];
      const el = document.createElement('div');
      el.className='black key'; el.dataset.midi=midi;
      el.style.left = ((o*7+idx)*W + W*0.72)+'px'; el.style.width = (B)+'px';
      el.innerHTML = `<span class="note-lbl">${noteName(midi)}</span>`;
      kb.appendChild(el);
    }
  }
  kb.style.minWidth = (range*7*W)+'px';
}
function noteName(m){ return KEY_NAMES[m%12] + (Math.floor(m/12)-1); }
// ===== Per-Key Settings =====
const SETTINGS_KEY = 'mk_classic_settings_v1';
let settings = loadJSON(SETTINGS_KEY, {}); // midi -> {color, detune, pan, vib, chord:[..], seq:[0/1x16], latch:bool}
function keySettings(m){ return settings[m] || {}; }
function setKeySettings(m, obj){ settings[m] = {...keySettings(m), ...obj}; saveJSON(SETTINGS_KEY, settings); }

// ===== Voices =====
const voices = new Map(); // midi -> voice
let sustain = false;
const meterFill = document.getElementById('meterFill');

function startVoice(midi, vel){
  ensureCtx();
  const st = keySettings(midi);
  const now = actx.currentTime;
  let v = voices.get(midi);
  if(!v){
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    const pan = actx.createStereoPanner ? actx.createStereoPanner() : null;
    const filt = actx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value = 18000;
    const vibr = actx.createOscillator(); const vibrGain = actx.createGain();

    osc.type = document.getElementById('wave').value;
    osc.frequency.value = midiToFreq(midi);
    if(st.detune) osc.detune.value = st.detune;

    const vibDepth = (st.vib||0)/100 * 30 + (modAmount/100)*40;
    vibr.frequency.value = 5 + (modAmount/100)*3; 
    vibrGain.gain.value = vibDepth;
    vibr.connect(vibrGain); vibrGain.connect(osc.frequency);

    if(pan){ osc.connect(filt).connect(pan).connect(gain).connect(master); pan.pan.value = (st.pan||0)/100; }
    else { osc.connect(filt).connect(gain).connect(master); }
    const g = velToGain(vel);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(g, now+0.01);

    osc.start(now); vibr.start(now);
    v = {osc,gain,filt,pan,vibr,vibrGain, baseFreq: osc.frequency.value};
    voices.set(midi, v);
  } else {
    const g = velToGain(vel);
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(g, now, 0.01);
  }
  updateMeter();
}
function stopVoice(midi){
  const v = voices.get(midi); if(!v) return;
  const now = actx.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setTargetAtTime(0.0001, now, 0.08);
  setTimeout(()=>{
    try{ v.osc.stop(); v.vibr.stop(); }catch{}
    try{ v.osc.disconnect(); v.vibr.disconnect(); v.gain.disconnect(); v.filt.disconnect(); v.pan && v.pan.disconnect(); }catch{}
    voices.delete(midi); updateMeter();
  }, 140);
}
function updateMeter(){ const n = voices.size; meterFill.style.width = Math.min(100, n*12)+'%'; }
function applyPitchBend(midi, bend){ const v = voices.get(midi); if(!v) return; v.osc.frequency.setTargetAtTime(v.baseFreq * Math.pow(2, bend/12), actx.currentTime, 0.01); }
function applyAftertouch(midi, amt){ const v = voices.get(midi); if(!v) return; v.filt.frequency.setTargetAtTime(500 + amt*17000, actx.currentTime, 0.02); }

// ===== Latch =====
function isLatched(midi){ return !!(keySettings(midi).latch); }
function toggleLatch(midi, el){
  const now = !isLatched(midi);
  setKeySettings(midi,{latch:now});
  if(now){ el.classList.add('latch'); playKey(midi); }
  else { el.classList.remove('latch'); stopAllForKey(midi); }
}
function restoreLatchStyles(){
  kb.querySelectorAll('.key').forEach(el=>{
    const m=Number(el.dataset.midi);
    if(isLatched(m)) el.classList.add('latch'); else el.classList.remove('latch');
  });
}

// ===== Play key with chord/sequence =====
function playKey(midi){
  const st = keySettings(midi); 
  const vel = Number(document.getElementById('vel').value);
  const chord = parseChord(st.chord);
  if(chord && chord.length){ chord.forEach(iv => startVoice(midi+iv, vel)); } 
  else { startVoice(midi, vel); }
  if(st.seq && st.seq.some(x=>x)){ startKeySequencer(midi, st.seq); }
}
function stopAllForKey(midi){
  const st = keySettings(midi); 
  const chord = parseChord(st.chord); 
  if(chord && chord.length){ chord.forEach(iv => stopVoice(midi+iv)); } 
  else { stopVoice(midi); }
  stopKeySequencer(midi);
}
function parseChord(s){ if(!s) return null; try{ return String(s).split(',').map(x=>parseInt(x.trim(),10)).filter(x=>!isNaN(x)); }catch{ return null; } }
// ===== Build missing UI (safe to run multiple times) =====
(function ensureUI(){
  const main = document.querySelector('main');
  // Control panel with Scale + Arp + Meter if missing
  if(!document.getElementById('mk-panel')){
    const wrap = document.createElement('div');
    wrap.id = 'mk-panel';
    wrap.className = 'panel';
    wrap.innerHTML = `
      <div class="row" style="gap:12px; flex-wrap:wrap">
        <label>Tonart</label><select id="key"></select>
        <label>Skala</label><select id="scale"></select>
        <button id="highlight">Highlight</button>
        <label>Arp</label>
        <select id="arp">
          <option value="off">Off</option>
          <option value="up">Up</option>
          <option value="down">Down</option>
          <option value="updown">UpDown</option>
          <option value="rand">Random</option>
        </select>
        <label>Tempo</label><input id="bpm" type="range" min="40" max="200" value="120">
        <span id="bpmLbl">120</span>
      </div>
      <div class="meter" style="margin-top:8px"><i id="meterFill"></i></div>
    `;
    main.insertBefore(wrap, main.firstElementChild);
  }
  // Editor drawer if missing
  if(!document.getElementById('drawer')){
    const drawer = document.createElement('aside');
    drawer.id = 'drawer';
    drawer.className = 'drawer';
    drawer.setAttribute('aria-hidden','true');
    drawer.innerHTML = `
      <h3>Key-Editor <span id="edNote" class="small"></span></h3>
      <div class="row">Farbe: <input id="edColor" type="color" value="#ffffff"></div>
      <div class="row">Detune (Cent): <input id="edDetune" type="range" min="-100" max="100" value="0"><span id="edDetuneLbl">0</span></div>
      <div class="row">Pan: <input id="edPan" type="range" min="-100" max="100" value="0"><span id="edPanLbl">0</span></div>
      <div class="row">Vibrato: <input id="edVib" type="range" min="0" max="100" value="0"><span id="edVibLbl">0</span></div>
      <div class="row">Chord (HT, z. B. 0,4,7): <input id="edChord" placeholder="0,4,7"></div>
      <div class="row">Sequencer (16 Steps):</div>
      <div id="edSeq" class="row"></div>
      <div class="row"><button id="edApply">Übernehmen</button> <button id="edClose">Schließen</button></div>
      <p class="small">Doppeltippen = Latch • Langdruck auf Taste = Editor.</p>
    `;
    document.body.appendChild(drawer);
  }
})();

// Hook scale selects
const selKeyEl   = document.getElementById('key');
const selScaleEl = document.getElementById('scale');
if(selKeyEl && selKeyEl.options.length === 0){
  KEY_OPT.forEach(k=>{ const o=document.createElement('option'); o.value=o.textContent=k; selKeyEl.appendChild(o); });
  selKeyEl.value = 'C';
}
if(selScaleEl && selScaleEl.options.length === 0){
  Object.keys(ALL_SCALES).forEach(n=>{ const o=document.createElement('option'); o.value=o.textContent=n; selScaleEl.appendChild(o); });
  selScaleEl.value = 'Major (Ionisch)';
}

// ===== Scale Highlight =====
function refreshHighlights(){
  if(!selKeyEl || !selScaleEl) return;
  const root = selKeyEl.value;
  const steps = ALL_SCALES[selScaleEl.value] || [];
  const rootPC = {"C":0,"C#":1,"D":2,"Eb":3,"E":4,"F":5,"F#":6,"G":7,"Ab":8,"A":9,"Bb":10,"B":11}[root];
  const pcs = new Set(steps.map(s=>(rootPC + s) % 12));
  kb.querySelectorAll('.key').forEach(k=>{
    const m = Number(k.dataset.midi);
    if(pcs.has(m%12)) k.classList.add('in-scale'); else k.classList.remove('in-scale');
  });
}
document.getElementById('highlight')?.addEventListener('click', refreshHighlights);

// Meter handle (created above)
const meterFill = document.getElementById('meterFill');

// ===== Pointer / Touch Interaction (gliss, bend, aftertouch, double-tap, long-press) =====
const pointerState = new Map(); // pointerId -> {midi, el, startX, startY, lastX, lastY, downAt}
let longTimer = null;

function handleDown(e){
  const el = e.target.closest('.key'); if(!el) return; e.preventDefault();
  const midi = Number(el.dataset.midi); const now = performance.now();
  el._lastTap = el._lastTap || 0;
  if(now - el._lastTap < 280){ toggleLatch(midi, el); return; } // double tap -> latch
  el._lastTap = now;

  pointerState.set(e.pointerId, {midi, el, startX:e.clientX, startY:e.clientY, lastX:e.clientX, lastY:e.clientY, downAt:now});
  el.classList.add('play');
  clearTimeout(longTimer); longTimer = setTimeout(()=> openEditor(midi), 550); // long press -> editor
  playKey(midi);
}
function handleMove(e){
  const st = pointerState.get(e.pointerId); if(!st) return;
  const dx = e.clientX - st.startX; const dy = st.startY - e.clientY;
  st.lastX = e.clientX; st.lastY = e.clientY;
  const semis = Math.max(-pitchRange, Math.min(pitchRange, (dx/80) * pitchRange));
  applyPitchBend(st.midi, semis);
  const amt = Math.max(0, Math.min(1, (dy+120)/240));
  applyAftertouch(st.midi, amt);

  // Glissando über Keys
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const el = over && over.closest && over.closest('.key');
  if(el && el !== st.el){
    const prev = st.el;
    prev.classList.remove('play');
    if(!sustain && !isLatched(Number(prev.dataset.midi))) stopAllForKey(Number(prev.dataset.midi));
    st.el = el; el.classList.add('play');
    playKey(Number(el.dataset.midi));
    st.midi = Number(el.dataset.midi);
    st.startX = e.clientX; st.startY = e.clientY; // reset bend origin
  }
}
function handleUp(e){
  const st = pointerState.get(e.pointerId); if(!st) return;
  clearTimeout(longTimer);
  st.el.classList.remove('play');
  if(!sustain && !isLatched(st.midi)) stopAllForKey(st.midi);
  pointerState.delete(e.pointerId);
}

kb.addEventListener('pointerdown', e=>{ kb.setPointerCapture?.(e.pointerId); handleDown(e); });
kb.addEventListener('pointermove', handleMove);
['pointerup','pointercancel','pointerleave'].forEach(ev => kb.addEventListener(ev, handleUp));

// ===== Editor Drawer (per key) =====
const drawer   = document.getElementById('drawer');
const edNote   = document.getElementById('edNote');
const edColor  = document.getElementById('edColor');
const edDetune = document.getElementById('edDetune'); const edDetuneLbl = document.getElementById('edDetuneLbl');
const edPan    = document.getElementById('edPan');    const edPanLbl    = document.getElementById('edPanLbl');
const edVib    = document.getElementById('edVib');    const edVibLbl    = document.getElementById('edVibLbl');
const edChord  = document.getElementById('edChord');
const edSeq    = document.getElementById('edSeq');
let editMidi = null;

// Build seq buttons once
if(edSeq && edSeq.children.length === 0){
  for(let i=0;i<16;i++){
    const b = document.createElement('button');
    b.textContent = String(i+1);
    b.style.minWidth = '32px';
    b.dataset.on = '0';
    b.addEventListener('click', ()=>{ b.dataset.on = b.dataset.on==='1' ? '0':'1'; b.style.outline = b.dataset.on==='1' ? '2px solid var(--ok)' : ''; });
    edSeq.appendChild(b);
  }
}

function rgbToHex(rgb){
  if(!rgb) return '#ffffff';
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if(!m) return '#ffffff';
  const hx = n => ('0'+parseInt(n,10).toString(16)).slice(-2);
  return '#'+hx(m[1])+hx(m[2])+hx(m[3]);
}
function openEditor(midi){
  if(!drawer) return;
  editMidi = midi;
  const st = keySettings(midi);
  const keyEl = kb.querySelector(`.key[data-midi="${midi}"]`);
  edNote.textContent = '• '+noteName(midi)+' ('+midi+')';
  edColor.value = rgbToHex(getComputedStyle(keyEl).backgroundColor) || '#ffffff';
  edDetune.value = st.detune||0; edDetuneLbl.textContent = edDetune.value;
  edPan.value = st.pan||0;       edPanLbl.textContent    = edPan.value;
  edVib.value = st.vib||0;       edVibLbl.textContent    = edVib.value;
  edChord.value = st.chord ? String(st.chord) : '';
  const seq = st.seq || Array(16).fill(0);
  Array.from(edSeq.children).forEach((btn,i)=>{ btn.dataset.on = seq[i]?'1':'0'; btn.style.outline = seq[i] ? '2px solid var(--ok)' : ''; });
  drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false');
}
document.getElementById('edApply')?.addEventListener('click', ()=>{
  if(editMidi==null) return;
  const seq = Array.from(edSeq.children).map(b => b.dataset.on==='1' ? 1 : 0);
  setKeySettings(editMidi, {
    color: edColor.value,
    detune: parseInt(edDetune.value,10) || 0,
    pan:    parseInt(edPan.value,10)    || 0,
    vib:    parseInt(edVib.value,10)    || 0,
    chord:  edChord.value || '',
    seq
  });
  const el = kb.querySelector(`.key[data-midi="${editMidi}"]`);
  if(el && !el.classList.contains('black')) el.style.backgroundColor = edColor.value;
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true');
});
document.getElementById('edClose')?.addEventListener('click', ()=>{
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true');
});
edDetune?.addEventListener('input', ()=> edDetuneLbl.textContent = edDetune.value);
edPan?.addEventListener('input',    ()=> edPanLbl.textContent    = edPan.value);
edVib?.addEventListener('input',    ()=> edVibLbl.textContent    = edVib.value);

// ===== Per-key Sequencer =====
const seqTimers = new Map(); // midi -> timer
function startKeySequencer(midi, arr){
  stopKeySequencer(midi);
  const bpm = parseInt(document.getElementById('bpm')?.value || '120',10);
  const interval = 60000 / bpm / 2; // 8tel
  let i=0;
  const t = setInterval(()=>{
    if(!isLatched(midi)) return;  // pattern nur wenn gelatched
    if(arr[i%16]){ startVoice(midi, 100); setTimeout(()=> stopVoice(midi), interval*0.9); }
    i++;
  }, interval);
  seqTimers.set(midi, t);
}
function stopKeySequencer(midi){
  const t = seqTimers.get(midi); if(t){ clearInterval(t); seqTimers.delete(midi); }
}

// ===== Arpeggiator =====
let arpTimer = null;
function restartArp(){
  clearInterval(arpTimer); arpTimer=null;
  const mode = (document.getElementById('arp')||{}).value || 'off';
  if(mode==='off') return;
  const bpm = parseInt(document.getElementById('bpm')?.value || '120', 10);
  const interval = 60000 / bpm / 2; // 8tel
  let idx=0, dir=1;
  arpTimer = setInterval(()=>{
    const latched = [...kb.querySelectorAll('.key.latch')].map(el=>Number(el.dataset.midi)).sort((a,b)=>a-b);
    if(latched.length===0) return;
    let pick;
    if(mode==='up'){ pick = latched[idx % latched.length]; idx++; }
    else if(mode==='down'){ pick = latched[(latched.length-1)-(idx%latched.length)]; idx++; }
    else if(mode==='updown'){ pick = latched[idx]; idx+=dir; if(idx>=latched.length-1 || idx<=0) dir*=-1; }
    else if(mode==='rand'){ pick = latched[Math.floor(Math.random()*latched.length)]; }
    startVoice(pick, 95); setTimeout(()=> stopVoice(pick), interval*0.9);
  }, interval);
}
document.getElementById('arp')?.addEventListener('change', restartArp);
document.getElementById('bpm')?.addEventListener('input', ()=> {
  const bpmLbl = document.getElementById('bpmLbl'); if(bpmLbl) bpmLbl.textContent = document.getElementById('bpm').value;
  restartArp();
});

// ===== Global Controls =====
document.getElementById('sustain')?.addEventListener('click', e=>{
  sustain = !sustain;
  e.currentTarget.style.outline = sustain ? '2px solid var(--ok)' : '';
  if(!sustain){
    const pressed = new Set([...pointerState.values()].map(s=>s.midi));
    for(const m of Array.from(voices.keys())){ if(!pressed.has(m) && !isLatched(m)) stopAllForKey(m); }
  }
});
document.getElementById('panic')?.addEventListener('click', ()=>{ for(const m of Array.from(voices.keys())) stopAllForKey(m); });
document.getElementById('bendRange')?.addEventListener('input', e=> pitchRange = parseInt(e.target.value,10)||2 );
document.getElementById('mod')?.addEventListener('input',      e=> modAmount  = parseInt(e.target.value,10)||0 );

document.getElementById('octUp')?.addEventListener('click',  ()=>{ baseOct=Math.min(7,baseOct+1); octLbl.textContent=baseOct; buildKeyboard(currentRange); refreshHighlights(); });
document.getElementById('octDown')?.addEventListener('click',()=>{ baseOct=Math.max(1,baseOct-1); octLbl.textContent=baseOct; buildKeyboard(currentRange); refreshHighlights(); });

// ===== Keyboard mapping (DE) =====
const KEYMAP = {'z':0,'s':1,'x':2,'d':3,'c':4,'v':5,'g':6,'b':7,'h':8,'n':9,'j':10,'m':11,',':12,'.':13,'-':14};
document.addEventListener('keydown', (e)=>{
  if(e.repeat) return;
  if(e.key==='ArrowUp'){ baseOct=Math.min(7,baseOct+1); octLbl.textContent=baseOct; buildKeyboard(currentRange); refreshHighlights(); return; }
  if(e.key==='ArrowDown'){ baseOct=Math.max(1,baseOct-1); octLbl.textContent=baseOct; buildKeyboard(currentRange); refreshHighlights(); return; }
  const off = KEYMAP[e.key.toLowerCase()];
  if(off!=null){
    const midi=12*baseOct + off;
    const el=kb.querySelector(`.key[data-midi="${midi}"]`);
    if(el){ el.classList.add('play'); playKey(midi); }
  }
});
document.addEventListener('keyup', (e)=>{
  const off = KEYMAP[e.key.toLowerCase()];
  if(off!=null){
    const midi=12*baseOct + off;
    const el=kb.querySelector(`.key[data-midi="${midi}"]`);
    if(el){ el.classList.remove('play'); if(!sustain && !isLatched(midi)) stopAllForKey(midi); }
  }
});

// ===== Init =====
function fitRange(){ const w=window.innerWidth; currentRange = w<480?2:(w<900?3:4); }
window.addEventListener('resize', ()=>{ fitRange(); buildKeyboard(currentRange); refreshHighlights(); });
fitRange(); buildKeyboard(currentRange); refreshHighlights(); restoreLatchStyles();
// ===== Ear Training UI (add if missing) =====
(function ensureEarUI(){
  if(!document.getElementById('earPanel')){
    const panel = document.createElement('div');
    panel.id = 'earPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="row" style="gap:12px; flex-wrap:wrap">
        <button id="earStart">Ear-Training Start</button>
        <button id="earStop">Stop</button>
        <label>Umfang</label>
        <select id="earScope">
          <option value="scale" selected>Nur Skala</option>
          <option value="all">Alle sichtbaren</option>
        </select>
        <span class="small">Punkte: <b id="earScore">0</b> • Streak: <b id="earStreak">0</b></span>
      </div>
      <p class="small">Ein Zielton blinkt → spiele ihn nach. Richtige Töne erhöhen Punkte und Streak.</p>
    `;
    document.querySelector('main').insertBefore(panel, document.querySelector('.kb-wrap').parentElement);
  }
})();

// ===== Export / Import / Reset UI (add if missing) =====
(function ensureExportUI(){
  if(!document.getElementById('exportPanel')){
    const panel = document.createElement('div');
    panel.id = 'exportPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="row" style="gap:12px; flex-wrap:wrap">
        <button id="exportBtn">Export Settings</button>
        <input id="importFile" type="file" accept="application/json">
        <button id="resetBtn">Reset</button>
      </div>
      <p class="small">Speichert je Taste: Farbe, Detune, Pan, Vibrato, Akkord, Sequencer, Latch.</p>
    `;
    document.querySelector('main').insertBefore(panel, document.querySelector('.kb-wrap').parentElement);
  }
})();

// ===== Ear Training Logic =====
let earTimer = null, earTarget = null, earScore = 0, earStreak = 0;
const earScoreEl  = document.getElementById('earScore');
const earStreakEl = document.getElementById('earStreak');

function earCandidates(){
  const keys = [...kb.querySelectorAll('.key')];
  const scope = (document.getElementById('earScope')||{}).value || 'scale';
  if(scope === 'scale'){
    return keys.filter(k => k.classList.contains('in-scale'));
  }
  return keys;
}
function pickEar(){
  const cand = earCandidates();
  if(cand.length === 0) return null;
  return cand[Math.floor(Math.random() * cand.length)];
}
function startEar(){
  stopEar();
  const next = () => {
    const el = pickEar(); if(!el) return;
    earTarget = Number(el.dataset.midi);
    el.classList.add('blink');
    setTimeout(()=> el.classList.remove('blink'), 1200);
  };
  next();
  earTimer = setInterval(next, 4000);
}
function stopEar(){
  clearInterval(earTimer); earTimer = null; earTarget = null;
  kb.querySelectorAll('.blink').forEach(e => e.classList.remove('blink'));
}
document.getElementById('earStart')?.addEventListener('click', startEar);
document.getElementById('earStop')?.addEventListener('click',  stopEar);

// Hook scoring into startVoice / playKey (non-destructive)
(function hookEarScoring(){
  if(!window.__mk_ear_hooked){
    const __origStartVoice = startVoice;
    startVoice = function(midi, vel){
      __origStartVoice(midi, vel);
      if(earTarget != null && midi === earTarget){
        earScore++; earStreak++;
        if(earScoreEl)  earScoreEl.textContent  = String(earScore);
        if(earStreakEl) earStreakEl.textContent = String(earStreak);
        earTarget = null; // Treffer verbrauchen
      }
    };
    const __origPlayKey = playKey;
    playKey = function(midi){
      if(earTimer && earTarget != null && midi !== earTarget){
        earStreak = 0;
        if(earStreakEl) earStreakEl.textContent = '0';
      }
      __origPlayKey(midi);
    };
    window.__mk_ear_hooked = true;
  }
})();

// ===== Export / Import / Reset Logic =====
document.getElementById('exportBtn')?.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(settings, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'melodykeys_settings.json';
  a.click();
});
document.getElementById('importFile')?.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  try{
    const txt = await f.text();
    const obj = JSON.parse(txt);
    settings = obj || {};
    saveJSON('mk_classic_settings_v1', settings);
    buildKeyboard(currentRange);
    refreshHighlights();
    restoreLatchStyles();
    alert('Import OK');
  }catch{
    alert('Import fehlgeschlagen (ungültige Datei?)');
  }
  e.target.value = '';
});
document.getElementById('resetBtn')?.addEventListener('click', ()=>{
  if(confirm('Alle Key-Einstellungen wirklich löschen?')){
    settings = {};
    saveJSON('mk_classic_settings_v1', settings);
    buildKeyboard(currentRange);
    refreshHighlights();
    restoreLatchStyles();
  }
});

// ===== Final safety refresh =====
refreshHighlights();
restoreLatchStyles();
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
</script>
console.log('AAAKeys.js geladen');

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <button id="testBtn">Klick mich</button>
    <p id="out">Noch nix passiert…</p>
  `;

  document.getElementById('testBtn').addEventListener('click', () => {
    document.getElementById('out').textContent = 'Button funktioniert 🎹';
  });
});
