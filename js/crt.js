/* Analogue CRT overlay — real-time canvas render (organic, non-repeating). */
(function () {
  "use strict";

  var canvas = document.querySelector("canvas.crt");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var W = 0,
    H = 0,
    vignette = null;
  var noise = document.createElement("canvas");
  var nctx = noise.getContext("2d");
  var heads = Array.prototype.slice.call(
    document.querySelectorAll("header h1, header > p, section h1, pre")
  );

  // text-decode (scramble -> resolve) effect
  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*<>/=+?";
  for (var hi = 0; hi < heads.length; hi++) heads[hi]._text = heads[hi].textContent;

  function startDecode(el, dur) {
    el._decoding = true;
    el._dstart = performance.now();
    el._ddur = dur;
  }
  function stepDecode(el, now) {
    var txt = el._text, p = (now - el._dstart) / el._ddur;
    if (p >= 1) { el.textContent = txt; el._decoding = false; return; }
    var e = 1 - Math.pow(1 - p, 3); // ease-out: locks in smoothly
    var lock = Math.floor(e * txt.length), out = "", i, c;
    for (i = 0; i < txt.length; i++) {
      c = txt.charAt(i);
      // keep whitespace (preserves the ASCII art's shape) and already-locked chars
      out += (c === " " || c === "\n" || c === "\t" || i < lock)
        ? c
        : GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
    }
    el.textContent = out;
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    // half-resolution noise buffer, scaled up for chunky CRT grain
    noise.width = Math.max(1, Math.ceil(W / 2));
    noise.height = Math.max(1, Math.ceil(H / 2));
    var r = ctx.createRadialGradient(
      W / 2, H * 0.42, Math.min(W, H) * 0.30,
      W / 2, H / 2, Math.max(W, H) * 0.78
    );
    r.addColorStop(0, "rgba(0,0,0,0)");
    r.addColorStop(1, "rgba(6,10,30,0.15)");
    vignette = r;
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  function paintNoise(alpha) {
    var w = noise.width, h = noise.height;
    var img = nctx.createImageData(w, h);
    var d = img.data, n = d.length, i, v;
    for (i = 0; i < n; i += 4) {
      v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = alpha;
    }
    nctx.putImageData(img, 0, 0);
  }

  function scanlines(offset) {
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = "#000";
    for (var y = offset; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;
  }

  // organic, JS-driven flicker + varied glitch bursts on the headings
  function reset(el) {
    el.style.opacity = "";
    el.style.transform = "";
    el.style.textShadow = "";
    el.style.clipPath = "";
    el._until = 0;
  }
  function textFX(now) {
    for (var i = 0; i < heads.length; i++) {
      var el = heads[i];
      if (el._decoding) { stepDecode(el, now); continue; }
      if (el._until && now < el._until) continue; // mid-effect, leave it
      if (el._until) reset(el);

      var r = Math.random();
      if (r < 0.009) {
        // rare, gentle brightness dip
        el.style.opacity = (0.6 + Math.random() * 0.3).toFixed(2);
        el._until = now + 40 + Math.random() * 70;
      } else if (r < 0.015) {
        // rare, soft chromatic shimmer
        var a = (1 + Math.random() * 1.3).toFixed(1);
        el.style.textShadow =
          "-" + a + "px 0 rgba(255,60,90,.4), " + a + "px 0 rgba(40,200,255,.4)";
        el.style.transform = "translateX(" + (Math.random() * 1.6 - 0.8).toFixed(1) + "px)";
        el._until = now + 45 + Math.random() * 80;
      }
    }
    // rarely re-decode a random heading
    if (Math.random() < 0.0022) {
      var d = heads[(Math.random() * heads.length) | 0];
      if (d && !d._decoding) { reset(d); startDecode(d, 360 + Math.random() * 320); }
    }
  }

  // accessibility / static fallback
  if (reduce) {
    ctx.clearRect(0, 0, W, H);
    paintNoise(9);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(noise, 0, 0, W, H);
    scanlines(0);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  var bright = 1, last = 0, t = 0, hidden = false;
  document.addEventListener("visibilitychange", function () {
    hidden = document.hidden;
  });

  function frame(now) {
    requestAnimationFrame(frame);
    if (hidden) return;
    if (now - last < 32) return; // ~30fps cap
    last = now;
    t++;

    ctx.clearRect(0, 0, W, H);

    // organic static (regenerated every frame)
    paintNoise(8);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(noise, 0, 0, W, H);

    // scanlines with a subtle roll
    scanlines(t % 3);

    // refresh band sweeping down the screen
    var bandY = ((t * 5) % (H + 260)) - 130;
    var g = ctx.createLinearGradient(0, bandY, 0, bandY + 200);
    g.addColorStop(0, "rgba(130,165,255,0)");
    g.addColorStop(0.5, "rgba(160,190,255,0.028)");
    g.addColorStop(1, "rgba(130,165,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, bandY, W, 200);

    // organic brightness flicker: random walk + occasional dips
    bright += (Math.random() - 0.5) * 0.03;
    if (Math.random() < 0.012) bright -= 0.07;
    if (bright > 1) bright = 1;
    if (bright < 0.88) bright = 0.88;
    if (bright < 1) {
      ctx.fillStyle = "rgba(0,0,0," + ((1 - bright) * 0.35).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }

    // a single faint drift line, rarely
    if (Math.random() < 0.013) {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(0, Math.random() * H, W, 1);
    }

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    textFX(now);
  }

  // decode every heading on load, staggered
  for (var s = 0; s < heads.length; s++) {
    (function (el, k) {
      setTimeout(function () { startDecode(el, 620); }, 150 + k * 120);
    })(heads[s], s);
  }
  // re-decode a heading when hovered (subtle, interactive)
  for (var hv = 0; hv < heads.length; hv++) {
    heads[hv].addEventListener("mouseenter", function () {
      if (!this._decoding) { reset(this); startDecode(this, 360); }
    });
  }
  requestAnimationFrame(frame);
})();
