(() => {
  const $ = (s) => document.querySelector(s);

  const APP_BUILD = "roam-v2";
  async function selfHealCaches(){
    // Clears only Gigglebits caches/service workers for THIS origin.
    if(!("serviceWorker" in navigator)) return;
    try{
      const regs = await navigator.serviceWorker.getRegistrations();
      // If an old service worker is controlling this page, refresh after cleanup
      const hadController = !!navigator.serviceWorker.controller;
      await Promise.all(regs.map(r => r.unregister()));
      if("caches" in window){
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.startsWith("gigglebits-")).map(k => caches.delete(k)));
      }
      // Prevent reload loops
      if(hadController && sessionStorage.getItem("gb.didHeal") !== "1"){
        sessionStorage.setItem("gb.didHeal","1");
        location.reload();
      }
    }catch{
      // ignore
    }
  }

  const DEFAULTS = {
    palette: "vault",
    background: "desk",
    bgMode: "fixed", // fixed | random
    charSize: "medium", // small | medium | large
    intensity: "balanced", // calm | balanced | expressive
    sleepEnabled: true,
    sleepDelay: "medium", // short | medium | long
    bubbles: true,
    emojis: true,
    verbosity: "short", // minimal | short | silent
    vhs: true,
    movement: "roam" // roam | static
  };

  const PALETTES = {
    vault:   { bg0:"#063f2b", bg1:"#082f25", fg:"#b9f7d4", muted:"#7bcaa7", accent:"#31d07f" },
    amber:   { bg0:"#2a1e06", bg1:"#1b1304", fg:"#ffe6b1", muted:"#d8b97c", accent:"#ffb340" },
    soft:    { bg0:"#1d2a32", bg1:"#0f151a", fg:"#d6f6ff", muted:"#9fd4e6", accent:"#63d1ff" },
    mono:    { bg0:"#101014", bg1:"#060608", fg:"#e8e8ee", muted:"#b7b7c2", accent:"#d0d0ff" }
  };

  const BACKGROUNDS = {
    desk: () => ({
      extra: `radial-gradient(900px 520px at 20% 15%, rgba(255,255,255,.06), transparent 55%),
              radial-gradient(900px 600px at 85% 90%, rgba(0,0,0,.35), transparent 60%)`
    }),
    cozy: () => ({
      extra: `radial-gradient(1000px 800px at 35% 20%, rgba(255,170,90,.12), transparent 60%),
              radial-gradient(900px 600px at 80% 85%, rgba(0,0,0,.35), transparent 60%)`
    }),
    minimal: () => ({
      extra: `radial-gradient(1000px 900px at 50% 45%, rgba(255,255,255,.05), transparent 62%)`
    })
  };

  const sleepMs = (delay) => {
    if (delay === "short") return 45_000;
    if (delay === "long") return 180_000;
    return 90_000;
  };
  const boredomMs = (delay) => Math.floor(sleepMs(delay) * 0.55);

  const state = {
    settings: loadSettings(),
    lastInteraction: Date.now(),
    mode: "active", // active | bored | sleeping
    wakeLockedUntil: 0
  };

  const el = {
    settingsBtn: $("#settingsBtn"),
    modalBackdrop: $("#modalBackdrop"),
    modalClose: $("#modalClose"),

    palette: $("#palette"),
    background: $("#background"),
    bgMode: $("#bgMode"),
    movement: $("#movement"),
    charSize: $("#charSize"),
    intensity: $("#intensity"),
    sleepEnabled: $("#sleepEnabled"),
    sleepDelay: $("#sleepDelay"),
    bubbles: $("#bubbles"),
    emojis: $("#emojis"),
    verbosity: $("#verbosity"),
    vhs: $("#vhs"),
    exportBtn: $("#exportBtn"),
    importFile: $("#importFile"),
    resetBtn: $("#resetBtn"),

    bubble: $("#bubble"),
    bigEmoji: $("#bigEmoji"),
    cat: $("#cat"),
    catSprite: $("#catSprite"),
    charWrap: $("#charWrap"),
    input: $("#input"),
    send: $("#send")
  };

  function loadSettings(){
    try{
      const raw = localStorage.getItem("gigglebits.settings.v4");
      if(!raw) return {...DEFAULTS};
      const parsed = JSON.parse(raw);
      return {...DEFAULTS, ...parsed};
    }catch{
      return {...DEFAULTS};
    }
  }
  function saveSettings(){
    localStorage.setItem("gigglebits.settings.v4", JSON.stringify(state.settings));
  }

  function hexToRgba(hex, a){
    const h = hex.replace("#","").trim();
    const full = h.length === 3 ? h.split("").map(c=>c+c).join("") : h;
    const n = parseInt(full, 16);
    const r = (n>>16)&255, g=(n>>8)&255, b=n&255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function applyPalette(){
    const p = PALETTES[state.settings.palette] || PALETTES.vault;
    const root = document.documentElement.style;
    root.setProperty("--bg0", p.bg0);
    root.setProperty("--bg1", p.bg1);
    root.setProperty("--fg", p.fg);
    root.setProperty("--muted", p.muted);
    root.setProperty("--accent", p.accent);
    root.setProperty("--border", hexToRgba(p.accent, 0.35));
  }

  function applyBackground(){
    const bgFn = BACKGROUNDS[state.settings.background] || BACKGROUNDS.desk;
    const {extra} = bgFn();
    document.body.style.background =
      `${extra},
       radial-gradient(1200px 800px at 30% 10%, rgba(61,255,176,.14), transparent 55%),
       linear-gradient(160deg, var(--bg0), var(--bg1))`;
  }

  function applyVhs(){
    document.documentElement.style.setProperty("--vhs", state.settings.vhs ? "1" : "0");
  }

  function applyCharLayout(){
    el.charWrap.classList.remove("docked","large");
    document.documentElement.style.setProperty("--charScale","1");
    if(state.settings.charSize === "small"){
      el.charWrap.classList.add("docked");
      document.documentElement.style.setProperty("--charScale","0.78");
    }else if(state.settings.charSize === "large"){
      el.charWrap.classList.add("large");
      document.documentElement.style.setProperty("--charScale","1.18");
    }else{
      document.documentElement.style.setProperty("--charScale","1");
    }
  }

  function applyIntensity(){
    el.cat.classList.remove("alive","sway");
    if(state.settings.intensity === "calm"){
      el.cat.classList.add("alive");
    }else if(state.settings.intensity === "expressive"){
      el.cat.classList.add("sway");
    }else{
      el.cat.classList.add("alive");
    }
  }

  function refreshUIFromSettings(){
    el.palette.value = state.settings.palette;
    el.background.value = state.settings.background;
    el.bgMode.value = state.settings.bgMode;
    if(el.movement) el.movement.value = state.settings.movement || "roam";
    el.charSize.value = state.settings.charSize;
    el.intensity.value = state.settings.intensity;
    el.sleepEnabled.checked = !!state.settings.sleepEnabled;
    el.sleepDelay.value = state.settings.sleepDelay;
    el.bubbles.checked = !!state.settings.bubbles;
    el.emojis.checked = !!state.settings.emojis;
    el.verbosity.value = state.settings.verbosity;
    el.vhs.checked = !!state.settings.vhs;
  }

  function showBubble(text){
    if(!state.settings.bubbles) return;
    if(state.settings.verbosity === "silent") return;
    el.bubble.textContent = text;
    el.bubble.classList.add("show");
  }
  function hideBubble(){ el.bubble.classList.remove("show"); }
  function showEmoji(ch){
    if(!state.settings.emojis) return;
    el.bigEmoji.textContent = ch;
    el.bigEmoji.classList.add("show");
  }
  function hideEmoji(){ el.bigEmoji.classList.remove("show"); }

  function setMode(mode){
    if(state.mode === mode) return;
    state.mode = mode;
    if(mode === "sleeping"){
      el.cat.classList.add("sleeping");
      if(el.catSprite) el.catSprite.classList.add("curl");
      showEmoji("💤");
      if(state.settings.bubbles && state.settings.verbosity !== "silent"){
        showBubble("zzz…");
      }
    }else if(mode === "bored"){
      el.cat.classList.remove("sleeping");
      if(el.catSprite) el.catSprite.classList.remove("curl");
      if(state.settings.emojis) showEmoji("…");
      if(state.settings.bubbles && state.settings.verbosity !== "silent"){
        showBubble("…");
      }
    }else{
      el.cat.classList.remove("sleeping");
      if(el.catSprite) el.catSprite.classList.remove("curl");
      hideEmoji();
      hideBubble();
    }
  }

  function randomizeBackground(){
    const keys = Object.keys(BACKGROUNDS);
    const next = keys[Math.floor(Math.random()*keys.length)];
    state.settings.background = next;
    saveSettings();
    applyBackground();
    refreshUIFromSettings();
  }

  function interpret(text){
    const t = text.trim();
    if(!t) return {bubble:"", emoji:"", reason:"neutral"};
    const lower = t.toLowerCase();
    const isQuestion = t.endsWith("?") || /\b(why|how|what|when|where|who)\b/.test(lower);
    const happy = /(\blol\b|haha|yay|nice|cool|awesome|great|love|:)|
                   \u2764|\u2728/.test(lower);
    const sad = /(sad|ugh|tired|bad|hate|angry|mad|:\/|:\(|\uD83D\uDE2D)/.test(lower);

    let emoji = "🙂";
    if(isQuestion) emoji = "❓";
    if(happy) emoji = "✨";
    if(sad) emoji = "😿";

    let bubble = "";
    if(state.settings.verbosity !== "silent"){
      if(state.settings.verbosity === "minimal"){
        bubble = isQuestion ? "hmm" : happy ? "nice" : sad ? "oh" : "ok";
      }else{
        bubble = isQuestion ? "hmm… tell me more." : happy ? "that’s a vibe." : sad ? "aw. i’m here." : "got it.";
      }
    }
    return {bubble, emoji, reason: isQuestion ? "question" : happy ? "happy" : sad ? "sad" : "neutral"};
  }

  function send(){
    const txt = el.input.value;
    el.input.value = "";
    if(!txt.trim()) return;
    state.lastInteraction = Date.now();
    const r = interpret(txt);

    setMode("active");
    if(state.settings.emojis && r.emoji){
      showEmoji(r.emoji);
      setTimeout(hideEmoji, 950);
    }
    if(state.settings.bubbles && r.bubble){
      showBubble(r.bubble);
      setTimeout(hideBubble, 2200);
    }
  }

  function nudgeLife(){
    state.lastInteraction = Date.now();
    if(state.mode === "sleeping"){
      state.wakeLockedUntil = Date.now() + 900;
      setMode("active");
      if(state.settings.bgMode === "random"){
        randomizeBackground();
      }
      if(state.settings.emojis) showEmoji("😺");
      doWiggle();
      if(state.settings.bubbles && state.settings.verbosity !== "silent"){
        showBubble(state.settings.verbosity === "minimal" ? "hi" : "hey.");
      }
      setTimeout(() => { hideEmoji(); hideBubble(); }, 1400);
    }else{
      setMode("active");
      if(state.settings.emojis){
        showEmoji("🙂");
        setTimeout(hideEmoji, 800);
      }
    }
  }

  function bindSettings(){
    const bind = (node, key, transform = (v)=>v) => {
      node.addEventListener("change", () => {
        state.settings[key] = transform(node.type === "checkbox" ? node.checked : node.value);
        saveSettings();
        applyAll();
        nudgeLife();
      });
    };
    bind(el.palette, "palette");
    bind(el.background, "background");
    bind(el.bgMode, "bgMode");
    if(el.movement) bind(el.movement, "movement");
    bind(el.charSize, "charSize");
    bind(el.intensity, "intensity");
    bind(el.sleepEnabled, "sleepEnabled", v => !!v);
    bind(el.sleepDelay, "sleepDelay");
    bind(el.bubbles, "bubbles", v => !!v);
    bind(el.emojis, "emojis", v => !!v);
    bind(el.verbosity, "verbosity");
    bind(el.vhs, "vhs", v => !!v);

    el.exportBtn.addEventListener("click", () => {
      const data = { version: 2, settings: state.settings };
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gigglebits-settings.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    el.importFile.addEventListener("change", async () => {
      const file = el.importFile.files?.[0];
      if(!file) return;
      try{
        const text = await file.text();
        const parsed = JSON.parse(text);
        if(parsed?.settings){
          state.settings = {...DEFAULTS, ...parsed.settings};
          saveSettings();
          applyAll();
          refreshUIFromSettings();
          showEmoji("✨");
          setTimeout(hideEmoji, 900);
        }
      }catch{
        showBubble("couldn’t import.");
        setTimeout(hideBubble, 1500);
      }finally{
        el.importFile.value = "";
      }
    });

    el.resetBtn.addEventListener("click", () => {
      state.settings = {...DEFAULTS};
      saveSettings();
      applyAll();
      refreshUIFromSettings();
      showEmoji("↺");
      setTimeout(hideEmoji, 900);
    });
  }

  function openSettings(){ el.modalBackdrop.classList.add("show"); }
  function closeSettings(){ el.modalBackdrop.classList.remove("show"); }

  function bindUI(){
    el.settingsBtn.addEventListener("click", openSettings);
    el.modalClose.addEventListener("click", closeSettings);
    el.modalBackdrop.addEventListener("click", (e) => { if(e.target === el.modalBackdrop) closeSettings(); });

    el.send.addEventListener("click", send);
    el.input.addEventListener("keydown", (e) => { if(e.key === "Enter") send(); });

    ["pointerdown","keydown","focus"].forEach(evt => {
      window.addEventListener(evt, () => { state.lastInteraction = Date.now(); }, {passive:true});
    });

    el.charWrap.addEventListener("pointerdown", nudgeLife);
  }


  let roam = {
    nextMoveAt: 0,
    nextLookAt: 0,
    targetX: 0,
    targetY: 0,
    dir: 1 // 1 right, -1 left
  };

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function stageBounds(){
    const rect = el.stage.getBoundingClientRect();
    // Keep the cat comfortably on-screen
    const padX = Math.min(40, rect.width * 0.10);
    const padTop = Math.min(70, rect.height * 0.12);
    const padBottom = Math.min(120, rect.height * 0.18);
    return {
      minX: -rect.width/2 + padX,
      maxX:  rect.width/2 - padX,
      minY: -rect.height/2 + padTop,
      maxY:  rect.height/2 - padBottom
    };
  }

  function setRoamTarget(x, y){
    roam.targetX = x;
    roam.targetY = y;
    // Apply offsets to charWrap via CSS vars
    el.charWrap.style.setProperty("--x", `${Math.round(x)}px`);
    el.charWrap.style.setProperty("--y", `${Math.round(y)}px`);
  }

  function chooseNewRoamTarget(){
    const b = stageBounds();
    // Roam range depends on size (small stays put)
    if(state.settings.charSize === "small") return;
    const x = b.minX + Math.random() * (b.maxX - b.minX);
    const y = b.minY + Math.random() * (b.maxY - b.minY);
    // Direction + flip
    const newDir = (x >= roam.targetX) ? 1 : -1;
    roam.dir = newDir;
    if(el.catSprite){
      el.catSprite.classList.toggle("flip", roam.dir === -1);
    }
    setRoamTarget(x, y);
  }

  function doWiggle(){
    if(!el.catSprite) return;
    el.catSprite.classList.remove("wiggle");
    // retrigger
    void el.catSprite.offsetWidth;
    el.catSprite.classList.add("wiggle");
    setTimeout(()=>el.catSprite && el.catSprite.classList.remove("wiggle"), 950);
  }

  function lookAround(){
    if(!el.catSprite) return;
    // tiny "turn head" illusion: quick flip and back sometimes
    const r = Math.random();
    if(r < 0.45){
      doWiggle(); // reads like tail/interest
      return;
    }
    const wasFlip = el.catSprite.classList.contains("flip");
    el.catSprite.classList.toggle("flip", !wasFlip);
    setTimeout(()=> el.catSprite && el.catSprite.classList.toggle("flip", wasFlip), 520);
  }

  function roamTick(now){
    if(state.settings.movement !== "roam") return;
    if(state.mode !== "active") return;
    if(state.settings.charSize === "small") return;

    // Movement pacing depends on intensity
    const baseMove = state.settings.intensity === "calm" ? 9500 : state.settings.intensity === "expressive" ? 5200 : 7200;
    const baseLook = state.settings.intensity === "calm" ? 7000 : state.settings.intensity === "expressive" ? 3800 : 5200;

    if(now > roam.nextMoveAt){
      chooseNewRoamTarget();
      roam.nextMoveAt = now + baseMove + Math.random()*baseMove*0.55;
    }
    if(now > roam.nextLookAt){
      lookAround();
      roam.nextLookAt = now + baseLook + Math.random()*baseLook*0.6;
    }
  }

  function applyAll(){
    applyPalette();
    applyBackground();
    applyVhs();
    applyCharLayout();
    applyIntensity();
  }

  function tick(){
    const now = Date.now();
    roamTick(now);
    if(now < state.wakeLockedUntil) return;
    const idle = now - state.lastInteraction;
    if(state.settings.sleepEnabled){
      if(idle > sleepMs(state.settings.sleepDelay)){
        setMode("sleeping");
        return;
      }
      if(idle > boredomMs(state.settings.sleepDelay)){
        setMode("bored");
        return;
      }
    }
    setMode("active");
  }

  async function registerSW(){
    if(!("serviceWorker" in navigator)) return;
    await selfHealCaches();
    try{
      await navigator.serviceWorker.register(`./sw.js?build=${APP_BUILD}`, {scope:"./"});
    }catch{}
  }

  refreshUIFromSettings();
  applyAll();
  bindSettings();
  bindUI();
  registerSW();

  if(state.settings.bgMode === "random"){
    randomizeBackground();
  }

  setTimeout(() => {
    if(state.settings.emojis) showEmoji("👋");
    if(state.settings.bubbles && state.settings.verbosity !== "silent"){
      showBubble(state.settings.verbosity === "minimal" ? "hi" : "hey, i'm here.");
    }
    setTimeout(() => { hideEmoji(); hideBubble(); }, 1700);
  }, 350);

  setInterval(tick, 650);
})();
