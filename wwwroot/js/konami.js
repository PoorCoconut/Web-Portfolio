// Konami tank mode for the GAMES page.
// Loaded on demand by Pages/Games.razor (ES module). Nothing here runs until init() is called, and dispose() undoes everything.
//
// Code:  ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight  B  A   (arrows = real arrow keys, B/A = the letter keys)
// Then:  the arrowhead "A" in GAMES becomes a tank.   Left/Right = turn   Z = move   X = shoot   Esc = exit
//
// What can be shot: .folder, [data-hit] and every child of [data-hit-children]. Each gets 2 or 3 HP.
// The sticky <header> is indestructible (bullets just spark off it).

const SEQ = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

// ---------------- tweak me ----------------
const TURN_SPEED = 3.3;       // radians / second
const MOVE_SPEED = 300;       // px / second
const BULLET_SPEED = 820;     // px / second
const BULLET_LIFE = 1.3;      // seconds
const FIRE_COOLDOWN = 0.22;   // seconds between shots (hold X to keep firing)
const TANK_SIZE = 54;         // px tall
const GHOST_OPACITY = 0.1;    // how visible a broken component stays (0 = fully invisible)
const MAX_DEBRIS = 320;
const MAX_PARTICLES = 600;
// ------------------------------------------

let inited = false;
let progress = 0;
let active = false;

let row = null;               // the row of Konami arrows on the page (lights up as you type the code)
let header = null;
let canvas = null, ctx = null;
let dpr = 1, docW = 0, docH = 0;
let targets = [];
let tank = null;
let bullets = [], parts = [], debris = [];
let ghostedA = null;
let hudEl = null, hudTimer = 0, rectTimer = 0, raf = 0, last = 0, clock = 0;
let reduced = false;
let colEdge = '#a09fa6';
const keys = new Set();
let fireQueued = false;       // a quick tap on X always fires, even if the key is released before the next frame

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// =====================================================================================================
// public API (called from Blazor)
// =====================================================================================================
export function init() {
    if (inited) return;
    inited = true;
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const edge = getComputedStyle(document.documentElement).getPropertyValue('--color-edge').trim();
    if (edge) colEdge = edge;
    row = document.querySelector('[data-hit-children]');
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
}

export function dispose() {
    if (!inited) return;
    if (active) deactivate();
    lightRow(0);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    inited = false;
    progress = 0;
}

// =====================================================================================================
// keyboard
// =====================================================================================================
function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const k = String(e.key).toLowerCase();

    if (active) {
        if (k === 'escape') { deactivate(); return; }
        if (k === 'arrowleft' || k === 'arrowright' || k === 'z' || k === 'x') {
            keys.add(k);
            if (k === 'x' && !e.repeat) fireQueued = true;
            e.preventDefault();
        }
        return;
    }

    if (e.repeat) return;
    if (k === SEQ[progress]) {
        progress++;
        lightRow(progress);
        if (progress === SEQ.length) activate();
    } else {
        progress = k === SEQ[0] ? 1 : 0;
        lightRow(progress);
    }
}

function onKeyUp(e) { keys.delete(String(e.key).toLowerCase()); }
function onBlur() { keys.clear(); }

// the 8 arrows + "AB" on the page glow as the code is typed
function lightRow(n) {
    if (!row) return;
    [...row.children].forEach((c, i) => {
        const on = i < 8 ? i < n : n >= 9;
        if (!c.style.transition.includes('filter')) c.style.transition = (c.style.transition ? c.style.transition + ', ' : '') + 'filter .2s, translate .2s';
        c.style.filter = on ? 'drop-shadow(0 0 8px rgba(255,255,255,.95))' : '';
        c.style.translate = on ? '0 -3px' : '';
    });
}

// =====================================================================================================
// start / stop
// =====================================================================================================
function activate() {
    active = true;
    header = document.querySelector('header');
    collectTargets();
    makeCanvas();

    // launch from the arrowhead in the GAMES heading, which stays behind as a faint ghost
    const a = document.querySelector('.arrow-a');
    let x = window.innerWidth / 2 + window.scrollX, y = window.innerHeight / 2 + window.scrollY, scale = 1;
    if (a) {
        const r = a.getBoundingClientRect();
        x = r.left + r.width / 2 + window.scrollX;
        y = r.top + r.height / 2 + window.scrollY;
        scale = Math.max(1, r.height / TANK_SIZE);
        a.style.opacity = '.15';
        ghostedA = a;
    }
    tank = { x, y, a: 0, speed: 0, vx: 0, vy: 0, scale, cool: 0, trail: 0 };
    bullets = []; parts = []; debris = [];

    showHud();
    rectTimer = window.setInterval(refreshRects, 400);
    last = performance.now();
    raf = requestAnimationFrame(frame);
}

function deactivate() {
    active = false;
    cancelAnimationFrame(raf);
    window.clearInterval(rectTimer);
    window.clearTimeout(hudTimer);
    window.removeEventListener('resize', onResize);
    for (const t of targets) {
        t.el.style.opacity = t.saved.opacity;
        t.el.style.transition = t.saved.transition;
        t.el.style.pointerEvents = t.saved.pointerEvents;
    }
    targets = [];
    if (ghostedA) { ghostedA.style.opacity = ''; ghostedA = null; }
    if (canvas) { canvas.remove(); canvas = null; ctx = null; }
    if (hudEl) { hudEl.remove(); hudEl = null; }
    bullets = []; parts = []; debris = []; tank = null;
    keys.clear();
    fireQueued = false;
    progress = 0;
    lightRow(0);
}

function makeCanvas() {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    // above the page (z-10), below the sticky header (z-30)
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:20';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    onResize();
    window.addEventListener('resize', onResize);
}

function onResize() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    refreshRects();
}

function showHud() {
    hudEl = document.createElement('div');
    hudEl.textContent = 'TANK MODE  \u00B7  \u2190 \u2192 TURN  \u00B7  Z MOVE  \u00B7  X SHOOT  \u00B7  ESC EXIT';
    hudEl.style.cssText =
        'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:40;padding:8px 14px;' +
        'border:1px solid ' + colEdge + ';background:rgba(3,0,19,.88);color:#fff;pointer-events:none;white-space:nowrap;' +
        'font:600 12px Electrolize,Instrument Sans,sans-serif;letter-spacing:.2em;transition:opacity .8s';
    document.body.appendChild(hudEl);
    hudTimer = window.setTimeout(() => { if (hudEl) hudEl.style.opacity = '0'; }, 6000);
}

// =====================================================================================================
// targets (the things you can shoot)
// =====================================================================================================
function collectTargets() {
    const els = new Set(document.querySelectorAll('.folder, [data-hit]'));
    document.querySelectorAll('[data-hit-children]').forEach(p => [...p.children].forEach(c => els.add(c)));
    targets = [];
    els.forEach(el => {
        if (el.closest('header')) return;                       // the top nav bar is indestructible
        const max = Math.random() < 0.5 ? 2 : 3;               // 2 or 3 lives
        targets.push({
            el, hp: max, max, r: null, area: 0, live: false,
            saved: { opacity: el.style.opacity, transition: el.style.transition, pointerEvents: el.style.pointerEvents }
        });
        // quick, undelayed fade for damage, whatever transitions the element already has (keeps its hover / reveal animations)
        const tr = getComputedStyle(el).transition;
        el.style.transition = (tr ? tr + ', ' : '') + 'opacity .35s ease 0s';
    });
    refreshRects();
}

// rectangles in DOCUMENT coordinates (they do not change while scrolling), refreshed on resize and every 400 ms
function refreshRects() {
    docW = document.documentElement.clientWidth;
    docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    const MIN = 14;                                             // thin things (dividers) get a fairer hit box
    for (const t of targets) {
        const b = t.el.getBoundingClientRect();
        let x = b.left + window.scrollX, y = b.top + window.scrollY, w = b.width, h = b.height;
        if (h < MIN) { y -= (MIN - h) / 2; h = MIN; }
        if (w < MIN) { x -= (MIN - w) / 2; w = MIN; }
        t.r = { x, y, w, h };
        t.area = w * h;
        // not shootable until it has faded in on the page
        t.live = t.el.isConnected && b.width > 0 && b.height > 0 &&
            (!t.el.classList.contains('reveal') || t.el.classList.contains('is-visible'));
    }
}

function hitTest(px, py) {
    let best = null;
    for (const t of targets) {
        if (t.hp <= 0 || !t.live) continue;                     // broken things ignore bullets
        const r = t.r;
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h && (!best || t.area < best.area)) best = t;
    }
    return best;
}

// =====================================================================================================
// damage
// =====================================================================================================
function hurt(t, px, py, b) {
    t.hp--;
    ring(px, py, 16, 0.28, '#ffffff');
    burst(px, py, Math.atan2(-b.vy, -b.vx), 1.3, 9, 0.45, '#ffffff');
    if (t.hp > 0) {
        t.el.style.opacity = String(0.45 + 0.55 * (t.hp / t.max));   // visibly more battered each hit
        shake(t.el);
    } else {
        kill(t, px, py);
    }
}

function kill(t, px, py) {
    t.el.style.opacity = String(GHOST_OPACITY);
    t.el.style.pointerEvents = 'none';
    ring(px, py, 46, 0.55, '#ffffff');
    burst(px, py, 0, Math.PI, 28, 0.8, '#ffffff');
    burst(px, py, 0, Math.PI, 14, 1.0, colEdge);
    spawnDebris(t);
}

function shake(el) {
    if (reduced || !el.animate) return;
    el.animate([
        { translate: '0 0', filter: 'brightness(2.4)' },
        { translate: '-3px 1px', filter: 'brightness(1.6)', offset: 0.3 },
        { translate: '3px -2px', offset: 0.6 },
        { translate: '0 0', filter: 'brightness(1)' }
    ], { duration: 220, easing: 'ease-out' });
}

function bonk(px, py) {                                         // bullet hit the indestructible header
    burst(px, py, Math.PI / 2, 1.2, 7, 0.4, colEdge);
    ring(px, py, 12, 0.22, colEdge);
    if (!reduced && header && header.animate)
        header.animate([{ filter: 'brightness(1.9)' }, { filter: 'brightness(1)' }], { duration: 180 });
}

// =====================================================================================================
// debris
// =====================================================================================================
function spawnDebris(t) {
    const r = t.r;
    const n = clamp(Math.round((r.w * r.h) / 5500) + 6, 6, 26);
    const base = clamp(Math.sqrt(r.w * r.h) / 9, 4, 15);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let i = 0; i < n; i++) {
        const x = r.x + Math.random() * r.w, y = r.y + Math.random() * r.h;
        const ang = Math.atan2(y - cy, x - cx), sp = rnd(50, 220);
        const sides = Math.random() < 0.5 ? 3 : 4;
        const verts = [];
        for (let k = 0; k < sides; k++) {
            const a = (k / sides) * Math.PI * 2 + rnd(-0.4, 0.4), rad = rnd(0.6, 1);
            verts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
        }
        debris.push({
            x, y, vx: Math.cos(ang) * sp + rnd(-30, 30), vy: Math.sin(ang) * sp + rnd(-30, 30),
            rot: rnd(0, 6.28), vr: rnd(-4, 4), spin: rnd(-0.7, 0.7), size: base * rnd(0.45, 1.1),
            verts, fill: Math.random() < 0.35, ph: rnd(0, 6.28)
        });
        if (debris.length > MAX_DEBRIS) debris.shift();
    }
}

function updateDebris(dt) {
    const drag = Math.exp(-dt * 0.55);
    const R = TANK_SIZE * 0.42;
    for (const d of debris) {
        // gentle zero-gravity wander so it keeps floating instead of stopping
        d.vx += Math.cos(clock * 0.6 + d.ph) * 10 * dt;
        d.vy += Math.sin(clock * 0.5 + d.ph * 1.3) * 10 * dt;
        d.vx *= drag; d.vy *= drag;
        d.vr += (d.spin - d.vr) * dt * 0.4;

        // the tank shoves debris around
        if (tank) {
            const dx = d.x - tank.x, dy = d.y - tank.y, dist = Math.hypot(dx, dy), min = R + d.size * 0.8;
            if (dist < min) {
                const nx = dist > 1e-3 ? dx / dist : 1, ny = dist > 1e-3 ? dy / dist : 0;
                d.x = tank.x + nx * min; d.y = tank.y + ny * min;
                const rel = (d.vx - tank.vx) * nx + (d.vy - tank.vy) * ny;   // < 0 when moving into each other
                const push = (rel < 0 ? -rel * 1.5 : 0) + 40;
                d.vx += nx * push + tank.vx * 0.35;
                d.vy += ny * push + tank.vy * 0.35;
                d.vr += rnd(-4, 4);
            }
        }

        const sp = Math.hypot(d.vx, d.vy);
        if (sp > 520) { d.vx *= 520 / sp; d.vy *= 520 / sp; }

        d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
        if (d.x < d.size) { d.x = d.size; d.vx = Math.abs(d.vx) * 0.6; }
        else if (d.x > docW - d.size) { d.x = docW - d.size; d.vx = -Math.abs(d.vx) * 0.6; }
        if (d.y < d.size) { d.y = d.size; d.vy = Math.abs(d.vy) * 0.6; }
        else if (d.y > docH - d.size) { d.y = docH - d.size; d.vy = -Math.abs(d.vy) * 0.6; }
    }
}

// =====================================================================================================
// particles
// =====================================================================================================
function burst(x, y, dir, spread, n, life, color) {
    for (let i = 0; i < n && parts.length < MAX_PARTICLES; i++) {
        const a = dir + rnd(-spread, spread), sp = rnd(80, 380), l = life * rnd(0.5, 1);
        parts.push({ k: 's', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: l, max: l, color });
    }
}

function ring(x, y, r, life, color) {
    if (parts.length < MAX_PARTICLES) parts.push({ k: 'r', x, y, r, life, max: life, color });
}

function updateParticles(dt) {
    const slow = Math.exp(-dt * 3.2);
    for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        if (p.k === 's') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= slow; p.vy *= slow; }
    }
}

// =====================================================================================================
// bullets
// =====================================================================================================
function fire() {
    const dx = Math.sin(tank.a), dy = -Math.cos(tank.a);
    const tip = TANK_SIZE * 0.55;
    const x = tank.x + dx * tip, y = tank.y + dy * tip;
    bullets.push({ x, y, vx: dx * BULLET_SPEED, vy: dy * BULLET_SPEED, life: BULLET_LIFE });
    burst(x, y, tank.a - Math.PI / 2, 0.5, 4, 0.18, '#ffffff');
    tank.cool = FIRE_COOLDOWN;
}

function updateBullets(dt) {
    const hb = header ? header.getBoundingClientRect().bottom : 0;     // viewport coords: the header is sticky
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.life -= dt;
        const mx = b.vx * dt, my = b.vy * dt;
        const steps = Math.max(1, Math.ceil(Math.hypot(mx, my) / 5));   // small steps so fast bullets cannot skip a thin target
        let dead = b.life <= 0;
        for (let s = 1; s <= steps && !dead; s++) {
            const px = b.x + (mx * s) / steps, py = b.y + (my * s) / steps;
            if (py - window.scrollY <= hb) { bonk(px, py); dead = true; }
            else if (px < 0 || px > docW || py < 0 || py > docH) dead = true;
            else {
                const t = hitTest(px, py);
                if (t) { hurt(t, px, py, b); dead = true; }          // the bullet is consumed, it never pierces
            }
        }
        if (dead) bullets.splice(i, 1);
        else { b.x += mx; b.y += my; }
    }
}

// =====================================================================================================
// main loop
// =====================================================================================================
function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    updateTank(dt);
    follow(dt);
    updateBullets(dt);
    updateDebris(dt);
    updateParticles(dt);
    draw();
}

function updateTank(dt) {
    const turn = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
    tank.a += turn * TURN_SPEED * dt;

    const want = keys.has('z') ? MOVE_SPEED : 0;
    tank.speed += (want - tank.speed) * Math.min(1, dt * (want ? 9 : 7));
    const dx = Math.sin(tank.a), dy = -Math.cos(tank.a);
    tank.vx = dx * tank.speed;
    tank.vy = dy * tank.speed;

    const r = TANK_SIZE / 2;
    tank.x = clamp(tank.x + tank.vx * dt, r, Math.max(r, docW - r));
    tank.y = clamp(tank.y + tank.vy * dt, r, Math.max(r, docH - r));
    tank.scale += (1 - tank.scale) * Math.min(1, dt * 6);          // shrinks from heading size to tank size on launch

    // little exhaust behind it while driving
    tank.trail -= dt;
    if (want && tank.trail <= 0) {
        burst(tank.x - dx * TANK_SIZE * 0.4, tank.y - dy * TANK_SIZE * 0.4, tank.a + Math.PI / 2, 0.35, 1, 0.3, colEdge);
        tank.trail = 0.04;
    }

    tank.cool -= dt;
    if ((fireQueued || keys.has('x')) && tank.cool <= 0) { fireQueued = false; fire(); }
}

// keep the tank on screen: scroll the page when it gets near the top or bottom edge
function follow(dt) {
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    const top = headerBottom + 80, bottom = window.innerHeight - 120;
    const sy = tank.y - window.scrollY;
    let delta = 0;
    if (sy < top) delta = sy - top;
    else if (sy > bottom) delta = sy - bottom;
    if (delta) window.scrollBy({ top: delta * Math.min(1, dt * 6), behavior: 'instant' });
}

// =====================================================================================================
// drawing (one fixed canvas; world objects are stored in document coords and shifted by the scroll)
// =====================================================================================================
function draw() {
    const sx = window.scrollX, sy = window.scrollY, vw = window.innerWidth, vh = window.innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // debris
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = colEdge;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const d of debris) {
        const x = d.x - sx, y = d.y - sy;
        if (x < -30 || x > vw + 30 || y < -30 || y > vh + 30) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(d.rot);
        ctx.beginPath();
        d.verts.forEach(([vx, vy], i) => (i ? ctx.lineTo(vx * d.size, vy * d.size) : ctx.moveTo(vx * d.size, vy * d.size)));
        ctx.closePath();
        if (d.fill) ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // particles
    for (const p of parts) {
        const x = p.x - sx, y = p.y - sy;
        const f = p.life / p.max;
        ctx.globalAlpha = f;
        ctx.strokeStyle = p.color;
        if (p.k === 's') {
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - p.vx * 0.035, y - p.vy * 0.035);
            ctx.stroke();
        } else {
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(x, y, p.r * (1 - f * f), 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;

    // bullets
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(255,255,255,.9)';
    ctx.shadowBlur = 8;
    for (const b of bullets) {
        const x = b.x - sx, y = b.y - sy, len = Math.hypot(b.vx, b.vy);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (b.vx / len) * 12, y - (b.vy / len) * 12);
        ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // tank: same arrowhead shape as the "A" in GAMES, pointing up when angle = 0
    const k = (TANK_SIZE / 64) * tank.scale;
    ctx.save();
    ctx.translate(tank.x - sx, tank.y - sy);
    ctx.rotate(tank.a);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,.4)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, -32 * k);
    ctx.lineTo(28 * k, 32 * k);
    ctx.lineTo(0, 15 * k);
    ctx.lineTo(-28 * k, 32 * k);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
