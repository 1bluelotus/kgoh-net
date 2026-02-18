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

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();

        const sectionId = link.dataset.section;

        // Update active nav state
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Update waypoint opacity
        document.querySelectorAll('.waypoint').forEach(w => {
            w.style.opacity = w.dataset.section === sectionId ? '1' : '0.5';
        });

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
    });

    link.addEventListener('mouseenter', () => {
        const sectionId = link.dataset.section;
        const lockElement = document.querySelector(`.waypoint-lock[data-section="${sectionId}"]`);
        const targetIndicator = document.getElementById('target-lock-indicator');

        if (lockElement) lockElement.classList.add('active');
        if (targetIndicator) {
            targetIndicator.setAttribute('opacity', '1');
            targetIndicator.classList.add('blinking');
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
            targetIndicator.classList.remove('blinking');
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

// Music Player Controls
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const trackName = document.getElementById('track-name');

let isPlaying = false;
const playlist = [
    'TRACK_001.MP3',
    'TRACK_002.MP3', 
    'TRACK_003.MP3'
];
let currentTrack = 0;

playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playBtn.textContent = isPlaying ? '❚❚' : '▶';
    
    if (isPlaying) {
        trackName.textContent = playlist[currentTrack];
    }
});

prevBtn.addEventListener('click', () => {
    currentTrack = (currentTrack - 1 + playlist.length) % playlist.length;
    trackName.textContent = playlist[currentTrack];
    if (isPlaying) {
        playBtn.textContent = '❚❚';
    }
});

nextBtn.addEventListener('click', () => {
    currentTrack = (currentTrack + 1) % playlist.length;
    trackName.textContent = playlist[currentTrack];
    if (isPlaying) {
        playBtn.textContent = '❚❚';
    }
});

// Add some glitch effect on page load
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    }, 100);
});

// Optional: Add scanline effect
const scanlineEffect = () => {
    const scanline = document.createElement('div');
    scanline.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.1),
            rgba(0, 0, 0, 0.1) 1px,
            transparent 1px,
            transparent 2px
        );
        pointer-events: none;
        z-index: 999;
        opacity: 0.1;
    `;
    document.body.appendChild(scanline);
};

// Uncomment to enable scanline effect
// scanlineEffect();
