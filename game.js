// Pay2Win web version. Same rules as Pay2Win/Game/FingerDodgeScene.swift, at size 1 (no Growth Tokens).
// The page sets window.P2W_STRINGS before loading this file.
(() => {
  "use strict";

  const S = window.P2W_STRINGS;
  const stage = document.getElementById("stage");
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const ui = {
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    state: document.getElementById("state"),
    over: document.getElementById("over"),
    newBest: document.getElementById("new-best"),
    restart: document.getElementById("restart")
  };

  // Rules, mirrored from FingerDodgeScene.
  const MAX_FRAME_DELTA = 1 / 20;
  const score = (elapsed) => Math.floor(Math.max(0, elapsed) * 10);
  const spawnInterval = (elapsed) => Math.max(0.35, 1.05 - elapsed * 0.018);
  const travelDuration = (elapsed) => Math.max(1.15, 3.4 - elapsed * 0.045);
  const clampedFrameDelta = (delta) => Math.min(MAX_FRAME_DELTA, Math.max(0, delta));

  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  const INK = "#1a3036";
  const OBSTACLE_COLORS = ["#f57a61", "#6eb8e3", "#75cc9c", "#fac242", "#ba96db"];
  const BEST_KEY = "pay2win.web.best";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let background = null;
  const player = { x: 0, y: 0, angle: 0 };
  let obstacles = [];
  let elapsed = 0;
  let sinceSpawn = 0;
  let currentScore = 0;
  let isRunning = false;
  let hasRunEnded = false;
  let pointerDown = false;
  let lastFrame = 0;
  let wobbleStart = -1;
  let best = readBest();

  const random = (min, max) => min + Math.random() * (max - min);
  const pick = (items) => items[Math.floor(Math.random() * items.length)];

  function readBest() {
    try {
      return Math.max(0, parseInt(localStorage.getItem(BEST_KEY), 10) || 0);
    } catch {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch {
      // Private mode or blocked storage: the best score lasts for this visit only.
    }
  }

  // Draws a rectangle centered on (x, y), like SKShapeNode(rectOf:).
  function box(target, x, y, w, h, fill, stroke, lineWidth) {
    if (fill) {
      target.fillStyle = fill;
      target.fillRect(x - w / 2, y - h / 2, w, h);
    }
    if (stroke) {
      target.strokeStyle = stroke;
      target.lineWidth = lineWidth;
      target.strokeRect(x - w / 2, y - h / 2, w, h);
    }
  }

  function text(target, value, x, y, size, weight, color) {
    target.fillStyle = color;
    target.font = `${weight} ${size}px ${FONT}`;
    target.textAlign = "center";
    target.textBaseline = "middle";
    target.fillText(value, x, y);
  }

  function drawBackground() {
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const g = layer.getContext("2d");
    g.scale(pixelRatio, pixelRatio);

    box(g, width / 2, height / 2, width, height, "#61c7e0");
    box(g, width - 58, 155, 54, 54, "#ffdb54", "rgba(51, 89, 87, 0.45)", 3);
    drawCloud(g, 62, 188, 1);
    drawCloud(g, width - 48, 286, 0.72);

    const buildingColors = ["#f0b88a", "#a3c2b8", "#d6a6c7"];
    for (let x = -8, index = 0; x < width; index += 1) {
      const w = 34 + (index % 3) * 12;
      const h = 72 + (index % 4) * 18;
      const cx = x + w / 2;
      const cy = height - 60 - h / 2;
      box(g, cx, cy, w, h, buildingColors[index % 3], "rgba(41, 79, 82, 0.5)", 2);
      box(g, cx - w * 0.18, cy - h * 0.18, 8, 8, "rgba(255, 224, 102, 0.9)");
      x += w + 8;
    }

    box(g, width / 2, height - 30, width + 8, 64, "#e3d17a", "#1f403d", 4);
    box(g, width / 2, height - 66, width + 8, 14, "#70bf63", "#1f403d", 3);
    for (let x = 12, dark = false; x < width; x += 24, dark = !dark) {
      box(g, x, height - 35, 24, 20, dark ? "#c2a657" : "#f5e091");
    }
    return layer;
  }

  function drawCloud(g, x, y, scale) {
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    for (const [px, py, w, h] of [[-31, 5, 34, 24], [-8, -7, 48, 38], [25, 2, 42, 28]]) {
      box(g, px, py, w, h, "#f5fae8", "rgba(46, 107, 110, 0.55)", 2);
    }
    g.restore();
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    box(ctx, 5, 5, 54, 68, "rgba(26, 59, 59, 0.28)");
    box(ctx, 0, 23, 28, 30, "#304f73", INK, 3);
    box(ctx, 0, 2, 48, 40, "#40ad91", INK, 3);
    box(ctx, -17, 2, 12, 34, "#eb5945");
    box(ctx, 0, -31, 36, 32, "#edab85", INK, 3);
    box(ctx, -1, -42, 38, 13, "#293338");
    box(ctx, -7, -31, 4, 4, "#1f2b33");
    box(ctx, 7, -31, 4, 4, "#1f2b33");
    box(ctx, 0, -23, 11, 3, "#753b33");
    ctx.restore();
  }

  function drawObstacle(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.angle);
    box(ctx, 5, 5, o.w, o.h, "rgba(26, 56, 56, 0.42)");
    box(ctx, 0, 0, o.w, o.h, o.color, INK, 3);
    box(ctx, -o.w * 0.28, -(o.h / 2 + 3), 18, 7, "rgba(255, 255, 255, 0.62)", INK, 2);
    text(ctx, o.label, 0, 1, 14, 700, INK);
    ctx.restore();
  }

  function drawGameOver() {
    const cx = width / 2;
    const cy = height / 2 - 58;
    box(ctx, cx + 7, cy + 7, 292, 108, "rgba(23, 51, 51, 0.52)");
    box(ctx, cx, cy, 292, 108, "#fae8a8", INK, 4);
    text(ctx, S.caught, cx, cy - 17, 30, 900, "#eb5945");
    text(ctx, `${S.score.toLocaleUpperCase(S.lang)}: ${currentScore}`, cx, cy + 23, 16, 700, INK);
  }

  function spawnObstacle() {
    const label = pick(S.obstacles);
    const w = Math.min(118, Math.max(68, Array.from(label).length * 8 + 28));
    const inset = 88;
    let start;
    let end;
    switch (Math.floor(Math.random() * 4)) {
      case 0:
        start = [random(0, width), -inset];
        end = [random(0, width), height + inset];
        break;
      case 1:
        start = [width + inset, random(0, height)];
        end = [-inset, random(0, height)];
        break;
      case 2:
        start = [random(0, width), height + inset];
        end = [random(0, width), -inset];
        break;
      default:
        start = [-inset, random(0, height)];
        end = [width + inset, random(0, height)];
    }
    obstacles.push({
      label,
      w,
      h: 42,
      color: pick(OBSTACLE_COLORS),
      angle: random(-0.16, 0.16),
      start,
      end,
      x: start[0],
      y: start[1],
      age: 0,
      duration: travelDuration(elapsed)
    });
  }

  // Bounding box of the obstacle with its shadow and tab, inset by 6 as in the app.
  function obstacleBounds(o) {
    const left = -o.w / 2 - 1.5;
    const right = o.w / 2 + 5;
    const top = -(o.h / 2 + 7.5);
    const bottom = o.h / 2 + 5;
    const cos = Math.cos(o.angle);
    const sin = Math.sin(o.angle);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [px, py] of [[left, top], [right, top], [right, bottom], [left, bottom]]) {
      const x = o.x + px * cos - py * sin;
      const y = o.y + px * sin + py * cos;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return { x0: x0 + 6, y0: y0 + 6, x1: x1 - 6, y1: y1 - 6 };
  }

  function checkCollisions() {
    const px0 = player.x - 22;
    const px1 = player.x + 22;
    const py0 = player.y - 34;
    const py1 = player.y + 34;
    for (const o of obstacles) {
      const b = obstacleBounds(o);
      if (b.x0 < px1 && b.x1 > px0 && b.y0 < py1 && b.y1 > py0) {
        endRun();
        return;
      }
    }
  }

  function setState(message) {
    ui.state.textContent = message;
  }

  function beginRunIfNeeded() {
    if (isRunning || hasRunEnded) return;
    isRunning = true;
    sinceSpawn = 0;
    setState(S.dodge);
  }

  function endRun() {
    isRunning = false;
    hasRunEnded = true;
    pointerDown = false;
    setState(S.caughtBy);

    const isNewBest = currentScore > best;
    if (isNewBest) {
      best = currentScore;
      writeBest(best);
      ui.best.textContent = best;
    }
    ui.newBest.hidden = !isNewBest;
    ui.over.hidden = false;
    ui.restart.focus({ preventScroll: true });
    if (!reducedMotion.matches) wobbleStart = performance.now();
    if (navigator.vibrate) navigator.vibrate(80);
  }

  function restart() {
    obstacles = [];
    elapsed = 0;
    sinceSpawn = 0;
    currentScore = 0;
    isRunning = false;
    hasRunEnded = false;
    wobbleStart = -1;
    player.angle = 0;
    player.x = width / 2;
    player.y = height / 2;
    ui.score.textContent = "0";
    ui.over.hidden = true;
    setState(S.dragToStart);
  }

  function clampPlayer(x, y) {
    player.x = Math.min(Math.max(x, 38), width - 38);
    player.y = Math.min(Math.max(y, 54), height - 96);
  }

  function movePlayer(event) {
    if (hasRunEnded) return;
    beginRunIfNeeded();
    const rect = stage.getBoundingClientRect();
    clampPlayer(event.clientX - rect.left, event.clientY - rect.top);
  }

  // Tilt -0.12, then +0.22, then back to 0 over 0.3 s, as in the app's game-over wobble.
  function wobbleAngle(now) {
    if (wobbleStart < 0) return 0;
    const t = (now - wobbleStart) / 1000;
    if (t < 0.08) return 0.12 * (t / 0.08);
    if (t < 0.2) return 0.12 - 0.22 * ((t - 0.08) / 0.12);
    if (t < 0.3) return -0.1 * (1 - (t - 0.2) / 0.1);
    wobbleStart = -1;
    return 0;
  }

  function step(delta) {
    if (isRunning) {
      elapsed += delta;
      const nextScore = score(elapsed);
      if (nextScore !== currentScore) {
        currentScore = nextScore;
        ui.score.textContent = currentScore;
      }
      sinceSpawn += delta;
      if (sinceSpawn > spawnInterval(elapsed)) {
        spawnObstacle();
        sinceSpawn = 0;
      }
    }

    // Obstacles keep flying after the run ends, like the app's SKActions.
    for (const o of obstacles) {
      o.age += delta;
      const t = Math.min(1, o.age / o.duration);
      const eased = t * t;
      o.x = o.start[0] + (o.end[0] - o.start[0]) * eased;
      o.y = o.start[1] + (o.end[1] - o.start[1]) * eased;
    }
    obstacles = obstacles.filter((o) => o.age < o.duration);

    if (isRunning) checkCollisions();
  }

  function render(now) {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.drawImage(background, 0, 0, width, height);
    for (const o of obstacles) drawObstacle(o);
    player.angle = wobbleAngle(now);
    drawPlayer();
    if (hasRunEnded) drawGameOver();
  }

  function frame(now) {
    const delta = lastFrame ? clampedFrameDelta((now - lastFrame) / 1000) : 0;
    lastFrame = now;
    step(delta);
    render(now);
    requestAnimationFrame(frame);
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    background = drawBackground();
    if (isRunning || hasRunEnded) {
      clampPlayer(player.x, player.y);
    } else {
      player.x = width / 2;
      player.y = height / 2;
    }
  }

  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest("a, button")) return;
    event.preventDefault();
    pointerDown = true;
    if (stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
    movePlayer(event);
  });
  stage.addEventListener("pointermove", (event) => {
    // A mouse keeps steering after the first click; a finger steers while it touches.
    if (pointerDown || (event.pointerType === "mouse" && isRunning)) movePlayer(event);
  });
  for (const type of ["pointerup", "pointercancel"]) {
    stage.addEventListener(type, () => { pointerDown = false; });
  }
  ui.restart.addEventListener("click", restart);
  window.addEventListener("resize", resize);

  ui.best.textContent = best;
  resize();
  restart();
  requestAnimationFrame(frame);
})();
