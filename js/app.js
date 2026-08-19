/**
 * BNQARM01 — Monitor Arm compatibility filter + instant results
 * Data sources (Free HTML vendor structure):
 *   js/data/MonitorSpec.csv
 *   js/data/BenQArmSpec.csv
 */
(function () {
  "use strict";

  var PREFIX = "BNQARM01";
  var DATA_BASE = "js/data/";
  var MONITOR_CSV = DATA_BASE + "MonitorSpec.csv";
  var ARM_CSV = DATA_BASE + "BenQArmSpec.csv";

  var ARM_TYPE_I18N = {
    "zh-Hant": { single: "單螢幕", dual: "雙螢幕" },
    zh: { single: "單螢幕", dual: "雙螢幕" },
    en: { single: "Single monitor", dual: "Dual monitor" }
  };

  var PER_DISPLAY_I18N = {
    "zh-Hant": " (每螢幕)",
    zh: " (每螢幕)",
    en: " (per display)"
  };

  /** Marketing copy for arm cards */
  var ARM_DISPLAY = {
    BSH01: {
      title: "ERGO ARM 氣壓式螢幕支架 (單臂)",
      sizeLabel: "22 - 24 吋",
      weightLabel: "2 - 20 Kg",
      vesaLabel: "75x75 / 100x100",
      desc: "氣壓式彈簧支架設計，高達 20 公斤的負重能力，為您的螢幕帶來穩定、持久的支撐。"
    },
    BSH02: {
      title: "ERGO ARM 氣壓式螢幕支架 (單臂)",
      sizeLabel: "22 - 45 吋",
      weightLabel: "2 - 20 Kg",
      vesaLabel: "75x75 / 100x100",
      desc: "氣壓式彈簧支架設計，高達 20 公斤的負重能力，為您的螢幕帶來穩定、持久的支撐。"
    },
    BDH01: {
      title: "ERGO ARM 氣壓式螢幕支架 (雙臂)",
      sizeLabel: "17 - 35 吋",
      weightLabel: "2 - 20 Kg",
      vesaLabel: "75x75 / 100x100",
      desc: "雙螢幕氣壓式支架設計，每臂高達 20 公斤負重，彈性調整雙螢幕工作站高度與角度。"
    }
  };

  var state = {
    monitors: [],
    arms: [],
    brand: "",
    size: "",
    model: ""
  };

  function byId(id) {
    return document.getElementById(id);
  }

  /* ——— CSV helpers ——— */

  function parseCsv(text) {
    var rows = [];
    var i = 0;
    var field = "";
    var row = [];
    var inQuotes = false;
    var len = text.length;

    function pushField() {
      row.push(field);
      field = "";
    }

    function pushRow() {
      if (row.length === 1 && row[0] === "" && rows.length === 0) {
        row = [];
        return;
      }
      if (row.length) {
        rows.push(row);
      }
      row = [];
    }

    while (i < len) {
      var ch = text.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ",") {
        pushField();
        i += 1;
        continue;
      }
      if (ch === "\r") {
        i += 1;
        continue;
      }
      if (ch === "\n") {
        pushField();
        pushRow();
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
    }
    pushField();
    pushRow();

    if (!rows.length) {
      return [];
    }

    var headers = rows[0].map(function (h) {
      return String(h || "").trim();
    });
    var records = [];
    for (var r = 1; r < rows.length; r += 1) {
      var cells = rows[r];
      if (!cells.length || (cells.length === 1 && !cells[0])) {
        continue;
      }
      var obj = {};
      for (var c = 0; c < headers.length; c += 1) {
        obj[headers[c]] = cells[c] != null ? String(cells[c]).trim() : "";
      }
      records.push(obj);
    }
    return records;
  }

  function fetchText(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) {
        throw new Error("Failed to load " + url + " (" + res.status + ")");
      }
      return res.text();
    });
  }

  /* ——— Data normalize ——— */

  function normalizeVesa(value) {
    return String(value || "")
      .replace(/[\u00d7\u2715]/g, "x")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function formatVesa(value) {
    var v = normalizeVesa(value);
    if (!v || v === "-") {
      return "—";
    }
    return v;
  }

  function parseWeightKg(value) {
    var s = String(value || "").trim();
    if (!s || s === "-") {
      return null;
    }
    var m = s.match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

  function formatWeight(value) {
    var s = String(value || "").trim();
    if (!s || s === "-") {
      return "—";
    }
    var num = parseWeightKg(s);
    if (num == null) {
      return s;
    }
    if (/含座/.test(s)) {
      return num + " Kg(含座)";
    }
    return num + " Kg";
  }

  function formatSizeInch(value) {
    var s = String(value || "").trim();
    if (!s || s === "-") {
      return "—";
    }
    return s + " 吋";
  }

  function sizeOptionLabel(inch) {
    return formatSizeInch(inch);
  }

  function inchToMm(inch) {
    var n = parseFloat(inch);
    return isNaN(n) ? null : n * 25.4;
  }

  function prepareMonitors(rows) {
    return rows.map(function (r) {
      return {
        brand: r.brand,
        modelName: r.model_name,
        sizeInch: String(r.screen_size_inch || "").trim(),
        isCurved: r.is_curved,
        vesa: r.vesa_pattern,
        weightRaw: r.weight_kg,
        weightKg: parseWeightKg(r.weight_kg),
        depth: r.screen_depth_mm
      };
    });
  }

  function pageLang() {
    var lang = String(document.documentElement.lang || "zh-Hant").toLowerCase();
    if (lang.indexOf("zh") === 0) {
      return "zh-Hant";
    }
    if (lang.indexOf("en") === 0) {
      return "en";
    }
    return "zh-Hant";
  }

  function translateArmType(armType) {
    var map = ARM_TYPE_I18N[pageLang()] || ARM_TYPE_I18N["zh-Hant"];
    var key = String(armType || "").toLowerCase();
    return map[key] || armType || "—";
  }

  function perDisplaySuffix(limitsPerDisplay) {
    var flag = String(limitsPerDisplay || "").toUpperCase();
    if (flag !== "TRUE" && flag !== "1") {
      return "";
    }
    return PER_DISPLAY_I18N[pageLang()] || PER_DISPLAY_I18N["zh-Hant"];
  }

  function formatRange(min, max, unit) {
    if (min == null || isNaN(min) || max == null || isNaN(max)) {
      return "—";
    }
    return min + " - " + max + " " + unit;
  }

  function formatArmVesa(value) {
    var parts = String(value || "")
      .split(";")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    return parts.length ? parts.join(" / ") : "—";
  }

  function prepareArms(rows) {
    return rows.map(function (r) {
      var vesas = String(r.vesa_supported || "")
        .split(";")
        .map(normalizeVesa)
        .filter(Boolean);
      var sizeMinInch = parseFloat(r.size_min_inch);
      var sizeMaxInch = parseFloat(r.size_max_inch);
      return {
        id: r.arm_id,
        brand: r.brand,
        productName: r.product_name,
        color: r.color,
        armType: r.arm_type,
        displays: parseInt(r.displays_supported, 10) || 1,
        vesaRaw: r.vesa_supported,
        vesaList: vesas,
        weightMin: parseFloat(r.weight_min_kg),
        weightMax: parseFloat(r.weight_max_kg),
        sizeMinInch: sizeMinInch,
        sizeMaxInch: sizeMaxInch,
        sizeMinMm: inchToMm(sizeMinInch),
        sizeMaxMm: inchToMm(sizeMaxInch),
        limitsPerDisplay: r.limits_per_display,
        mediaUrl: r.media_url,
        buyUrl: r.buy_url
      };
    });
  }

  function renderSpecTable(arms) {
    var tbody = byId(PREFIX + "-spec-body");
    if (!tbody) {
      return;
    }
    while (tbody.firstChild) {
      tbody.removeChild(tbody.firstChild);
    }

    arms.forEach(function (arm) {
      var suffix = perDisplaySuffix(arm.limitsPerDisplay);
      var tr = document.createElement("tr");

      var tdId = document.createElement("td");
      tdId.className = PREFIX + "-table-model";
      tdId.textContent = arm.id;
      tr.appendChild(tdId);

      var tdSize = document.createElement("td");
      tdSize.textContent = formatRange(arm.sizeMinInch, arm.sizeMaxInch, "吋") + suffix;
      tr.appendChild(tdSize);

      var tdWeight = document.createElement("td");
      tdWeight.textContent = formatRange(arm.weightMin, arm.weightMax, "Kg") + suffix;
      tr.appendChild(tdWeight);

      var tdVesa = document.createElement("td");
      tdVesa.textContent = formatArmVesa(arm.vesaRaw);
      tr.appendChild(tdVesa);

      var tdType = document.createElement("td");
      tdType.textContent = translateArmType(arm.armType);
      tr.appendChild(tdType);

      tbody.appendChild(tr);
    });
  }

  function isMonitorCompatibleWithArm(monitor, arm) {
    var monVesa = normalizeVesa(monitor.vesa);
    if (monVesa && monVesa !== "-" && arm.vesaList.indexOf(monVesa) === -1) {
      return false;
    }
    if (monitor.weightKg != null) {
      if (monitor.weightKg < arm.weightMin || monitor.weightKg > arm.weightMax) {
        return false;
      }
    }
    var sizeMm = inchToMm(monitor.sizeInch);
    if (sizeMm != null && arm.sizeMinMm != null && arm.sizeMaxMm != null) {
      if (sizeMm < arm.sizeMinMm - 0.5 || sizeMm > arm.sizeMaxMm + 0.5) {
        return false;
      }
    }
    return true;
  }

  function noMatchReason(monitor) {
    var reasons = [];
    var vesa = normalizeVesa(monitor.vesa);
    var vesaOk =
      !vesa ||
      vesa === "-" ||
      state.arms.some(function (arm) {
        return arm.vesaList.indexOf(vesa) !== -1;
      });
    if (!vesaOk) {
      reasons.push("VESA 規格不符（需 75x75 或 100x100）");
    }

    if (monitor.weightKg != null) {
      var weightOk = state.arms.some(function (arm) {
        return (
          monitor.weightKg >= arm.weightMin && monitor.weightKg <= arm.weightMax
        );
      });
      if (!weightOk) {
        if (monitor.weightKg < 2) {
          reasons.push("螢幕重量低於支架承重範圍（2 - 20 Kg）");
        } else {
          reasons.push("螢幕重量超出支架承重範圍（2 - 20 Kg）");
        }
      }
    }

    var sizeMm = inchToMm(monitor.sizeInch);
    if (sizeMm != null) {
      var sizeOk = state.arms.some(function (arm) {
        return (
          arm.sizeMinMm != null &&
          arm.sizeMaxMm != null &&
          sizeMm >= arm.sizeMinMm - 0.5 &&
          sizeMm <= arm.sizeMaxMm + 0.5
        );
      });
      if (!sizeOk) {
        reasons.push("螢幕尺寸超出支架適用範圍");
      }
    }

    if (!reasons.length) {
      return "規格未符合支架適用條件";
    }
    return reasons.join("、");
  }

  /* ——— Select UI ——— */

  function clearOptions(selectEl, placeholder) {
    while (selectEl.firstChild) {
      selectEl.removeChild(selectEl.firstChild);
    }
    var opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    selectEl.appendChild(opt);
  }

  function uniqueSorted(values, sortFn) {
    var map = {};
    values.forEach(function (v) {
      if (v != null && v !== "") {
        map[v] = true;
      }
    });
    return Object.keys(map).sort(sortFn);
  }

  function brandList() {
    return uniqueSorted(
      state.monitors.map(function (m) {
        return m.brand;
      }),
      function (a, b) {
        return a.localeCompare(b);
      }
    );
  }

  function sizeList(brand) {
    var sizes = state.monitors
      .filter(function (m) {
        return m.brand === brand;
      })
      .map(function (m) {
        return m.sizeInch;
      });
    return uniqueSorted(sizes, function (a, b) {
      return parseFloat(a) - parseFloat(b);
    });
  }

  function fillBrands(brandSelect) {
    clearOptions(brandSelect, "品牌");
    brandList().forEach(function (brand) {
      var opt = document.createElement("option");
      opt.value = brand;
      opt.textContent = brand;
      brandSelect.appendChild(opt);
    });
  }

  function fillSizes(sizeSelect, brand) {
    clearOptions(sizeSelect, "尺寸");
    if (!brand) {
      return;
    }
    sizeList(brand).forEach(function (size) {
      var opt = document.createElement("option");
      opt.value = size;
      opt.textContent = sizeOptionLabel(size);
      sizeSelect.appendChild(opt);
    });
  }

  /**
   * Renders the model <select> options.
   * filters: { brand, size } — either/both may be omitted.
   * When the filtered set spans more than one brand, options are grouped
   * with <optgroup> so a full/unfiltered list stays scannable. Once a
   * single brand remains, options render flat (no redundant single group).
   * Each <option> carries data-brand/data-size so a direct model pick can
   * sync the brand/size selects without re-searching the monitor list.
   */
  function renderModelOptions(modelSelect, filters) {
    filters = filters || {};
    clearOptions(modelSelect, "型號");

    var monitors = state.monitors.filter(function (m) {
      if (filters.brand && m.brand !== filters.brand) {
        return false;
      }
      if (filters.size && m.sizeInch !== filters.size) {
        return false;
      }
      return true;
    });

    var byBrand = {};
    var brandsInOrder = [];
    monitors.forEach(function (m) {
      if (!byBrand[m.brand]) {
        byBrand[m.brand] = [];
        brandsInOrder.push(m.brand);
      }
      byBrand[m.brand].push(m);
    });
    brandsInOrder.sort(function (a, b) {
      return a.localeCompare(b);
    });

    var grouped = brandsInOrder.length > 1;

    brandsInOrder.forEach(function (brand) {
      var models = byBrand[brand].slice().sort(function (a, b) {
        return a.modelName.localeCompare(b.modelName);
      });

      var container = modelSelect;
      if (grouped) {
        container = document.createElement("optgroup");
        container.label = brand;
        modelSelect.appendChild(container);
      }

      models.forEach(function (m) {
        var opt = document.createElement("option");
        opt.value = m.modelName;
        opt.textContent = m.modelName;
        opt.dataset.brand = m.brand;
        opt.dataset.size = m.sizeInch;
        container.appendChild(opt);
      });
    });
  }

  /* ——— Filters + results ——— */

  function filteredMonitors() {
    return state.monitors.filter(function (m) {
      if (state.brand && m.brand !== state.brand) {
        return false;
      }
      if (state.size && m.sizeInch !== state.size) {
        return false;
      }
      if (state.model && m.modelName !== state.model) {
        return false;
      }
      return true;
    });
  }

  function recommendedArms(monitors) {
    if (!monitors.length) {
      return [];
    }
    return state.arms.filter(function (arm) {
      return monitors.some(function (m) {
        return isMonitorCompatibleWithArm(m, arm);
      });
    });
  }

  function renderNoMatch(text) {
    var el = byId(PREFIX + "-result-nomatch");
    if (!el) {
      return;
    }
    if (!text) {
      el.textContent = "";
      el.hidden = true;
      return;
    }
    el.textContent = text;
    el.hidden = false;
  }

  function clearResults() {
    var title = byId(PREFIX + "-result-title");
    var hint = byId(PREFIX + "-result-hint");
    var tableWrap = byId(PREFIX + "-result-table-wrap");
    var tbody = byId(PREFIX + "-result-body");

    if (title) {
      title.textContent = "搜尋結果型號";
    }
    if (hint) {
      hint.hidden = true;
    }
    if (tableWrap) {
      tableWrap.hidden = true;
    }
    if (tbody) {
      while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
      }
    }
    renderNoMatch("");
    renderRecommendations([]);
  }

  function appendModelCell(tr, monitor, clickable) {
    var tdModel = document.createElement("td");
    tdModel.className = PREFIX + "-result-col-model";

    if (clickable) {
      var modelBtn = document.createElement("button");
      modelBtn.type = "button";
      modelBtn.className = PREFIX + "-model-name";
      modelBtn.textContent = monitor.modelName;
      modelBtn.addEventListener("click", function () {
        applyModelSelection(monitor.brand, monitor.sizeInch, monitor.modelName);
      });
      tdModel.appendChild(modelBtn);
    } else {
      var modelText = document.createElement("span");
      modelText.className = PREFIX + "-model-name";
      modelText.textContent = monitor.modelName;
      tdModel.appendChild(modelText);
    }

    tr.appendChild(tdModel);
  }

  function renderResultPanel(monitors, mode) {
    var title = byId(PREFIX + "-result-title");
    var hint = byId(PREFIX + "-result-hint");
    var tableWrap = byId(PREFIX + "-result-table-wrap");
    var tbody = byId(PREFIX + "-result-body");

    if (!tbody) {
      return;
    }

    while (tbody.firstChild) {
      tbody.removeChild(tbody.firstChild);
    }

    if (!monitors.length) {
      if (title) {
        title.textContent = "查無相符型號";
      }
      if (hint) {
        hint.hidden = true;
      }
      if (tableWrap) {
        tableWrap.hidden = true;
      }
      return;
    }

    var listMode = mode === "list";

    if (title) {
      title.textContent = "搜尋結果型號";
    }
    if (hint) {
      hint.hidden = !listMode;
    }
    if (tableWrap) {
      tableWrap.hidden = false;
    }

    monitors.forEach(function (m) {
      var tr = document.createElement("tr");

      appendModelCell(tr, m, listMode);

      var tdSize = document.createElement("td");
      tdSize.textContent = formatSizeInch(m.sizeInch);
      tr.appendChild(tdSize);

      var tdWeight = document.createElement("td");
      tdWeight.textContent = formatWeight(m.weightRaw);
      tr.appendChild(tdWeight);

      var tdVesa = document.createElement("td");
      tdVesa.textContent = formatVesa(m.vesa);
      tr.appendChild(tdVesa);

      tbody.appendChild(tr);
    });
  }

  function renderRecommendations(arms) {
    var wrap = byId(PREFIX + "-recommend");
    var title = byId(PREFIX + "-recommend-title");
    var section = byId(PREFIX + "-recommend-section");
    if (!wrap) {
      return;
    }
    while (wrap.firstChild) {
      wrap.removeChild(wrap.firstChild);
    }

    if (title) {
      title.hidden = !arms.length;
    }
    if (section) {
      section.hidden = !arms.length;
    }

    arms.forEach(function (arm) {
      var meta = ARM_DISPLAY[arm.id] || {
        title: arm.productName,
        desc: "氣壓式彈簧支架設計，高達 20 公斤的負重能力，為您的螢幕帶來穩定、持久的支撐。"
      };

      var card = document.createElement("article");
      card.className = PREFIX + "-card";

      var media = document.createElement("div");
      media.className = PREFIX + "-card-media";
      var img = document.createElement("img");
      img.className = PREFIX + "-card-img";
      img.src = arm.mediaUrl;
      img.alt = meta.title;
      img.loading = "lazy";
      media.appendChild(img);
      card.appendChild(media);

      var body = document.createElement("div");
      body.className = PREFIX + "-card-body";

      var h = document.createElement("h3");
      h.className = PREFIX + "-card-title";
      h.textContent = meta.title;
      body.appendChild(h);

      var p = document.createElement("p");
      p.className = PREFIX + "-card-desc";
      p.textContent = meta.desc;
      body.appendChild(p);

      if (arm.buyUrl) {
        var a = document.createElement("a");
        a.className = PREFIX + "-card-btn";
        a.href = arm.buyUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "了解詳情";
        body.appendChild(a);
      } else {
        var btn = document.createElement("span");
        btn.className = PREFIX + "-card-btn";
        btn.textContent = "了解詳情";
        body.appendChild(btn);
      }

      card.appendChild(body);
      wrap.appendChild(card);
    });
  }

  function updateResults() {
    if (state.model) {
      var monitors = filteredMonitors();
      renderResultPanel(monitors, "detail");
      if (monitors.length) {
        var arms = recommendedArms(monitors);
        if (arms.length) {
          renderNoMatch("");
          renderRecommendations(arms);
        } else {
          renderRecommendations([]);
          renderNoMatch("尚無匹配的螢幕支架，" + noMatchReason(monitors[0]));
        }
      } else {
        renderRecommendations([]);
        renderNoMatch("");
      }
      return;
    }

    if (state.brand && state.size) {
      renderNoMatch("");
      renderResultPanel(filteredMonitors(), "list");
      renderRecommendations([]);
      return;
    }

    clearResults();
  }

  function resetFilters() {
    var brandSelect = byId(PREFIX + "-brand");
    var sizeSelect = byId(PREFIX + "-size");
    var modelSelect = byId(PREFIX + "-model");

    state.brand = "";
    state.size = "";
    state.model = "";

    if (brandSelect) {
      brandSelect.value = "";
    }
    if (sizeSelect) {
      sizeSelect.disabled = true;
      clearOptions(sizeSelect, "尺寸");
    }
    if (modelSelect) {
      renderModelOptions(modelSelect, {});
    }

    clearResults();
  }

  function onBrandChange(sizeSelect, modelSelect) {
    state.brand = byId(PREFIX + "-brand").value;
    state.size = "";
    state.model = "";

    if (state.brand) {
      sizeSelect.disabled = false;
      fillSizes(sizeSelect, state.brand);
      renderModelOptions(modelSelect, { brand: state.brand });
    } else {
      sizeSelect.disabled = true;
      clearOptions(sizeSelect, "尺寸");
      renderModelOptions(modelSelect, {});
    }

    updateResults();
  }

  function onSizeChange(modelSelect) {
    state.size = byId(PREFIX + "-size").value;
    state.model = "";
    renderModelOptions(modelSelect, { brand: state.brand, size: state.size });
    updateResults();
  }

  /**
   * Applies a specific monitor's brand/size/model across all three selects
   * and immediately refreshes results.
   */
  function applyModelSelection(brand, size, model) {
    var brandSelect = byId(PREFIX + "-brand");
    var sizeSelect = byId(PREFIX + "-size");
    var modelSelect = byId(PREFIX + "-model");

    state.brand = brand;
    state.size = size;
    state.model = model;

    brandSelect.value = brand;
    sizeSelect.disabled = false;
    fillSizes(sizeSelect, brand);
    sizeSelect.value = size;

    renderModelOptions(modelSelect, { brand: brand });
    modelSelect.value = model;

    updateResults();
  }

  function onModelChange(modelSelect) {
    if (modelSelect.value) {
      var opt = modelSelect.selectedOptions[0];
      applyModelSelection(opt.dataset.brand, opt.dataset.size, modelSelect.value);
      return;
    }
    state.model = "";
    renderModelOptions(modelSelect, { brand: state.brand, size: state.size });
    updateResults();
  }

  function bindEvents(brandSelect, sizeSelect, modelSelect) {
    brandSelect.addEventListener("change", function () {
      onBrandChange(sizeSelect, modelSelect);
    });
    sizeSelect.addEventListener("change", function () {
      onSizeChange(modelSelect);
    });
    modelSelect.addEventListener("change", function () {
      onModelChange(modelSelect);
    });

    var resetBtn = byId(PREFIX + "-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        resetFilters();
      });
    }
  }

  function showLoadError(message) {
    var root = document.querySelector("." + PREFIX + "-root");
    if (!root) {
      return;
    }
    var el = document.createElement("p");
    el.className = PREFIX + "-load-error";
    el.setAttribute("role", "alert");
    el.textContent = message;
    root.insertBefore(el, root.firstChild);
  }

  function init() {
    var brandSelect = byId(PREFIX + "-brand");
    var sizeSelect = byId(PREFIX + "-size");
    var modelSelect = byId(PREFIX + "-model");

    if (!brandSelect || !sizeSelect || !modelSelect) {
      return;
    }

    Promise.all([fetchText(MONITOR_CSV), fetchText(ARM_CSV)])
      .then(function (texts) {
        state.monitors = prepareMonitors(parseCsv(texts[0]));
        state.arms = prepareArms(parseCsv(texts[1]));

        renderSpecTable(state.arms);
        fillBrands(brandSelect);
        clearOptions(sizeSelect, "尺寸");
        sizeSelect.disabled = true;
        renderModelOptions(modelSelect, {});
        bindEvents(brandSelect, sizeSelect, modelSelect);
        clearResults();
      })
      .catch(function (err) {
        showLoadError(
          "無法載入相容清單資料，請確認 js/data 下的 CSV 路徑是否正確。"
        );
        if (typeof console !== "undefined" && console.error) {
          console.error(err);
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
