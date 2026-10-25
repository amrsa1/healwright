/*
 * Healwright docs site behaviour (home and guide).
 *
 * The hero stage acts out one heal: a redesign moves the button, the thread
 * from selector to element snaps, the page is scanned, the best match is
 * verified, and the thread is stitched back on. It is the only motion that
 * runs on its own; everything else responds to scrolling or input.
 */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

  const fontsReady = Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);

  /* ---------- Nav ---------- */

  const nav = $(".nav");
  const onScroll = () => nav && nav.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Copy install command ---------- */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  $$("[data-copy]").forEach((btn) => {
    const state = $(".install-state", btn);
    btn.addEventListener("click", async () => {
      await copyText(btn.dataset.copy);
      btn.classList.add("is-copied");
      if (state) state.textContent = "Copied";
      clearTimeout(btn._reset);
      btn._reset = setTimeout(() => {
        btn.classList.remove("is-copied");
        if (state) state.textContent = "Copy";
      }, 1800);
    });
  });

  $$(".codeblock-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const block = btn.closest(".codeblock");
      const code = $$("pre code", block).find((c) => !c.closest("[hidden]"));
      if (!code) return;
      await copyText(code.textContent);
      btn.classList.add("is-copied");
      btn.textContent = "Copied";
      clearTimeout(btn._reset);
      btn._reset = setTimeout(() => {
        btn.classList.remove("is-copied");
        btn.textContent = "Copy";
      }, 1800);
    });
  });

  /* ---------- Headline: cracked on load and on hover, then healed ---------- */

  const title = $("#title");
  let titleBusy = false;

  // Break the headline, hold it broken for a beat, then stitch it back.
  function crackTitle(ready = Promise.resolve()) {
    titleBusy = true;
    title.classList.add("is-cracked");
    return ready.then(() => new Promise((resolve) => {
      setTimeout(() => {
        title.classList.add("is-healing");
        setTimeout(() => {
          title.classList.remove("is-cracked", "is-healing");
          titleBusy = false;
          resolve();
        }, 1300);
      }, 450);
    }));
  }

  const autoplayTitle = title && !reduce && title.dataset.crack !== "hover";
  const titleHealed = autoplayTitle ? crackTitle(fontsReady) : Promise.resolve();

  if (title && !reduce) {
    title.addEventListener("pointerenter", () => {
      if (!titleBusy) crackTitle();
    });
  }

  /* ---------- Hero stage ---------- */

  const stage = $("#stage");
  if (stage) initStage(stage);

  function initStage(stage) {
    const NS = "http://www.w3.org/2000/svg";
    const scene = $(".scene", stage);
    const svg = $("#thread");
    const main = $("#th-main");
    const halfA = $("#th-a");
    const halfB = $("#th-b");
    const stitches = $("#th-stitches");
    const dotStart = $("#th-start");
    const dotEnd = $("#th-end");
    const token = $("#tok");
    const diag = $("#diag");
    const lens = $("#lens");
    const lensText = $("#lens-text");
    const cacheCount = $("#cache-count");
    const app = $("#app");
    const target = $("#target");
    const targetLabel = $("#target-label");
    const attr = $("#attr");
    const deploy = $("#deploy");
    const confirmEl = $("#confirm");
    const cands = $("#cands");
    const scanline = $("#scanline");
    const verifyEl = $("#verify");
    const termBody = $("#term-body");
    const phases = $$(".phase", stage);
    const pauseBtn = $("#pause");
    const nextBtn = $("#redesign");

    const ORDER = ["run", "break", "scan", "verify", "heal", "cache"];
    const BASE = { label: "Place order", attr: 'id="buy-now"' };
    // Each loop ships one redesign. Strategies, scores and log lines follow
    // what healwright actually prints for a heal of this kind.
    const VARIANTS = [
      {
        label: "Place order",
        attr: 'class="cta-primary"',
        short: "getByRole('button', { name: 'Place order' })",
        full: 'getByRole("button", { name: "Place order" })',
        conf: 0.96,
        scores: { email: 0.01, coupon: 0.07, cont: 0.03 },
        tokens: [1180, 96],
        chars: 412,
        time: "2.8s",
        reject: null,
      },
      {
        label: "Complete purchase",
        attr: 'data-testid="checkout-submit"',
        short: "getByTestId('checkout-submit')",
        full: 'getByTestId("checkout-submit")',
        conf: 0.91,
        scores: { email: 0.01, coupon: 0.06, cont: 0.04 },
        tokens: [1204, 88],
        chars: 388,
        time: "2.6s",
        reject: null,
      },
      {
        label: "Pay $70.00",
        attr: 'class="pay-now"',
        short: "getByRole('button', { name: 'Pay $70.00' })",
        full: 'getByRole("button", { name: "Pay $70.00" })',
        conf: 0.88,
        scores: { email: 0.02, coupon: 0.09, cont: 0.05 },
        tokens: [1166, 131],
        chars: 506,
        time: "3.1s",
        reject: { locator: "getByText('Pay')", why: "2 matches", log: "[text] skipped: count=2" },
      },
    ];

    let gen = 0;
    let userPaused = false;
    let offscreen = false;
    let current = 0;
    let threadMode = "connected";
    let cacheEntries = 3;
    const paused = () => userPaused || offscreen;

    /* Pausable sleep on the animation clock: stops with the tab, the
       viewport and the Pause button, and resolves false once cancelled. */
    function sleep(ms, g) {
      return new Promise((resolve) => {
        let left = ms;
        let last = performance.now();
        const tick = (now) => {
          if (g !== gen) return resolve(false);
          if (!paused()) left -= now - last;
          last = now;
          if (left <= 0) return resolve(true);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }

    /* ---- Geometry ---- */

    function rect(el) {
      const s = scene.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, sw: s.width };
    }

    const pt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

    // From the end of the selector token to the element. Side by side it's an
    // S-curve across the gap; stacked, it runs out to the right gutter, down,
    // and back in, so it never cuts across the code.
    function route() {
      const a = rect(token);
      const b = rect(target);
      const ed = rect($(".editor", scene));
      const p0 = [a.x + a.w + 10, a.y + a.h / 2];
      if (b.x - (ed.x + ed.w) > 24) {
        const p3 = [b.x - 6, b.y + b.h / 2];
        const d = `M${pt(p0)} C${pt([ed.x + ed.w, p0[1]])} ${pt([b.x - 30, p3[1]])} ${pt(p3)}`;
        return { d, p0, p3 };
      }
      const p3 = [b.x + b.w + 6, b.y + b.h / 2];
      const gx = a.sw - 13;
      const dir = p3[1] >= p0[1] ? 1 : -1;
      const r = Math.min(14, Math.abs(p3[1] - p0[1]) / 2);
      const d = [
        `M${pt(p0)}`,
        `H${(gx - r).toFixed(1)}`,
        `Q${pt([gx, p0[1]])} ${pt([gx, p0[1] + r * dir])}`,
        `V${(p3[1] - r * dir).toFixed(1)}`,
        `Q${pt([gx, p3[1]])} ${pt([gx - r, p3[1]])}`,
        `H${p3[0].toFixed(1)}`,
      ].join(" ");
      return { d, p0, p3 };
    }

    function placeDots(p0, p3) {
      dotStart.setAttribute("cx", p0[0]);
      dotStart.setAttribute("cy", p0[1]);
      dotEnd.setAttribute("cx", p3[0]);
      dotEnd.setAttribute("cy", p3[1]);
    }

    function resetPath(el) {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.strokeDasharray = "";
      el.style.strokeDashoffset = "";
    }

    function drawThread(mode, { animate = false } = {}) {
      threadMode = mode;
      svg.dataset.mode = mode;
      [main, halfA, halfB].forEach(resetPath);
      halfA.style.opacity = 0;
      halfB.style.opacity = 0;
      stitches.textContent = "";
      const r = route();
      main.setAttribute("d", r.d);
      main.style.opacity = 1;
      placeDots(r.p0, r.p3);
      if (mode !== "healed") return;
      const len = main.getTotalLength();
      if (animate) {
        main.style.strokeDasharray = `${len} ${len}`;
        main.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
          duration: 900,
          easing: "cubic-bezier(.6,0,.2,1)",
          fill: "forwards",
        });
      }
      sew(len, animate ? 900 : 0);
    }

    // Suture marks along the healed thread, laid down as it is drawn.
    function sew(len, dur) {
      stitches.classList.toggle("is-static", !dur);
      const gap = 15;
      const size = 4.5;
      for (let s = gap; s < len - gap / 2; s += gap) {
        const p = main.getPointAtLength(s);
        const q = main.getPointAtLength(Math.min(len, s + 1));
        let tx = q.x - p.x;
        let ty = q.y - p.y;
        const m = Math.hypot(tx, ty) || 1;
        tx /= m;
        ty /= m;
        const ax = -ty * 0.87 + tx * 0.5;
        const ay = tx * 0.87 + ty * 0.5;
        const line = document.createElementNS(NS, "line");
        line.setAttribute("x1", (p.x - ax * size).toFixed(1));
        line.setAttribute("y1", (p.y - ay * size).toFixed(1));
        line.setAttribute("x2", (p.x + ax * size).toFixed(1));
        line.setAttribute("y2", (p.y + ay * size).toFixed(1));
        line.style.setProperty("--d", `${Math.round((s / len) * dur)}ms`);
        stitches.appendChild(line);
      }
    }

    // The selector still points where the button used to be; then it snaps,
    // each half recoiling toward its own end.
    function tear() {
      threadMode = "torn";
      svg.dataset.mode = "torn";
      const d = main.getAttribute("d");
      if (!d) return;
      const len = main.getTotalLength();
      const h = len / 2;
      main.style.opacity = 0;
      const opts = { duration: 650, easing: "cubic-bezier(.3,1.2,.5,1)", fill: "forwards" };
      [halfA, halfB].forEach((el) => {
        resetPath(el);
        el.setAttribute("d", d);
        el.style.opacity = 1;
      });
      halfA.animate([{ strokeDasharray: `${h} ${len}` }, { strokeDasharray: `${len * 0.07} ${len}` }], opts);
      halfB.animate([{ strokeDasharray: `0 ${h} ${h} ${len}` }, { strokeDasharray: `0 ${len * 0.93} ${len * 0.07} ${len}` }], opts);
    }

    /* ---- The app under test ---- */

    function flipTo(variantIndex, label) {
      const els = $$("[data-el]", app);
      const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
      app.dataset.variant = String(variantIndex);
      targetLabel.textContent = label;
      els.forEach((el) => {
        const f = first.get(el);
        const l = el.getBoundingClientRect();
        const dx = f.left - l.left;
        const dy = f.top - l.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 750,
          easing: "cubic-bezier(.65,0,.25,1)",
        });
      });
    }

    function showAttr(html) {
      attr.innerHTML = html;
      const a = app.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      attr.classList.add("is-on");
      const w = attr.offsetWidth;
      let left = t.left - a.left + t.width / 2;
      left = Math.max(w / 2 + 8, Math.min(left, a.width - w / 2 - 8));
      attr.style.left = `${left}px`;
      attr.style.top = `${t.top - a.top}px`;
    }

    function ripple(el) {
      const r = document.createElement("span");
      r.className = "ripple";
      el.appendChild(r);
      r.addEventListener("animationend", () => r.remove());
      setTimeout(() => r.remove(), 1200);
    }

    function scan(v) {
      const a = app.getBoundingClientRect();
      const dur = 1500;
      cands.textContent = "";
      const picks = [
        ["email", v.scores.email],
        ["coupon", v.scores.coupon],
        ["cont", v.scores.cont],
        ["target", v.conf],
      ];
      picks.forEach(([key, score]) => {
        const host = $(`[data-el="${key}"]`, app);
        const el = host.matches("[data-hit]") ? host : $("[data-hit]", host);
        const r = el.getBoundingClientRect();
        const pad = 5;
        const box = document.createElement("div");
        box.className = "cand";
        box.dataset.key = key;
        box.style.left = `${r.left - a.left - pad}px`;
        box.style.top = `${r.top - a.top - pad}px`;
        box.style.width = `${r.width + pad * 2}px`;
        box.style.height = `${r.height + pad * 2}px`;
        box.style.setProperty("--d", `${Math.round(Math.max(0, (r.top - a.top) / a.height) * dur)}ms`);
        box.innerHTML = `<span class="cand-score">${score.toFixed(2)}</span>`;
        cands.appendChild(box);
      });
      scanline.style.setProperty("--h", `${a.height}px`);
      scanline.style.setProperty("--dur", `${dur}ms`);
      scanline.classList.remove("is-on");
      void scanline.offsetWidth;
      scanline.classList.add("is-on");
    }

    function verify(v) {
      $$(".cand", cands).forEach((c) => {
        const best = c.dataset.key === "target";
        c.classList.toggle("is-best", best);
        c.classList.toggle("is-dim", !best);
      });
      const rows = [];
      let t = 0;
      if (v.reject) {
        rows.push(`<div class="vrow vrow-no" style="--d:0ms"><i>✕</i><span>${esc(v.reject.locator)} · ${esc(v.reject.why)}</span></div>`);
        t = 700;
      }
      rows.push(`<div class="vrow vrow-pick" style="--d:${t}ms"><i>→</i><span>${esc(v.short)}</span></div>`);
      ["exactly 1 match", "visible", `confidence ${v.conf.toFixed(2)} ≥ 0.80`].forEach((text, i) => {
        rows.push(`<div class="vrow" style="--d:${t + 280 + i * 260}ms"><i class="ok">✓</i><span>${esc(text)}</span></div>`);
      });
      verifyEl.innerHTML = rows.join("");
      // Place beside the target: below it if there's room, otherwise above.
      const a = app.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      verifyEl.classList.add("is-on");
      const w = verifyEl.offsetWidth;
      const h = verifyEl.offsetHeight;
      let left = r.left - a.left + r.width / 2 - w / 2;
      left = Math.max(8, Math.min(left, a.width - w - 8));
      let top = r.bottom - a.top + 14;
      if (top + h > a.height - 8) top = r.top - a.top - h - 14;
      verifyEl.style.left = `${left}px`;
      verifyEl.style.top = `${Math.max(8, top)}px`;
    }

    /* ---- Terminal: lines in healwright's own console format ---- */

    const D = (s) => `<span class="t-dim">${esc(s)}</span>`;
    const RULE = D(`  └${"─".repeat(30)}`);
    const T = {
      run: () => [
        `${D("$")} npx playwright test`,
        `<span class="t-ok">  ✓</span> checkout.spec.ts › checkout ${D("(1.1s)")}`,
      ],
      break: () => [
        "",
        `${D("$")} npx playwright test ${D("# after the redesign")}`,
        `<span class="t-badge">✦ healwright</span>`,
        D("  │"),
        `${D("  ├─")} <span class="t-warn">⚡︎</span> ${D("CLICK")} <span class="t-hi">Place order button</span>`,
      ],
      scan: (v) => [
        `${D("  │  ")}<span class="t-scan">⬡</span> ${D("analyzing 14 elements... (filtered from 63)")}`,
        D(`  │  ↳ received ${v.chars} chars`),
      ],
      reject: (v) => [D(`  │  ↳ ${v.reject.log}`)],
      heal: (v) => [
        D("  │"),
        `${D("  ├─")} <span class="t-ok">✓</span> <span class="t-hi">Place order button</span>`,
        D(`  │  → ${v.full}`),
        `${D("  │  ↑ ")}<span class="t-scan">${v.tokens[0]}</span>${D(" input · ")}<span class="t-scan">${v.tokens[1]}</span>${D(" output · ")}<span class="t-scan">${v.tokens[0] + v.tokens[1]}</span>${D(" total tokens")}`,
        RULE,
        `<span class="t-ok">  ✓</span> checkout.spec.ts › checkout ${D(`(${v.time})`)}`,
      ],
      cache: () => [
        "",
        `${D("$")} npx playwright test ${D("# next run")}`,
        `${D("  ├─")} <span class="t-warn">⚡︎</span> ${D("CLICK")} <span class="t-hi">Place order button</span>`,
        `${D("  │  ")}<span class="t-ok">◆</span> ${D("cached: Place order button")}`,
        RULE,
        `<span class="t-ok">  ✓</span> checkout.spec.ts › checkout ${D("(1.2s) · no model call")}`,
      ],
    };

    function termLine(html) {
      const div = document.createElement("div");
      div.className = "tl";
      div.innerHTML = html || " ";
      termBody.appendChild(div);
      while (termBody.children.length > 60) termBody.firstChild.remove();
      termBody.scrollTop = termBody.scrollHeight;
    }

    async function termLines(lines, g, gap) {
      for (const line of lines) {
        if (g !== gen) return false;
        termLine(line);
        if (gap && !(await sleep(gap, g))) return false;
      }
      return true;
    }

    /* ---- Scene state ---- */

    function setPhase(name) {
      const i = ORDER.indexOf(name);
      phases.forEach((p, j) => {
        p.classList.toggle("is-current", j === i);
        p.classList.toggle("is-done", i < 0 ? false : j < i);
        if (j === i) p.setAttribute("aria-current", "step");
        else p.removeAttribute("aria-current");
      });
    }

    const setMood = (m) => { stage.dataset.mood = m; };

    function resetScene() {
      stage.getAnimations({ subtree: true }).forEach((a) => {
        if (a instanceof CSSTransition) return;
        a.cancel();
      });
      app.dataset.variant = "0";
      targetLabel.textContent = BASE.label;
      deploy.classList.remove("is-on");
      confirmEl.classList.remove("is-on");
      token.classList.remove("is-broken", "is-healed");
      diag.classList.remove("is-on");
      lens.classList.remove("is-on");
      verifyEl.classList.remove("is-on");
      scanline.classList.remove("is-on");
      cands.textContent = "";
      cacheCount.classList.remove("is-bumped");
      cacheCount.textContent = `${cacheEntries} entries`;
      termBody.textContent = "";
      setMood("idle");
      setPhase(null);
      drawThread("connected");
      showAttr(esc(BASE.attr));
    }

    async function loop(start, skipRun) {
      const g = ++gen;
      let vi = start;
      let first = true;
      while (g === gen) {
        const v = VARIANTS[vi];
        current = vi;
        resetScene();
        if (!(await sleep(350, g))) return;

        if (!(first && skipRun)) {
          setPhase("run");
          ripple(target);
          if (!(await termLines(T.run(), g, 280))) return;
          if (!(await sleep(1300, g))) return;
        }
        first = false;

        // Break: a redesign ships and the selector points at nothing.
        setPhase("break");
        deploy.classList.add("is-on");
        attr.classList.remove("is-on");
        flipTo(vi + 1, v.label);
        if (!(await sleep(820, g))) return;
        showAttr(`<s>${esc(BASE.attr)}</s>${esc(v.attr)}`);
        if (!(await sleep(500, g))) return;
        setMood("broken");
        tear();
        token.classList.add("is-broken");
        diag.classList.add("is-on");
        if (!(await termLines(T.break(), g, 110))) return;
        if (!(await sleep(900, g))) return;

        // Scan: candidates scored against the description.
        setPhase("scan");
        setMood("scan");
        attr.classList.remove("is-on");
        scan(v);
        if (!(await sleep(450, g))) return;
        if (!(await termLines(T.scan(v), g, 650))) return;
        if (!(await sleep(800, g))) return;

        // Verify: one match, visible, confident enough.
        setPhase("verify");
        verify(v);
        if (v.reject && !(await termLines(T.reject(v), g, 0))) return;
        if (!(await sleep(v.reject ? 2300 : 1700, g))) return;

        // Heal: annotate, then stitch the thread onto the moved element.
        setPhase("heal");
        setMood("healed");
        verifyEl.classList.remove("is-on");
        diag.classList.remove("is-on");
        token.classList.remove("is-broken");
        token.classList.add("is-healed");
        lensText.textContent = v.short;
        lens.classList.add("is-on");
        if (!(await sleep(520, g))) return;
        drawThread("healed", { animate: true });
        if (!(await sleep(900, g))) return;
        cands.textContent = "";
        ripple(target);
        confirmEl.classList.add("is-on");
        if (!(await termLines(T.heal(v), g, 120))) return;
        if (!(await sleep(1100, g))) return;

        // Cache: the next run never asks the model.
        setPhase("cache");
        cacheCount.textContent = `${cacheEntries + 1} entries`;
        cacheCount.classList.add("is-bumped");
        if (!(await termLines(T.cache(), g, 230))) return;
        if (!(await sleep(2600, g))) return;

        phases.forEach((p) => { p.classList.remove("is-current"); p.classList.add("is-done"); });
        vi = (vi + 1) % VARIANTS.length;
        scene.classList.add("is-resetting");
        if (!(await sleep(450, g))) return;
        scene.classList.remove("is-resetting");
      }
    }

    // Reduced motion: show the healed end state, no autoplay.
    function renderStatic(vi) {
      gen++;
      current = vi;
      const v = VARIANTS[vi];
      resetScene();
      app.dataset.variant = String(vi + 1);
      targetLabel.textContent = v.label;
      token.classList.add("is-healed");
      lensText.textContent = v.short;
      lens.classList.add("is-on");
      confirmEl.classList.add("is-on");
      setMood("healed");
      [...T.break(), ...T.scan(v), ...(v.reject ? T.reject(v) : []), ...T.heal(v)].forEach(termLine);
      phases.forEach((p) => p.classList.add("is-done"));
      requestAnimationFrame(() => {
        drawThread("healed");
        showAttr(`<s>${esc(BASE.attr)}</s>${esc(v.attr)}`);
      });
    }

    /* ---- Controls ---- */

    function applyPause() {
      const p = paused();
      stage.classList.toggle("is-paused", p);
      stage.getAnimations({ subtree: true }).forEach((a) => {
        if (p && a.playState === "running") a.pause();
        else if (!p && a.playState === "paused") a.play();
      });
    }

    function setUserPaused(value) {
      userPaused = value;
      pauseBtn.textContent = value ? "Play" : "Pause";
      pauseBtn.setAttribute("aria-pressed", String(value));
      applyPause();
    }

    pauseBtn.addEventListener("click", () => setUserPaused(!userPaused));

    nextBtn.addEventListener("click", () => {
      const next = (current + 1) % VARIANTS.length;
      if (reduce) return renderStatic(next);
      setUserPaused(false);
      loop(next, true);
    });

    if (reduce) pauseBtn.hidden = true;

    // Keep the thread attached when the layout changes size.
    const ro = new ResizeObserver(() => {
      if (threadMode === "torn") {
        halfA.style.opacity = 0;
        halfB.style.opacity = 0;
        return;
      }
      drawThread(threadMode);
    });

    // Don't burn frames on a demo nobody is looking at.
    const io = new IntersectionObserver((entries) => {
      offscreen = !entries[0].isIntersecting;
      applyPause();
    }, { threshold: 0.1 });

    Promise.all([fontsReady, titleHealed]).then(() => {
      if (reduce) renderStatic(0);
      else loop(0, false);
      stage.classList.add("is-live");
      ro.observe(scene);
      io.observe(stage);
    });
  }

  /* ---------- Pipeline spine fills with scroll ---------- */

  const spine = $("#spine");
  if (spine) {
    const steps = $$(".step", spine);
    let queued = false;
    const update = () => {
      queued = false;
      const anchor = window.innerHeight * 0.62;
      const r = spine.getBoundingClientRect();
      const fill = reduce ? 1 : Math.min(1, Math.max(0, (anchor - r.top) / r.height));
      spine.style.setProperty("--fill", fill.toFixed(4));
      steps.forEach((s) => {
        s.classList.toggle("is-lit", reduce || s.getBoundingClientRect().top + 20 < anchor);
      });
    };
    const queue = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    update();
  }

  /* ---------- Guide: table of contents follows the reader ---------- */

  const toc = $("#toc");
  if (toc) {
    const links = $$("a", toc);
    const sections = links.map((a) => document.getElementById(a.hash.slice(1)));
    const body = $("#guide-body");
    let queued = false;
    const update = () => {
      queued = false;
      const anchor = window.innerHeight * 0.35;
      let current = 0;
      sections.forEach((s, i) => {
        if (s && s.getBoundingClientRect().top <= anchor) current = i;
      });
      // At the very bottom the last section may never reach the anchor.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = sections.length - 1;
      }
      links.forEach((a, i) => {
        a.classList.toggle("is-current", i === current);
        a.classList.toggle("is-done", i < current);
        if (i === current) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
      const r = body.getBoundingClientRect();
      const fill = Math.min(1, Math.max(0, (anchor - r.top) / r.height));
      toc.style.setProperty("--fill", (current === sections.length - 1 ? 1 : fill).toFixed(4));
    };
    const queue = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    update();
  }

  /* ---------- Guardrails playground ---------- */

  const guard = $("#guard");
  if (guard) {
    const SCORE = 0.86;
    const range = $("#minconf");
    const out = $("#minconf-out");
    const gTitle = $("#g-title");
    const gBody = $("#g-body");
    const gLog = $("#g-log");
    const gCode = $("#g-code");
    const D = (s) => `<span class="t-dim">${esc(s)}</span>`;
    const STRATEGY = 'getByRole("button", { name: "Place order" })';

    const render = () => {
      const mode = $('input[name="mode"]:checked', guard).value;
      const t = Number(range.value);
      out.textContent = t.toFixed(2);
      range.disabled = mode === "off";

      let tone;
      let head;
      let body;
      let log;
      if (mode === "off") {
        tone = "off";
        head = "Healing is off.";
        body = "Your locator's own timeout error is thrown, exactly as Playwright reports it. No model is called.";
        log = `<span class="t-bad">TimeoutError</span>${D(": locator.waitFor: Timeout 5000ms exceeded.")}`;
      } else if (t > 0 && SCORE < t) {
        tone = "fracture";
        head = "Rejected. The test fails.";
        body = `The best match scored ${SCORE.toFixed(2)}, below your minConfidence of ${t.toFixed(2)}. The HealError lists every strategy that was tried.`;
        log = [
          D(`  │  ↳ [role] skipped: confidence ${SCORE.toFixed(2)} below minConfidence ${t.toFixed(2)}`),
          D("  │"),
          `${D("  ├─")} <span class="t-bad">✕ Place order button</span>`,
        ].join("\n");
      } else if (mode === "warn") {
        tone = "warn";
        head = "Reported, not applied.";
        body = "The test still fails on your original locator, and the fix it would have used is logged. A safe way to measure drift in CI.";
        log = [
          `${D("  ├─")} <span class="t-warn">◐</span> <span class="t-hi">Place order button</span> ${D("(report-only)")}`,
          D(`  │  would heal to ${STRATEGY} — original failure kept`),
        ].join("\n");
      } else {
        tone = "heal";
        head = "Healed. The click runs and the test carries on.";
        body = "The fix is cached for the next run and written to heal_events.jsonl with the model's reason and token count.";
        log = [
          `${D("  ├─")} <span class="t-ok">✓</span> <span class="t-hi">Place order button</span>`,
          D(`  │  → ${STRATEGY}`),
        ].join("\n");
      }

      guard.dataset.tone = tone;
      gTitle.textContent = head;
      gBody.textContent = body;
      gLog.innerHTML = log;

      const opts = mode === "off"
        ? `  mode: <span class="hl">'off'</span>,`
        : `  mode: <span class="hl">'${mode}'</span>,\n  minConfidence: <span class="hl">${t.toFixed(2)}</span>,`;
      gCode.innerHTML = [
        `<span class="tk-c">// fixtures.ts</span>`,
        `<span class="tk-k">export const</span> test = base.<span class="tk-f">extend</span>&lt;{ page: HealPage }&gt;(`,
        `  <span class="tk-f">createHealingFixture</span>({`,
        opts.replace(/^ {2}/gm, "    "),
        `  })`,
        `);`,
      ].join("\n");
    };

    guard.addEventListener("input", render);
    guard.addEventListener("change", render);
    render();
  }

  /* ---------- Tabs ---------- */

  $$('[role="tablist"]').forEach((list) => {
    const tabs = $$('[role="tab"]', list);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab, false));
      tab.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabs.length - 1;
        if (j !== null) {
          e.preventDefault();
          select(tabs[j], true);
        }
      });
    });
  });

  /* ---------- Provider picker ---------- */

  const prov = $("#prov");
  if (prov) {
    const env = $("#prov-env");
    const C = (s) => `<span class="tk-c">${esc(s)}</span>`;
    const kv = (k, v) => `<span class="e-k">${k}</span>=<span class="e-v">${esc(v)}</span>`;
    const ENV = {
      openai: [C("# .env"), kv("SELF_HEAL", "1"), kv("AI_PROVIDER", "openai"), kv("AI_API_KEY", "sk-…"), C("# AI_MODEL=…  optional")],
      anthropic: [C("# .env"), kv("SELF_HEAL", "1"), kv("AI_PROVIDER", "anthropic"), kv("AI_API_KEY", "sk-ant-…"), C("# AI_MODEL=…  optional")],
      google: [C("# .env"), kv("SELF_HEAL", "1"), kv("AI_PROVIDER", "google"), kv("AI_API_KEY", "…"), C("# AI_MODEL=…  optional")],
      local: [C("# .env"), kv("SELF_HEAL", "1"), kv("AI_PROVIDER", "local"), kv("OLLAMA_HOST", "http://127.0.0.1:11434"), C("# No API key. Nothing leaves"), C("# your machine.")],
      custom: [
        C("// fixtures.ts"),
        `<span class="tk-f">createHealingFixture</span>({`,
        `  aiProvider: myProvider,`,
        `});`,
        "",
        C("// myProvider implements"),
        C("// generateHealPlan(input)"),
      ],
    };
    const render = () => {
      const value = $("input:checked", prov).value;
      env.innerHTML = ENV[value].join("\n");
    };
    prov.addEventListener("change", render);
    render();
  }

  /* ---------- Video: load YouTube only when asked ---------- */

  const play = $("#video-play");
  if (play) {
    play.addEventListener("click", () => {
      const frame = document.createElement("iframe");
      frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(play.dataset.yt)}?autoplay=1&rel=0`;
      frame.title = "Healwright demo video";
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      frame.allowFullscreen = true;
      play.replaceWith(frame);
      frame.focus();
    });
  }
})();
