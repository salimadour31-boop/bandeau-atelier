/* Bandeau Atelier — app controller (vanilla JS, no build step). */
(function () {
  "use strict";

  const canvas = document.getElementById("preview");
  const ctx = canvas.getContext("2d");
  const screen = document.getElementById("screen");

  const state = {
    primary: "Amina Belkacem",
    secondary: "Réalisatrice",
    tertiary: "Alger · 2026",
    layout: "bar",
    theme: "cinematic",
    font: "Inter",
    position: "bottom",
    side: "left",
    ratio: "16:9",
    res: 1080,
    bg: "checker",
    safe: true,
    anim: "fadeSlide",
    durIn: 0.6,
    durHold: 2.5,
    durOut: 0.5,
    logoImg: null,
    logoData: null,
    bgImg: null,
    lang: "fr",
  };

  let animStart = null;
  let animRaf = null;
  let looping = false;
  let playing = false;
  let previewTime = null; // null = hold pose mid

  function $(id) { return document.getElementById(id); }

  function resizeCanvas() {
    const { w, h } = BA_render.ratioSize(state.ratio, state.res);
    canvas.width = w;
    canvas.height = h;
    screen.style.aspectRatio = `${w} / ${h}`;
    paint();
  }

  function paint() {
    const t = previewTime != null
      ? previewTime
      : (playing && animStart != null
        ? (performance.now() - animStart) / 1000
        : state.durIn + state.durHold * 0.5);
    BA_render.drawFrame(ctx, state, { time: t, forceHold: !playing && previewTime == null && !looping ? false : false });
  }

  function tick(now) {
    if (!playing) return;
    const t = (now - animStart) / 1000;
    const total = state.durIn + state.durHold + state.durOut;
    BA_render.drawFrame(ctx, state, { time: t });
    if (t >= total) {
      if (looping) {
        animStart = now;
        animRaf = requestAnimationFrame(tick);
      } else {
        playing = false;
        animRaf = null;
        previewTime = null;
        paint();
        $("animStatus").textContent = "";
      }
    } else {
      animRaf = requestAnimationFrame(tick);
    }
  }

  function play() {
    if (animRaf) cancelAnimationFrame(animRaf);
    playing = true;
    previewTime = null;
    animStart = performance.now();
    $("animStatus").textContent = "…";
    animRaf = requestAnimationFrame(tick);
  }

  function showHold() {
    if (animRaf) cancelAnimationFrame(animRaf);
    playing = false;
    looping = false;
    $("btnLoop").setAttribute("aria-pressed", "false");
    previewTime = state.durIn + state.durHold * 0.5;
    paint();
    $("animStatus").textContent = "";
  }

  /* ----- UI binding ----- */
  function readFields() {
    state.primary = $("fPrimary").value;
    state.secondary = $("fSecondary").value;
    state.tertiary = $("fTertiary").value;
    state.position = $("fPosition").value;
    state.side = $("fSide").value;
    state.font = $("fFont").value;
    state.res = parseInt($("fRes").value, 10) || 1080;
    state.bg = $("fBg").value;
    state.safe = $("fSafe").checked;
    state.anim = $("fAnim").value;
    state.durIn = parseFloat($("fDurIn").value);
    state.durHold = parseFloat($("fDurHold").value);
    state.durOut = parseFloat($("fDurOut").value);
    $("outIn").textContent = state.durIn.toFixed(2);
    $("outHold").textContent = state.durHold.toFixed(1);
    $("outOut").textContent = state.durOut.toFixed(2);
    $("bgImageRow").hidden = state.bg !== "image";
    const lay = document.querySelector('input[name="layout"]:checked');
    if (lay) state.layout = lay.value;
    const rat = document.querySelector('input[name="ratio"]:checked');
    if (rat) state.ratio = rat.value;
  }

  function onChange() {
    readFields();
    resizeCanvas();
  }

  function buildThemes() {
    const grid = $("themeGrid");
    grid.innerHTML = "";
    Object.values(BA_THEMES).forEach((th) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-btn" + (state.theme === th.id ? " active" : "");
      btn.dataset.theme = th.id;
      const name = th.name[state.lang] || th.name.fr;
      btn.innerHTML = `<span class="theme-swatches"><i style="background:${th.plate}"></i><i style="background:${th.bar}"></i><i style="background:${th.accent}"></i></span>${name}`;
      btn.addEventListener("click", () => {
        state.theme = th.id;
        grid.querySelectorAll(".theme-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === th.id));
        paint();
      });
      grid.appendChild(btn);
    });
  }

  function setupLang() {
    const sel = $("lang");
    sel.innerHTML = "";
    [["fr", "Français"], ["en", "English"], ["kab", "Taqbaylit"]].forEach(([v, l]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = l;
      if (v === state.lang) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => {
      state.lang = sel.value;
      BA_applyI18n(state.lang);
      buildThemes();
    });
    BA_applyI18n(state.lang);
  }

  /* ----- Logo / BG ----- */
  $("logoFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      state.logoImg = img;
      $("logoThumb").src = url;
      $("logoThumb").hidden = false;
      $("logoRemove").hidden = false;
      // keep data URL for JSON (small logos only)
      const c = document.createElement("canvas");
      const max = 128;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      state.logoData = c.toDataURL("image/png");
      paint();
    };
    img.src = url;
  });
  $("logoRemove").addEventListener("click", () => {
    state.logoImg = null;
    state.logoData = null;
    $("logoThumb").hidden = true;
    $("logoRemove").hidden = true;
    $("logoFile").value = "";
    paint();
  });
  $("bgFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { state.bgImg = img; paint(); };
    img.src = url;
  });

  /* ----- Export ----- */
  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function exportPng() {
    const { w, h } = BA_render.ratioSize(state.ratio, state.res);
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const octx = off.getContext("2d");
    BA_render.drawFrame(octx, state, {
      time: state.durIn + state.durHold * 0.5,
      transparent: true,
      noGuides: true,
      forceHold: true,
    });
    off.toBlob((blob) => {
      downloadBlob(blob, "bandeau-atelier.png");
      $("exportStatus").textContent = BA_I18N[state.lang].done;
    }, "image/png");
  }

  function exportSvg() {
    const { w, h } = BA_render.ratioSize(state.ratio, state.res);
    const svg = BA_render.toSVG(state, w, h);
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "bandeau-atelier.svg");
    $("exportStatus").textContent = BA_I18N[state.lang].done;
  }

  function exportJson() {
    const data = {
      version: 1,
      app: "bandeau-atelier",
      primary: state.primary,
      secondary: state.secondary,
      tertiary: state.tertiary,
      layout: state.layout,
      theme: state.theme,
      font: state.font,
      position: state.position,
      side: state.side,
      ratio: state.ratio,
      res: state.res,
      anim: state.anim,
      durIn: state.durIn,
      durHold: state.durHold,
      durOut: state.durOut,
      logoData: state.logoData || null,
    };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "bandeau-atelier.json");
    $("exportStatus").textContent = BA_I18N[state.lang].done;
  }

  async function exportWebm() {
    const dict = BA_I18N[state.lang] || BA_I18N.fr;
    if (typeof MediaRecorder === "undefined") {
      $("exportStatus").textContent = dict.errRecord;
      return;
    }
    const { w, h } = BA_render.ratioSize(state.ratio, state.res);
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const octx = off.getContext("2d");
    const stream = off.captureStream(30);
    let mime = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm";
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 }); }
    catch (e) { $("exportStatus").textContent = dict.errRecord; return; }

    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = () => res(); });
    $("exportStatus").textContent = dict.recording;
    $("btnWebm").disabled = true;
    rec.start(100);

    const total = state.durIn + state.durHold + state.durOut;
    const fps = 30;
    const frames = Math.ceil(total * fps) + 2;
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      BA_render.drawFrame(octx, state, { time: t, transparent: false, noGuides: true });
      // pace roughly to realtime so MediaRecorder gets frames
      const target = t0 + i * (1000 / fps);
      const wait = target - performance.now();
      if (wait > 2) await new Promise((r) => setTimeout(r, wait));
      else await new Promise((r) => requestAnimationFrame(r));
    }
    rec.stop();
    stream.getTracks().forEach((tr) => tr.stop());
    await done;
    downloadBlob(new Blob(chunks, { type: mime }), "bandeau-atelier.webm");
    $("exportStatus").textContent = dict.done;
    $("btnWebm").disabled = false;
  }

  $("importJson").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        ["primary", "secondary", "tertiary", "layout", "theme", "font", "position", "side", "ratio", "anim"].forEach((k) => {
          if (data[k] != null) state[k] = data[k];
        });
        if (data.res) state.res = data.res;
        if (data.durIn) state.durIn = data.durIn;
        if (data.durHold) state.durHold = data.durHold;
        if (data.durOut) state.durOut = data.durOut;
        $("fPrimary").value = state.primary;
        $("fSecondary").value = state.secondary;
        $("fTertiary").value = state.tertiary;
        $("fPosition").value = state.position;
        $("fSide").value = state.side;
        $("fFont").value = state.font;
        $("fRes").value = String(state.res);
        $("fAnim").value = state.anim;
        $("fDurIn").value = state.durIn;
        $("fDurHold").value = state.durHold;
        $("fDurOut").value = state.durOut;
        const lay = document.querySelector(`input[name="layout"][value="${state.layout}"]`);
        if (lay) lay.checked = true;
        const rat = document.querySelector(`input[name="ratio"][value="${state.ratio}"]`);
        if (rat) rat.checked = true;
        if (data.logoData) {
          const img = new Image();
          img.onload = () => {
            state.logoImg = img;
            state.logoData = data.logoData;
            $("logoThumb").src = data.logoData;
            $("logoThumb").hidden = false;
            $("logoRemove").hidden = false;
            buildThemes();
            onChange();
          };
          img.src = data.logoData;
        } else {
          buildThemes();
          onChange();
        }
        $("exportStatus").textContent = BA_I18N[state.lang].done;
      } catch (err) {
        $("exportStatus").textContent = String(err.message || err);
      }
    };
    reader.readAsText(f);
  });

  /* ----- Events ----- */
  ["fPrimary", "fSecondary", "fTertiary", "fPosition", "fSide", "fFont", "fRes", "fBg", "fAnim"].forEach((id) => {
    $(id).addEventListener("input", onChange);
    $(id).addEventListener("change", onChange);
  });
  ["fDurIn", "fDurHold", "fDurOut"].forEach((id) => {
    $(id).addEventListener("input", onChange);
  });
  $("fSafe").addEventListener("change", onChange);
  document.querySelectorAll('input[name="layout"], input[name="ratio"]').forEach((el) => {
    el.addEventListener("change", onChange);
  });

  $("btnPlay").addEventListener("click", play);
  $("btnLoop").addEventListener("click", () => {
    looping = !looping;
    $("btnLoop").setAttribute("aria-pressed", String(looping));
    if (looping && !playing) play();
  });
  $("btnHold").addEventListener("click", showHold);
  $("btnPng").addEventListener("click", exportPng);
  $("btnSvg").addEventListener("click", exportSvg);
  $("btnWebm").addEventListener("click", () => { exportWebm().catch((e) => { $("exportStatus").textContent = String(e); $("btnWebm").disabled = false; }); });
  $("btnJson").addEventListener("click", exportJson);
  $("helpBtn").addEventListener("click", () => $("helpDialog").showModal());

  window.addEventListener("resize", () => { /* CSS handles display size */ });

  // init
  setupLang();
  buildThemes();
  readFields();
  resizeCanvas();
  // auto-play once so user sees animation
  setTimeout(play, 400);
})();
