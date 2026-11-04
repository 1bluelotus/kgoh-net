// Reticle cursor — four glowing corner brackets that trail the mouse,
// clamp onto clickable things on hover, and kick outward ("recoil") on click.
// Self-contained: it builds its own markup, so a page only needs
// <script src="/reticle.js" defer></script>. Styles live in style.css
// under "Reticle cursor".
(() => {
    // Touch screens have no mouse to follow.
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    // ---- Tuning knobs ----
    const GAP       = 14;    // resting distance from the mouse to each bracket corner
    const FOLLOW    = 0.25;  // 0–1: how quickly the brackets catch up (lower = more drift)
    const RECOIL    = 14;    // extra pixels the brackets kick outward on click
    const STIFFNESS = 0.18;  // spring pull back to rest after recoil
    const DAMPING   = 0.72;  // 0–1: how quickly the spring settles (lower = more wobble)
    const LOCK_PAD  = 6;     // breathing room around a clamped-on element
    const SIZE      = 8;     // bracket arm length (matches .reticle-bracket in CSS)
    const FLARE_MS  = 90;    // how long the click glow flare lasts

    // What the brackets clamp onto. Add data-reticle-lock to any element to opt it in.
    const LOCKABLE = 'a, button, .blog-card, .cs-img, [data-reticle-lock]';

    const reticle = document.createElement('div');
    reticle.className = 'reticle';
    reticle.setAttribute('aria-hidden', 'true');
    reticle.innerHTML =
        '<div class="reticle-bracket tl"></div>' +
        '<div class="reticle-bracket tr"></div>' +
        '<div class="reticle-bracket bl"></div>' +
        '<div class="reticle-bracket br"></div>' +
        '<div class="reticle-dot"></div>';
    document.body.appendChild(reticle);

    const [tl, tr, bl, br] = ['tl', 'tr', 'bl', 'br'].map(c => reticle.querySelector('.' + c));
    const dot = reticle.querySelector('.reticle-dot');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let mouseX = 0, mouseY = 0;
    let cx = 0, cy = 0, hw = GAP, hh = GAP;   // current box: center + half-width/height
    let kick = 0, kickVel = 0;                // recoil spring
    let lockTarget = null;
    let started = false;
    let fireTimer;

    addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        if (!started) {
            // first sighting: appear right at the mouse instead of flying in from the corner
            cx = mouseX; cy = mouseY;
            started = true;
            requestAnimationFrame(frame);
        }
        reticle.classList.add('is-visible');
    }, { passive: true });

    // Hide when the mouse leaves the window or moves into an embedded player
    // (iframes swallow mouse events, so the reticle would otherwise freeze at the edge).
    document.addEventListener('mouseout', e => {
        if (!e.relatedTarget || e.relatedTarget.tagName === 'IFRAME') {
            reticle.classList.remove('is-visible');
        }
    });

    addEventListener('mousedown', () => {
        reticle.classList.add('is-firing');
        clearTimeout(fireTimer);
        fireTimer = setTimeout(() => reticle.classList.remove('is-firing'), FLARE_MS);
        if (!reduceMotion) kickVel += RECOIL * 0.9;
    });

    document.addEventListener('mouseover', e => {
        const el = e.target.closest(LOCKABLE);
        lockTarget = el && !isHuge(el) ? el : null;
        reticle.classList.toggle('is-locked', !!lockTarget);
    });

    // Don't clamp onto something that fills most of the screen — it would just
    // frame the whole window. Fall back to following the mouse instead.
    function isHuge(el) {
        const r = el.getBoundingClientRect();
        return r.width > innerWidth * 0.7 && r.height > innerHeight * 0.5;
    }

    function frame() {
        let tx = mouseX, ty = mouseY, thw = GAP, thh = GAP;
        if (lockTarget && lockTarget.isConnected) {
            const r = lockTarget.getBoundingClientRect();
            if (r.width && r.height) {
                tx = r.left + r.width / 2;
                ty = r.top + r.height / 2;
                thw = r.width / 2 + LOCK_PAD;
                thh = r.height / 2 + LOCK_PAD;
            }
        }

        const f = reduceMotion ? 1 : FOLLOW;
        cx += (tx - cx) * f;
        cy += (ty - cy) * f;
        hw += (thw - hw) * f;
        hh += (thh - hh) * f;

        kickVel += -kick * STIFFNESS;
        kickVel *= DAMPING;
        kick += kickVel;

        const x = hw + kick, y = hh + kick;
        tl.style.transform = `translate(${cx - x}px, ${cy - y}px)`;
        tr.style.transform = `translate(${cx + x - SIZE}px, ${cy - y}px)`;
        bl.style.transform = `translate(${cx - x}px, ${cy + y - SIZE}px)`;
        br.style.transform = `translate(${cx + x - SIZE}px, ${cy + y - SIZE}px)`;
        dot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;

        requestAnimationFrame(frame);
    }
})();
