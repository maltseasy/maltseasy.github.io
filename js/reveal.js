/* reveal.js: headings materialize from grain, a nod to guided discrete diffusion.
   Replaces the old CRT scanline + glitch. Each heading is revealed ONCE (on load or
   when scrolled into view) by a real threshold-dissolve of fine noise; the actual DOM
   text stays in place for accessibility and is only hidden during the ~0.8s reveal.
   Reduced-motion + no-canvas → text is left crisp, untouched. */
(function () {
  "use strict";

  /* ═══ TWEAK HERE: every knob for the denoise reveal ═══════════════════════ */
  const CFG = {
    selector: '.mast .who h1, .kicker h2', // headings that denoise in (single-line only)
    duration: 1000,    // ms of one reveal
    blurStart: 5,      // px blur at t=0 (eases to 0); bigger = softer emergence
    grainPx: 3,        // noise cell size in CSS px; bigger = chunkier grain
    edge: 0.16,        // soft threshold band (0..0.5); bigger = smoother dissolve
    stagger: 95,       // ms between reveals that fire in the same batch
    threshold: 0.55,   // fraction of the heading visible before it triggers
  };
  /* ═════════════════════════════════════════════════════════════════════════ */

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = [].slice.call(document.querySelectorAll(CFG.selector));
  if (reduce || !els.length || !window.IntersectionObserver) return;
  if (!document.createElement('canvas').getContext) return;

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const clamp01 = a => (a < 0 ? 0 : a > 1 ? 1 : a);

  function reveal(el, delay) {
    if (el._revealed) return;
    const rect = el.getBoundingClientRect();
    const w = Math.ceil(rect.width), h = Math.ceil(rect.height);
    if (w < 2 || h < 2) {                             // not laid out yet; retry, don't burn the one shot
      requestAnimationFrame(function () { reveal(el, delay); }); return;
    }
    el._revealed = true;

    const cs = getComputedStyle(el);
    let text = el.textContent;
    if (cs.textTransform === 'uppercase') text = text.toUpperCase();
    const fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || fs * 1.2;

    // crisp text rendered once to an offscreen buffer
    const off = document.createElement('canvas'); off.width = w * DPR; off.height = h * DPR;
    const oc = off.getContext('2d'); oc.scale(DPR, DPR);
    // font-variant must be carried over or small-caps headings redraw as lowercase
    // at the wrong width, which visibly jumps when the DOM text takes back over
    oc.font = `${cs.fontStyle} ${cs.fontVariantCaps} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    try { if ('letterSpacing' in oc) oc.letterSpacing = cs.letterSpacing; } catch (e) {}
    oc.textBaseline = 'top'; oc.fillStyle = cs.color;
    oc.fillText(text, 0, Math.max(0, (lh - fs) / 2) - fs * 0.08);

    // static chunky noise map (low-res cells, looked up per pixel)
    const cw = Math.max(1, Math.ceil(w / CFG.grainPx)), ch = Math.max(1, Math.ceil(h / CFG.grainPx));
    const cells = new Float32Array(cw * ch);
    for (let i = 0; i < cells.length; i++) cells[i] = Math.random();

    // overlay canvas placed over the heading (document-absolute so it scrolls with the page)
    const cv = document.createElement('canvas'); cv.width = w * DPR; cv.height = h * DPR;
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;left:' + (rect.left + scrollX) + 'px;top:' +
      (rect.top + scrollY) + 'px;width:' + w + 'px;height:' + h + 'px;pointer-events:none;z-index:5;';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d'); ctx.scale(DPR, DPR);

    const W = w * DPR, H = h * DPR, sx = cw / W, sy = ch / H, edge = CFG.edge;
    const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
    const mctx = mask.getContext('2d');
    const mimg = mctx.createImageData(W, H), mdata = mimg.data;

    el.style.visibility = 'hidden';                   // hand the pixels to the canvas

    let start = null;
    function frame(now) {
      if (start === null) start = now;
      const p = clamp01((now - start) / CFG.duration), e = easeOut(p);

      // mask alpha = soft threshold of the grain against progress e
      for (let y = 0; y < H; y++) {
        const row = (y * sy) | 0;
        for (let x = 0; x < W; x++) {
          const nv = cells[row * cw + ((x * sx) | 0)];
          mdata[(y * W + x) * 4 + 3] = (clamp01((e - nv) / edge + 0.5) * 255) | 0;
        }
      }
      mctx.putImageData(mimg, 0, 0);

      ctx.clearRect(0, 0, w, h);
      ctx.filter = 'blur(' + ((1 - e) * CFG.blurStart).toFixed(2) + 'px)';
      ctx.drawImage(off, 0, 0, w, h);                 // blurred crisp text
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0, w, h);                // keep only where grain has resolved
      ctx.globalCompositeOperation = 'source-over';

      if (p < 1) requestAnimationFrame(frame);
      else { el.style.visibility = ''; cv.remove(); } // real DOM text takes over, perfectly placed
    }
    setTimeout(function () { requestAnimationFrame(frame); }, delay || 0);
  }

  // fire once per heading on entering view; stagger reveals that arrive together
  let batch = 0, lastT = -1e9;
  const io = new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const now = performance.now();
      if (now - lastT > 350) batch = 0;               // new scroll batch → reset the stagger
      reveal(en.target, batch * CFG.stagger);
      batch++; lastT = now;
    });
  }, { threshold: CFG.threshold });
  els.forEach(function (el) { io.observe(el); });
})();
