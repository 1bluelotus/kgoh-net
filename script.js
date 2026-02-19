// Waypoint positions on the minimap
const waypoints = {
    home:    { x: 50,  y: 50  },
    about:   { x: 150, y: 50  },
    studies: { x: 100, y: 80  },
    blog:    { x: 50,  y: 120 },
    photos:  { x: 150, y: 120 },
    resume:  { x: 100, y: 155 }
};

const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('.section');
const arrow = document.getElementById('arrow');

// Arrow state
let currentSection = 'home';
let travelAngle = 0;

// Navigation trail
const navTrail = document.getElementById('nav-trail');
let navigationHistory = ['home'];
let activeTrailGroup = null;   // the currently visible path
let fadingTrailGroup = null;   // the path currently fading out

const TRAIL_DOTS     = 10;
const TRAIL_OPACITY  = 0.4;
const FADE_DURATION  = 300; // ms per dot
const FADE_STAGGER   = 50;  // ms between dot fades

// Sandevistan gradient: bright violet (oldest) → electric blue → cyan (newest)
const SANDEVISTAN_COLORS = ['#7df9ff', '#00f5ff', '#38bdf8', '#8b5cf6', '#c060ff', '#e040fb'];

function hexToRgb(hex) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
    ];
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function interpolateGradient(colors, t) {
    const segments = colors.length - 1;
    const scaled   = t * segments;
    const idx      = Math.min(Math.floor(scaled), segments - 1);
    const segT     = scaled - idx;
    const [r1, g1, b1] = hexToRgb(colors[idx]);
    const [r2, g2, b2] = hexToRgb(colors[idx + 1]);
    return rgbToHex(r1 + (r2 - r1) * segT, g1 + (g2 - g1) * segT, b1 + (b2 - b1) * segT);
}

function getDotColor(index, total) {
    const body = document.body;
    if (body.classList.contains('mode-neon')) {
        return interpolateGradient(SANDEVISTAN_COLORS, index / (total - 1));
    }
    if (body.classList.contains('mode-retro')) return '#33ff33';
    return '#00ffff';
}

function drawTrailPath(fromSection, toSection) {
    const from      = waypoints[fromSection];
    const to        = waypoints[toSection];
    const isCyber   = document.body.classList.contains('mode-neon');
    const group     = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'trail-path');
    group._timeouts = [];

    // Spread dot spawns across the arrow's 500ms CSS transition so each
    // dot pops into existence as the arrow passes through that position.
    const DOT_STAGGER = 480 / TRAIL_DOTS;

    navTrail.appendChild(group);

    for (let i = 0; i < TRAIL_DOTS; i++) {
        const t     = i / (TRAIL_DOTS - 1);
        const cx    = from.x + (to.x - from.x) * t;
        const cy    = from.y + (to.y - from.y) * t;
        const color = getDotColor(i, TRAIL_DOTS);

        const id = setTimeout(() => {
            if (isCyber) {
                const bloom = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                bloom.setAttribute('cx', cx);
                bloom.setAttribute('cy', cy);
                bloom.setAttribute('r', 6);
                bloom.setAttribute('fill', color);
                bloom.setAttribute('opacity', 0.18);
                group.appendChild(bloom);
            }

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', cx);
            dot.setAttribute('cy', cy);
            dot.setAttribute('r', isCyber ? 3.5 : 2);
            dot.setAttribute('fill', color);
            dot.setAttribute('opacity', isCyber ? 0.9 : TRAIL_OPACITY);
            if (isCyber) dot.setAttribute('filter', 'url(#dot-glow)');
            group.appendChild(dot);
        }, i * DOT_STAGGER);

        group._timeouts.push(id);
    }

    return group;
}

function fadeOutTrail(group) {
    if (!group) return;
    // Cancel any dots that haven't spawned yet
    if (group._timeouts) group._timeouts.forEach(id => clearTimeout(id));
    const dots = Array.from(group.querySelectorAll('circle'));
    dots.forEach((dot, i) => {
        setTimeout(() => {
            dot.style.transition = `opacity ${FADE_DURATION}ms ease`;
            dot.setAttribute('opacity', '0');
            dot.style.opacity = '0';
        }, i * FADE_STAGGER);
    });
    // Remove the group after all fades complete
    const totalTime = (dots.length - 1) * FADE_STAGGER + FADE_DURATION;
    setTimeout(() => {
        if (group.parentNode) group.parentNode.removeChild(group);
    }, totalTime + 50);
}

function updateTrail(toSection) {
    const fromSection = navigationHistory[navigationHistory.length - 1];
    if (fromSection === toSection) return;

    // Fade out the previous active trail (it becomes the old trail)
    if (fadingTrailGroup) {
        // Already fading — just let it finish
    }
    if (activeTrailGroup) {
        fadingTrailGroup = activeTrailGroup;
        fadeOutTrail(fadingTrailGroup);
        fadingTrailGroup = null;
    }

    // Draw new path and make it the active trail
    activeTrailGroup = drawTrailPath(fromSection, toSection);

    // Update history (keep last 2)
    navigationHistory.push(toSection);
    if (navigationHistory.length > 2) navigationHistory.shift();
}

// Calculate angle (in degrees) from one waypoint to another.
// Arrow polygon points up by default, so offset atan2 by 90°.
function calculateAngle(fromSection, toSection) {
    const from = waypoints[fromSection];
    const to = waypoints[toSection];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.atan2(dy, dx) * 180 / Math.PI + 90;
}

// Apply both position and rotation in a single consistent transform string
// so the CSS transition can interpolate smoothly between states.
function setArrowTransform(x, y, angle) {
    arrow.setAttribute('transform', `translate(${x}, ${y}) rotate(${angle})`);
}

// Initialize arrow at home, pointing up
setArrowTransform(waypoints.home.x, waypoints.home.y, 0);

// Cycling home greeting
const GREETINGS = ["HI, I'M KEVEN.", "MY NAME'S KEVEN!", "YO! IT'S KEVEN."];

function updateGreeting(advance = true) {
    const el = document.getElementById('home-greeting');
    if (!el) return;
    const idx = parseInt(localStorage.getItem('greetingIndex') || '0');
    el.textContent = GREETINGS[idx];
    if (advance) localStorage.setItem('greetingIndex', (idx + 1) % GREETINGS.length);
}

updateGreeting();

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();

        const sectionId = link.dataset.section;

        // Update active nav state
        navLinks.forEach(l => {
            l.classList.remove('active');
            l.querySelector('.nav-icon').textContent = '●';
        });
        link.classList.add('active');
        link.querySelector('.nav-icon').textContent = '▲';

        // Update waypoint opacity
        document.querySelectorAll('.waypoint').forEach(w => {
            w.style.opacity = w.dataset.section === sectionId ? '1' : '0.5';
        });

        // Draw navigation trail before updating currentSection
        if (sectionId !== currentSection) {
            updateTrail(sectionId);
        }

        // Rotate to face direction of travel, then move simultaneously
        if (sectionId !== currentSection) {
            travelAngle = calculateAngle(currentSection, sectionId);
        }
        const target = waypoints[sectionId];
        setArrowTransform(target.x, target.y, travelAngle);
        currentSection = sectionId;

        // Switch visible section
        sections.forEach(section => {
            if (section.id === sectionId) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });

        if (sectionId === 'home') updateGreeting();
    });

    link.addEventListener('mouseenter', () => {
        const sectionId = link.dataset.section;
        const lockElement = document.querySelector(`.waypoint-lock[data-section="${sectionId}"]`);
        const targetIndicator = document.getElementById('target-lock-indicator');

        if (lockElement) lockElement.classList.add('active');
        if (targetIndicator && sectionId !== currentSection) {
            targetIndicator.setAttribute('opacity', '1');
        }

        // Rotate arrow in place to face the hovered waypoint
        if (sectionId !== currentSection) {
            const hoverAngle = calculateAngle(currentSection, sectionId);
            const pos = waypoints[currentSection];
            setArrowTransform(pos.x, pos.y, hoverAngle);
        }
    });

    link.addEventListener('mouseleave', () => {
        const sectionId = link.dataset.section;
        const lockElement = document.querySelector(`.waypoint-lock[data-section="${sectionId}"]`);
        const targetIndicator = document.getElementById('target-lock-indicator');

        if (lockElement) lockElement.classList.remove('active');
        if (targetIndicator) {
            targetIndicator.setAttribute('opacity', '0');
        }

        // Restore arrow to last travel direction
        const pos = waypoints[currentSection];
        setArrowTransform(pos.x, pos.y, travelAngle);
    });
});

// Clock function for status bar
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds}`;
}

// Update clock immediately and then every second
updateClock();
setInterval(updateClock, 1000);

// Detect and display system information
function detectSystemInfo() {
    // Browser detection
    const userAgent = navigator.userAgent;
    let browserName = 'UNKNOWN';
    
    if (userAgent.indexOf('Firefox') > -1) {
        browserName = 'FIREFOX';
    } else if (userAgent.indexOf('Chrome') > -1) {
        browserName = 'CHROME';
    } else if (userAgent.indexOf('Safari') > -1) {
        browserName = 'SAFARI';
    } else if (userAgent.indexOf('Edge') > -1) {
        browserName = 'EDGE';
    }
    
    // OS detection
    let osName = 'UNKNOWN';
    
    if (userAgent.indexOf('Win') > -1) {
        osName = 'WINDOWS';
    } else if (userAgent.indexOf('Mac') > -1) {
        osName = 'MACOS';
    } else if (userAgent.indexOf('Linux') > -1) {
        osName = 'LINUX';
    } else if (userAgent.indexOf('Android') > -1) {
        osName = 'ANDROID';
    } else if (userAgent.indexOf('iOS') > -1) {
        osName = 'IOS';
    }
    
    // Screen resolution
    const resolution = `${window.screen.width}x${window.screen.height}`;
    
    // Update status bar
    document.getElementById('browser-info').textContent = `BROWSER: ${browserName}`;
    document.getElementById('os-info').textContent = `OS: ${osName}`;
    document.getElementById('resolution-info').textContent = `RES: ${resolution}`;
}

// Initialize system info
detectSystemInfo();

// Last updated date from the document's last-modified timestamp
const lastMod = new Date(document.lastModified);
const pad = n => String(n).padStart(2, '0');
const lastUpdatedStr = `${lastMod.getFullYear()}.${pad(lastMod.getMonth() + 1)}.${pad(lastMod.getDate())}`;
document.getElementById('last-updated').textContent = `UPDATED: ${lastUpdatedStr}`;

// Weather Panel — Open-Meteo (free, no API key)
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=47.6062&longitude=-122.3321' +
    '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph';

// SVG inner markup for each condition (viewBox 0 0 50 50, stroke="currentColor")
const WEATHER_ICONS = {
    clear: `
        <circle cx="25" cy="25" r="8"/>
        <line x1="25" y1="10" x2="25" y2="6"/><line x1="25" y1="44" x2="25" y2="40"/>
        <line x1="10" y1="25" x2="6" y2="25"/><line x1="44" y1="25" x2="40" y2="25"/>
        <line x1="15" y1="15" x2="12" y2="12"/><line x1="38" y1="12" x2="35" y2="15"/>
        <line x1="15" y1="35" x2="12" y2="38"/><line x1="35" y1="35" x2="38" y2="38"/>`,
    partlyCloudy: `
        <circle cx="16" cy="19" r="6"/>
        <line x1="16" y1="9"  x2="16" y2="7"/><line x1="22" y1="13" x2="24" y2="11"/>
        <line x1="10" y1="13" x2="8"  y2="11"/>
        <path d="M12 33 Q12 26 19 26 Q20 21 27 21 Q34 21 36 26 Q41 26 41 33 Q41 38 35 38 L18 38 Q12 38 12 33"/>`,
    cloudy: `
        <path d="M9 30 Q9 22 17 22 Q17 14 26 14 Q35 14 37 22 Q43 22 43 30 Q43 37 36 37 L14 37 Q9 37 9 30"/>`,
    fog: `
        <line x1="8"  y1="17" x2="42" y2="17"/>
        <line x1="5"  y1="25" x2="45" y2="25"/>
        <line x1="8"  y1="33" x2="42" y2="33"/>`,
    rain: `
        <path d="M9 24 Q9 17 17 17 Q17 10 26 10 Q35 10 37 17 Q43 17 43 24 Q43 30 36 30 L14 30 Q9 30 9 24"/>
        <line x1="16" y1="34" x2="14" y2="42"/>
        <line x1="25" y1="34" x2="23" y2="42"/>
        <line x1="34" y1="34" x2="32" y2="42"/>`,
    snow: `
        <path d="M9 24 Q9 17 17 17 Q17 10 26 10 Q35 10 37 17 Q43 17 43 24 Q43 30 36 30 L14 30 Q9 30 9 24"/>
        <line x1="16" y1="35" x2="16" y2="43"/><line x1="12" y1="39" x2="20" y2="39"/>
        <line x1="25" y1="35" x2="25" y2="43"/><line x1="21" y1="39" x2="29" y2="39"/>
        <line x1="34" y1="35" x2="34" y2="43"/><line x1="30" y1="39" x2="38" y2="39"/>`,
    storm: `
        <path d="M9 22 Q9 15 17 15 Q17 8 26 8 Q35 8 37 15 Q43 15 43 22 Q43 28 36 28 L14 28 Q9 28 9 22"/>
        <polyline points="27,28 22,37 28,37 23,47"/>`
};

function codeToIcon(code) {
    if (code === 0)                           return 'clear';
    if (code <= 2)                            return 'partlyCloudy';
    if (code === 3)                           return 'cloudy';
    if (code <= 48)                           return 'fog';
    if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
    if (code <= 77 || (code >= 85 && code <= 86)) return 'snow';
    if (code >= 95)                           return 'storm';
    return 'cloudy';
}

function codeToCondition(code) {
    if (code === 0)  return 'CLEAR SKY';
    if (code === 1)  return 'MAINLY CLEAR';
    if (code === 2)  return 'PARTLY CLOUDY';
    if (code === 3)  return 'OVERCAST';
    if (code <= 48)  return 'FOGGY';
    if (code <= 55)  return 'DRIZZLE';
    if (code <= 65)  return 'RAIN';
    if (code <= 75)  return 'SNOW';
    if (code <= 82)  return 'RAIN SHOWERS';
    if (code <= 86)  return 'SNOW SHOWERS';
    if (code >= 95)  return 'THUNDERSTORM';
    return 'UNKNOWN';
}

async function fetchWeather() {
    try {
        const resp = await fetch(WEATHER_URL);
        const data = await resp.json();
        const c    = data.current;

        document.getElementById('weather-temp').textContent      = `${Math.round(c.temperature_2m)}°`;
        document.getElementById('weather-condition').textContent  = codeToCondition(c.weather_code);
        document.getElementById('weather-humidity').textContent   = `${c.relative_humidity_2m}%`;
        document.getElementById('weather-wind').textContent       = `${Math.round(c.wind_speed_10m)} MPH`;
        document.getElementById('weather-icon').innerHTML         = WEATHER_ICONS[codeToIcon(c.weather_code)];
    } catch {
        document.getElementById('weather-condition').textContent = 'DATA UNAVAILABLE';
    }
}

fetchWeather();
setInterval(fetchWeather, 10 * 60 * 1000);

// Add some glitch effect on page load
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    }, 100);
});

// Visual Mode Selector
const vmDisplay = document.getElementById('vm-display');
const vmBtns = document.querySelectorAll('.vm-btn');
const minimapGridBg = document.getElementById('minimap-grid-bg');

const visualModes = {
    standard: { name: 'STANDARD',    bodyClass: '',           gridPattern: 'grid-standard' },
    retro:    { name: 'DECKARD',     bodyClass: 'mode-retro', gridPattern: 'grid-retro'    },
    neon:     { name: 'CYBERPSYCHO', bodyClass: 'mode-neon',  gridPattern: 'grid-neon'     }
};

function applyVisualMode(modeName) {
    const mode = visualModes[modeName];
    if (!mode) return;

    // Swap body class — all variable overrides live in CSS
    document.body.classList.remove('mode-retro', 'mode-neon');
    if (mode.bodyClass) document.body.classList.add(mode.bodyClass);

    // Swap minimap grid pattern
    if (minimapGridBg) minimapGridBg.setAttribute('fill', `url(#${mode.gridPattern})`);

    // Update target lock label
    const targetLockText = document.getElementById('target-lock-text');
    if (targetLockText) {
        targetLockText.textContent = modeName === 'neon' ? 'SANDEVISTAN: READY' : 'TARGET: LOCKED';
    }

    // Update display and active button
    vmDisplay.textContent = mode.name;
    vmBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === modeName));

    localStorage.setItem('visualMode', modeName);

}

// Load saved mode on page load
applyVisualMode(localStorage.getItem('visualMode') || 'standard');

vmBtns.forEach(btn => btn.addEventListener('click', () => applyVisualMode(btn.dataset.mode)));

// Blog expand / collapse
function expandPost(article) {
    const full = article.querySelector('.blog-full-content');
    full.style.height = full.scrollHeight + 'px';
    full.style.opacity = '1';
    article.classList.add('expanded');
    full.addEventListener('transitionend', () => {
        if (article.classList.contains('expanded')) {
            full.style.height = 'auto';
        }
    }, { once: true });
}

function collapsePost(article) {
    const full = article.querySelector('.blog-full-content');
    full.style.height = full.scrollHeight + 'px';
    full.offsetHeight; // force reflow
    full.style.height = '0';
    full.style.opacity = '0';
    article.classList.remove('expanded');
}

document.querySelectorAll('.blog-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const article = document.getElementById(btn.dataset.target);
        expandPost(article);
    });
});

document.querySelectorAll('.blog-collapse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const article = document.getElementById(btn.dataset.target);
        collapsePost(article);
        article.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});
