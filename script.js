(function () {
  "use strict";

  var STORAGE_KEY = "catatan-keuangan-v1";

  var CATEGORIES = {
    income: ["Gaji", "Bonus", "Usaha", "Investasi", "Lainnya"],
    expense: ["Makanan", "Transportasi", "Tagihan", "Belanja", "Hiburan", "Kesehatan", "Pendidikan", "Lainnya"]
  };

  var transactions = load();
  var chartMode = "monthly";
  var hitBoxes = [];

  var $ = function (id) { return document.getElementById(id); };
  var form = $("form"), descEl = $("desc"), amountEl = $("amount"),
      categoryEl = $("category"), dateEl = $("date"), listEl = $("list"),
      filterEl = $("filter"), canvas = $("chart"), tooltip = $("tooltip");

  var rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

  /* ---------- Penyimpanan ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
      flashStatus("Tersimpan ✓");
    } catch (e) {
      flashStatus("Gagal menyimpan");
    }
  }

  var statusTimer;
  function flashStatus(text) {
    var el = $("saveStatus");
    el.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.textContent = "Tersimpan otomatis"; }, 1800);
  }

  /* ---------- Util ---------- */
  function todayStr() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function currentType() {
    return document.querySelector('input[name="type"]:checked').value;
  }

  function fillCategories() {
    categoryEl.innerHTML = "";
    CATEGORIES[currentType()].forEach(function (c) {
      var o = document.createElement("option");
      o.value = o.textContent = c;
      categoryEl.appendChild(o);
    });
  }

  function formatDate(s) {
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }

  function shortNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + " M";
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + " jt";
    if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + " rb";
    return String(n);
  }

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ---------- Render ringkasan & daftar ---------- */
  function renderSummary() {
    var inc = 0, exp = 0;
    transactions.forEach(function (t) { if (t.type === "income") inc += t.amount; else exp += t.amount; });
    $("totalIncome").textContent = rupiah.format(inc);
    $("totalExpense").textContent = rupiah.format(exp);
    $("balance").textContent = rupiah.format(inc - exp);
    $("balance").style.color = inc - exp < 0 ? css("--expense") : "";
  }

  function renderList() {
    var f = filterEl.value;
    var rows = transactions
      .filter(function (t) { return f === "all" || t.type === f; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id; });

    listEl.innerHTML = "";
    rows.forEach(function (t) {
      var tr = document.createElement("tr");

      var tdDate = document.createElement("td");
      tdDate.textContent = formatDate(t.date);

      var tdDesc = document.createElement("td");
      tdDesc.textContent = t.desc;

      var tdCat = document.createElement("td");
      var tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = t.category;
      tdCat.appendChild(tag);

      var tdAmt = document.createElement("td");
      tdAmt.className = "amt " + t.type;
      tdAmt.textContent = (t.type === "income" ? "+ " : "− ") + rupiah.format(t.amount);

      var tdDel = document.createElement("td");
      var btn = document.createElement("button");
      btn.className = "del";
      btn.type = "button";
      btn.title = "Hapus";
      btn.setAttribute("aria-label", "Hapus transaksi " + t.desc);
      btn.textContent = "✕";
      btn.addEventListener("click", function () { removeTx(t.id); });
      tdDel.appendChild(btn);

      [tdDate, tdDesc, tdCat, tdAmt, tdDel].forEach(function (td) { tr.appendChild(td); });
      listEl.appendChild(tr);
    });

    $("listEmpty").hidden = rows.length > 0;
  }

  /* ---------- Data diagram ---------- */
  function monthlyData() {
    var now = new Date();
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"),
        label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
        income: 0, expense: 0
      });
    }
    transactions.forEach(function (t) {
      var m = months.find(function (x) { return x.key === t.date.slice(0, 7); });
      if (m) m[t.type] += t.amount;
    });
    return {
      labels: months.map(function (m) { return m.label; }),
      series: [
        { name: "Pemasukan", color: css("--income"), values: months.map(function (m) { return m.income; }) },
        { name: "Pengeluaran", color: css("--expense"), values: months.map(function (m) { return m.expense; }) }
      ]
    };
  }

  function categoryData() {
    var totals = {};
    transactions.forEach(function (t) {
      if (t.type === "expense") totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    var keys = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });
    return {
      labels: keys,
      series: [{ name: "Pengeluaran", color: css("--expense"), values: keys.map(function (k) { return totals[k]; }) }]
    };
  }

  /* ---------- Gambar diagram batang ---------- */
  function niceMax(v) {
    if (v <= 0) return 100000;
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / pow;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
  }

  function drawChart() {
    var data = chartMode === "monthly" ? monthlyData() : categoryData();
    var all = [];
    data.series.forEach(function (s) { all = all.concat(s.values); });
    var hasData = all.some(function (v) { return v > 0; });
    $("chartEmpty").hidden = hasData;

    var box = canvas.parentElement;
    var w = box.clientWidth, h = box.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    hitBoxes = [];

    var legend = $("legend");
    legend.innerHTML = "";
    data.series.forEach(function (s) {
      var span = document.createElement("span");
      var i = document.createElement("i");
      i.style.background = s.color;
      span.appendChild(i);
      span.appendChild(document.createTextNode(s.name));
      legend.appendChild(span);
    });

    if (!hasData) return;

    var textColor = css("--muted"), gridColor = css("--border");
    var pad = { top: 16, right: 12, bottom: 34, left: 52 };
    var cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    var max = niceMax(Math.max.apply(null, all));
    var ticks = 5;

    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (var i = 0; i <= ticks; i++) {
      var val = (max / ticks) * i;
      var y = pad.top + ch - (ch * i) / ticks;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.fillText(shortNum(val), pad.left - 8, y);
    }

    var n = data.labels.length;
    var groupW = cw / n;
    var sCount = data.series.length;
    var barW = Math.min(44, (groupW * 0.7) / sCount);
    var gap = 4;
    var totalBars = barW * sCount + gap * (sCount - 1);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    data.labels.forEach(function (label, idx) {
      var gx = pad.left + groupW * idx + (groupW - totalBars) / 2;
      data.series.forEach(function (s, si) {
        var v = s.values[idx];
        var bh = (v / max) * ch;
        var x = gx + si * (barW + gap);
        var y = pad.top + ch - bh;
        ctx.fillStyle = s.color;
        roundRect(ctx, x, y, barW, bh, 5);
        ctx.fill();
        hitBoxes.push({ x: x, y: y, w: barW, h: Math.max(bh, 4), text: label + " · " + s.name + ": " + rupiah.format(v) });
      });
      ctx.fillStyle = textColor;
      var short = label.length > 11 && w < 520 ? label.slice(0, 9) + "…" : label;
      ctx.fillText(short, pad.left + groupW * idx + groupW / 2, pad.top + ch + 10);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0) { ctx.beginPath(); return; }
    r = Math.min(r, h, w / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  canvas.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var hit = hitBoxes.find(function (b) { return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h; });
    if (hit) {
      tooltip.hidden = false;
      tooltip.textContent = hit.text;
      tooltip.style.left = hit.x + hit.w / 2 + "px";
      tooltip.style.top = hit.y + "px";
    } else {
      tooltip.hidden = true;
    }
  });
  canvas.addEventListener("mouseleave", function () { tooltip.hidden = true; });

  /* ---------- Aksi ---------- */
  function refresh() {
    renderSummary();
    renderList();
    drawChart();
  }

  function removeTx(id) {
    transactions = transactions.filter(function (t) { return t.id !== id; });
    save();
    refresh();
  }

  amountEl.addEventListener("input", function () {
    var digits = amountEl.value.replace(/\D/g, "");
    amountEl.value = digits ? Number(digits).toLocaleString("id-ID") : "";
  });

  document.querySelectorAll('input[name="type"]').forEach(function (r) {
    r.addEventListener("change", fillCategories);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var amount = Number(amountEl.value.replace(/\D/g, ""));
    var desc = descEl.value.trim();
    if (!desc || !amount || !dateEl.value) return;

    transactions.push({
      id: Date.now(),
      type: currentType(),
      desc: desc,
      amount: amount,
      category: categoryEl.value,
      date: dateEl.value
    });
    save();
    refresh();
    descEl.value = "";
    amountEl.value = "";
    descEl.focus();
  });

  filterEl.addEventListener("change", renderList);

  document.querySelectorAll(".seg-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".seg-btn").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      chartMode = b.dataset.mode;
      drawChart();
    });
  });

  $("btnReset").addEventListener("click", function () {
    if (!transactions.length) return;
    if (confirm("Hapus semua transaksi? Tindakan ini tidak bisa dibatalkan.")) {
      transactions = [];
      save();
      refresh();
    }
  });

  $("btnExport").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "keuangan-" + todayStr() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("btnImport").addEventListener("click", function () { $("fileImport").click(); });
  $("fileImport").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error();
        var valid = data.filter(function (t) {
          return t && (t.type === "income" || t.type === "expense") &&
                 typeof t.desc === "string" && Number(t.amount) > 0 &&
                 /^\d{4}-\d{2}-\d{2}$/.test(t.date);
        }).map(function (t, i) {
          return { id: t.id || Date.now() + i, type: t.type, desc: t.desc, amount: Number(t.amount), category: t.category || "Lainnya", date: t.date };
        });
        transactions = valid;
        save();
        refresh();
      } catch (err) {
        alert("File tidak valid. Gunakan file JSON hasil ekspor aplikasi ini.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawChart, 100);
  });
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawChart);
  }

  /* ---------- Mulai ---------- */
  dateEl.value = todayStr();
  fillCategories();
  refresh();
})();