// content.js - DEDHD FocusFlow v2 | 15 Signals + Hybrid Scoring
(function () {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;

    try {

    // ═══════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════
    let simplificationAllowed = null;
    let masterLevel = 0;

    // Raw signal data
    const raw = {
        // Typing
        keyTimestamps: [],
        backspaceTimestamps: [],
        pasteTimestamps: [],
        lastInputEl: null,
        lastInputActivity: Date.now(),

        // Mouse
        mousePositions: [],
        clickTimestamps: [],
        rageZones: {}, // "x,y" → [timestamps]
        cursorLeft: false,
        cursorLeftTimestamp: 0,

        // Scroll
        scrollTimestamps: [],
        lastScrollY: window.scrollY,
        lastScrollTime: Date.now(),

        // Tab / Window
        tabSwitchTimestamps: [],
        resizeTimestamps: [],
        zoomChanges: [],
        lastDevicePixelRatio: window.devicePixelRatio,

        // Time
        pageLoadTime: Date.now(),

        // NEW SIGNALS
        selectionTimestamps: [],
        randomClickTimestamps: [],
        scrollDirectionFlips: [],
        lastScrollDir: null,
    };

    // Computed signal levels (0=none, 1=green, 2=orange, 3=red)
    const signals = {
        typingSpeed: 0,
        mouseJitter: 0,
        idle: 0,
        scrollSpeed: 0,
        tabSwitching: 0,
        rapidClicking: 0,
        copyPaste: 0,
        inputInactivity: 0,
        windowResize: 0,
        cursorLeaving: 0,
        readingSpeed: 0,
        backspaceRate: 0,
        rageClicking: 0,
        zoomChanges: 0,
        timeOnPage: 0,
        textSelection: 0,
        randomClicks: 0,
        scrollReversals: 0,
    };

    // ═══════════════════════════════════════════════════════════════════
    // EVENT LISTENERS — collect raw data
    // ═══════════════════════════════════════════════════════════════════

    // Typing speed & backspace rate
    document.addEventListener('keydown', (e) => {
        const now = Date.now();
        raw.keyTimestamps.push(now);
        if (e.key === 'Backspace' || e.key === 'Delete') raw.backspaceTimestamps.push(now);

        if (e.key.length === 1 && e.key !== ' ') {
            if (!raw.consecutiveChars) raw.consecutiveChars = 0;
            raw.consecutiveChars++;
        } else if (e.key === ' ' || e.key === 'Enter') {
            raw.consecutiveChars = 0;
        }

        if (raw.lastInputEl) raw.lastInputActivity = now;
    });


    document.addEventListener('paste', () => raw.pasteTimestamps.push(Date.now()));
    document.addEventListener('copy', () => raw.pasteTimestamps.push(Date.now()));

    // Input focus tracking
    document.addEventListener('focusin', (e) => {
        if (e.target.matches('input, textarea, [contenteditable]')) {
            raw.lastInputEl = e.target;
            raw.lastInputActivity = Date.now();
        }
    });

    // Mouse jitter + cursor leaving
    document.addEventListener('mousemove', (e) => {
        raw.mousePositions.push({ x: e.clientX, y: e.clientY, t: Date.now() });
        if (raw.mousePositions.length > 60) raw.mousePositions.shift();
    });
    document.addEventListener('mouseleave', () => {
        raw.cursorLeft = true;
        raw.cursorLeftTimestamp = Date.now();
    });
    document.addEventListener('mouseenter', () => { raw.cursorLeft = false; });

    // Clicks + rage clicking + random clicking
    document.addEventListener('click', (e) => {
        const now = Date.now();
        raw.clickTimestamps.push(now);

        const isInteractive = e.target.closest('a, button, input, select, textarea, [role="button"], [role="link"], [contenteditable]');
        if (!isInteractive) {
            raw.randomClickTimestamps.push(now);
        }

        const zone = `${Math.round(e.clientX / 60)},${Math.round(e.clientY / 60)}`;
        if (!raw.rageZones[zone]) raw.rageZones[zone] = [];
        raw.rageZones[zone].push(now);
        // Clean old zones
        Object.keys(raw.rageZones).forEach(k => {
            raw.rageZones[k] = raw.rageZones[k].filter(t => now - t < 3000);
            if (raw.rageZones[k].length === 0) delete raw.rageZones[k];
        });
    });

    // Scroll speed + reading speed + scroll reversals
    document.addEventListener('scroll', () => {
        const now = Date.now();
        const dy = window.scrollY - raw.lastScrollY;
        const absDy = Math.abs(dy);
        const dt = now - raw.lastScrollTime;
        const speed = dt > 0 ? absDy / dt : 0; // px/ms

        if (absDy > 5) {
            const currentDir = dy > 0 ? 'down' : 'up';
            if (raw.lastScrollDir && raw.lastScrollDir !== currentDir) {
                raw.scrollDirectionFlips.push(now);
            }
            raw.lastScrollDir = currentDir;
        }

        raw.scrollTimestamps.push({ speed, t: now });
        if (raw.scrollTimestamps.length > 30) raw.scrollTimestamps.shift();

        raw.lastScrollY = window.scrollY;
        raw.lastScrollTime = now;
    });

    // Text selection
    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection().toString().trim();
        if (sel.length > 0) {
            const now = Date.now();
            const lastSel = raw.selectionTimestamps[raw.selectionTimestamps.length - 1] || 0;
            if (now - lastSel > 500) { // throttle
                raw.selectionTimestamps.push(now);
            }
        }
    });

    // Window resize
    window.addEventListener('resize', () => raw.resizeTimestamps.push(Date.now()));

    // Zoom detection via devicePixelRatio change
    setInterval(() => {
        if (window.devicePixelRatio !== raw.lastDevicePixelRatio) {
            raw.zoomChanges.push(Date.now());
            raw.lastDevicePixelRatio = window.devicePixelRatio;
        }
    }, 500);

    // Tab switching (visibility API)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) raw.tabSwitchTimestamps.push(Date.now());
    });

    // ═══════════════════════════════════════════════════════════════════
    // SIGNAL COMPUTATION — runs every 2 seconds
    // ═══════════════════════════════════════════════════════════════════

    const now = () => Date.now();
    const recentCount = (arr, windowMs) => arr.filter(t => now() - t < windowMs).length;
    const recentCountObj = (arr, windowMs) => arr.filter(item => now() - item.t < windowMs).length;

    const computeSignals = () => {
        const t = now();
        const WIN = 10000; // 10s window for most signals

        // 1. TYPING SPEED (WPM) — count keypresses in last 10s, estimate WPM
        const keys10s = recentCount(raw.keyTimestamps, WIN);
        const wpm = (keys10s / 5) * 6; // rough WPM
        signals.typingSpeed = wpm > 120 ? 3 : wpm > 80 ? 2 : wpm > 40 ? 1 : 0;
        if (wpm > 80 && raw.consecutiveChars > 15) {
            signals.typingSpeed = 4; // gibberish detected
        }

        // 2. MOUSE JITTER — avg direction change per move
        const recent = raw.mousePositions.filter(p => t - p.t < 2000);
        let jitterScore = 0;
        for (let i = 2; i < recent.length; i++) {
            const dx1 = recent[i-1].x - recent[i-2].x;
            const dy1 = recent[i-1].y - recent[i-2].y;
            const dx2 = recent[i].x - recent[i-1].x;
            const dy2 = recent[i].y - recent[i-1].y;
            const dot = dx1*dx2 + dy1*dy2;
            const mag = (Math.hypot(dx1,dy1) * Math.hypot(dx2,dy2)) || 1;
            const angle = Math.acos(Math.max(-1, Math.min(1, dot/mag)));
            jitterScore += angle;
        }
        const avgJitter = recent.length > 2 ? jitterScore / (recent.length - 2) : 0;
        signals.mouseJitter = avgJitter > 1.8 ? 3 : avgJitter > 1.2 ? 2 : avgJitter > 0.7 ? 1 : 0;

        // 3. IDLE — no keyboard/mouse activity
        const lastKey = raw.keyTimestamps[raw.keyTimestamps.length - 1] || 0;
        const lastMouse = raw.mousePositions[raw.mousePositions.length - 1]?.t || 0;
        const lastActivity = Math.max(lastKey, lastMouse);
        const idleSec = (t - lastActivity) / 1000;
        signals.idle = idleSec > 120 ? 3 : idleSec > 45 ? 2 : idleSec > 15 ? 1 : 0;

        // 4. SCROLL SPEED — px/ms
        const recentScrolls = raw.scrollTimestamps.filter(s => t - s.t < 3000);
        const avgSpeed = recentScrolls.length
            ? recentScrolls.reduce((a, s) => a + s.speed, 0) / recentScrolls.length
            : 0;
        signals.scrollSpeed = avgSpeed > 5 ? 3 : avgSpeed > 2.5 ? 2 : avgSpeed > 1 ? 1 : 0;

        // 5. TAB SWITCHING — switches in last 30s
        const tabs30 = recentCount(raw.tabSwitchTimestamps, 30000);
        const tabs3 = recentCount(raw.tabSwitchTimestamps, 3000);
        signals.tabSwitching = (tabs3 >= 3) ? 4 : tabs30 > 8 ? 3 : tabs30 > 4 ? 2 : tabs30 > 2 ? 1 : 0;

        // 6. RAPID CLICKING — clicks in last 5s
        const clicks5 = recentCount(raw.clickTimestamps, 5000);
        signals.rapidClicking = clicks5 > 10 ? 3 : clicks5 > 6 ? 2 : clicks5 > 3 ? 1 : 0;

        // 7. COPY-PASTE — pastes in last 30s
        const pastes30 = recentCount(raw.pasteTimestamps, 30000);
        signals.copyPaste = pastes30 > 8 ? 3 : pastes30 > 4 ? 2 : pastes30 > 1 ? 1 : 0;

        // 8. INPUT INACTIVITY — focused on input but not typing
        if (raw.lastInputEl) {
            const inputIdleSec = (t - raw.lastInputActivity) / 1000;
            signals.inputInactivity = inputIdleSec > 60 ? 3 : inputIdleSec > 30 ? 2 : inputIdleSec > 10 ? 1 : 0;
        } else {
            signals.inputInactivity = 0;
        }

        // 9. WINDOW RESIZE — resizes in last 10s
        const resizes10 = recentCount(raw.resizeTimestamps, WIN);
        signals.windowResize = resizes10 > 6 ? 3 : resizes10 > 3 ? 2 : resizes10 > 1 ? 1 : 0;

        // 10. CURSOR LEAVING — how recently / how often
        const leftRecently = raw.cursorLeft || (t - raw.cursorLeftTimestamp < 5000);
        const leftFrequency = recentCount(
            raw.mousePositions.filter(p => false), // placeholder; use tabSwitch as proxy
            WIN
        );
        signals.cursorLeaving = raw.cursorLeft
            ? ((t - raw.cursorLeftTimestamp) > 5000 ? 3 : 2)
            : (leftRecently ? 1 : 0);

        // 11. READING SPEED — very slow scroll = reading, very fast = skimming
        const slowScrolls = recentScrolls.filter(s => s.speed < 0.3 && s.speed > 0);
        const readingRatio = recentScrolls.length ? slowScrolls.length / recentScrolls.length : 1;
        // High ratio = reading slowly = good. Low ratio = skimming = worse
        signals.readingSpeed = readingRatio < 0.2 ? 3 : readingRatio < 0.4 ? 2 : readingRatio < 0.7 ? 1 : 0;

        // 12. BACKSPACE RATE — backspaces in last 10s
        const bs10 = recentCount(raw.backspaceTimestamps, WIN);
        signals.backspaceRate = bs10 > 20 ? 3 : bs10 > 10 ? 2 : bs10 > 5 ? 1 : 0;

        // 13. RAGE CLICKING — zone with 4+ clicks in 3s
        const maxRage = Math.max(0, ...Object.values(raw.rageZones).map(a => a.length));
        signals.rageClicking = maxRage > 6 ? 3 : maxRage > 4 ? 2 : maxRage > 2 ? 1 : 0;

        // 14. ZOOM CHANGES — changes in last 30s
        const zoom30 = recentCount(raw.zoomChanges, 30000);
        signals.zoomChanges = zoom30 > 4 ? 3 : zoom30 > 2 ? 2 : zoom30 > 0 ? 1 : 0;

        // 15. TIME ON PAGE — minutes
        const minOnPage = (t - raw.pageLoadTime) / 60000;
        signals.timeOnPage = minOnPage > 30 ? 3 : minOnPage > 15 ? 2 : minOnPage > 5 ? 1 : 0;

        // 16. TEXT SELECTION — frequent highlighting
        const sel30 = recentCount(raw.selectionTimestamps, 30000);
        signals.textSelection = sel30 > 6 ? 3 : sel30 > 3 ? 2 : sel30 > 1 ? 1 : 0;

        // 17. RANDOM CLICKS — clicking non-interactive parts
        const rClick30 = recentCount(raw.randomClickTimestamps, 30000);
        signals.randomClicks = rClick30 > 8 ? 3 : rClick30 > 4 ? 2 : rClick30 > 1 ? 1 : 0;

        // 18. SCROLL REVERSALS — scrolling up/down quickly
        const scrollRev30 = recentCount(raw.scrollDirectionFlips, 30000);
        signals.scrollReversals = scrollRev30 > 5 ? 3 : scrollRev30 > 3 ? 2 : scrollRev30 > 1 ? 1 : 0;

        // Clean up old timestamps
        const cutoff = t - 60000;
        ['keyTimestamps','backspaceTimestamps','pasteTimestamps',
         'clickTimestamps','tabSwitchTimestamps','resizeTimestamps','zoomChanges',
         'selectionTimestamps', 'randomClickTimestamps', 'scrollDirectionFlips']
            .forEach(k => { raw[k] = raw[k].filter(ts => ts > cutoff); });
    };

    // ═══════════════════════════════════════════════════════════════════
    // MASTER SCORE
    // ═══════════════════════════════════════════════════════════════════

    const computeMasterLevel = () => {
        const vals = Object.values(signals);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return avg > 2.0 ? 3 : avg > 1.0 ? 2 : avg > 0.3 ? 1 : 0;
    };

    const computeMasterScore = () => {
        const vals = Object.values(signals);
        return Math.round((vals.reduce((a, b) => a + b, 0) / (vals.length * 3)) * 100);
    };

    // ═══════════════════════════════════════════════════════════════════
    // INDIVIDUAL SIGNAL EFFECTS
    // ═══════════════════════════════════════════════════════════════════

    // Cursor trail for mouse jitter
    let trailActive = false;
    const createTrailDot = (x, y, color) => {
        const dot = document.createElement('div');
        dot.className = 'ff-trail-dot';
        dot.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:8px;height:8px;border-radius:50%;background:${color};pointer-events:none;z-index:99999;opacity:0.8;transition:opacity 0.5s;`;
        document.body.appendChild(dot);
        setTimeout(() => { dot.style.opacity = '0'; setTimeout(() => dot.remove(), 500); }, 100);
    };

    let lastTrailPos = { x: 0, y: 0 };
    document.addEventListener('mousemove', (e) => {
        if (!trailActive) return;
        const dist = Math.hypot(e.clientX - lastTrailPos.x, e.clientY - lastTrailPos.y);
        if (dist > 15) {
            const color = signals.mouseJitter === 3 ? '#FF4D4D' : signals.mouseJitter === 2 ? '#FFA500' : '#00FF88';
            createTrailDot(e.clientX, e.clientY, color);
            lastTrailPos = { x: e.clientX, y: e.clientY };
        }
    });

    // Click ripple
    document.addEventListener('click', (e) => {
        if (signals.rapidClicking === 0 && signals.rageClicking === 0) return;
        const ripple = document.createElement('div');
        const color = signals.rageClicking === 3 ? '#FF4D4D' :
                      signals.rapidClicking >= 2 ? '#FFA500' : '#00FF88';
        ripple.style.cssText = `position:fixed;left:${e.clientX - 20}px;top:${e.clientY - 20}px;width:40px;height:40px;border-radius:50%;border:3px solid ${color};pointer-events:none;z-index:99999;animation:ff-ripple 0.6s ease-out forwards;`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);
    });

    // Edge glow for cursor leaving
    const getEdgeEl = () => document.getElementById('ff-edge-glow') || (() => {
        const el = document.createElement('div'); el.id = 'ff-edge-glow';
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99990;transition:box-shadow 0.5s;';
        document.body.appendChild(el); return el;
    })();


    // Break overlay for timeOnPage lv3
    let breakOverlayShown = false;
    const showBreakOverlay = () => {
        if (breakOverlayShown || document.getElementById('ff-break-overlay')) return;
        breakOverlayShown = true;
        const el = document.createElement('div'); el.id = 'ff-break-overlay';
        el.innerHTML = `<div class="ff-break-inner"><h2>⏸ Time for a break</h2><p>You've been here for 30+ minutes.</p><button onclick="this.parentElement.parentElement.remove()">Dismiss</button></div>`;
        document.body.appendChild(el);
        setTimeout(() => { breakOverlayShown = false; }, 300000); // show again after 5 min
    };

    // Zoom reset nudge
    let zoomNudgeShown = false;
    const showZoomNudge = () => {
        if (zoomNudgeShown || document.getElementById('ff-zoom-nudge')) return;
        zoomNudgeShown = true;
        const el = document.createElement('div'); el.id = 'ff-zoom-nudge';
        el.innerHTML = `Zoom changed — press <kbd>Ctrl+0</kbd> to reset`;
        document.body.appendChild(el);
        setTimeout(() => { el.remove(); zoomNudgeShown = false; }, 4000);
    };

    // ── TOAST HELPER (reusable for any signal message) ───────────────
    const toastTimers = {};
    const showToast = (id, html, durationMs = 4000) => {
        let el = document.getElementById(id);
        if (!el) { el = document.createElement('div'); el.id = id; el.className = 'ff-toast'; document.body.appendChild(el); }
        el.innerHTML = html;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        clearTimeout(toastTimers[id]);
        toastTimers[id] = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(8px)';
        }, durationMs);
    };

    // Copy-paste toast — human language
    const showPasteToast = () => {
        const msg = signals.copyPaste === 3
            ? '😮‍💨 Hey, take a breath. You\'re copying a lot — maybe slow down a little?'
            : '💡 Noticed some heavy copy-pasting. Everything okay?';
        showToast('ff-paste-toast', msg);
    };

    // Tab switching toast — replaces page title too
    let originalTitle = document.title;
    let titleRestoreTimer = null;
    const showTabSwitchNudge = () => {
        const msgs = [
            '🌿 Hey, take a break. You\'ve been jumping around a lot.',
            '😮‍💨 Slow down — switching tabs a lot won\'t help you focus.',
            '💙 Take a moment. breathe. You\'ve got this.',
        ];
        const msg = msgs[Math.floor(Date.now() / 8000) % msgs.length];
        showToast('ff-tab-toast', msg, 5000);

        // Also replace tab title briefly
        clearTimeout(titleRestoreTimer);
        document.title = '🌿 Take a break...';
        titleRestoreTimer = setTimeout(() => { document.title = originalTitle; }, 5000);
    };



    // ── BREATHING CIRCLE ──────────────────────────────────────────────
    const getBreathingCircle = () => {
        let el = document.getElementById('ff-breathing');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ff-breathing';
            el.innerHTML = `
                <div class="ff-breath-ring ff-breath-ring-1"></div>
                <div class="ff-breath-ring ff-breath-ring-2"></div>
                <div class="ff-breath-ring ff-breath-ring-3"></div>
                <div class="ff-breath-core">
                    <span class="ff-breath-text">breathe</span>
                </div>`;
            document.body.appendChild(el);
        }
        return el;
    };

    // Which signals count as "too fast"
    const fastSignals = () => ['typingSpeed','scrollSpeed','rapidClicking','rageClicking','mouseJitter','tabSwitching']
        .some(k => signals[k] === 3);

    let breathingVisible = false;
    let breathHideTimer = null;
    const updateBreathingCircle = () => {
        const shouldShow = fastSignals();
        const el = getBreathingCircle();

        if (shouldShow && !breathingVisible) {
            breathingVisible = true;
            el.classList.add('ff-breath-show');
            clearTimeout(breathHideTimer);
            // Auto-hide after 12s so it doesn't get annoying
            breathHideTimer = setTimeout(() => {
                el.classList.remove('ff-breath-show');
                breathingVisible = false;
            }, 12000);
        } else if (!shouldShow && breathingVisible) {
            el.classList.remove('ff-breath-show');
            breathingVisible = false;
            clearTimeout(breathHideTimer);
        }
    };

    // Apply all individual effects
    const applyIndividualEffects = () => {
        // Mouse jitter → cursor trail
        trailActive = signals.mouseJitter > 0;

        // Idle → color theme
        document.body.classList.remove('ff-idle-lv1', 'ff-idle-lv2', 'ff-idle-lv3');
        if (signals.idle > 0) document.body.classList.add(`ff-idle-lv${signals.idle}`);

        // Cursor leaving → edge glow
        const edge = getEdgeEl();
        if (signals.cursorLeaving === 3)
            edge.style.boxShadow = 'inset 0 0 40px 10px rgba(255,77,77,0.6)';
        else if (signals.cursorLeaving === 2)
            edge.style.boxShadow = 'inset 0 0 30px 6px rgba(255,165,0,0.4)';
        else if (signals.cursorLeaving === 1)
            edge.style.boxShadow = 'inset 0 0 20px 4px rgba(0,255,136,0.3)';
        else
            edge.style.boxShadow = 'none';

        // Scroll speed → body class
        document.body.classList.remove('ff-scroll-lv1', 'ff-scroll-lv2', 'ff-scroll-lv3');
        if (signals.scrollSpeed > 0) document.body.classList.add(`ff-scroll-lv${signals.scrollSpeed}`);


        // Time on page → break overlay
        if (signals.timeOnPage === 3) showBreakOverlay();

        // Zoom nudge
        if (signals.zoomChanges >= 2) showZoomNudge();

        // Copy-paste toast — friendly language
        if (signals.copyPaste >= 2) showPasteToast();

        // Tab switching — title + toast nudge
        if (signals.tabSwitching >= 2) showTabSwitchNudge();
        
        document.body.classList.remove('ff-tab-blur');
        if (signals.tabSwitching === 4) {
            document.body.classList.add('ff-tab-blur');
        }

        // Breathing circle — any "too fast" signal at lv3
        updateBreathingCircle();

        // Input inactivity → shake the focused input
        document.querySelectorAll('.ff-input-shake').forEach(el => el.classList.remove('ff-input-shake'));
        if (signals.inputInactivity === 3 && raw.lastInputEl) raw.lastInputEl.classList.add('ff-input-shake');

        // Window resize → border flash
        document.body.classList.remove('ff-resize-flash');
        if (signals.windowResize >= 2) {
            document.body.classList.add('ff-resize-flash');
            setTimeout(() => document.body.classList.remove('ff-resize-flash'), 600);
        }

        // Typing speed → screen shake at lv3, infinite at lv4 (gibberish)
        document.body.classList.remove('ff-type-shake', 'ff-type-shake-severe');
        if (signals.typingSpeed === 4) {
            document.body.classList.add('ff-type-shake-severe');
        } else if (signals.typingSpeed === 3) {
            document.body.classList.add('ff-type-shake');
        }

        // Backspace rate → typing lock hint at lv3
        document.body.classList.remove('ff-backspace-lv1','ff-backspace-lv2','ff-backspace-lv3');
        if (signals.backspaceRate > 0) document.body.classList.add(`ff-backspace-lv${signals.backspaceRate}`);

        // Spotlight → rapid clicking only
        const spotlight = getFocusSpotlight();
        if (signals.rapidClicking >= 2) {
            spotlight.style.display = 'block';
            setTimeout(() => spotlight.style.opacity = '1', 50); // fade in
        } else {
            spotlight.style.opacity = '0';
            setTimeout(() => spotlight.style.display = 'none', 500);
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // ACTIVE COMFORT UI FIXES
    // ═══════════════════════════════════════════════════════════════════

    // Focus Spotlight (Reading mode helper)
    const getFocusSpotlight = () => document.getElementById('ff-focus-spotlight') || (() => {
        const el = document.createElement('div'); el.id = 'ff-focus-spotlight';
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99980;display:none; transition: opacity 0.5s; opacity: 0;';
        document.body.appendChild(el); return el;
    })();

    document.addEventListener('mousemove', (e) => {
        const spotlight = document.getElementById('ff-focus-spotlight');
        if (spotlight && spotlight.style.display !== 'none') {
            spotlight.style.background = `radial-gradient(circle 250px at ${e.clientX}px ${e.clientY}px, transparent 0%, rgba(0,0,0,0.85) 100%)`;
        }
    });

    // Paragraph hover dimming logic
    let lastHoveredP = null;
    document.addEventListener('mouseover', (e) => {
        if (masterLevel >= 2 && e.target.tagName === 'P') {
            if (lastHoveredP) lastHoveredP.classList.remove('ff-focus-paragraph');
            lastHoveredP = e.target;
            lastHoveredP.classList.add('ff-focus-paragraph');
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // MASTER LEVEL EFFECTS (lv1/lv2/lv3)
    const applyMasterStyles = () => {
        document.body.classList.remove('lv1', 'lv2', 'lv3', 'ff-engaged');
        const revertBtn = document.getElementById('ff-revert-btn');
        
        if (simplificationAllowed === true) {
            document.body.classList.add('ff-engaged');
            if (revertBtn) revertBtn.style.display = 'block';

            if (masterLevel > 0) {
                document.body.classList.add(`lv${masterLevel}`);
            }
            
            // Auto pause videos for level 2 and above
            if (masterLevel >= 2) {
                document.querySelectorAll('video').forEach(v => {
                    if (!v.paused) {
                        try { v.pause(); showToast('ff-vid-toast', '⏸ Video auto-paused to protect focus.', 3500); } catch(e){}
                    }
                });
            }
        } else {
            if (revertBtn) revertBtn.style.display = 'none';
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // CONSENT PROMPT UI
    // ═══════════════════════════════════════════════════════════════════

    const injectUI = () => {
        if (document.getElementById('ff-prompt')) return;

        // Bubble burst prompt
        const promptDiv = document.createElement('div');
        promptDiv.id = 'ff-prompt';
        promptDiv.innerHTML = `
            <div class="ff-bubble-inner">
                <div class="ff-glitch-title" data-text="TAKE A BREATH">TAKE A BREATH</div>
                <p class="ff-bubble-msg">You seem a little frustrated.<br>Calm down a bit, want to enable Focus Mode?</p>
                <div class="ff-bubble-buttons">
                    <button id="ff-yes" class="ff-btn-yes">SURE</button>
                    <button id="ff-no" class="ff-btn-no">NO THANKS</button>
                </div>
                <div class="ff-scanline"></div>
            </div>
            <div class="ff-particles" id="ff-particles"></div>`;
        document.body.appendChild(promptDiv);

        // Revert Focus Mode button
        if (!document.getElementById('ff-revert-btn')) {
            const revertBtn = document.createElement('button');
            revertBtn.id = 'ff-revert-btn';
            revertBtn.innerHTML = '✕ Exit Focus Mode';
            revertBtn.style.cssText = 'display:none; position:fixed; top:20px; right:20px; z-index:999999; background: #FF4D4D; color: #fff; border: 1px solid rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-family: sans-serif; font-size: 12px; font-weight: bold; opacity: 0.9; transition: transform 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
            revertBtn.onmouseover = () => revertBtn.style.transform = 'scale(1.05)';
            revertBtn.onmouseleave = () => revertBtn.style.transform = 'scale(1)';
            revertBtn.onclick = () => {
                simplificationAllowed = false;
                applyMasterStyles();
            };
            document.body.appendChild(revertBtn);
        }

        // Spawn particle bursts
        const spawnParticles = () => {
            const container = document.getElementById('ff-particles');
            if (!container) return;
            container.innerHTML = '';
            for (let i = 0; i < 20; i++) {
                const p = document.createElement('div');
                p.className = 'ff-particle';
                const angle = (Math.PI * 2 * i) / 20;
                const dist = 80 + Math.random() * 60;
                p.style.cssText = `
                    --dx: ${Math.cos(angle) * dist}px;
                    --dy: ${Math.sin(angle) * dist}px;
                    --color: ${['#00FF88','#FF0080','#00BFFF','#FFD700'][Math.floor(Math.random()*4)]};
                    animation-delay: ${Math.random() * 0.3}s;`;
                container.appendChild(p);
            }
        };
        spawnParticles();

        // Auto-dismiss and re-burst every 8s if unanswered
        const burstInterval = setInterval(() => {
            if (simplificationAllowed !== null) { clearInterval(burstInterval); return; }
            promptDiv.classList.remove('ff-burst');
            void promptDiv.offsetWidth; // reflow
            promptDiv.classList.add('ff-burst');
            spawnParticles();
        }, 8000);

        document.getElementById('ff-yes').onclick = () => {
            simplificationAllowed = true;
            promptDiv.classList.add('ff-bubble-exit');
            setTimeout(() => { promptDiv.style.display = 'none'; promptDiv.classList.remove('ff-bubble-exit'); }, 500);
            clearInterval(burstInterval);
            applyMasterStyles();
        };
        document.getElementById('ff-no').onclick = () => {
            simplificationAllowed = false;
            promptDiv.classList.add('ff-bubble-exit');
            setTimeout(() => { promptDiv.style.display = 'none'; promptDiv.classList.remove('ff-bubble-exit'); }, 500);
            clearInterval(burstInterval);
        };

        // Auto-accept after 15s
        setTimeout(() => {
            if (simplificationAllowed === null && masterLevel > 0) {
                simplificationAllowed = true;
                promptDiv.style.display = 'none';
                clearInterval(burstInterval);
                applyMasterStyles();
            }
        }, 15000);

        // Indicators
        if (!document.getElementById('ff-status-dot')) {
            const dot = document.createElement('div'); dot.id = 'ff-status-dot';
            document.body.append(dot);
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // RESPOND TO POPUP
    // ═══════════════════════════════════════════════════════════════════
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === 'GET_CURRENT_STATE') {
            sendResponse({ score: computeMasterScore(), level: masterLevel, signals });
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // MAIN LOOP — every 2 seconds
    // ═══════════════════════════════════════════════════════════════════
    const mainInterval = setInterval(async () => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
            clearInterval(mainInterval);
            return;
        }

        injectUI();
        computeSignals();
        applyIndividualEffects();

        masterLevel = computeMasterLevel();
        const score = computeMasterScore();

        // Show prompt if needed
        const prompt = document.getElementById('ff-prompt');
        if ((masterLevel > 0 || signals.scrollSpeed >= 2) && simplificationAllowed === null && prompt) {
            prompt.style.display = 'flex';
            prompt.classList.add('ff-burst');
        }

        if (simplificationAllowed === true) applyMasterStyles();

        // Update dot color
        const dot = document.getElementById('ff-status-dot');
        const colors = ['transparent', '#00FF88', '#FFA500', '#FF4D4D'];
        if (dot) dot.style.background = colors[masterLevel] || 'transparent';

        try {
            await chrome.runtime.sendMessage({
                type: 'ADHD_LEVEL_UPDATE',
                level: masterLevel,
                score,
                signals: { ...signals }
            });
        } catch (_e) {
            clearInterval(mainInterval);
        }
    }, 2000);

    } catch (e) { /* silent stop */ }
})();