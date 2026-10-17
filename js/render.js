/* Canvas renderer for lower-thirds — original layouts only. */
(function (global) {
  "use strict";

  const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  const TIFINAGH_RE = /[\u2D30-\u2D7F]/;

  function hasArabic(s) { return ARABIC_RE.test(s || ""); }
  function hasTifinagh(s) { return TIFINAGH_RE.test(s || ""); }

  function pickFont(state, text) {
    if (hasArabic(text)) return '"Noto Sans Arabic", "Noto Naskh Arabic", sans-serif';
    if (hasTifinagh(text)) return '"Noto Sans Tifinagh", sans-serif';
    const f = state.font || "Inter";
    if (f === "system-ui") return 'system-ui, -apple-system, "Segoe UI", sans-serif';
    return `"${f}", system-ui, sans-serif`;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  /** Animation progress 0..1 for the banner itself (opacity / offset / scale). */
  function animFactors(state, t) {
    const din = state.durIn, dhold = state.durHold, dout = state.durOut;
    const total = din + dhold + dout;
    const mode = state.anim || "fadeSlide";
    let opacity = 1, ox = 0, oy = 0, scale = 1, wipe = 1;

    if (t <= 0) {
      opacity = 0; scale = mode === "grow" ? 0.6 : 1;
      ox = mode === "fadeSlide" || mode === "wipe" ? (state.side === "right" ? 40 : -40) : 0;
      wipe = 0;
    } else if (t < din) {
      const p = easeOutCubic(t / din);
      opacity = mode === "fade" || mode === "fadeSlide" || mode === "wipe" ? p : 1;
      if (mode === "fadeSlide") ox = (1 - p) * (state.side === "right" ? 40 : -40);
      if (mode === "grow") scale = 0.6 + 0.4 * p;
      if (mode === "wipe") wipe = p;
      if (mode === "fade") { ox = 0; scale = 1; }
    } else if (t < din + dhold) {
      opacity = 1; ox = 0; oy = 0; scale = 1; wipe = 1;
    } else if (t < total) {
      const p = easeInCubic((t - din - dhold) / dout);
      opacity = 1 - p;
      if (mode === "fadeSlide") ox = p * (state.side === "right" ? 40 : -40);
      if (mode === "grow") scale = 1 - 0.3 * p;
      if (mode === "wipe") wipe = 1 - p;
    } else {
      opacity = 0; wipe = 0;
    }
    return { opacity, ox, oy, scale, wipe, total };
  }

  function ratioSize(ratio, longSide) {
    const map = {
      "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:5": [4, 5], "2.39:1": [2.39, 1],
    };
    const [a, b] = map[ratio] || [16, 9];
    if (a >= b) return { w: longSide, h: Math.round(longSide * b / a) };
    return { w: Math.round(longSide * a / b), h: longSide };
  }

  function drawChecker(ctx, w, h, cell) {
    cell = cell || 24;
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const on = ((x / cell) + (y / cell)) % 2 === 0;
        ctx.fillStyle = on ? "#2a2a32" : "#1a1a22";
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  function drawSafeGuides(ctx, w, h) {
    const m = Math.min(w, h) * 0.05;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    ctx.strokeStyle = "rgba(201,164,106,0.25)";
    ctx.setLineDash([4, 8]);
    const m2 = Math.min(w, h) * 0.1;
    ctx.strokeRect(m2, m2, w - 2 * m2, h - 2 * m2);
    ctx.restore();
  }

  function measureBlock(ctx, state, scale) {
    const primary = state.primary || "";
    const secondary = state.secondary || "";
    const tertiary = state.tertiary || "";
    const s = scale;
    const fs1 = Math.round(42 * s);
    const fs2 = Math.round(24 * s);
    const fs3 = Math.round(18 * s);
    ctx.font = `700 ${fs1}px ${pickFont(state, primary)}`;
    const w1 = ctx.measureText(primary).width;
    ctx.font = `600 ${fs2}px ${pickFont(state, secondary)}`;
    const w2 = ctx.measureText(secondary).width;
    ctx.font = `400 ${fs3}px ${pickFont(state, tertiary)}`;
    const w3 = tertiary ? ctx.measureText(tertiary).width : 0;
    const lines = 1 + (secondary ? 1 : 0) + (tertiary ? 1 : 0);
    const textH = fs1 + (secondary ? fs2 + 8 * s : 0) + (tertiary ? fs3 + 6 * s : 0);
    return { w1, w2, w3, fs1, fs2, fs3, textH, lines, maxW: Math.max(w1, w2, w3) };
  }

  function drawTexts(ctx, state, x, y, align, scale, theme) {
    const primary = state.primary || "";
    const secondary = state.secondary || "";
    const tertiary = state.tertiary || "";
    const m = measureBlock(ctx, state, scale);
    const rtl = hasArabic(primary + secondary + tertiary);
    ctx.textAlign = align === "right" ? "right" : align === "center" ? "center" : (rtl ? "right" : "left");
    ctx.direction = rtl ? "rtl" : "ltr";
    let cy = y;
    ctx.fillStyle = theme.primary;
    ctx.font = `700 ${m.fs1}px ${pickFont(state, primary)}`;
    ctx.fillText(primary, x, cy);
    cy += m.fs1 * 0.35 + m.fs2 * 0.85 + 4 * scale;
    if (secondary) {
      ctx.fillStyle = theme.secondary;
      ctx.font = `600 ${m.fs2}px ${pickFont(state, secondary)}`;
      ctx.fillText(secondary, x, cy);
      cy += m.fs2 * 0.35 + (tertiary ? m.fs3 * 0.9 + 4 * scale : 0);
    }
    if (tertiary) {
      ctx.fillStyle = theme.tertiary;
      ctx.font = `400 ${m.fs3}px ${pickFont(state, tertiary)}`;
      ctx.fillText(tertiary, x, cy);
    }
    return m;
  }

  function logoSize(state, scale) {
    if (!state.logoImg) return 0;
    return Math.round(56 * scale);
  }

  function drawLogo(ctx, state, x, y, size) {
    if (!state.logoImg || !size) return;
    ctx.save();
    const r = 6;
    roundRect(ctx, x, y, size, size, r);
    ctx.clip();
    ctx.drawImage(state.logoImg, x, y, size, size);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function bannerOrigin(state, w, h, pad) {
    const side = state.side || "left";
    let y;
    if (state.position === "top") y = pad;
    else if (state.position === "lower") y = h - pad - Math.round(h * 0.22);
    else y = h - pad - Math.round(h * 0.14);
    const x = side === "right" ? w - pad : pad;
    return { x, y, side };
  }

  /** Layout: left accent bar + text plate */
  function layoutBar(ctx, state, w, h, theme, af, scale) {
    const pad = Math.round(Math.min(w, h) * 0.06);
    const origin = bannerOrigin(state, w, h, pad);
    const m = measureBlock(ctx, state, scale);
    const ls = logoSize(state, scale);
    const gap = 14 * scale;
    const barW = Math.round(6 * scale);
    const padX = 18 * scale;
    const padY = 14 * scale;
    const contentW = m.maxW + (ls ? ls + gap : 0);
    const boxW = contentW + padX * 2 + barW;
    const boxH = Math.max(m.textH, ls) + padY * 2;

    let bx = origin.side === "right" ? origin.x - boxW : origin.x;
    let by = origin.y;
    bx += af.ox * scale;
    by += af.oy * scale;

    ctx.save();
    ctx.globalAlpha = af.opacity;
    const cx = bx + boxW / 2, cy = by + boxH / 2;
    ctx.translate(cx, cy);
    ctx.scale(af.scale, af.scale);
    ctx.translate(-cx, -cy);

    if (af.wipe < 1) {
      ctx.beginPath();
      if (origin.side === "right") ctx.rect(bx + boxW * (1 - af.wipe), by, boxW * af.wipe, boxH);
      else ctx.rect(bx, by, boxW * af.wipe, boxH);
      ctx.clip();
    }

    ctx.fillStyle = theme.plate;
    roundRect(ctx, bx, by, boxW, boxH, 4 * scale);
    ctx.fill();

    const barX = origin.side === "right" ? bx + boxW - barW : bx;
    ctx.fillStyle = theme.bar;
    ctx.fillRect(barX, by, barW, boxH);

    let tx = origin.side === "right" ? bx + boxW - barW - padX : bx + barW + padX;
    let ty = by + padY + m.fs1 * 0.85;
    const align = origin.side === "right" ? "right" : "left";

    if (ls && state.logoImg) {
      const lx = origin.side === "right" ? bx + padX : bx + barW + padX;
      drawLogo(ctx, state, lx, by + (boxH - ls) / 2, ls);
      if (origin.side === "left") tx += ls + gap;
      else tx = bx + boxW - barW - padX;
    }

    drawTexts(ctx, state, tx, ty, align, scale, theme);
    ctx.restore();
  }

  /** Layout: bottom frosted glass strip */
  function layoutGlass(ctx, state, w, h, theme, af, scale) {
    const stripH = Math.round(Math.max(90, h * 0.16) * (0.85 + 0.15));
    const m = measureBlock(ctx, state, scale);
    const ls = logoSize(state, scale);
    let by = state.position === "top" ? 0 : h - stripH;
    by += af.oy * scale;

    ctx.save();
    ctx.globalAlpha = af.opacity;

    if (af.wipe < 1) {
      ctx.beginPath();
      ctx.rect(0, by, w * af.wipe, stripH);
      ctx.clip();
    }

    ctx.fillStyle = theme.glass;
    ctx.fillRect(0, by + af.ox * 0, w, stripH);
    // top accent line
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = af.opacity * 0.85;
    ctx.fillRect(0, by, w, Math.max(2, 3 * scale));
    ctx.globalAlpha = af.opacity;

    const pad = Math.round(w * 0.05) + af.ox * scale;
    const side = state.side || "left";
    let tx = side === "right" ? w - pad : pad;
    let ty = by + stripH / 2 - m.textH / 2 + m.fs1 * 0.75;
    if (ls && state.logoImg) {
      const lx = side === "right" ? w - pad - ls : pad;
      drawLogo(ctx, state, lx, by + (stripH - ls) / 2, ls);
      if (side === "left") tx = pad + ls + 16 * scale;
      else tx = w - pad - ls - 16 * scale;
    }
    drawTexts(ctx, state, tx, ty, side === "right" ? "right" : "left", scale, theme);
    ctx.restore();
  }

  /** Layout: compact corner badge */
  function layoutBadge(ctx, state, w, h, theme, af, scale) {
    const pad = Math.round(Math.min(w, h) * 0.05);
    const m = measureBlock(ctx, state, scale * 0.92);
    const ls = logoSize(state, scale * 0.9);
    const padX = 16 * scale, padY = 12 * scale;
    const gap = 10 * scale;
    const boxW = m.maxW + padX * 2 + (ls ? ls + gap : 0);
    const boxH = Math.max(m.textH, ls || 0) + padY * 2;
    const origin = bannerOrigin(state, w, h, pad);
    let bx = origin.side === "right" ? origin.x - boxW : origin.x;
    let by = origin.y;
    bx += af.ox * scale;

    ctx.save();
    ctx.globalAlpha = af.opacity;
    const cx = bx + boxW / 2, cy = by + boxH / 2;
    ctx.translate(cx, cy);
    ctx.scale(af.scale, af.scale);
    ctx.translate(-cx, -cy);

    // soft shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, bx + 3, by + 4, boxW, boxH, 14 * scale);
    ctx.fill();

    ctx.fillStyle = theme.plate;
    roundRect(ctx, bx, by, boxW, boxH, 14 * scale);
    ctx.fill();
    ctx.strokeStyle = theme.stroke;
    ctx.lineWidth = 1.5 * scale;
    roundRect(ctx, bx, by, boxW, boxH, 14 * scale);
    ctx.stroke();

    // small accent pill at top
    ctx.fillStyle = theme.accent;
    const pillW = Math.min(boxW * 0.35, 48 * scale);
    roundRect(ctx, bx + (boxW - pillW) / 2, by - 3 * scale, pillW, 6 * scale, 3 * scale);
    ctx.fill();

    let tx = origin.side === "right" ? bx + boxW - padX : bx + padX;
    let ty = by + padY + m.fs1 * 0.85;
    if (ls && state.logoImg) {
      const lx = origin.side === "right" ? bx + padX : bx + padX;
      drawLogo(ctx, state, lx, by + (boxH - ls) / 2, ls);
      if (origin.side === "left") tx = bx + padX + ls + gap;
    }
    drawTexts(ctx, state, tx, ty, origin.side === "right" ? "right" : "left", scale * 0.92, theme);
    ctx.restore();
  }

  /** Layout: split two-tone plate */
  function layoutSplit(ctx, state, w, h, theme, af, scale) {
    const pad = Math.round(Math.min(w, h) * 0.06);
    const m = measureBlock(ctx, state, scale);
    const ls = logoSize(state, scale);
    const padX = 16 * scale, padY = 12 * scale;
    const leftW = Math.max(ls ? ls + padX * 2 : 50 * scale, 56 * scale);
    const rightW = m.maxW + padX * 2;
    const boxW = leftW + rightW;
    const boxH = Math.max(m.textH, ls || 40 * scale) + padY * 2;
    const origin = bannerOrigin(state, w, h, pad);
    let bx = origin.side === "right" ? origin.x - boxW : origin.x;
    let by = origin.y;
    bx += af.ox * scale;

    ctx.save();
    ctx.globalAlpha = af.opacity;
    const cx = bx + boxW / 2, cy = by + boxH / 2;
    ctx.translate(cx, cy);
    ctx.scale(af.scale, af.scale);
    ctx.translate(-cx, -cy);

    if (af.wipe < 1) {
      ctx.beginPath();
      ctx.rect(bx, by, boxW * af.wipe, boxH);
      ctx.clip();
    }

    // left tone
    ctx.fillStyle = theme.bar;
    roundRect(ctx, bx, by, leftW + 8 * scale, boxH, 6 * scale);
    ctx.fill();
    ctx.fillStyle = theme.plate2;
    ctx.fillRect(bx + leftW, by, rightW, boxH);
    // clip right side rounded
    ctx.fillStyle = theme.plate2;
    roundRect(ctx, bx + leftW - 8 * scale, by, rightW + 8 * scale, boxH, 6 * scale);
    ctx.fill();

    if (ls && state.logoImg) {
      drawLogo(ctx, state, bx + (leftW - ls) / 2, by + (boxH - ls) / 2, ls);
    } else {
      // decorative mark
      ctx.fillStyle = theme.plate;
      ctx.beginPath();
      ctx.arc(bx + leftW / 2, by + boxH / 2, 10 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    const tx = bx + leftW + padX;
    const ty = by + padY + m.fs1 * 0.85;
    // for mono theme, text on light plate2 may need dark colors — handled via theme.primary
    const textTheme = theme.id === "mono"
      ? { ...theme, primary: "#111", secondary: "#333", tertiary: "#555" }
      : theme;
    drawTexts(ctx, state, tx, ty, "left", scale, textTheme);
    ctx.restore();
  }

  function drawFrame(ctx, state, opts) {
    opts = opts || {};
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const theme = BA_THEMES[state.theme] || BA_THEMES.cinematic;
    const t = opts.time != null ? opts.time : (state.durIn + state.durHold * 0.5);
    const af = opts.forceHold ? { opacity: 1, ox: 0, oy: 0, scale: 1, wipe: 1, total: 1 } : animFactors(state, t);
    const scale = Math.min(w, h) / 720;
    const transparent = !!opts.transparent;

    ctx.clearRect(0, 0, w, h);

    if (!transparent) {
      if (state.bg === "checker") drawChecker(ctx, w, h, Math.round(20 * scale));
      else if (state.bg === "green") { ctx.fillStyle = "#00b140"; ctx.fillRect(0, 0, w, h); }
      else if (state.bg === "image" && state.bgImg) {
        const img = state.bgImg;
        const ir = img.width / img.height, cr = w / h;
        let dw, dh, dx, dy;
        if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
        else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
        ctx.drawImage(img, dx, dy, dw, dh);
      } else { ctx.fillStyle = "#121218"; ctx.fillRect(0, 0, w, h); }
    }

    if (state.safe && !transparent && !opts.noGuides) drawSafeGuides(ctx, w, h);

    const layout = state.layout || "bar";
    if (layout === "glass") layoutGlass(ctx, state, w, h, theme, af, scale);
    else if (layout === "badge") layoutBadge(ctx, state, w, h, theme, af, scale);
    else if (layout === "split") layoutSplit(ctx, state, w, h, theme, af, scale);
    else layoutBar(ctx, state, w, h, theme, af, scale);

    return af;
  }

  /** Build SVG of hold pose (approximate vector recreation). */
  function toSVG(state, w, h) {
    const theme = BA_THEMES[state.theme] || BA_THEMES.cinematic;
    const scale = Math.min(w, h) / 720;
    const primary = escapeXml(state.primary || "");
    const secondary = escapeXml(state.secondary || "");
    const tertiary = escapeXml(state.tertiary || "");
    const font = (state.font || "Inter").replace(/"/g, "");
    const pad = Math.round(Math.min(w, h) * 0.06);
    const fs1 = Math.round(42 * scale);
    const fs2 = Math.round(24 * scale);
    const fs3 = Math.round(18 * scale);
    const approxW = Math.max(primary.length, secondary.length, tertiary.length) * fs1 * 0.52 + 80 * scale;
    const boxH = Math.round((fs1 + (secondary ? fs2 + 8 : 0) + (tertiary ? fs3 + 6 : 0) + 28 * scale));
    const side = state.side || "left";
    let by = state.position === "top" ? pad : h - pad - Math.round(h * 0.14);
    let bx = side === "right" ? w - pad - approxW : pad;
    const barW = Math.round(6 * scale);
    const rtl = hasArabic((state.primary || "") + (state.secondary || ""));
    const anchor = side === "right" || rtl ? "end" : "start";
    const tx = side === "right" ? bx + approxW - barW - 18 * scale : bx + barW + 18 * scale;

    let texts = `<text x="${tx}" y="${by + 18 * scale + fs1 * 0.85}" fill="${theme.primary}" font-family="${font}, sans-serif" font-size="${fs1}" font-weight="700" text-anchor="${anchor}">${primary}</text>`;
    let cy = by + 18 * scale + fs1 * 0.85 + fs2 * 0.95;
    if (secondary) {
      texts += `<text x="${tx}" y="${cy}" fill="${theme.secondary}" font-family="${font}, sans-serif" font-size="${fs2}" font-weight="600" text-anchor="${anchor}">${secondary}</text>`;
      cy += fs3 * 1.1;
    }
    if (tertiary) {
      texts += `<text x="${tx}" y="${cy}" fill="${theme.tertiary}" font-family="${font}, sans-serif" font-size="${fs3}" text-anchor="${anchor}">${tertiary}</text>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="${bx}" y="${by}" width="${approxW}" height="${boxH}" rx="4" fill="${theme.plate}"/>
  <rect x="${side === "right" ? bx + approxW - barW : bx}" y="${by}" width="${barW}" height="${boxH}" fill="${theme.bar}"/>
  ${texts}
</svg>`;
  }

  function escapeXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  global.BA_render = {
    drawFrame, animFactors, ratioSize, toSVG, hasArabic, pickFont, measureBlock,
  };
})(window);
