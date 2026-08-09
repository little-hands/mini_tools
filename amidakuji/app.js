/* あみだくじ抽選 */
(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  const entriesEl = document.getElementById("entries");
  const winnerCountEl = document.getElementById("winnerCount");
  const drawBtn = document.getElementById("drawBtn");
  const winnersEl = document.getElementById("winners");
  const svg = document.getElementById("amida");

  // サンプル初期値
  entriesEl.value = ["Alice", "Bob", "Chris", "Dan", "Emi", "Fumi"].join("\n");

  const BALL_COLORS = ["#ff7aa2", "#7ad7f0", "#ffe066", "#8de8b3", "#c8a2ff", "#ffb37a"];

  // SVG 座標系
  const W = 600;
  const H = 560;
  const TOP_Y = 110;         // 縦線の上端（カードの下に少し空ける）
  const BOT_Y = 490;
  const ROW_COUNT = 9;       // 横線の行数
  const SIDE_PAD = 60;
  const CARD_W = 70;
  const CARD_H = 56;
  const CARD_Y = 30;         // カードの上端 y

  let isAnimating = false;

  function parseEntries() {
    return entriesEl.value
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * 横線をランダム生成。
   * 各「行」で隣接ペアを左から見て、ランダムに線を入れる（直前で線が引かれていたら引かない）。
   * 戻り値: rows[rowIndex] = Set<leftColumnIndex>（その行で col と col+1 をつなぐ線）
   */
  function generateBridges(numCols, numRows) {
    const rows = [];
    for (let r = 0; r < numRows; r++) {
      const set = new Set();
      let lastUsed = -2;
      for (let c = 0; c < numCols - 1; c++) {
        if (c === lastUsed + 1) continue; // 同じ行で隣り合う橋を避ける
        if (Math.random() < 0.55) { // 橋の出現密度
          set.add(c);
          lastUsed = c;
        }
      }
      rows.push(set);
    }
    return rows;
  }

  function colX(numCols, col) {
    if (numCols === 1) return W / 2;
    const usable = W - SIDE_PAD * 2;
    return SIDE_PAD + (usable * col) / (numCols - 1);
  }

  function rowY(numRows, rowIdx) {
    // 0..numRows-1 の行を TOP_Y..BOT_Y の間に等間隔配置（端は少し内側）
    const span = BOT_Y - TOP_Y;
    return TOP_Y + (span * (rowIdx + 1)) / (numRows + 1);
  }

  function buildBoard(numCols, labelsBottom, prizeCols) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const bridges = generateBridges(numCols, ROW_COUNT);
    const prizeSet = new Set(prizeCols || []);
    const cards = []; // 各列のカード参照

    // 縦線
    for (let c = 0; c < numCols; c++) {
      const x = colX(numCols, c);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("x2", x);
      line.setAttribute("y1", TOP_Y);
      line.setAttribute("y2", BOT_Y);
      line.setAttribute("class", "v-line");
      svg.appendChild(line);

      // 下の候補名
      const bot = document.createElementNS(SVG_NS, "text");
      bot.setAttribute("x", x);
      bot.setAttribute("y", BOT_Y + 28);
      bot.setAttribute("class", "name-label");
      bot.textContent = labelsBottom[c];
      svg.appendChild(bot);
    }

    // 横線
    for (let r = 0; r < ROW_COUNT; r++) {
      const y = rowY(ROW_COUNT, r);
      for (const c of bridges[r]) {
        const x1 = colX(numCols, c);
        const x2 = colX(numCols, c + 1);
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", x1);
        line.setAttribute("x2", x2);
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.setAttribute("class", "h-line");
        svg.appendChild(line);
      }
    }

    // 上のカード（裏向き ?）
    // SVG transform属性と CSS transform 競合回避のため、外側=位置 / 内側=フリップ の二重 g
    for (let c = 0; c < numCols; c++) {
      const x = colX(numCols, c);
      const isPrize = prizeSet.has(c);
      const outer = document.createElementNS(SVG_NS, "g");
      outer.setAttribute("transform", `translate(${x - CARD_W / 2}, ${CARD_Y})`);

      const inner = document.createElementNS(SVG_NS, "g");
      inner.setAttribute("class", "card");
      inner.setAttribute("data-col", c);
      inner.dataset.prize = isPrize ? "1" : "0";

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "card-rect");
      rect.setAttribute("width", CARD_W);
      rect.setAttribute("height", CARD_H);
      rect.setAttribute("rx", 8);
      rect.setAttribute("ry", 8);
      inner.appendChild(rect);

      const q = document.createElementNS(SVG_NS, "text");
      q.setAttribute("class", "card-q");
      q.setAttribute("x", CARD_W / 2);
      q.setAttribute("y", CARD_H / 2 + 8);
      q.textContent = "?";
      inner.appendChild(q);

      const result = document.createElementNS(SVG_NS, "text");
      result.setAttribute("class", "card-result");
      result.setAttribute("x", CARD_W / 2);
      result.setAttribute("y", CARD_H / 2 + 6);
      result.textContent = isPrize ? "当たり" : "ハズレ";
      result.style.opacity = "0";
      inner.appendChild(result);

      outer.appendChild(inner);
      svg.appendChild(outer);
      cards.push(inner);
    }

    return { bridges, cards };
  }

  function flipCard(card) {
    return new Promise((resolve) => {
      card.classList.add("flipping");
      // フリップ中(scaleX=0)で表示切替
      setTimeout(() => {
        card.classList.add("opened");
        if (card.dataset.prize === "1") card.classList.add("prize");
        const q = card.querySelector(".card-q");
        const r = card.querySelector(".card-result");
        if (q) q.style.opacity = "0";
        if (r) r.style.opacity = "1";
      }, 220);
      setTimeout(() => {
        card.classList.remove("flipping");
        resolve();
      }, 460);
    });
  }

  /**
   * 上端の col からスタートして経路を計算。
   * 戻り値: ポイント配列 [{x,y}, ...]
   */
  function computePath(numCols, bridges, startCol) {
    const points = [];
    let col = startCol;
    points.push({ x: colX(numCols, col), y: TOP_Y });

    for (let r = 0; r < ROW_COUNT; r++) {
      const y = rowY(ROW_COUNT, r);
      // この行に到達
      points.push({ x: colX(numCols, col), y });
      // 左右の橋を確認
      const set = bridges[r];
      if (col > 0 && set.has(col - 1)) {
        col = col - 1;
        points.push({ x: colX(numCols, col), y });
      } else if (col < numCols - 1 && set.has(col)) {
        col = col + 1;
        points.push({ x: colX(numCols, col), y });
      }
    }
    points.push({ x: colX(numCols, col), y: BOT_Y });
    return { points, endCol: col };
  }

  function pathLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return total;
  }

  function pointAt(points, dist) {
    let remaining = dist;
    for (let i = 1; i < points.length; i++) {
      const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (remaining <= seg) {
        const t = seg === 0 ? 0 : remaining / seg;
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
          segIndex: i,
        };
      }
      remaining -= seg;
    }
    const last = points[points.length - 1];
    return { x: last.x, y: last.y, segIndex: points.length };
  }

  function pointsToPathD(points, upToSegIndex, currentPoint) {
    if (points.length === 0) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < upToSegIndex && i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    if (currentPoint) d += ` L ${currentPoint.x} ${currentPoint.y}`;
    return d;
  }

  function animateBall({ points, color, onDone }) {
    const total = pathLength(points);
    const speed = 320; // px/sec
    const duration = (total / speed) * 1000;

    const trail = document.createElementNS(SVG_NS, "path");
    trail.setAttribute("class", "trail");
    trail.setAttribute("stroke", color);
    svg.appendChild(trail);

    const ball = document.createElementNS(SVG_NS, "circle");
    ball.setAttribute("class", "ball");
    ball.setAttribute("r", 10);
    ball.setAttribute("fill", color);
    ball.setAttribute("stroke", "#ffffff");
    ball.setAttribute("stroke-width", "2");
    ball.setAttribute("cx", points[0].x);
    ball.setAttribute("cy", points[0].y);
    svg.appendChild(ball);

    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const dist = total * t;
      const p = pointAt(points, dist);
      ball.setAttribute("cx", p.x);
      ball.setAttribute("cy", p.y);
      trail.setAttribute("d", pointsToPathD(points, p.segIndex, p));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // 玉は到達点に固定（残す）
        onDone();
      }
    }
    requestAnimationFrame(tick);
  }

  function addWinner(name) {
    const li = document.createElement("li");
    li.textContent = `🎉 ${name}`;
    winnersEl.appendChild(li);
  }

  async function draw() {
    if (isAnimating) return;
    const entries = parseEntries();
    const winnerCount = Math.max(1, parseInt(winnerCountEl.value, 10) || 1);

    if (entries.length === 0) {
      alert("候補を1つ以上入力してください");
      return;
    }
    if (winnerCount > entries.length) {
      alert(`当選数（${winnerCount}）が候補数（${entries.length}）を超えています`);
      return;
    }

    winnersEl.innerHTML = "";
    isAnimating = true;
    drawBtn.disabled = true;

    const numCols = entries.length;
    const labelsBottom = entries; // 下は固定順（候補そのまま）

    // 当たりカード位置をランダム選定（N個）
    const prizeCols = shuffle(Array.from({ length: numCols }, (_, i) => i)).slice(0, winnerCount);
    const prizeColsSorted = [...prizeCols].sort((a, b) => a - b);

    const { bridges, cards } = buildBoard(numCols, labelsBottom, prizeCols);

    // ステップ1: カードを左から順にフリップ
    // 最後のカードのフリップ完了(460ms)まで確実に待つ
    for (let c = 0; c < cards.length; c++) {
      flipCard(cards[c]);
      await wait(140);
    }
    await wait(500);

    // ステップ2: 当たりカードから玉発射 → トレース
    for (let i = 0; i < prizeColsSorted.length; i++) {
      const startCol = prizeColsSorted[i];
      const color = BALL_COLORS[i % BALL_COLORS.length];
      const { points, endCol } = computePath(numCols, bridges, startCol);

      await new Promise((resolve) => {
        animateBall({
          points,
          color,
          onDone: () => {
            highlightName(numCols, endCol, color);
            addWinner(labelsBottom[endCol]);
            resolve();
          },
        });
      });
    }

    isAnimating = false;
    drawBtn.disabled = false;
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function highlightName(numCols, col, color) {
    const x = colX(numCols, col);
    const halo = document.createElementNS(SVG_NS, "circle");
    halo.setAttribute("cx", x);
    halo.setAttribute("cy", BOT_Y + 22);
    halo.setAttribute("r", 28);
    halo.setAttribute("fill", color);
    halo.setAttribute("class", "name-halo");
    svg.insertBefore(halo, svg.firstChild);
  }

  drawBtn.addEventListener("click", draw);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      draw();
    }
  });

  // 初期ボード描画（プレビュー）
  function rebuildPreview() {
    const entries = parseEntries();
    if (entries.length > 0) buildBoard(entries.length, entries, []);
  }
  rebuildPreview();
  entriesEl.addEventListener("input", () => { if (!isAnimating) rebuildPreview(); });
})();
