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

  function isTruthyFlag(value) {
    var flag = String(value || "").trim().toUpperCase();
    return flag === "TRUE" || flag === "1" || flag === "Y" || flag === "YES";
  }

  function perDisplaySuffix(limitsPerDisplay) {
    if (!isTruthyFlag(limitsPerDisplay)) {
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
        productGroup: r.product_group || r.arm_id,
        isGroupPrimary: isTruthyFlag(r.is_group_primary),
        groupDisplayName: r.group_display_name,
        groupDescription: r.group_description,
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

  /**
   * Collapses colour variants (e.g. BSH01/BSH02) sharing a product_group
   * into one spec-table row, since they're the same arm with identical
   * specs. Row order follows first appearance in the CSV; the row's specs
   * come from the group's primary arm (is_group_primary), matching how
   * recommendation cards already pick a lead row per group.
   */
  function groupArmsByProductGroup(arms) {
    var groups = [];
    var byKey = {};
    arms.forEach(function (arm) {
      var key = arm.productGroup;
      if (!byKey[key]) {
        byKey[key] = { ids: [], lead: arm };
        groups.push(byKey[key]);
      } else if (arm.isGroupPrimary) {
        byKey[key].lead = arm;
      }
      byKey[key].ids.push(arm.id);
    });
    return groups;
  }

  function renderSpecTable(arms) {
    var tbody = byId(PREFIX + "-spec-body");
    if (!tbody) {
      return;
    }
    while (tbody.firstChild) {
      tbody.removeChild(tbody.firstChild);
    }

    groupArmsByProductGroup(arms).forEach(function (group) {
      var arm = group.lead;
      var suffix = perDisplaySuffix(arm.limitsPerDisplay);
      var tr = document.createElement("tr");

      var thId = document.createElement("th");
      thId.scope = "row";
      thId.className = PREFIX + "-table-model";
      thId.textContent = group.ids.join("、");
      tr.appendChild(thId);

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

  /**
   * Resolves the row that carries a group's display fields. Looked up across
   * every arm rather than the matched subset, so the card keeps its name and
   * copy even when only a non-primary variant passed the spec check.
   */
  function groupPrimary(groupKey) {
    var members = state.arms.filter(function (arm) {
      return arm.productGroup === groupKey;
    });
    var primary = members.filter(function (arm) {
      return arm.isGroupPrimary;
    })[0];
    return primary || members[0] || null;
  }

  /**
   * Collapses compatible arms into one entry per product_group. Runs after
   * the compatibility filter so a variant that fails on specs never pulls
   * its whole group into the recommendations.
   */
  function groupArms(arms) {
    var groups = [];
    var byKey = {};

    arms.forEach(function (arm) {
      var key = arm.productGroup;
      if (!byKey[key]) {
        byKey[key] = { key: key, matched: [] };
        groups.push(byKey[key]);
      }
      byKey[key].matched.push(arm);
    });

    return groups.map(function (group) {
      var lead = groupPrimary(group.key) || group.matched[0];
      return {
        key: group.key,
        title: lead.groupDisplayName || lead.productName,
        desc: lead.groupDescription,
        mediaUrl: lead.mediaUrl,
        buyUrl: lead.buyUrl,
        matched: group.matched
      };
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
    var backBtn = byId(PREFIX + "-back-btn");

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
    if (backBtn) {
      backBtn.hidden = true;
    }
    renderNoMatch("");
    renderRecommendations([]);
    renderRecommendSummary(null, []);
    announce("");
  }

  function appendModelCell(tr, monitor, clickable) {
    var thModel = document.createElement("th");
    thModel.scope = "row";
    thModel.className = PREFIX + "-result-col-model";

    if (clickable) {
      var modelBtn = document.createElement("button");
      modelBtn.type = "button";
      modelBtn.className = PREFIX + "-model-name";
      modelBtn.textContent = monitor.modelName;
      modelBtn.addEventListener("click", function () {
        applyModelSelection(monitor.brand, monitor.sizeInch, monitor.modelName);
      });
      thModel.appendChild(modelBtn);
    } else {
      var modelText = document.createElement("span");
      modelText.className = PREFIX + "-model-name";
      modelText.textContent = monitor.modelName;
      thModel.appendChild(modelText);
    }

    tr.appendChild(thModel);
  }

  function renderResultPanel(monitors, mode) {
    var title = byId(PREFIX + "-result-title");
    var hint = byId(PREFIX + "-result-hint");
    var tableWrap = byId(PREFIX + "-result-table-wrap");
    var tbody = byId(PREFIX + "-result-body");
    var backBtn = byId(PREFIX + "-back-btn");

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
      if (backBtn) {
        backBtn.hidden = true;
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
    if (backBtn) {
      backBtn.hidden = listMode;
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

  /**
   * "了解更多 >" link styled after benq.com. The visually hidden suffix names
   * the product and warns about the new tab, so the three identical-looking
   * links stay distinguishable for screen reader users.
   */
  function buildCardLink(group) {
    var a = document.createElement("a");
    a.className = PREFIX + "-card-link";
    a.href = group.buyUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.appendChild(document.createTextNode("了解更多"));

    var hidden = document.createElement("span");
    hidden.className = PREFIX + "-visually-hidden";
    hidden.textContent = "：" + group.title + "（另開新視窗）";
    a.appendChild(hidden);

    var svgNs = "http://www.w3.org/2000/svg";
    var icon = document.createElementNS(svgNs, "svg");
    icon.setAttribute("class", PREFIX + "-card-link-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    var path = document.createElementNS(svgNs, "path");
    path.setAttribute(
      "d",
      "M7.889 21.838 17.539 12.188 7.889 2.537 6.464 3.962 14.714 12.188 6.464 20.413Z"
    );
    icon.appendChild(path);
    a.appendChild(icon);

    return a;
  }

  function renderRecommendations(groups) {
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
      title.hidden = !groups.length;
    }
    if (section) {
      section.hidden = !groups.length;
    }

    groups.forEach(function (group) {
      var card = document.createElement("li");
      card.className = PREFIX + "-card";

      var media = document.createElement("div");
      media.className = PREFIX + "-card-media";
      var img = document.createElement("img");
      img.className = PREFIX + "-card-img";
      img.src = group.mediaUrl;
      // Decorative: the product name is already in the card heading below.
      img.alt = "";
      img.loading = "lazy";
      media.appendChild(img);
      card.appendChild(media);

      var body = document.createElement("div");
      body.className = PREFIX + "-card-body";

      var h = document.createElement("h4");
      h.className = PREFIX + "-card-title";
      h.textContent = group.title;
      body.appendChild(h);

      if (group.desc) {
        var p = document.createElement("p");
        p.className = PREFIX + "-card-desc";
        p.textContent = group.desc;
        body.appendChild(p);
      }

      if (group.buyUrl) {
        body.appendChild(buildCardLink(group));
      }

      card.appendChild(body);
      wrap.appendChild(card);
    });
  }

  /**
   * Weight tier a monitor should lead with, keyed to product_group values
   * in BenQArmSpec.csv. 8kg is the single cutover: BenQ's guidance is to
   * steer heavier screens to BSH (2-20kg) before they get close to BSL's
   * 11kg ceiling, and everything at or under 8kg is comfortably within
   * BSL's (2-11kg) range, so one threshold covers both "under 6kg" and
   * "6-8kg" from the product brief without a separate branch.
   */
  var WEIGHT_TIER_PREFERENCE = [
    { maxKg: 8, groupKey: "BSL" },
    { maxKg: Infinity, groupKey: "BSH" }
  ];

  /**
   * Short, factual selling point appended after the spec match, keyed by
   * product_group so it stays in sync with which tier actually got
   * recommended. Falls back to a neutral line for any group without a
   * specific entry (e.g. if a dual-arm group is ever picked as lead).
   */
  var GROUP_BENEFIT_COPY = {
    BSL: "價格更親民，日常使用也輕巧好調整",
    BSH: "支撐更穩固，長時間使用也不易下滑"
  };
  var DEFAULT_BENEFIT_COPY = "安裝與調整都相當簡便";

  /**
   * Drafts the single-sentence recommendation shown above the cards. Only
   * fires when the selected monitor has a known weight — CSV rows with a
   * blank weight_kg (e.g. "-") can't be matched to a weight tier, so no
   * summary is shown rather than guessing. Prefers the weight-tier arm
   * (BSL under 8kg, BSH above) but only among groups that actually passed
   * the compatibility check for this monitor; if the preferred tier didn't
   * match (e.g. its size/VESA range excludes this screen), falls back to
   * whichever compatible single-arm group has the smallest capacity that
   * still fits, so the sentence never recommends something incompatible.
   */
  function buildSummaryParts(monitor, groups) {
    if (!monitor || monitor.weightKg == null || !groups.length) {
      return null;
    }

    var singleGroups = groups.filter(function (g) {
      return g.matched[0].armType === "single";
    });
    if (!singleGroups.length) {
      return null;
    }

    var preferredKey = WEIGHT_TIER_PREFERENCE.filter(function (tier) {
      return monitor.weightKg <= tier.maxKg;
    })[0].groupKey;

    var lead = singleGroups.filter(function (g) {
      return g.key === preferredKey;
    })[0];

    if (!lead) {
      singleGroups.sort(function (a, b) {
        return a.matched[0].weightMax - b.matched[0].weightMax;
      });
      lead = singleGroups[0];
    }

    var arm = lead.matched[0];
    var benefit = GROUP_BENEFIT_COPY[lead.key] || DEFAULT_BENEFIT_COPY;
    return [
      { text: "您選擇的 " },
      { text: monitor.modelName, strong: true },
      {
        text:
          " 螢幕重量為 " +
          formatWeight(monitor.weightRaw) +
          "，建議優先選擇 "
      },
      { text: lead.title, strong: true },
      {
        text:
          "，承重範圍 " +
          arm.weightMin +
          "–" +
          arm.weightMax +
          " Kg、適用尺寸 " +
          arm.sizeMinInch +
          "–" +
          arm.sizeMaxInch +
          " 吋，符合您的螢幕規格，且" +
          benefit +
          "。"
      }
    ];
  }

  function renderRecommendSummary(monitor, groups) {
    var el = byId(PREFIX + "-recommend-summary");
    if (!el) {
      return;
    }
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    var parts = buildSummaryParts(monitor, groups);
    if (!parts) {
      el.hidden = true;
      return;
    }

    parts.forEach(function (part) {
      if (part.strong) {
        var strong = document.createElement("strong");
        strong.textContent = part.text;
        el.appendChild(strong);
      } else {
        el.appendChild(document.createTextNode(part.text));
      }
    });
    el.hidden = false;
  }

  /**
   * Short screen reader summary of what just changed. Replaces a live region
   * on the whole results block, which read every table row aloud and never
   * covered the recommendation cards.
   */
  function announce(text) {
    var el = byId(PREFIX + "-status");
    if (el) {
      el.textContent = text;
    }
  }

  /**
   * Wide tables scroll sideways on small screens. Only while they actually
   * overflow, make the wrapper a named, focusable region so keyboard users
   * can scroll it with the arrow keys; otherwise drop it from the tab order.
   */
  function updateScrollRegions() {
    var attr = "data-" + PREFIX.toLowerCase() + "-scroll-region";
    var regions = document.querySelectorAll("[" + attr + "]");
    Array.prototype.forEach.call(regions, function (el) {
      if (el.scrollWidth > el.clientWidth) {
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "region");
        el.setAttribute("aria-labelledby", el.getAttribute(attr));
      } else {
        el.removeAttribute("tabindex");
        el.removeAttribute("role");
        el.removeAttribute("aria-labelledby");
      }
    });
  }

  function setSizeEnabled(sizeSelect, enabled) {
    sizeSelect.disabled = !enabled;
    if (enabled) {
      sizeSelect.removeAttribute("aria-describedby");
    } else {
      sizeSelect.setAttribute("aria-describedby", PREFIX + "-size-hint");
    }
  }

  function updateResults() {
    renderResults();
    updateScrollRegions();
  }

  function renderResults() {
    if (state.model) {
      var monitors = filteredMonitors();
      renderResultPanel(monitors, "detail");
      if (monitors.length) {
        var arms = recommendedArms(monitors);
        if (arms.length) {
          renderNoMatch("");
          var groups = groupArms(arms);
          renderRecommendations(groups);
          renderRecommendSummary(monitors[0], groups);
          announce(
            "已選擇 " + state.model + "，找到 " + groups.length + " 款適合的 BenQ 螢幕支架。"
          );
        } else {
          var reason = "尚無匹配的螢幕支架，" + noMatchReason(monitors[0]);
          renderRecommendations([]);
          renderRecommendSummary(null, []);
          renderNoMatch(reason);
          announce(reason);
        }
      } else {
        renderRecommendations([]);
        renderRecommendSummary(null, []);
        renderNoMatch("");
        announce("查無相符型號。");
      }
      return;
    }

    if (state.brand && state.size) {
      var listed = filteredMonitors();
      renderNoMatch("");
      renderResultPanel(listed, "list");
      renderRecommendations([]);
      renderRecommendSummary(null, []);
      announce(
        listed.length
          ? "找到 " + listed.length + " 個型號，請從清單選擇型號以查看適合的支架。"
          : "查無相符型號。"
      );
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
      setSizeEnabled(sizeSelect, false);
      clearOptions(sizeSelect, "尺寸");
    }
    if (modelSelect) {
      renderModelOptions(modelSelect, {});
    }

    clearResults();
    announce("已重設篩選條件。");
  }

  function onBrandChange(sizeSelect, modelSelect) {
    state.brand = byId(PREFIX + "-brand").value;
    state.size = "";
    state.model = "";

    if (state.brand) {
      setSizeEnabled(sizeSelect, true);
      fillSizes(sizeSelect, state.brand);
      renderModelOptions(modelSelect, { brand: state.brand });
    } else {
      setSizeEnabled(sizeSelect, false);
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
    setSizeEnabled(sizeSelect, true);
    fillSizes(sizeSelect, brand);
    sizeSelect.value = size;

    renderModelOptions(modelSelect, { brand: brand, size: size });
    modelSelect.value = model;

    updateResults();
  }

  /**
   * Returns from a single-model detail view back to the brand/size result
   * list, so users can compare a different model without reopening the
   * model dropdown. Moves focus to the result title so screen reader users
   * land on the refreshed list instead of losing focus to the now-hidden
   * back button.
   */
  function backToList() {
    var modelSelect = byId(PREFIX + "-model");
    var title = byId(PREFIX + "-result-title");

    state.model = "";
    if (modelSelect) {
      modelSelect.value = "";
    }
    updateResults();
    if (title) {
      title.focus();
    }
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

    var backBtn = byId(PREFIX + "-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        backToList();
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
        setSizeEnabled(sizeSelect, false);
        renderModelOptions(modelSelect, {});
        bindEvents(brandSelect, sizeSelect, modelSelect);
        clearResults();
        updateScrollRegions();
        window.addEventListener("resize", updateScrollRegions);
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
