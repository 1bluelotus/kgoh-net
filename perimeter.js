// PERIMETER — a small wave-defense minigame.
// Hostiles advance across a 3-D grid toward the core. Each of the four kinds
// only goes down to its matching ammo (A S D F). Waves get faster, denser and
// more mixed until the core's integrity runs out.
//
// Two modes, set by data-pm-mode on #pm-root (see _includes/perimeter-game.njk):
//   page      /perimeter/ — the grid materializes as soon as the page loads
//   embedded  homepage — PLAY fades the content column out and the grid
//             materializes in its place, between the side HUD panels
(() => {
    const root = document.getElementById('pm-root');
    if (!root) return;
    const EMBEDDED = root.dataset.pmMode === 'embedded';

    // ---------- Tuning ----------
    const NEAR = 1;            // depth of the defense line (closest to the player)
    const FAR = 9;             // depth where hostiles spawn
    const MAX_INTEGRITY = 5;
    const BOOT_SECS = 2.4;     // grid materialize
    const DEREZ_SECS = 0.9;    // grid collapse on exit

    const waveSize       = n => Math.min(6 + 3 * (n - 1), 40);               // hostiles per wave
    const waveSpeed      = n => 0.7 * Math.min(1 + 0.1 * (n - 1), 2.6);      // depth units per second
    const spawnGap       = n => Math.max(0.4, 2.0 * Math.pow(0.86, n - 1));  // seconds between spawns
    const maxOnField     = n => Math.min(4 + n, 13);                          // keeps it from getting too dense
    const typesInWave    = n => Math.min(n, 4);                               // a new kind each wave until all four
    const repeatChance   = n => Math.max(0.1, 0.75 - 0.12 * (n - 1));         // early waves come in same-color runs

    const TYPES = [
        { key: 'A', name: 'SPIKE', color: '#ff3b5c', sides: 3, rot: -Math.PI / 2 },
        { key: 'S', name: 'BLOCK', color: '#ffc400', sides: 4, rot: Math.PI / 4 },
        { key: 'D', name: 'SHARD', color: '#3dff8a', sides: 4, rot: -Math.PI / 2, squash: 0.8 },
        { key: 'F', name: 'HIVE',  color: '#8f7bff', sides: 6, rot: 0, spin: 0.5 },
    ];
    const KEYS = { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };

    // ---------- DOM ----------
    const $ = id => document.getElementById(id);
    const canvas = $('pm-canvas');
    const ctx = canvas.getContext('2d');
    const hud = $('pm-hud');
    const panels = { start: $('pm-start'), pause: $('pm-pause'), over: $('pm-over') };
    const slots = [...root.querySelectorAll('.pm-slot')];
    const integrityEl = $('pm-integrity').parentElement;
    const integrityBars = [...$('pm-integrity').children];
    const banner = $('pm-banner');

    // reticle.js skips itself on touch screens, so fall back to a no-op
    const Reticle = window.Reticle || { lock() {}, color() {} };
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasMouse = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const BEST_KEY = 'perimeterBest';

    // ---------- State ----------
    // offline (embedded, not launched) → booting → briefing → playing ⇄ paused → over
    // and from any of those → shutdown → offline
    let state = 'offline';
    let wave = 0, score = 0, integrity = MAX_INTEGRITY, ammo = 0;
    let enemies = [], particles = [], tracers = [];
    let toSpawn, spawnTimer, waveBreak, lastType, firstSpawnOfWave;
    let best = +localStorage.getItem(BEST_KEY) || 0;
    let m = 0;                 // materialize progress: 0 = nothing, 1 = battlefield fully built
    let flash = 0, shake = 0;
    let mouseX = -999, mouseY = -999;
    let time = 0, lastFrame = 0;
    let accent = [0, 255, 255];

    // ---------- Layout / projection ----------
    let W, H, horizonY, kY, kX, enemyR;

    function resize() {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        W = innerWidth;
        H = innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // on the homepage the battlefield only uses the column between the side panels
        const side = EMBEDDED ? 260 + Math.max(0, (W - 1320) / 2) : 0;
        const fieldW = W - side * 2;
        horizonY = H * 0.34;
        kY = H * 0.74 - horizonY;              // defense line sits at 74% of the screen height
        kX = Math.min(fieldW * 0.4, H * 0.75);
        enemyR = Math.min(fieldW, H) * 0.05;
    }

    // world (x, depth) → screen
    const screenX = (x, d) => W / 2 + (x * kX) / d;
    const groundY = d => horizonY + kY / d;

    // ---------- Helpers ----------
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const seg = (v, a, b) => clamp((v - a) / (b - a), 0, 1);   // 0→1 as v moves from a to b
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const pad = (n, len) => String(n).padStart(len, '0');
    const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
    function hexToRgb(hex) {
        const match = hex.trim().match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
        return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : [0, 255, 255];
    }
    TYPES.forEach(t => (t.rgb = hexToRgb(t.color)));

    function readAccent() {
        accent = hexToRgb(getComputedStyle(document.body).getPropertyValue('--accent-color') || '#00ffff');
    }
    // follow theme changes made from the HUD THEME panel mid-game
    new MutationObserver(readAccent).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // ---------- Boot / launch / exit ----------
    function boot() {
        if (EMBEDDED && state !== 'launching') return;   // exited before the grid started
        readAccent();
        resetGame();
        m = 0;
        state = 'booting';
    }

    // homepage: PLAY swaps the content column for the battlefield
    function canEmbed() {
        return EMBEDDED && hasMouse && innerWidth >= 1100 && innerHeight >= 600;
    }

    function launch() {
        root.hidden = false;
        document.documentElement.classList.add('pm-lock');
        document.body.classList.add('pm-active');   // fades the content column out
        state = 'launching';
        setTimeout(boot, reduceMotion ? 0 : 380);
    }

    function exit() {
        if (state === 'offline' || state === 'shutdown') return;
        state = 'shutdown';
        document.body.classList.remove('pm-running');
        Reticle.lock(null);
        Reticle.color(null);
        showPanel(null);
        hud.hidden = true;
        banner.classList.remove('is-showing');
    }

    function finishExit() {
        state = 'offline';
        m = 0;
        resetGame();
        root.hidden = true;
        document.documentElement.classList.remove('pm-lock');
        document.body.classList.remove('pm-active');   // content column fades back in
    }

    // ---------- Game flow ----------
    function resetGame() {
        wave = 0;
        score = 0;
        integrity = MAX_INTEGRITY;
        enemies = [];
        particles = [];
        tracers = [];
        lastType = 0;
        updateHud();
    }

    function newGame() {
        resetGame();
        setAmmo(0);
        showPanel(null);
        hud.hidden = false;
        state = 'playing';
        document.body.classList.add('pm-running');
        nextWave();
    }

    function nextWave() {
        wave++;
        toSpawn = waveSize(wave);
        spawnTimer = 1.6;
        waveBreak = 0;
        firstSpawnOfWave = true;
        updateHud();
        const t = TYPES[wave - 1];
        if (wave <= 4) {
            showBanner(`WAVE ${pad(wave, 2)}`, `NEW HOSTILE: ${t.name} // AMMO [${t.key}]`, t.color);
        } else {
            showBanner(`WAVE ${pad(wave, 2)}`, 'HOLD THE LINE');
        }
    }

    function spawn() {
        const kinds = typesInWave(wave);
        let type;
        if (firstSpawnOfWave && wave <= 4) type = wave - 1;   // introduce the new kind first
        else if (Math.random() < repeatChance(wave) && lastType < kinds) type = lastType;
        else type = Math.floor(Math.random() * kinds);
        firstSpawnOfWave = false;
        lastType = type;
        enemies.push({
            type,
            x0: rand(-2.6, 2.6),
            d: FAR + 0.5,
            speed: waveSpeed(wave) * rand(0.85, 1.15),
            phase: rand(0, Math.PI * 2),
            flash: 0,
        });
    }

    function endGame() {
        state = 'over';
        document.body.classList.remove('pm-running');
        Reticle.lock(null);
        Reticle.color(null);
        const isBest = score > best;
        if (isBest) {
            best = score;
            localStorage.setItem(BEST_KEY, best);
        }
        $('pm-final-wave').textContent = pad(wave, 2);
        $('pm-final-score').textContent = pad(score, 6);
        $('pm-final-best').textContent = pad(best, 6);
        $('pm-new-best').hidden = !isBest;
        updateHud();
        setTimeout(() => state === 'over' && showPanel('over'), 900);   // let the breach explosion play first
    }

    function pause() {
        if (state !== 'playing') return;
        state = 'paused';
        document.body.classList.remove('pm-running');
        Reticle.lock(null);
        showPanel('pause');
    }

    function resume() {
        if (state !== 'paused') return;
        state = 'playing';
        document.body.classList.add('pm-running');
        Reticle.color(TYPES[ammo].color);
        showPanel(null);
    }

    // ---------- Input ----------
    function setAmmo(i) {
        ammo = i;
        slots.forEach((s, j) => s.classList.toggle('is-active', j === i));
        Reticle.color(TYPES[i].color);
    }

    function fire(x, y) {
        // the core shoots a tracer to wherever you clicked
        tracers.push({ x, y, color: TYPES[ammo].color, life: 1 });
        const target = enemyAt(x, y);
        if (!target) return;
        if (target.type === ammo) {
            destroy(target);
        } else {
            target.flash = 1;   // wrong ammo: it shrugs the hit off
            burst(target.sx, target.sy, [200, 200, 200], 6, target.r * 0.6);
        }
    }

    function destroy(e) {
        enemies.splice(enemies.indexOf(e), 1);
        score += 100 * wave;
        burst(e.sx, e.sy, TYPES[e.type].rgb, 18, e.r * 2.2);
        particles.push({ ring: true, x: e.sx, y: e.sy, r: e.r, life: 1, rgb: TYPES[e.type].rgb });
        updateHud();
    }

    function breach(e) {
        enemies.splice(enemies.indexOf(e), 1);
        integrity--;
        flash = 1;
        if (!reduceMotion) shake = 12;
        burst(W / 2, groundY(NEAR), TYPES[e.type].rgb, 26, enemyR * 3);
        updateHud();
        if (integrity <= 0) endGame();
    }

    // nearest hostile whose outline contains the point
    function enemyAt(x, y) {
        let hit = null;
        for (const e of enemies) {
            if (e.sx === undefined) continue;
            const hitR = Math.max(e.r * 1.15, 14);
            if ((x - e.sx) ** 2 + (y - e.sy) ** 2 <= hitR * hitR && (!hit || e.d < hit.d)) hit = e;
        }
        return hit;
    }

    canvas.addEventListener('mousedown', e => {
        if (e.button === 0 && state === 'playing') fire(e.clientX, e.clientY);
    });

    addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, { passive: true });

    addEventListener('keydown', e => {
        if (e.metaKey || e.ctrlKey || e.altKey || state === 'offline') return;
        if (state === 'playing' && e.code in KEYS) {
            setAmmo(KEYS[e.code]);
            e.preventDefault();
        } else if (e.code === 'Escape' || e.code === 'KeyP') {
            if (state === 'playing') pause();
            else if (state === 'paused') resume();
            else if (EMBEDDED && e.code === 'Escape' && (state === 'briefing' || state === 'over')) exit();
        }
    });

    slots.forEach((s, i) => s.addEventListener('click', () => state === 'playing' && setAmmo(i)));

    for (const id of ['pm-start-btn', 'pm-retry-btn', 'pm-restart-btn']) {
        $(id).addEventListener('click', e => {
            e.currentTarget.blur();
            newGame();
        });
    }
    $('pm-resume-btn').addEventListener('click', resume);

    if (EMBEDDED) {
        // PLAY on the Projects card: materialize in place when there's room, else fall
        // through to the /perimeter/ page (small screens, touch devices)
        document.addEventListener('click', e => {
            const play = e.target.closest('[data-perimeter-launch]');
            if (play && state === 'offline' && canEmbed()) {
                e.preventDefault();
                play.blur();
                launch();
            }
        });
        // EXIT buttons collapse the grid instead of following their link
        root.querySelectorAll('.pm-exit').forEach(a => a.addEventListener('click', e => {
            e.preventDefault();
            exit();
        }));
        // navigating with the side panels leaves the game
        document.addEventListener('click', e => {
            if (state !== 'offline' && e.target.closest('.hud-nav a')) exit();
        }, true);
    }

    document.addEventListener('visibilitychange', () => document.hidden && pause());
    addEventListener('blur', pause);
    addEventListener('resize', resize);

    // ---------- HUD ----------
    function updateHud() {
        $('pm-wave').textContent = pad(wave, 2);
        $('pm-score').textContent = pad(score, 6);
        $('pm-best').textContent = pad(Math.max(best, score), 6);
        integrityBars.forEach((b, i) => b.classList.toggle('is-lost', i >= integrity));
        integrityEl.classList.toggle('is-critical', integrity <= 2);
        slots.forEach((s, i) => s.classList.toggle('is-unknown', i >= typesInWave(wave)));
    }

    function showPanel(name) {
        Object.entries(panels).forEach(([k, el]) => (el.hidden = k !== name));
    }

    function showBanner(title, sub, subColor) {
        $('pm-banner-title').textContent = title;
        $('pm-banner-sub').textContent = sub;
        banner.style.setProperty('--banner-sub-color', subColor || 'var(--accent-color)');
        banner.classList.remove('is-showing');
        void banner.offsetWidth;   // restart the CSS animation
        banner.classList.add('is-showing');
    }

    // ---------- Simulation ----------
    function update(dt) {
        if (state === 'paused') return;   // freeze everything, including the grid drift
        time += dt;

        if (state === 'booting') {
            m = Math.min(1, m + dt / (reduceMotion ? 0.3 : BOOT_SECS));
            if (m === 1) {
                state = 'briefing';
                showPanel('start');
            }
        } else if (state === 'shutdown') {
            m = Math.max(0, m - dt / (reduceMotion ? 0.2 : DEREZ_SECS));
            if (m === 0) finishExit();
        }

        flash = Math.max(0, flash - dt * 2.5);
        shake = Math.max(0, shake - dt * 40);

        for (const p of particles) {
            p.life -= dt * (p.ring ? 2.4 : 1.8);
            if (!p.ring) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 260 * dt;
            }
        }
        particles = particles.filter(p => p.life > 0);
        for (const t of tracers) t.life -= dt * 8;
        tracers = tracers.filter(t => t.life > 0);

        if (state !== 'playing') return;

        // spawning and wave progress
        if (toSpawn > 0) {
            spawnTimer -= dt;
            if (spawnTimer <= 0 && enemies.length < maxOnField(wave)) {
                spawn();
                toSpawn--;
                spawnTimer = spawnGap(wave) * rand(0.7, 1.3);
            }
        } else if (enemies.length === 0) {
            if (waveBreak === 0) {
                waveBreak = 2.6;
                const repaired = integrity < MAX_INTEGRITY;
                if (repaired) integrity++;
                updateHud();
                showBanner(`WAVE ${pad(wave, 2)} CLEARED`, repaired ? 'CORE INTEGRITY +1' : '');
            }
            waveBreak -= dt;
            if (waveBreak <= 0) nextWave();
        }

        for (const e of [...enemies]) {
            e.d -= e.speed * dt;
            e.flash = Math.max(0, e.flash - dt * 4);
            if (e.d <= NEAR) breach(e);
            if (state !== 'playing') return;   // that breach ended the game
        }

        // clamp the reticle onto whatever hostile is under the mouse
        const hovered = enemyAt(mouseX, mouseY);
        if (hovered) {
            const r = hovered.r * 1.1;
            Reticle.lock({ left: hovered.sx - r, top: hovered.sy - r, width: r * 2, height: r * 2 });
        } else {
            Reticle.lock(null);
        }
    }

    // ---------- Drawing ----------
    function draw() {
        ctx.clearRect(0, 0, W, H);
        if (m === 0) return;

        ctx.save();
        if (shake) ctx.translate(rand(-shake, shake), rand(-shake, shake));

        // while the grid is building, the whole thing flickers like it's powering up
        const building = m < 1 && !reduceMotion;
        ctx.globalAlpha = building && Math.random() < 0.08 ? 0.55 : 1;
        drawGround();
        drawCore();
        ctx.globalAlpha = 1;

        // position every hostile, then draw far → near so close ones overlap far ones
        ctx.globalAlpha = m;
        for (const e of enemies) placeEnemy(e);
        enemies.sort((a, b) => b.d - a.d);
        for (const e of enemies) drawEnemy(e);
        drawTracers();
        drawParticles();
        ctx.restore();

        if (flash) {
            const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
            g.addColorStop(0, 'rgba(255,59,92,0)');
            g.addColorStop(1, `rgba(255,59,92,${0.45 * flash})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // The ground builds TRON-style as m goes 0 → 1 (and collapses as it goes back):
    //   0.00–0.22  the horizon line streaks outward from the vanishing point
    //   0.12–0.80  rails shoot down from the horizon, center first, each with a bright head
    //   0.40–0.90  cross lines snap on from the horizon toward the viewer, flaring as they land
    //   0.78–1.00  the core and defense line power up
    function drawGround() {
        const base = ctx.globalAlpha;
        const vpX = W / 2;

        // center flare when the horizon ignites
        const ignite = seg(m, 0, 0.08) * (1 - seg(m, 0.08, 0.35));
        if (ignite) {
            const g = ctx.createRadialGradient(vpX, horizonY, 0, vpX, horizonY, 140);
            g.addColorStop(0, `rgba(255,255,255,${0.9 * ignite})`);
            g.addColorStop(0.2, rgba(accent, 0.6 * ignite));
            g.addColorStop(1, rgba(accent, 0));
            ctx.fillStyle = g;
            ctx.fillRect(vpX - 140, horizonY - 140, 280, 280);
        }

        // glow along the horizon
        const glowA = seg(m, 0.1, 0.6);
        const glow = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY + 40);
        glow.addColorStop(0, rgba(accent, 0));
        glow.addColorStop(0.6, rgba(accent, 0.12 * glowA));
        glow.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, horizonY - 60, W, 100);

        ctx.lineWidth = 1;

        // rails running toward the horizon
        const nearD = 0.45;
        for (let x = -8; x <= 8; x += 0.5) {
            const start = 0.12 + 0.36 * (Math.abs(x) / 8);
            const pr = easeOut(seg(m, start, start + 0.32));
            if (!pr) continue;
            const tipX = vpX + (screenX(x, nearD) - vpX) * pr;
            const tipY = horizonY + (groundY(nearD) - horizonY) * pr;
            ctx.strokeStyle = rgba(accent, (x === 0 ? 0.35 : 0.18) + 0.4 * (1 - pr));
            ctx.beginPath();
            ctx.moveTo(vpX, horizonY);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            if (pr < 1) lightHead(tipX, tipY);
        }

        // cross lines, drifting slowly toward the player
        const step = 0.5;
        const drift = (time * 0.35) % step;
        for (let d = 0.45 + step - drift; d < 40; d += step) {
            const y = groundY(d);
            if (y > H) continue;
            const depth = (y - horizonY) / (H - horizonY);   // 0 at the horizon, 1 at the bottom
            const start = 0.4 + 0.38 * depth;
            const pr = seg(m, start, start + 0.12);
            if (!pr) continue;
            const flare = 1 - seg(m, start + 0.12, start + 0.3);   // bright as it lands, then settles
            const half = (W / 2) * easeOut(pr);
            ctx.strokeStyle = rgba(accent, clamp(0.5 / d, 0.03, 0.35) * pr + 0.45 * flare * pr);
            ctx.beginPath();
            ctx.moveTo(vpX - half, y);
            ctx.lineTo(vpX + half, y);
            ctx.stroke();
        }

        // the horizon line itself
        const h = easeOut(seg(m, 0, 0.22));
        const hot = 1 - seg(m, 0.22, 0.5);
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * hot})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(vpX - (W / 2) * h, horizonY);
        ctx.lineTo(vpX + (W / 2) * h, horizonY);
        ctx.stroke();
        ctx.strokeStyle = rgba(accent, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (h < 1) {
            lightHead(vpX - (W / 2) * h, horizonY);
            lightHead(vpX + (W / 2) * h, horizonY);
        }
        ctx.globalAlpha = base;
    }

    // the white-hot leading tip of a line being drawn
    function lightHead(x, y) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = rgba(accent, 1);
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawCore() {
        const power = easeOut(seg(m, 0.78, 1));
        if (!power) return;
        const y = groundY(NEAR);
        const healthy = integrity / MAX_INTEGRITY;
        const lineRgb = integrity <= 2 && wave > 0 ? [255, 59, 92] : accent;
        const base = ctx.globalAlpha;

        // the defense line, drawn outward from the core
        const half = (W / 2) * power;
        const lg = ctx.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
        lg.addColorStop(0, rgba(lineRgb, 0));
        lg.addColorStop(0.5, rgba(lineRgb, 0.75));
        lg.addColorStop(1, rgba(lineRgb, 0));
        ctx.strokeStyle = lg;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W / 2 - half, y);
        ctx.lineTo(W / 2 + half, y);
        ctx.stroke();

        // the core: two counter-rotating hexagons lying flat on the grid
        const r = enemyR * 1.5 * power;
        const pulse = 1 + Math.sin(time * 3) * 0.06;
        ctx.globalAlpha = base * (power < 1 && !reduceMotion && Math.random() < 0.3 ? 0.35 : 1);
        ctx.shadowColor = rgba(lineRgb, 1);
        ctx.shadowBlur = 18;
        ctx.strokeStyle = rgba(lineRgb, 1);
        ctx.fillStyle = rgba(lineRgb, 0.12 + 0.18 * healthy);
        ctx.lineWidth = 2;
        flatPolygon(W / 2, y, r * pulse, time * 0.4);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        flatPolygon(W / 2, y, r * 0.5, -time * 0.8);
        ctx.stroke();
        ctx.globalAlpha = base;
    }

    // hexagon squashed vertically so it reads as lying on the ground plane
    function flatPolygon(x, y, r, rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, 0.32);
        polygon(0, 0, r, 6, rot);
        ctx.restore();   // path keeps its shape; the stroke stays an even width
    }

    function placeEnemy(e) {
        const progress = clamp((e.d - NEAR) / (FAR - NEAR), 0, 1);
        // hostiles drift in toward the core as they close in, with a little sway
        const x = e.x0 * (0.35 + 0.65 * progress) + Math.sin(time * 1.3 + e.phase) * 0.12;
        e.r = Math.max(enemyR / e.d, 5);
        e.gy = groundY(e.d);
        e.sx = screenX(x, e.d);
        e.sy = e.gy - e.r * 1.6;   // hovering above the ground
    }

    function drawEnemy(e) {
        const t = TYPES[e.type];
        const fadeIn = clamp((FAR + 0.5 - e.d) / 0.8, 0, 1) * m;
        const bob = Math.sin(time * 4 + e.phase) * e.r * 0.12;

        ctx.globalAlpha = fadeIn;
        // shadow on the grid
        ctx.fillStyle = rgba(t.rgb, 0.22);
        ctx.beginPath();
        ctx.ellipse(e.sx, e.gy, e.r * 0.9, e.r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();

        const stroke = e.flash ? `rgba(255,255,255,${0.5 + e.flash * 0.5})` : t.color;
        ctx.shadowColor = t.color;
        ctx.shadowBlur = e.r * 0.8;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = rgba(t.rgb, 0.18);
        ctx.lineWidth = Math.max(1.5, e.r * 0.09);
        polygon(e.sx, e.sy + bob, e.r, t.sides, t.rot + (t.spin || 0) * time, t.squash);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = fadeIn * 0.6;
        polygon(e.sx, e.sy + bob, e.r * 0.45, t.sides, t.rot - (t.spin || 0) * time, t.squash);
        ctx.stroke();
        ctx.globalAlpha = m;
    }

    function drawTracers() {
        const fromY = groundY(NEAR);
        for (const t of tracers) {
            ctx.strokeStyle = t.color;
            ctx.globalAlpha = t.life * m;
            ctx.lineWidth = 2;
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(W / 2, fromY);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
        }
        ctx.globalAlpha = m;
        ctx.shadowBlur = 0;
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = clamp(p.life, 0, 1) * m;
            if (p.ring) {
                ctx.strokeStyle = rgba(p.rgb, 1);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * (1 + (1 - p.life) * 2), 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.fillStyle = rgba(p.rgb, 1);
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
        }
        ctx.globalAlpha = m;
    }

    function burst(x, y, rgb, count, spread) {
        for (let i = 0; i < count; i++) {
            const a = rand(0, Math.PI * 2), v = rand(0.4, 1) * spread * 2.2;
            particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spread, life: rand(0.5, 1), size: rand(2, 4.5), rgb });
        }
    }

    // regular polygon path; squash narrows it horizontally (used for the diamond)
    function polygon(x, y, r, sides, rot, squash = 1) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = rot + (i / sides) * Math.PI * 2;
            const px = x + Math.cos(a) * r * squash, py = y + Math.sin(a) * r;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
    }

    // ---------- Loop ----------
    function frame(now) {
        const dt = Math.min((now - lastFrame) / 1000 || 0, 0.05);   // clamp so a hitch can't teleport hostiles
        lastFrame = now;
        if (state !== 'offline') {
            update(dt);
            draw();
        }
        requestAnimationFrame(frame);
    }

    // ---------- Start ----------
    resize();
    updateHud();
    if (!hasMouse) {
        $('pm-start-btn').disabled = true;
        $('pm-needs').hidden = false;
    }
    if (!EMBEDDED) boot();   // the standalone page builds its grid right away
    requestAnimationFrame(frame);
})();
