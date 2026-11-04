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
    let yaw = 0, pitch = 0.15; // cannon aim: swivel across the floor, tilt up from it
    let kick = 0, muzzleFlash = 0;
    let shells = [];
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
        shells = [];
        kick = 0;
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
        // the cannon snaps onto the shot, kicks back, and beams to wherever you clicked
        ({ yaw, pitch } = aimAt(x, y));
        kick = 1;
        muzzleFlash = 1;
        const tip = muzzle();
        tracers.push({ x0: tip[0], y0: tip[1], x, y, color: TYPES[ammo].color, life: 1 });
        ejectShell();
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

    // ---------- Cannon ----------
    // A small 3-D model drawn through the same camera as the grid, so it sits on
    // the floor's perspective. Model space: 1 unit = kY px at depth 1 (the camera
    // is 1 unit above the floor), x right, y up, z = depth away from the viewer.
    const unit = () => enemyR / kY;                  // model scale, ties to hostile size
    const BARREL = 1.55;                             // rail length, in model units
    const recoil = () => kick * 0.35 * unit();       // rails slide back when firing

    function project(p) {
        const z = Math.max(p[2], 0.2);
        return [W / 2 + (p[0] * kY) / z, horizonY + (kY * (1 - p[1])) / z, z];
    }
    const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
    const rotX = (p, a) => [p[0], p[1] * Math.cos(a) + p[2] * Math.sin(a), -p[1] * Math.sin(a) + p[2] * Math.cos(a)];

    // head space: origin on top of the pedestal, swivels with yaw
    const PEDESTAL_H = 0.22;
    function headPoint(p, u = unit()) {
        const r = rotY(p, yaw);
        return [r[0], r[1] + PEDESTAL_H * u, r[2] + NEAR];
    }
    // barrel space: origin at the trunnion inside the head, tilts with pitch
    function barrelPoint(p, u = unit()) {
        const r = rotX(p, pitch);
        return headPoint([r[0], r[1] + 0.56 * u, r[2] - 0.08 * u], u);
    }

    function muzzle() {
        return project(barrelPoint([0, 0, BARREL * unit() - recoil()]));
    }

    // swivel/tilt that points the rails at the screen point (mx, my), reading it
    // as a spot at hostile hover height out on the field
    function aimAt(mx, my) {
        const pivot = barrelPoint([0, 0, 0]);
        const hover = (1.6 * enemyR) / kY;           // see placeEnemy: hostiles float this high
        const d = clamp((kY * (1 - hover)) / Math.max(my - horizonY, 1), NEAR + 0.25, 40);
        const x = ((mx - W / 2) * d) / kY;
        const v = [x - pivot[0], hover - pivot[1], d - pivot[2]];
        return {
            yaw: clamp(Math.atan2(v[0], v[2]), -1.35, 1.35),
            pitch: clamp(Math.atan2(v[1], Math.hypot(v[0], v[2])), -0.05, 0.8),
        };
    }

    // a spent casing in the current ammo color, kicked out of the breech's right side
    function ejectShell() {
        const u = unit();
        const port = project(barrelPoint([0.22 * u, 0.04 * u, 0.1 * u]));
        const out = project(barrelPoint([0.9 * u, 0.04 * u, 0.1 * u]));
        const len = Math.hypot(out[0] - port[0], out[1] - port[1]) || 1;
        const side = rand(150, 230), up = rand(140, 220);
        shells.push({
            x: port[0], y: port[1],
            vx: ((out[0] - port[0]) / len) * side,
            vy: ((out[1] - port[1]) / len) * side - up,
            rot: rand(0, Math.PI), vr: rand(-18, 18),
            floor: groundY(NEAR) + rand(6, 40) * (H / 850),   // lands on the grid just in front of the core
            w: enemyR * 0.11, h: enemyR * 0.26,
            color: TYPES[ammo].color,
            life: 1,
        });
        if (shells.length > 40) shells.shift();
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

        // cannon tracks the mouse with a little weight
        const want = aimAt(mouseX, mouseY);
        const ease = Math.min(1, dt * 14);
        yaw += (want.yaw - yaw) * ease;
        pitch += (want.pitch - pitch) * ease;
        kick = Math.max(0, kick - dt * 6);
        muzzleFlash = Math.max(0, muzzleFlash - dt * 14);

        // casings arc out, bounce on the grid, and fade
        for (const sh of shells) {
            sh.vy += 1100 * dt;
            sh.x += sh.vx * dt;
            sh.y += sh.vy * dt;
            sh.rot += sh.vr * dt;
            sh.life -= dt * 0.55;
            if (sh.y > sh.floor) {
                sh.y = sh.floor;
                sh.vy = Math.abs(sh.vy) < 60 ? 0 : -sh.vy * 0.35;
                sh.vx *= 0.55;
                sh.vr *= 0.5;
            }
        }
        shells = shells.filter(sh => sh.life > 0);

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
        drawCannon();
        drawTracers();
        drawParticles();
        drawShells();
        ctx.restore();

        if (flash) {
            const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
            g.addColorStop(0, 'rgba(255,59,92,0)');
            g.addColorStop(1, `rgba(255,59,92,${0.45 * flash})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
    }

    // The ground is a finite floor: it ends at GRID_FAR, well short of the horizon,
    // so the rails never pinch together into a single vanishing point. Its far
    // edge dissolves into the dark gap below the horizon line.
    const GRID_FAR = 16;     // depth of the floor's far edge
    const FOG_NEAR = 5;      // the fade starts here and reaches black at GRID_FAR

    // It builds TRON-style as m goes 0 → 1 (and collapses as it goes back):
    //   0.00–0.22  the horizon line streaks outward from the center
    //   0.12–0.80  rails shoot from the floor's far edge toward the viewer, center first, each with a bright head
    //   0.40–0.90  cross lines snap on from far to near, flaring as they land
    //   0.78–1.00  the core and defense line power up
    function drawGround() {
        const base = ctx.globalAlpha;
        const cx = W / 2;
        const nearD = 0.45;
        const farY = groundY(GRID_FAR);
        ctx.lineWidth = 1;

        // rails, wide enough that the far edge reaches both sides of the screen
        const reach = Math.ceil((cx * GRID_FAR) / kX / 0.5) * 0.5;
        for (let x = -reach; x <= reach; x += 0.5) {
            const start = 0.12 + 0.36 * Math.min(1, Math.abs(x) / 8);
            const pr = easeOut(seg(m, start, start + 0.32));
            if (!pr) continue;
            const fx = screenX(x, GRID_FAR);
            const tipX = fx + (screenX(x, nearD) - fx) * pr;
            const tipY = farY + (groundY(nearD) - farY) * pr;
            ctx.strokeStyle = rgba(accent, (x === 0 ? 0.35 : 0.18) + 0.4 * (1 - pr));
            ctx.beginPath();
            ctx.moveTo(fx, farY);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            if (pr < 1) lightHead(tipX, tipY);
        }

        // cross lines, drifting slowly toward the player
        const step = 0.5;
        const drift = (time * 0.35) % step;
        for (let d = nearD + step - drift; d <= GRID_FAR; d += step) {
            const y = groundY(d);
            if (y > H) continue;
            const depth = (y - farY) / (H - farY);   // 0 at the far edge, 1 at the bottom
            const start = 0.4 + 0.38 * depth;
            const pr = seg(m, start, start + 0.12);
            if (!pr) continue;
            const flare = 1 - seg(m, start + 0.12, start + 0.3);   // bright as it lands, then settles
            const half = cx * easeOut(pr);
            ctx.strokeStyle = rgba(accent, clamp(0.5 / d, 0.05, 0.35) * pr + 0.45 * flare * pr);
            ctx.beginPath();
            ctx.moveTo(cx - half, y);
            ctx.lineTo(cx + half, y);
            ctx.stroke();
        }

        // distance fog: erase the floor progressively toward its far edge
        const fogY = groundY(FOG_NEAR);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-out';
        const fog = ctx.createLinearGradient(0, farY, 0, fogY);
        fog.addColorStop(0, 'rgba(0,0,0,1)');
        fog.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fog;
        ctx.fillRect(0, farY - 2, W, fogY - farY + 2);
        ctx.restore();

        // center flare when the horizon ignites
        const ignite = seg(m, 0, 0.08) * (1 - seg(m, 0.08, 0.35));
        if (ignite) {
            const g = ctx.createRadialGradient(cx, horizonY, 0, cx, horizonY, 140);
            g.addColorStop(0, `rgba(255,255,255,${0.9 * ignite})`);
            g.addColorStop(0.2, rgba(accent, 0.6 * ignite));
            g.addColorStop(1, rgba(accent, 0));
            ctx.fillStyle = g;
            ctx.fillRect(cx - 140, horizonY - 140, 280, 280);
        }

        // glow along the horizon
        const glowA = seg(m, 0.1, 0.6);
        const glow = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY + 40);
        glow.addColorStop(0, rgba(accent, 0));
        glow.addColorStop(0.6, rgba(accent, 0.12 * glowA));
        glow.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, horizonY - 60, W, 100);

        // the horizon line itself
        const h = easeOut(seg(m, 0, 0.22));
        const hot = 1 - seg(m, 0.22, 0.5);
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * hot})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - cx * h, horizonY);
        ctx.lineTo(cx + cx * h, horizonY);
        ctx.stroke();
        ctx.strokeStyle = rgba(accent, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (h < 1) {
            lightHead(cx - cx * h, horizonY);
            lightHead(cx + cx * h, horizonY);
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

    // the defense line across the floor (the cannon stands on it, see drawCannon)
    function drawCore() {
        const power = easeOut(seg(m, 0.78, 1));
        if (!power) return;
        const y = groundY(NEAR);
        const lineRgb = integrity <= 2 && wave > 0 ? [255, 59, 92] : accent;

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

    // ---- cannon meshes (model units × u) ----
    // a hull lofted between a rear and a front cross-section: [halfWidth, yBottom, yTop] at depth z
    function hull(x, z0, [w0, b0, t0], z1, [w1, b1, t1]) {
        return {
            v: [
                [x - w0, b0, z0], [x + w0, b0, z0], [x + w0, t0, z0], [x - w0, t0, z0],
                [x - w1, b1, z1], [x + w1, b1, z1], [x + w1, t1, z1], [x - w1, t1, z1],
            ],
            f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]],
        };
    }

    // hexagonal pedestal, tapering up from the core
    function pedestal(u) {
        const v = [];
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            v.push([Math.cos(a) * 0.62 * u, 0, Math.sin(a) * 0.62 * u]);
            v.push([Math.cos(a) * 0.46 * u, PEDESTAL_H * u, Math.sin(a) * 0.46 * u]);
        }
        const f = [[1, 3, 5, 7, 9, 11]];
        for (let i = 0; i < 6; i++) {
            const j = (i + 1) % 6;
            f.push([i * 2, j * 2, j * 2 + 1, i * 2 + 1]);
        }
        return { v, f };
    }

    function drawCannon() {
        const power = easeOut(seg(m, 0.85, 1));
        if (!power) return;
        const u = unit() * power;   // grows in as the core powers up
        const rk = recoil();
        const lineRgb = integrity <= 2 && wave > 0 ? [255, 59, 92] : accent;
        const armed = state === 'playing' || state === 'paused';
        const col = armed ? TYPES[ammo].color : rgba(accent, 1);
        const colRgb = armed ? TYPES[ammo].rgb : accent;

        const toWorld = {
            base: p => [p[0], p[1], p[2] + NEAR],
            head: p => headPoint(p, u),
            barrel: p => barrelPoint(p, u),
        };
        // [mesh, transform]; the pedestal always draws first since everything sits on it
        const pedestalPart = [pedestal(u), toWorld.base];
        const parts = [
            // wedge-shaped head: tall and wide at the back, sloping low and narrow at the front
            [hull(0, -0.5 * u, [0.4 * u, 0, 0.44 * u], 0.36 * u, [0.22 * u, 0, 0.18 * u]), toWorld.head],
            // swept side fins
            [hull(-0.47 * u, -0.56 * u, [0.025 * u, 0.06 * u, 0.4 * u], 0.12 * u, [0.025 * u, 0.02 * u, 0.1 * u]), toWorld.head],
            [hull(0.47 * u, -0.56 * u, [0.025 * u, 0.06 * u, 0.4 * u], 0.12 * u, [0.025 * u, 0.02 * u, 0.1 * u]), toWorld.head],
            // trunnion block, then the twin rails; all three slide back on recoil
            [hull(0, -0.34 * u - rk, [0.21 * u, -0.1 * u, 0.09 * u], 0.16 * u - rk, [0.18 * u, -0.08 * u, 0.07 * u]), toWorld.barrel],
            [hull(-0.12 * u, -0.08 * u - rk, [0.042 * u, -0.055 * u, 0.055 * u], BARREL * u - rk, [0.028 * u, -0.03 * u, 0.04 * u]), toWorld.barrel],
            [hull(0.12 * u, -0.08 * u - rk, [0.042 * u, -0.055 * u, 0.055 * u], BARREL * u - rk, [0.028 * u, -0.03 * u, 0.04 * u]), toWorld.barrel],
        ];

        // light each part's camera-facing faces; parts paint far → near
        const L = [0.35, 0.85, -0.4];
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const mean = pts => pts.reduce((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length, acc[2] + p[2] / pts.length], [0, 0, 0]);
        function build([mesh, xf]) {
            const w = mesh.v.map(xf);
            const centre = mean(w);
            const faces = [];
            for (const f of mesh.f) {
                const q = f.map(i => w[i]);
                const fc = mean(q);
                const e1 = sub(q[1], q[0]), e2 = sub(q[2], q[0]);
                let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
                if (dot(n, sub(fc, centre)) < 0) n = n.map(c => -c);        // make it point outward
                if (dot(n, sub([0, 1, 0], fc)) <= 0) continue;              // facing away from the camera
                const light = Math.abs(dot(n, L)) / (Math.hypot(...n) || 1);
                faces.push({ pts: q.map(project), light });
            }
            return { faces, depth: Math.hypot(centre[0], centre[1] - 1, centre[2]) };
        }
        const built = parts.map(build).sort((a, b) => b.depth - a.depth);
        const faces = [build(pedestalPart), ...built].flatMap(b => b.faces);

        ctx.save();
        ctx.globalAlpha = m * power;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = rgba(lineRgb, 1);
        for (const f of faces) {
            ctx.beginPath();
            f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.closePath();
            // dark hard-light panels, tinted by how much they catch the light
            const t = 0.04 + 0.2 * f.light;
            ctx.fillStyle = `rgb(${Math.round(4 + lineRgb[0] * t)},${Math.round(8 + lineRgb[1] * t)},${Math.round(10 + lineRgb[2] * t)})`;
            ctx.shadowBlur = 0;
            ctx.fill();
            ctx.strokeStyle = rgba(lineRgb, 0.55 + 0.45 * f.light);
            ctx.shadowBlur = 6;
            ctx.stroke();
        }

        // energy beam running between the rails, in the ammo color
        const a0 = project(barrelPoint([0, 0, 0.2 * u - rk], u));
        const a1 = project(barrelPoint([0, 0, BARREL * u - rk], u));
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.lineWidth = Math.max(1.5, (0.05 * u * kY) / a1[2]);
        ctx.beginPath();
        ctx.moveTo(a0[0], a0[1]);
        ctx.lineTo(a1[0], a1[1]);
        ctx.stroke();
        // emitter glow at the tips, flaring on each shot
        const glowR = enemyR * (0.18 + 0.6 * muzzleFlash);
        const g = ctx.createRadialGradient(a1[0], a1[1], 0, a1[0], a1[1], glowR);
        g.addColorStop(0, `rgba(255,255,255,${0.6 + 0.4 * muzzleFlash})`);
        g.addColorStop(0.35, rgba(colRgb, 0.9));
        g.addColorStop(1, rgba(colRgb, 0));
        ctx.fillStyle = g;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(a1[0], a1[1], glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawShells() {
        for (const sh of shells) {
            ctx.save();
            ctx.globalAlpha = clamp(sh.life * 1.6, 0, 1) * m;
            ctx.translate(sh.x, sh.y);
            ctx.rotate(sh.rot);
            ctx.fillStyle = sh.color;
            ctx.shadowColor = sh.color;
            ctx.shadowBlur = 8;
            ctx.fillRect(-sh.w / 2, -sh.h / 2, sh.w, sh.h);
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';   // bright rim at the casing's base
            ctx.fillRect(-sh.w / 2, sh.h / 2 - sh.h * 0.22, sh.w, sh.h * 0.22);
            ctx.restore();
        }
    }

    function drawTracers() {
        for (const t of tracers) {
            ctx.strokeStyle = t.color;
            ctx.globalAlpha = t.life * m;
            ctx.lineWidth = 2;
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(t.x0, t.y0);
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
