/* =========================================================
   MindSpace — script.js (JavaScript vanilla, tanpa framework)
   Data disimpan di localStorage dengan prefix "mindspace_".
   ========================================================= */
(() => {
  "use strict";

  /* ---------------------------------------------------------
     Konstanta
     --------------------------------------------------------- */
  // Isi dengan OAuth Client ID milik Anda dari Google Cloud Console (lihat petunjuk di Pengaturan → Akun Google).
  const GOOGLE_CLIENT_ID = "";

  const SCHEMA_VERSION = 1;
  const KEYS = {
    auth: "mindspace_auth",
    journals: "mindspace_journals",
    moods: "mindspace_moods",
    todos: "mindspace_todos",
    settings: "mindspace_settings",
    meta: "mindspace_meta",
  };
  const LIMITS = {
    title: 100,
    content: 5000,
    tag: 20,
    tags: 8,
    note: 280,
    todo: 120,
    name: 24,
    items: 20000,
    fileBytes: 5 * 1024 * 1024,
  };
  const DEFAULT_SETTINGS = {
    name: "",
    theme: "system",
    density: "comfortable",
    fontSize: "normal",
    showQuote: true,
    reduceMotion: false,
    notifications: {
      enabled: false,
      mood: { on: true, time: "20:00" },
      journal: { on: false, time: "21:00" },
      task: { on: true, time: "08:00" },
      last: { mood: "", journal: "", task: "" },
    },
  };
  const newSettings = () => JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const REMINDER_IDS = ["mood", "journal", "task"];
  const CATCHUP_MINUTES = 120; // pengingat yang terlewat lebih dari 2 jam tidak dikirim
  const NOTIF_ICON =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D6DF2"/><stop offset="1" stop-color="#A08FF7"/></linearGradient></defs><rect width="32" height="32" rx="10" fill="url(#g)"/><path d="M10.5 22V11l5.5 6.5L21.5 11v11" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    );

  // score dipakai hanya untuk grafik tren (1 = paling rendah, 6 = paling tinggi)
  const MOODS = [
    { id: "happy", label: "Senang", score: 5, color: "#F0B23E" },
    { id: "calm", label: "Tenang", score: 4, color: "#3FBFA8" },
    { id: "neutral", label: "Biasa saja", score: 3, color: "#8A97BD" },
    { id: "sad", label: "Sedih", score: 1, color: "#5B8DEF" },
    { id: "tired", label: "Lelah", score: 2, color: "#A78BDD" },
    { id: "excited", label: "Bersemangat", score: 6, color: "#EE7BA3" },
  ];
  const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.id, m]));
  const MOODS_BY_SCORE = [...MOODS].sort((a, b) => b.score - a.score);
  const PRIORITIES = {
    low: { label: "Rendah", rank: 1 },
    medium: { label: "Sedang", rank: 2 },
    high: { label: "Tinggi", rank: 3 },
  };

  const ROUTES = {
    dashboard: "Dashboard",
    journal: "Jurnal",
    mood: "Mood Tracker",
    todo: "To-Do List",
    stats: "Statistik",
    settings: "Pengaturan",
  };

  const QUOTES = [
    "Pelan-pelan juga tidak apa-apa, yang penting kamu tetap melangkah.",
    "Kamu tidak harus sempurna untuk layak beristirahat.",
    "Satu napas dalam bisa menjadi awal yang baru.",
    "Hal kecil yang dilakukan konsisten lebih berarti daripada rencana besar yang tak pernah dimulai.",
    "Perasaanmu valid, termasuk yang sulit diucapkan.",
    "Hari ini tidak perlu menang, cukup hadir sepenuhnya.",
    "Menulis adalah cara sederhana untuk mengenal diri sendiri.",
    "Istirahat adalah bagian dari perjalanan, bukan penghalangnya.",
    "Syukuri satu hal kecil hari ini, lalu lihat apa yang ikut terasa.",
    "Kamu sudah melewati banyak hari yang berat, dan kamu masih di sini.",
    "Beri ruang untuk dirimu sendiri, seperti kamu memberi ruang untuk orang yang kamu sayang.",
    "Fokus pada satu langkah berikutnya, bukan seluruh tangga.",
    "Tidak apa-apa merasa biasa saja; tidak setiap hari harus istimewa.",
    "Tenang bukan berarti tanpa badai, melainkan tahu di mana tempat berteduh.",
    "Catat hari ini, supaya besok kamu bisa melihat seberapa jauh kamu berjalan.",
    "Kemajuan kecil tetaplah kemajuan.",
    "Minum air, regangkan badan, tarik napas. Mulai dari yang paling dekat.",
    "Batas yang sehat adalah bentuk kasih sayang pada diri sendiri.",
    "Kamu boleh berubah pikiran, berubah arah, dan berubah pelan-pelan.",
    "Lelah adalah sinyal, bukan kelemahan.",
    "Hari yang baik sering dimulai dari niat yang sederhana.",
    "Ceritakan pada halaman kosong; ia pendengar yang sabar.",
    "Rayakan hal kecil yang berhasil kamu selesaikan hari ini.",
    "Jangan bandingkan bab awalmu dengan bab tengah orang lain.",
    "Ketenangan bisa dilatih, satu menit pada satu waktu.",
    "Tidak semua hal harus selesai hari ini.",
    "Bersikap lembut pada diri sendiri juga butuh latihan.",
    "Awali dengan napas panjang, lalu tentukan satu prioritas.",
    "Energi baik sering datang setelah kita mulai bergerak.",
    "Apa pun suasana hatimu hari ini, kamu tetap berharga.",
    "Semoga hari ini memberimu sedikit ruang untuk bernapas.",
  ];

  /* ---------------------------------------------------------
     Utilitas
     --------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, "0");
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (typeof v === "string" ? v : "");
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const uid = () =>
    window.crypto && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "id-" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 10);

  const dateKey = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => dateKey(new Date());
  const parseKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const isDateKey = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    dateKey(parseKey(s)) === s;
  const isoOrNull = (v) => {
    if (typeof v !== "string") return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  };
  const localKey = (iso) => dateKey(new Date(iso));
  const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);

  const dfLong = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dfMed = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const dfShort = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  });
  const dfTime = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dfMonth = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  });
  const dfWd = new Intl.DateTimeFormat("id-ID", { weekday: "short" });
  const asDate = (v) =>
    typeof v === "string" && v.length === 10 ? parseKey(v) : new Date(v);
  const fmtLong = (v) => dfLong.format(asDate(v));
  const fmtMed = (v) => dfMed.format(asDate(v));
  const fmtShort = (v) => dfShort.format(asDate(v));
  const fmtTime = (v) => dfTime.format(asDate(v));
  const fmtDateTime = (v) => `${fmtMed(v)}, ${fmtTime(v)}`;

  function relTime(iso) {
    const t = new Date(iso).getTime();
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return "Baru saja";
    if (m < 60) return `${m} menit lalu`;
    const days = daysBetween(localKey(iso), todayKey());
    if (days === 0) return `${Math.floor(m / 60)} jam lalu`;
    if (days === 1) return `Kemarin, ${fmtTime(iso)}`;
    if (days < 7) return `${days} hari lalu`;
    return fmtMed(iso);
  }

  function lastNDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(dateKey(d));
    }
    return out;
  }

  const icon = (name, cls = "") =>
    `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  const moodFace = (id) =>
    `<svg class="icon mood-face" aria-hidden="true" focusable="false"><use href="#mf-${id}"/></svg>`;
  const moodChip = (m) =>
    `<span class="chip-mood" style="--mc:${m.color}">${moodFace(m.id)}${esc(m.label)}</span>`;
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  function emptyState({
    ic = "feather",
    title,
    text,
    action = "",
    compact = false,
  }) {
    return `<div class="empty${compact ? " compact" : ""}"><span class="empty-icon">${icon(ic, "")}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  }

  /* ---------------------------------------------------------
     Penyimpanan (localStorage) dengan penanganan kegagalan
     --------------------------------------------------------- */
  const store = {
    available: false,
    mem: {},
    corrupted: [],
    init() {
      try {
        const probe = KEYS.meta + "_probe";
        window.localStorage.setItem(probe, "1");
        window.localStorage.removeItem(probe);
        this.available = true;
      } catch (e) {
        this.available = false;
      }
    },
    read(key, fallback, validate) {
      if (this.available) {
        let raw = null;
        try {
          raw = window.localStorage.getItem(key);
          if (raw === null) return fallback;
          const value = JSON.parse(raw);
          if (validate && !validate(value))
            throw new Error("Bentuk data tidak valid");
          return value;
        } catch (e) {
          console.warn("[MindSpace] Gagal membaca", key, e);
          this.corrupted.push(key);
          try {
            if (raw !== null)
              window.localStorage.setItem(
                KEYS.meta + "_corrupt_" + key.replace("mindspace_", ""),
                raw,
              );
          } catch (_) {
            /* abaikan */
          }
          return fallback;
        }
      }
      return key in this.mem ? this.mem[key] : fallback;
    },
    write(key, value) {
      this.mem[key] = value;
      if (!this.available) return false;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn("[MindSpace] Gagal menyimpan", key, e);
        return false;
      }
    },
    removeAll() {
      this.mem = {};
      try {
        Object.keys(window.localStorage)
          .filter((k) => k.startsWith("mindspace_"))
          .forEach((k) => window.localStorage.removeItem(k));
        return true;
      } catch (e) {
        return false;
      }
    },
    sizeBytes() {
      if (!this.available) return null;
      try {
        let total = 0;
        Object.keys(window.localStorage)
          .filter((k) => k.startsWith("mindspace_"))
          .forEach((k) => {
            total +=
              (k.length + (window.localStorage.getItem(k) || "").length) * 2;
          });
        return total;
      } catch (e) {
        return null;
      }
    },
  };

  /* ---------------------------------------------------------
     Parser & validator data (dipakai saat memuat dan mengimpor)
     --------------------------------------------------------- */
  const bad = (error) => ({ ok: false, error });
  const good = (value) => ({ ok: true, value });

  function cleanTags(input) {
    if (!Array.isArray(input)) return null;
    const out = [];
    for (const t of input) {
      if (typeof t !== "string") return null;
      const v = t.trim().replace(/^#+/, "").toLowerCase();
      if (!v) continue;
      if (v.length > LIMITS.tag) return null;
      if (!out.includes(v)) out.push(v);
    }
    return out.length > LIMITS.tags ? null : out;
  }

  function parseJournal(j) {
    if (!isObj(j)) return bad("bukan objek");
    const id = str(j.id).trim();
    if (!id || id.length > 80) return bad("id tidak valid");
    const title = str(j.title).trim();
    if (!title || title.length > LIMITS.title)
      return bad(`judul wajib diisi (maks. ${LIMITS.title} karakter)`);
    const content = str(j.content).trim();
    if (!content || content.length > LIMITS.content)
      return bad(`isi wajib diisi (maks. ${LIMITS.content} karakter)`);
    const tags = cleanTags(j.tags == null ? [] : j.tags);
    if (!tags)
      return bad(
        `tag tidak valid (maks. ${LIMITS.tags} tag, ${LIMITS.tag} karakter)`,
      );
    const mood = j.mood == null || j.mood === "" ? "" : j.mood;
    if (mood && !MOOD_MAP[mood]) return bad("mood tidak dikenal");
    const createdAt = isoOrNull(j.createdAt);
    if (!createdAt) return bad("createdAt tidak valid");
    const updatedAt = isoOrNull(j.updatedAt) || createdAt;
    return good({ id, title, content, tags, mood, createdAt, updatedAt });
  }

  function parseMood(m) {
    if (!isObj(m)) return bad("bukan objek");
    const id = str(m.id).trim();
    if (!id || id.length > 80) return bad("id tidak valid");
    if (!MOOD_MAP[m.mood]) return bad("mood tidak dikenal");
    const note = m.note == null ? "" : str(m.note).trim();
    if (note.length > LIMITS.note)
      return bad(`catatan terlalu panjang (maks. ${LIMITS.note} karakter)`);
    const createdAt = isoOrNull(m.createdAt);
    if (!createdAt) return bad("createdAt tidak valid");
    const date = m.date == null ? localKey(createdAt) : m.date;
    if (!isDateKey(date)) return bad("date harus berformat YYYY-MM-DD");
    return good({ id, mood: m.mood, note, date, createdAt });
  }

  function parseTodo(t) {
    if (!isObj(t)) return bad("bukan objek");
    const id = str(t.id).trim();
    if (!id || id.length > 80) return bad("id tidak valid");
    const title = str(t.title).trim();
    if (!title || title.length > LIMITS.todo)
      return bad(`judul wajib diisi (maks. ${LIMITS.todo} karakter)`);
    if (!PRIORITIES[t.priority])
      return bad("prioritas harus low, medium, atau high");
    const due = t.due == null ? "" : t.due;
    if (due !== "" && !isDateKey(due))
      return bad("tenggat harus berformat YYYY-MM-DD");
    if (typeof t.done !== "boolean") return bad("done harus true atau false");
    const createdAt = isoOrNull(t.createdAt);
    if (!createdAt) return bad("createdAt tidak valid");
    let completedAt = null;
    if (t.done) completedAt = isoOrNull(t.completedAt) || createdAt;
    return good({
      id,
      title,
      priority: t.priority,
      due,
      done: t.done,
      createdAt,
      completedAt,
    });
  }

  function validNotif(x) {
    return (
      isObj(x) &&
      typeof x.enabled === "boolean" &&
      REMINDER_IDS.every(
        (k) =>
          isObj(x[k]) &&
          typeof x[k].on === "boolean" &&
          TIME_RE.test(str(x[k].time)),
      ) &&
      (x.last === undefined || isObj(x.last))
    );
  }
  function sanitizeNotif(x) {
    const out = newSettings().notifications;
    if (!isObj(x)) return out;
    out.enabled = x.enabled === true;
    REMINDER_IDS.forEach((k) => {
      if (isObj(x[k])) {
        out[k].on = x[k].on === true;
        if (TIME_RE.test(str(x[k].time))) out[k].time = x[k].time;
      }
      if (isObj(x.last) && isDateKey(x.last[k])) out.last[k] = x.last[k];
    });
    return out;
  }

  function parseSettings(s, strict) {
    const value = newSettings();
    const errors = [];
    if (!isObj(s))
      return {
        value,
        errors: strict ? ["Pengaturan harus berupa objek."] : [],
      };
    const check = (key, ok, msg) => {
      if (!(key in s)) return;
      if (ok(s[key])) value[key] = s[key];
      else errors.push(msg);
    };
    check(
      "name",
      (x) => typeof x === "string" && x.trim().length <= LIMITS.name,
      `Nama panggilan maksimal ${LIMITS.name} karakter.`,
    );
    check(
      "theme",
      (x) => ["light", "dark", "system"].includes(x),
      "Tema harus light, dark, atau system.",
    );
    check(
      "density",
      (x) => ["comfortable", "compact"].includes(x),
      "Kerapatan harus comfortable atau compact.",
    );
    check(
      "fontSize",
      (x) => ["normal", "large"].includes(x),
      "Ukuran teks harus normal atau large.",
    );
    check(
      "showQuote",
      (x) => typeof x === "boolean",
      "showQuote harus true atau false.",
    );
    check(
      "reduceMotion",
      (x) => typeof x === "boolean",
      "reduceMotion harus true atau false.",
    );
    check(
      "notifications",
      validNotif,
      "Pengaturan notifikasi tidak valid (enabled, mood, journal, task, dan format waktu HH:MM).",
    );
    value.notifications = sanitizeNotif(value.notifications);
    value.name = value.name.trim();
    return { value, errors: strict ? errors : [] };
  }

  function validateImport(raw) {
    const errors = [];
    if (!isObj(raw))
      return { errors: ["Isi file bukan objek JSON MindSpace."] };
    if (raw.app !== "MindSpace")
      errors.push(
        'Penanda aplikasi tidak sesuai: nilai "app" harus "MindSpace".',
      );
    if (!Number.isInteger(raw.schemaVersion))
      errors.push('"schemaVersion" harus berupa bilangan bulat.');
    else if (raw.schemaVersion > SCHEMA_VERSION)
      errors.push(
        `File dibuat dengan versi skema ${raw.schemaVersion} yang lebih baru dari yang didukung (${SCHEMA_VERSION}).`,
      );
    if (!isObj(raw.data)) {
      errors.push('Bagian "data" tidak ditemukan atau bukan objek.');
      return { errors };
    }
    const d = raw.data;
    ["journals", "moods", "todos"].forEach((k) => {
      if (!Array.isArray(d[k])) errors.push(`"data.${k}" harus berupa array.`);
      else if (d[k].length > LIMITS.items)
        errors.push(
          `"data.${k}" berisi terlalu banyak item (maks. ${LIMITS.items}).`,
        );
    });
    if (errors.length) return { errors };

    const out = { journals: [], moods: [], todos: [], settings: null };
    const collect = (list, parser, target, label) => {
      const seen = new Set();
      list.forEach((item, i) => {
        const r = parser(item);
        if (!r.ok) {
          errors.push(`${label} #${i + 1}: ${r.error}.`);
          return;
        }
        if (seen.has(r.value.id)) {
          errors.push(`${label} #${i + 1}: id "${r.value.id}" duplikat.`);
          return;
        }
        seen.add(r.value.id);
        target.push(r.value);
      });
    };
    collect(d.journals, parseJournal, out.journals, "Jurnal");
    collect(d.moods, parseMood, out.moods, "Mood");
    collect(d.todos, parseTodo, out.todos, "Tugas");
    if (d.settings !== undefined) {
      const r = parseSettings(d.settings, true);
      r.errors.forEach((e) => errors.push(e));
      out.settings = r.value;
    }
    return { errors, data: out };
  }

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */
  const now0 = new Date();
  const state = {
    journals: [],
    moods: [],
    todos: [],
    settings: newSettings(),
    auth: null,
    ui: {
      route: "dashboard",
      journalFilters: { q: "", mood: "", from: "", to: "", sort: "newest" },
      todoFilter: "all",
      cal: { y: now0.getFullYear(), m: now0.getMonth() },
      calSelected: dateKey(now0),
      trendRange: 14,
      moodLimit: 10,
      statMonth: { y: now0.getFullYear(), m: now0.getMonth() },
      editingJournal: null,
      editingTodo: null,
      viewingJournal: null,
    },
  };

  function sortData() {
    state.journals.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    state.moods.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    state.todos.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function loadAll() {
    let dropped = 0;
    const load = (key, parser) => {
      const raw = store.read(key, [], Array.isArray);
      const seen = new Set();
      const out = [];
      raw.forEach((item) => {
        const r = parser(item);
        if (r.ok && !seen.has(r.value.id)) {
          seen.add(r.value.id);
          out.push(r.value);
        } else dropped++;
      });
      return out;
    };
    state.journals = load(KEYS.journals, parseJournal);
    state.moods = load(KEYS.moods, parseMood);
    state.todos = load(KEYS.todos, parseTodo);
    state.settings = parseSettings(
      store.read(KEYS.settings, {}, isObj),
      false,
    ).value;
    const auth = store.read(KEYS.auth, null, (v) => v === null || isObj(v));
    state.auth =
      auth && typeof auth.email === "string" && typeof auth.sub === "string"
        ? {
            sub: auth.sub,
            name: str(auth.name),
            email: auth.email,
            picture: str(auth.picture).startsWith("https://")
              ? auth.picture
              : "",
            signedInAt: str(auth.signedInAt),
          }
        : null;
    sortData();
    if (dropped > 0 || store.corrupted.length) {
      setTimeout(
        () =>
          toast(
            "Sebagian data tersimpan tidak valid dan dilewati. Salinan data rusak disimpan terpisah di browser.",
            "error",
            8000,
          ),
        500,
      );
    }
  }

  function updateBanner(failed) {
    $("#storage-banner").hidden = !failed;
  }

  function save(...names) {
    let ok = true;
    names.forEach((n) => {
      if (!store.write(KEYS[n], state[n])) ok = false;
    });
    store.write(KEYS.meta, {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    });
    updateBanner(!ok);
    if (!ok)
      toast(
        "Perubahan belum tersimpan permanen di browser. Ekspor data Anda untuk berjaga-jaga.",
        "error",
        7000,
      );
    return ok;
  }

  /* ---------------------------------------------------------
     Toast, loading, dialog
     --------------------------------------------------------- */
  function toast(message, type = "success", ms) {
    const box = $("#toasts");
    while (box.children.length >= 4) box.firstElementChild.remove();
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    if (type === "error") el.setAttribute("role", "alert");
    el.innerHTML = `${icon(type === "error" ? "alert" : type === "info" ? "info" : "check")}<span>${esc(message)}</span>`;
    box.appendChild(el);
    let timer;
    const remove = () => {
      clearTimeout(timer);
      el.classList.add("out");
      setTimeout(() => el.remove(), 220);
    };
    timer = setTimeout(remove, ms || (type === "error" ? 6000 : 3200));
    el.addEventListener("click", remove);
  }

  function showBusy(text) {
    $("#app-loader-text").textContent = text;
    $("#app-loader").hidden = false;
  }
  function hideBusy() {
    $("#app-loader").hidden = true;
  }

  function openDialog(dlg) {
    if (!dlg.open) dlg.showModal();
  }

  function confirmDialog(opts) {
    const dlg = $("#dlg-confirm");
    const input = $("#confirm-input");
    $("#confirm-title").textContent = opts.title;
    $("#confirm-msg").textContent = opts.message;
    $("#confirm-icon").className =
      "confirm-icon" + (opts.danger ? " danger" : "");
    const actions = opts.actions || [
      {
        value: "ok",
        label: opts.confirmText || "Ya",
        variant: opts.danger ? "danger" : "primary",
      },
    ];
    $("#confirm-actions").innerHTML =
      `<button type="button" class="btn btn-ghost" data-cancel>${esc(opts.cancelText || "Batal")}</button>` +
      actions
        .map(
          (a) =>
            `<button type="submit" value="${esc(a.value)}" class="btn btn-${esc(a.variant || "primary")}" data-act>${esc(a.label)}</button>`,
        )
        .join("");
    const acts = $$("[data-act]", dlg);
    const cancel = $("[data-cancel]", dlg);
    cancel.addEventListener("click", () => dlg.close(""));
    const extra = $("#confirm-extra");
    if (opts.requireText) {
      extra.hidden = false;
      $("#confirm-extra-label").textContent =
        `Ketik ${opts.requireText} untuk melanjutkan`;
      input.value = "";
      acts.forEach((b) => {
        b.disabled = true;
      });
      input.oninput = () => {
        const okText = input.value.trim().toUpperCase() === opts.requireText;
        acts.forEach((b) => {
          b.disabled = !okText;
        });
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") e.preventDefault();
      };
    } else {
      extra.hidden = true;
      input.oninput = null;
      input.onkeydown = null;
    }
    return new Promise((resolve) => {
      dlg.returnValue = "";
      dlg.addEventListener("close", () => resolve(dlg.returnValue || false), {
        once: true,
      });
      dlg.showModal();
      (opts.requireText ? input : cancel).focus();
    });
  }

  /* ---------------------------------------------------------
     Field error helpers
     --------------------------------------------------------- */
  function setError(inputId, message) {
    const input = $("#" + inputId);
    const err = $("#" + inputId + "-err");
    if (err) {
      err.textContent = message || "";
      err.hidden = !message;
    }
    if (input) {
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    return !!message;
  }
  function bindCounter(input, counter, max) {
    const update = () => {
      counter.textContent = `${input.value.length}/${max}`;
    };
    input.addEventListener("input", update);
    update();
    return update;
  }

  /* ---------------------------------------------------------
     Pengaturan tampilan
     --------------------------------------------------------- */
  const mqDark = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
  function effectiveTheme() {
    const t = state.settings.theme;
    if (t === "system") return mqDark && mqDark.matches ? "dark" : "light";
    return t;
  }
  function applySettings() {
    const s = state.settings;
    const root = document.documentElement;
    const theme = effectiveTheme();
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-density", s.density);
    root.setAttribute("data-font", s.fontSize);
    root.setAttribute("data-motion", s.reduceMotion ? "reduce" : "auto");
    const meta = $('meta[name="theme-color"]');
    if (meta)
      meta.setAttribute("content", theme === "dark" ? "#070D22" : "#0B1430");
  }
  if (mqDark) {
    const onChange = () => {
      if (state.settings.theme === "system") applySettings();
    };
    if (mqDark.addEventListener) mqDark.addEventListener("change", onChange);
    else if (mqDark.addListener) mqDark.addListener(onChange);
  }

  function renderChrome() {
    const n = state.settings.name;
    const a = state.auth;
    $$(".profile-name").forEach((el) => {
      el.textContent = n || (a ? a.email : "Atur nama panggilan");
    });
    $$(".profile-avatar").forEach((el) => {
      el.innerHTML =
        a && a.picture
          ? `<img src="${esc(a.picture)}" alt="" referrerpolicy="no-referrer" width="36" height="36">`
          : n
            ? esc(n.charAt(0).toUpperCase())
            : icon("user");
    });
  }

  /* ---------------------------------------------------------
     Login Google (Google Identity Services)
     Catatan: ini hanya mengidentifikasi akun di sisi browser.
     Data tetap di localStorage perangkat ini dan tidak dikunci.
     --------------------------------------------------------- */
  let gisInitialized = false;

  function decodeJwt(token) {
    const part = String(token).split(".")[1];
    if (!part) throw new Error("Token tidak valid");
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return JSON.parse(
      new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))),
    );
  }

  function handleGoogleCredential(resp) {
    try {
      const p = decodeJwt(resp && resp.credential);
      const issOk =
        p.iss === "accounts.google.com" ||
        p.iss === "https://accounts.google.com";
      if (
        !issOk ||
        p.aud !== GOOGLE_CLIENT_ID ||
        !p.exp ||
        p.exp * 1000 < Date.now() ||
        !p.sub ||
        typeof p.email !== "string"
      )
        throw new Error("Token ditolak");
      state.auth = {
        sub: String(p.sub),
        name: str(p.name),
        email: p.email,
        picture: str(p.picture).startsWith("https://") ? p.picture : "",
        signedInAt: new Date().toISOString(),
      };
      if (!state.settings.name && p.given_name)
        state.settings.name = String(p.given_name).trim().slice(0, LIMITS.name);
      save("auth", "settings");
      toast(`Masuk sebagai ${p.email}`);
      refresh();
    } catch (e) {
      console.warn("[MindSpace] Login Google gagal", e);
      toast("Login Google gagal diverifikasi. Coba lagi.", "error");
    }
  }

  function signOut() {
    try {
      if (window.google && google.accounts && google.accounts.id)
        google.accounts.id.disableAutoSelect();
    } catch (e) {
      /* abaikan */
    }
    state.auth = null;
    save("auth");
    toast("Anda telah keluar. Data di perangkat ini tetap tersimpan.", "info");
    refresh();
  }

  function renderAccount(attempt = 0) {
    const box = $("#account-body");
    if (!box || state.ui.route !== "settings") return;
    const a = state.auth;
    if (a) {
      box.innerHTML = `<div class="account-row">
          <span class="account-avatar">${a.picture ? `<img src="${esc(a.picture)}" alt="" referrerpolicy="no-referrer" width="48" height="48">` : icon("user")}</span>
          <div class="account-info"><strong>${esc(a.name || a.email)}</strong><span>${esc(a.email)}</span></div>
          <button type="button" class="btn btn-ghost" data-action="sign-out">Keluar</button>
        </div>
        <p class="hint">Login hanya menampilkan identitas Anda. Jurnal, mood, dan tugas tetap disimpan di browser ini dan tidak dikirim ke server mana pun.</p>`;
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      box.innerHTML = `<p class="info-box">${icon("info")}<span>Login Google memerlukan <strong>Client ID</strong> milik Anda. Tanpa itu, tombol login tidak bisa ditampilkan.</span></p>
        <ol class="setup-steps">
          <li>Buka <strong>Google Cloud Console → APIs &amp; Services → Credentials</strong>.</li>
          <li>Buat <strong>OAuth client ID</strong> bertipe <em>Web application</em>.</li>
          <li>Pada <em>Authorized JavaScript origins</em>, tambahkan <code>http://localhost:5500</code> dan <code>http://127.0.0.1:5500</code> (sesuaikan port Live Server).</li>
          <li>Salin Client ID, lalu tempel ke konstanta <code>GOOGLE_CLIENT_ID</code> di bagian atas <code>script.js</code>.</li>
          <li>Muat ulang halaman lewat Live Server.</li>
        </ol>`;
      return;
    }
    if (location.protocol === "file:") {
      box.innerHTML = `<p class="field-error">Login Google tidak berfungsi saat file dibuka langsung (file://). Jalankan lewat Live Server atau <code>http://localhost</code>.</p>`;
      return;
    }
    if (!(window.google && google.accounts && google.accounts.id)) {
      if (attempt >= 12) {
        box.innerHTML =
          '<p class="field-error">Layanan Google tidak dapat dimuat. Periksa koneksi internet atau pemblokir skrip, lalu muat ulang halaman.</p>';
      } else {
        box.innerHTML = '<p class="hint">Memuat layanan Google…</p>';
        setTimeout(() => {
          if (!state.auth) renderAccount(attempt + 1);
        }, 500);
      }
      return;
    }
    if (!gisInitialized) {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      gisInitialized = true;
    }
    box.innerHTML = `<div id="g-signin"></div><p class="hint" style="margin-top:.85rem">Login bersifat opsional. Data Anda tidak dikirim ke server mana pun dan <strong>tidak terkunci</strong>: siapa pun yang memakai browser ini tetap dapat melihatnya.</p>`;
    google.accounts.id.renderButton($("#g-signin"), {
      theme: effectiveTheme() === "dark" ? "filled_black" : "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      locale: "id",
      width: 280,
    });
  }

  /* ---------------------------------------------------------
     Data turunan
     --------------------------------------------------------- */
  function moodsByDate() {
    const map = new Map();
    [...state.moods]
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .forEach((e) => {
        if (!map.has(e.date)) map.set(e.date, []);
        map.get(e.date).push(e);
      });
    return map;
  }
  const avgScore = (entries) =>
    entries.reduce((s, e) => s + MOOD_MAP[e.mood].score, 0) / entries.length;
  const moodByAvg = (avg) =>
    MOODS.find((m) => m.score === Math.round(avg)) || MOODS[2];

  function dailyProgress() {
    const today = todayKey();
    const due = state.todos.filter((t) => t.due === today);
    if (due.length)
      return {
        done: due.filter((t) => t.done).length,
        total: due.length,
        scope: "today",
      };
    return {
      done: state.todos.filter((t) => t.done).length,
      total: state.todos.length,
      scope: "all",
    };
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function greeting() {
    const h = new Date().getHours();
    if (h >= 4 && h < 11) return "Selamat pagi";
    if (h < 15 && h >= 11) return "Selamat siang";
    if (h >= 15 && h < 18) return "Selamat sore";
    return "Selamat malam";
  }
  function dayOfYear() {
    const d = new Date();
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  }

  /* ---------------------------------------------------------
     Router
     --------------------------------------------------------- */
  let userNavigated = false;

  function currentRoute() {
    const r = location.hash.replace("#", "");
    return ROUTES[r] ? r : "dashboard";
  }

  function route() {
    const r = currentRoute();
    state.ui.route = r;
    $$(".view").forEach((v) => {
      v.hidden = v.id !== "view-" + r;
    });
    $$("[data-route]").forEach((a) => {
      if (a.dataset.route === r) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = `${ROUTES[r]} — MindSpace`;
    renderView(r);
    window.scrollTo(0, 0);
    if (userNavigated) {
      const h = $("#title-" + r);
      if (h) h.focus({ preventScroll: true });
    }
  }

  function renderView(r) {
    switch (r) {
      case "dashboard":
        renderDashboard();
        break;
      case "journal":
        renderJournal();
        break;
      case "mood":
        renderMood();
        break;
      case "todo":
        renderTodo();
        break;
      case "stats":
        renderStats();
        break;
      case "settings":
        renderSettings();
        break;
      default:
        break;
    }
  }
  function refresh() {
    renderChrome();
    renderView(state.ui.route);
  }

  /* ---------------------------------------------------------
     DASHBOARD
     --------------------------------------------------------- */
  function renderDashboard() {
    const s = state.settings;
    $("#dash-date").textContent = fmtLong(new Date());
    $("#dash-greeting").textContent =
      greeting() + (s.name ? ", " + s.name : "");

    const today = todayKey();
    const byDate = moodsByDate();
    const todayEntries = byDate.get(today) || [];
    const hasAny =
      state.journals.length || state.moods.length || state.todos.length;
    $("#dash-sub").textContent = !hasAny
      ? "Mulai dengan mencatat suasana hati atau menulis jurnal pertamamu."
      : todayEntries.length
        ? "Terima kasih sudah check-in hari ini. Ini ringkasan terbarumu."
        : "Bagaimana perasaanmu hari ini? Luangkan satu menit untuk mencatatnya.";

    const quoteWrap = $("#dash-quote-wrap");
    quoteWrap.hidden = !s.showQuote;
    $(".hero").classList.toggle("no-quote", !s.showQuote);
    $("#dash-quote").textContent =
      "“" + QUOTES[dayOfYear() % QUOTES.length] + "”";

    // Mood hari ini
    const last = todayEntries[todayEntries.length - 1];
    if (last) {
      const m = MOOD_MAP[last.mood];
      $("#dash-mood").innerHTML = `
        <div class="mood-today"><span class="mood-badge" style="--mc:${m.color}">${moodFace(m.id)}</span>
          <div><strong>${esc(m.label)}</strong><span class="sub">${fmtTime(last.createdAt)}${todayEntries.length > 1 ? ` · ${todayEntries.length} catatan hari ini` : ""}</span></div></div>
        ${last.note ? `<p class="note-preview">${esc(last.note)}</p>` : ""}
        <a class="link-inline" href="#mood">Catat lagi ${icon("chev-right")}</a>`;
    } else {
      $("#dash-mood").innerHTML = emptyState({
        ic: "smile",
        compact: true,
        title: "Belum ada catatan hari ini",
        text: "Pilih satu suasana hati untuk memulai riwayatmu.",
        action:
          '<a class="link-inline" href="#mood">Catat mood ' +
          icon("chev-right") +
          "</a>",
      });
    }

    // Jurnal
    const total = state.journals.length;
    if (total) {
      const ym = today.slice(0, 7);
      const thisMonth = state.journals.filter((j) =>
        localKey(j.createdAt).startsWith(ym),
      ).length;
      $("#dash-journal").innerHTML = `
        <p class="big-number">${total}</p>
        <p class="sub">${total === 1 ? "jurnal tersimpan" : "jurnal tersimpan"} · ${thisMonth} ditulis bulan ini</p>
        <a class="link-inline" href="#journal">Buka jurnal ${icon("chev-right")}</a>`;
    } else {
      $("#dash-journal").innerHTML = emptyState({
        ic: "book",
        compact: true,
        title: "Belum ada jurnal",
        text: "Tulis beberapa kalimat tentang harimu.",
        action:
          '<button type="button" class="link-inline btn-reset" data-action="new-journal" style="background:none;border:0;padding:0;color:var(--primary);cursor:pointer">Tulis jurnal ' +
          icon("chev-right") +
          "</button>",
      });
    }

    // Progres tugas
    const p = dailyProgress();
    if (p.total) {
      const percent = pct(p.done, p.total);
      const C = 2 * Math.PI * 40;
      $("#dash-tasks").innerHTML = `
        <div class="ring-wrap">
          <svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${percent} persen tugas selesai">
            <circle class="track" cx="50" cy="50" r="40"/>
            <circle class="bar" cx="50" cy="50" r="40" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - percent / 100)).toFixed(2)}"/>
            <text x="50" y="57" text-anchor="middle">${percent}%</text>
          </svg>
          <div><p class="big-number" style="font-size:1.6rem">${p.done}/${p.total}</p>
          <p class="sub">${p.scope === "today" ? "tugas hari ini selesai" : "semua tugas selesai"}</p></div>
        </div>
        <a class="link-inline" href="#todo">Kelola tugas ${icon("chev-right")}</a>`;
    } else {
      $("#dash-tasks").innerHTML = emptyState({
        ic: "check-square",
        compact: true,
        title: "Belum ada tugas",
        text: "Tambahkan tugas untuk melihat progresmu.",
        action:
          '<a class="link-inline" href="#todo">Tambah tugas ' +
          icon("chev-right") +
          "</a>",
      });
    }

    // Mood 7 hari
    const days = lastNDays(7);
    $("#dash-week").innerHTML =
      (state.moods.length
        ? ""
        : '<p class="sub" style="margin:0 0 1rem">Belum ada catatan mood. Lingkaran akan terisi saat kamu mulai mencatat.</p>') +
      `<div class="week-strip">${days
        .map((k) => {
          const es = byDate.get(k);
          const le = es && es[es.length - 1];
          const m = le && MOOD_MAP[le.mood];
          const wd = dfWd.format(parseKey(k));
          return `<div class="week-day${k === today ? " today" : ""}"><span class="week-dot${m ? " filled" : ""}" ${m ? `style="--mc:${m.color}" role="img" aria-label="${esc(fmtLong(k))}: ${esc(m.label)}"` : `role="img" aria-label="${esc(fmtLong(k))}: belum ada catatan"`}>${m ? moodFace(m.id) : ""}</span><span>${esc(wd)}</span></div>`;
        })
        .join("")}</div>`;

    // Aktivitas terbaru
    const acts = [];
    state.journals.forEach((j) => {
      const edited = new Date(j.updatedAt) - new Date(j.createdAt) > 1000;
      acts.push({
        at: edited ? j.updatedAt : j.createdAt,
        text: `${edited ? "Memperbarui" : "Menulis"} jurnal “${j.title}”`,
        ic: "book",
        cls: "",
        href: "#journal",
      });
    });
    state.moods.forEach((e) =>
      acts.push({
        at: e.createdAt,
        text: `Mencatat mood: ${MOOD_MAP[e.mood].label}`,
        ic: "smile",
        cls: "purple",
        href: "#mood",
      }),
    );
    state.todos.forEach((t) => {
      acts.push({
        at: t.createdAt,
        text: `Menambah tugas “${t.title}”`,
        ic: "plus",
        cls: "teal",
        href: "#todo",
      });
      if (t.completedAt)
        acts.push({
          at: t.completedAt,
          text: `Menyelesaikan tugas “${t.title}”`,
          ic: "check",
          cls: "teal",
          href: "#todo",
        });
    });
    acts.sort((a, b) => (a.at < b.at ? 1 : -1));
    $("#dash-activity").innerHTML = acts.length
      ? `<ul class="activity">${acts
          .slice(0, 7)
          .map(
            (a) =>
              `<li><a href="${a.href}"><span class="act-icon ${a.cls}">${icon(a.ic)}</span><span><span class="act-text">${esc(a.text)}</span><br><span class="act-time">${esc(relTime(a.at))}</span></span></a></li>`,
          )
          .join("")}</ul>`
      : emptyState({
          ic: "clock",
          title: "Belum ada aktivitas",
          text: "Jurnal, catatan mood, dan tugas terbaru akan muncul di sini.",
        });
  }

  /* ---------------------------------------------------------
     JOURNAL
     --------------------------------------------------------- */
  function journalFiltersActive() {
    const f = state.ui.journalFilters;
    return !!(f.q.trim() || f.mood || f.from || f.to);
  }

  function filteredJournals() {
    const f = state.ui.journalFilters;
    const q = f.q.trim().toLowerCase();
    const list = state.journals.filter((j) => {
      if (f.mood === "__none") {
        if (j.mood) return false;
      } else if (f.mood && j.mood !== f.mood) return false;
      const k = localKey(j.createdAt);
      if (f.from && k < f.from) return false;
      if (f.to && k > f.to) return false;
      if (
        q &&
        !`${j.title} ${j.content} ${j.tags.join(" ")}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    list.sort((a, b) =>
      f.sort === "oldest"
        ? a.createdAt < b.createdAt
          ? -1
          : 1
        : a.createdAt < b.createdAt
          ? 1
          : -1,
    );
    return list;
  }

  function renderJournalCard(j) {
    const mood = j.mood ? MOOD_MAP[j.mood] : null;
    const excerpt =
      j.content.length > 200
        ? j.content.slice(0, 200).trimEnd() + "…"
        : j.content;
    return `<article class="card journal-card">
      <div class="jc-top"><time datetime="${esc(j.createdAt)}">${esc(fmtDateTime(j.createdAt))}</time>${mood ? moodChip(mood) : ""}</div>
      <h3><button type="button" class="stretch" data-action="view-journal" data-id="${esc(j.id)}">${esc(j.title)}</button></h3>
      <p class="jc-excerpt">${esc(excerpt)}</p>
      <div class="jc-foot">
        <ul class="tags" aria-label="Tag">${j.tags.map((t) => `<li><button type="button" class="tag-btn" data-action="tag" data-tag="${esc(t)}" aria-label="Filter tag ${esc(t)}">#${esc(t)}</button></li>`).join("")}</ul>
        <div class="row-actions">
          <button type="button" class="icon-btn" data-action="edit-journal" data-id="${esc(j.id)}" aria-label="Edit jurnal ${esc(j.title)}">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-action="delete-journal" data-id="${esc(j.id)}" aria-label="Hapus jurnal ${esc(j.title)}">${icon("trash")}</button>
        </div>
      </div></article>`;
  }

  function renderJournal() {
    const f = state.ui.journalFilters;
    // sinkronkan kontrol filter dengan state
    if ($("#j-search").value !== f.q) $("#j-search").value = f.q;
    $("#j-filter-mood").value = f.mood;
    $("#j-from").value = f.from;
    $("#j-to").value = f.to;
    $("#j-sort").value = f.sort;

    const count = $("#journal-count");
    const list = $("#journal-list");
    count.classList.remove("error");

    if (f.from && f.to && f.from > f.to) {
      count.textContent =
        "Tanggal mulai harus sebelum atau sama dengan tanggal akhir.";
      count.classList.add("error");
      list.innerHTML = "";
      return;
    }
    if (!state.journals.length) {
      count.textContent = "";
      list.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState(
        {
          ic: "book",
          title: "Belum ada jurnal",
          text: "Jurnal pertamamu bisa sesingkat apa pun. Tanggal dan waktu tercatat otomatis.",
          action:
            '<button type="button" class="btn btn-primary" data-action="new-journal">' +
            icon("plus") +
            "Tulis jurnal pertama</button>",
        },
      )}</div>`;
      return;
    }
    const items = filteredJournals();
    count.textContent = journalFiltersActive()
      ? `${items.length} dari ${state.journals.length} jurnal ditampilkan`
      : `${state.journals.length} jurnal`;
    if (!items.length) {
      list.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState(
        {
          ic: "search",
          title: "Tidak ada jurnal yang cocok",
          text: "Coba ubah kata kunci, mood, atau rentang tanggal.",
          action:
            '<button type="button" class="btn btn-soft" data-action="reset-journal-filters">Reset filter</button>',
        },
      )}</div>`;
      return;
    }
    list.innerHTML = items.map(renderJournalCard).join("");
  }

  function parseTagInput(raw) {
    const parts = raw
      .split(/[,\n]/)
      .map((t) => t.trim().replace(/^#+/, "").toLowerCase())
      .filter(Boolean);
    const tags = [];
    parts.forEach((t) => {
      if (!tags.includes(t)) tags.push(t);
    });
    if (tags.some((t) => t.length > LIMITS.tag))
      return { error: `Setiap tag maksimal ${LIMITS.tag} karakter.` };
    if (tags.length > LIMITS.tags)
      return { error: `Maksimal ${LIMITS.tags} tag.` };
    return { tags };
  }

  let updateJournalCounter = () => {};

  function openJournalForm(id) {
    const j = id ? state.journals.find((x) => x.id === id) : null;
    state.ui.editingJournal = j ? j.id : null;
    $("#dlg-journal-title").textContent = j ? "Edit jurnal" : "Tulis jurnal";
    $("#j-title").value = j ? j.title : "";
    $("#j-content").value = j ? j.content : "";
    $("#j-tags").value = j ? j.tags.join(", ") : "";
    const radio = $(`input[name="j-mood"][value="${j ? j.mood : ""}"]`);
    if (radio) radio.checked = true;
    $("#j-dateinfo").textContent = j
      ? `Dibuat ${fmtDateTime(j.createdAt)}${new Date(j.updatedAt) - new Date(j.createdAt) > 1000 ? ` · Terakhir diubah ${fmtDateTime(j.updatedAt)}` : ""}`
      : `Tanggal dan waktu dicatat otomatis: ${fmtDateTime(new Date())}`;
    ["j-title", "j-content", "j-tags"].forEach((i) => setError(i, ""));
    updateJournalCounter();
    openDialog($("#dlg-journal"));
    $("#j-title").focus();
  }

  function submitJournal(e) {
    e.preventDefault();
    const title = $("#j-title").value.trim();
    const content = $("#j-content").value.trim();
    const tagRes = parseTagInput($("#j-tags").value);
    const mood = ($('input[name="j-mood"]:checked') || {}).value || "";

    const eTitle = !title
      ? "Judul wajib diisi."
      : title.length > LIMITS.title
        ? `Judul maksimal ${LIMITS.title} karakter.`
        : "";
    const eContent = !content
      ? "Isi jurnal wajib diisi."
      : content.length > LIMITS.content
        ? `Isi maksimal ${LIMITS.content} karakter.`
        : "";
    const eTags = tagRes.error || "";
    setError("j-title", eTitle);
    setError("j-content", eContent);
    setError("j-tags", eTags);
    if (eTitle) return $("#j-title").focus();
    if (eContent) return $("#j-content").focus();
    if (eTags) return $("#j-tags").focus();

    const nowIso = new Date().toISOString();
    const id = state.ui.editingJournal;
    if (id) {
      const j = state.journals.find((x) => x.id === id);
      if (!j) {
        toast("Jurnal tidak ditemukan.", "error");
        return;
      }
      Object.assign(j, {
        title,
        content,
        tags: tagRes.tags,
        mood,
        updatedAt: nowIso,
      });
      save("journals");
      toast("Perubahan jurnal disimpan");
    } else {
      state.journals.unshift({
        id: uid(),
        title,
        content,
        tags: tagRes.tags,
        mood,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      save("journals");
      toast("Jurnal disimpan");
    }
    $("#dlg-journal").close();
    refresh();
  }

  function openJournalView(id) {
    const j = state.journals.find((x) => x.id === id);
    if (!j) return;
    state.ui.viewingJournal = id;
    $("#jv-title").textContent = j.title;
    const mood = j.mood ? MOOD_MAP[j.mood] : null;
    const edited = new Date(j.updatedAt) - new Date(j.createdAt) > 1000;
    $("#jv-meta").innerHTML =
      `<span>${icon("calendar")} ${esc(fmtLong(j.createdAt))}, ${esc(fmtTime(j.createdAt))}</span>${mood ? moodChip(mood) : ""}${edited ? `<span>Diubah ${esc(fmtDateTime(j.updatedAt))}</span>` : ""}`;
    $("#jv-content").textContent = j.content;
    $("#jv-tags").innerHTML = j.tags
      .map((t) => `<li class="tag-chip">#${esc(t)}</li>`)
      .join("");
    openDialog($("#dlg-journal-view"));
  }

  async function deleteJournal(id) {
    const j = state.journals.find((x) => x.id === id);
    if (!j) return;
    const ok = await confirmDialog({
      title: "Hapus jurnal ini?",
      message: `“${j.title}” akan dihapus permanen dan tidak bisa dikembalikan.`,
      confirmText: "Hapus jurnal",
      danger: true,
    });
    if (!ok) return;
    state.journals = state.journals.filter((x) => x.id !== id);
    save("journals");
    if ($("#dlg-journal-view").open) $("#dlg-journal-view").close();
    toast("Jurnal dihapus");
    refresh();
  }

  /* ---------------------------------------------------------
     MOOD
     --------------------------------------------------------- */
  function renderMoodPickers() {
    $("#mood-picker").innerHTML = MOODS.map(
      (m) => `
      <label class="mood-option" style="--mc:${m.color}">
        <input type="radio" name="mood" value="${m.id}" class="sr-only">
        <span class="mood-card">${moodFace(m.id)}<span>${esc(m.label)}</span></span>
      </label>`,
    ).join("");
    $("#j-mood-picker").innerHTML =
      `<label class="chip-radio"><input type="radio" name="j-mood" value="" class="sr-only" checked><span>Tanpa mood</span></label>` +
      MOODS.map(
        (m) =>
          `<label class="chip-radio" style="--mc:${m.color}"><input type="radio" name="j-mood" value="${m.id}" class="sr-only"><span>${moodFace(m.id)}${esc(m.label)}</span></label>`,
      ).join("");
    $("#j-filter-mood").innerHTML =
      '<option value="">Semua mood</option>' +
      MOODS.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join(
        "",
      ) +
      '<option value="__none">Tanpa mood</option>';
  }

  function renderMood() {
    const today = todayKey();
    const cnt = (moodsByDate().get(today) || []).length;
    $("#mood-today-hint").textContent = cnt
      ? `Kamu sudah mencatat ${cnt} kali hari ini. Catatan baru akan ditambahkan ke riwayat.`
      : "Belum ada catatan hari ini.";
    renderCalendar();
    renderCalDetail();
    renderTrend();
    renderMoodHistory();
    $$("#trend-range .seg-btn").forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(Number(b.dataset.range) === state.ui.trendRange),
      ),
    );
  }

  function renderCalendar(focusDate) {
    const { y, m } = state.ui.cal;
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // Senin sebagai hari pertama
    const dim = new Date(y, m + 1, 0).getDate();
    const today = todayKey();
    const byDate = moodsByDate();
    $("#cal-label").textContent = dfMonth.format(first);
    const cur = new Date();
    $("#cal-next").disabled = y === cur.getFullYear() && m === cur.getMonth();

    let html = '<span class="cal-pad" aria-hidden="true"></span>'.repeat(
      offset,
    );
    for (let d = 1; d <= dim; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      const es = byDate.get(key);
      const le = es && es[es.length - 1];
      const mood = le && MOOD_MAP[le.mood];
      const future = key > today;
      const label = `${fmtLong(key)}${mood ? `, ${mood.label}${es.length > 1 ? ` (${es.length} catatan)` : ""}` : ", belum ada catatan"}`;
      html += `<button type="button" class="cal-day${key === today ? " is-today" : ""}" data-action="cal-day" data-date="${key}" aria-pressed="${key === state.ui.calSelected}" aria-label="${esc(label)}"${future ? " disabled" : ""}${mood ? ` style="--mc:${mood.color}"` : ""}><span class="cal-num">${d}</span>${mood ? moodFace(mood.id) : ""}</button>`;
    }
    $("#cal-grid").innerHTML = html;
    if (focusDate) {
      const b = $(`#cal-grid [data-date="${focusDate}"]`);
      if (b) b.focus();
    }
  }

  function moodEntryRow(e, withDelete = true) {
    const m = MOOD_MAP[e.mood];
    return `<li class="history-item">
      <span class="mood-badge" style="--mc:${m.color}">${moodFace(m.id)}</span>
      <div class="hi-body"><div class="hi-top"><strong>${esc(m.label)}</strong><time datetime="${esc(e.createdAt)}">${esc(fmtDateTime(e.createdAt))}</time></div>${e.note ? `<p class="hi-note">${esc(e.note)}</p>` : ""}</div>
      ${withDelete ? `<button type="button" class="icon-btn danger" data-action="delete-mood" data-id="${esc(e.id)}" aria-label="Hapus catatan mood ${esc(m.label)} pada ${esc(fmtDateTime(e.createdAt))}">${icon("trash")}</button>` : ""}
    </li>`;
  }

  function renderCalDetail() {
    const k = state.ui.calSelected;
    const es = (moodsByDate().get(k) || []).slice().reverse();
    $("#cal-detail").innerHTML =
      `<h3>${esc(fmtLong(k))}</h3>` +
      (es.length
        ? `<ul class="history-list">${es.map((e) => moodEntryRow(e)).join("")}</ul>`
        : `<p class="sub" style="margin:0">Tidak ada catatan mood pada tanggal ini.</p>`);
  }

  function renderTrend() {
    const box = $("#mood-trend");
    const n = state.ui.trendRange;
    const keys = lastNDays(n);
    const byDate = moodsByDate();
    const pts = keys.map((k, i) => {
      const es = byDate.get(k);
      return es ? { k, i, avg: avgScore(es) } : null;
    });
    const withData = pts.filter(Boolean);
    if (!withData.length) {
      box.innerHTML = emptyState({
        ic: "bar-chart",
        title: `Belum ada data ${n} hari terakhir`,
        text: "Catat mood beberapa kali dan grafik tren akan muncul di sini.",
      });
      return;
    }
    const W = Math.max(280, box.clientWidth || 600);
    const H = 270,
      padL = W < 460 ? 74 : 88,
      padR = 16,
      padT = 14,
      padB = 34;
    const iw = W - padL - padR,
      ih = H - padT - padB;
    const x = (i) => padL + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (s) => padT + ((6 - s) / 5) * ih;
    let g = "";
    MOODS_BY_SCORE.forEach((m) => {
      g += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(m.score)}" y2="${y(m.score)}"/><text class="ax" x="${padL - 10}" y="${y(m.score) + 4}" text-anchor="end">${esc(m.label)}</text>`;
    });
    const stepLbl = n <= 7 ? 1 : n <= 14 ? 2 : 5;
    keys.forEach((k, i) => {
      if ((n - 1 - i) % stepLbl !== 0) return;
      g += `<text class="ax" x="${x(i)}" y="${H - 10}" text-anchor="middle">${esc(fmtShort(k))}</text>`;
    });
    let path = "";
    let prev = null;
    pts.forEach((p, i) => {
      if (!p) {
        prev = null;
        return;
      }
      path += `${prev ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg).toFixed(1)} `;
      prev = p;
    });
    const dots = withData
      .map((p) => {
        const m = moodByAvg(p.avg);
        return `<circle class="pt" cx="${x(p.i).toFixed(1)}" cy="${y(p.avg).toFixed(1)}" r="5" fill="${m.color}"><title>${esc(fmtShort(p.k))}: ${esc(m.label)}</title></circle>`;
      })
      .join("");
    const overall = moodByAvg(
      withData.reduce((s, p) => s + p.avg, 0) / withData.length,
    );
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik tren mood ${n} hari terakhir. ${withData.length} hari memiliki catatan; rata-rata mood ${esc(overall.label)}.">${g}<path class="line" d="${path}"/>${dots}</svg>
      <p class="chart-note">Rata-rata pada ${withData.length} hari yang tercatat: <strong>${esc(overall.label)}</strong>. Garis terputus berarti ada hari tanpa catatan.</p>`;
  }

  function renderMoodHistory() {
    const box = $("#mood-history");
    const more = $("#mood-more");
    if (!state.moods.length) {
      box.innerHTML = emptyState({
        ic: "smile",
        title: "Riwayat masih kosong",
        text: "Catatan mood yang kamu simpan akan tampil di sini, terbaru di atas.",
      });
      more.hidden = true;
      return;
    }
    const shown = state.moods.slice(0, state.ui.moodLimit);
    box.innerHTML = `<ul class="history-list">${shown.map((e) => moodEntryRow(e)).join("")}</ul>`;
    more.hidden = shown.length >= state.moods.length;
    more.textContent = `Tampilkan lebih banyak (${state.moods.length - shown.length} lagi)`;
  }

  function submitMood(e) {
    e.preventDefault();
    const sel = $('input[name="mood"]:checked');
    const err = $("#mood-err");
    if (!sel) {
      err.textContent = "Pilih salah satu suasana hati terlebih dahulu.";
      err.hidden = false;
      $('input[name="mood"]').focus();
      return;
    }
    err.hidden = true;
    const note = $("#mood-note").value.trim();
    if (note.length > LIMITS.note) {
      err.textContent = `Catatan maksimal ${LIMITS.note} karakter.`;
      err.hidden = false;
      return;
    }
    const at = new Date();
    state.moods.unshift({
      id: uid(),
      mood: sel.value,
      note,
      date: dateKey(at),
      createdAt: at.toISOString(),
    });
    save("moods");
    sel.checked = false;
    $("#mood-note").value = "";
    $("#mood-count").textContent = `0/${LIMITS.note}`;
    state.ui.cal = { y: at.getFullYear(), m: at.getMonth() };
    state.ui.calSelected = dateKey(at);
    toast(`Mood “${MOOD_MAP[state.moods[0].mood].label}” tersimpan`);
    refresh();
  }

  async function deleteMood(id) {
    const e = state.moods.find((x) => x.id === id);
    if (!e) return;
    const ok = await confirmDialog({
      title: "Hapus catatan mood?",
      message: `Catatan “${MOOD_MAP[e.mood].label}” pada ${fmtDateTime(e.createdAt)} akan dihapus permanen.`,
      confirmText: "Hapus catatan",
      danger: true,
    });
    if (!ok) return;
    state.moods = state.moods.filter((x) => x.id !== id);
    save("moods");
    toast("Catatan mood dihapus");
    refresh();
  }

  /* ---------------------------------------------------------
     TODO
     --------------------------------------------------------- */
  function sortedTodos(list) {
    const active = list
      .filter((t) => !t.done)
      .sort((a, b) => {
        if (a.due !== b.due) {
          if (!a.due) return 1;
          if (!b.due) return -1;
          return a.due < b.due ? -1 : 1;
        }
        const pr = PRIORITIES[b.priority].rank - PRIORITIES[a.priority].rank;
        return pr || (a.createdAt < b.createdAt ? 1 : -1);
      });
    const done = list
      .filter((t) => t.done)
      .sort((a, b) => ((a.completedAt || "") < (b.completedAt || "") ? 1 : -1));
    return [...active, ...done];
  }

  function dueChip(t) {
    if (!t.due) return "";
    const diff = daysBetween(todayKey(), t.due);
    let cls = "due",
      text = fmtShort(t.due);
    if (t.done) {
      text = fmtShort(t.due);
    } else if (diff < 0) {
      cls += " overdue";
      text = `Terlambat ${-diff} hari`;
    } else if (diff === 0) {
      cls += " today";
      text = "Hari ini";
    } else if (diff === 1) {
      text = "Besok";
    }
    return `<span class="badge ${cls}">${icon("calendar")}<span>${esc(text)}</span></span>`;
  }

  function renderTodo() {
    const all = state.todos;
    const counts = {
      all: all.length,
      active: all.filter((t) => !t.done).length,
      done: all.filter((t) => t.done).length,
    };
    $$("#todo-filters .seg-btn").forEach((b) => {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.filter === state.ui.todoFilter),
      );
      $(".seg-count", b).textContent = `(${counts[b.dataset.filter]})`;
    });

    // Progres
    const p = dailyProgress();
    const overallPct = pct(counts.done, counts.all);
    let prog = "";
    if (!all.length) {
      prog = emptyState({
        ic: "check-square",
        compact: true,
        title: "Belum ada tugas",
        text: "Tambahkan tugas pertamamu untuk mulai melacak progres.",
      });
    } else {
      const dpct = pct(p.done, p.total);
      prog = `<div class="progress-block">
        <h3>${p.scope === "today" ? "Tugas bertenggat hari ini" : "Tidak ada tenggat hari ini"}</h3>
        <p class="big-number">${p.scope === "today" ? `${dpct}%` : "—"}</p>
        ${p.scope === "today" ? `<div class="bar-track" role="progressbar" aria-label="Progres tugas hari ini" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${dpct}"><div class="bar-fill" style="width:${dpct}%"></div></div><p>${p.done} dari ${p.total} tugas selesai</p>` : `<p>Beri tenggat hari ini pada sebuah tugas agar progres harian muncul di sini.</p>`}
      </div>
      <div class="progress-block">
        <h3>Semua tugas</h3>
        <p class="big-number">${overallPct}%</p>
        <div class="bar-track" role="progressbar" aria-label="Progres semua tugas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${overallPct}"><div class="bar-fill" style="width:${overallPct}%"></div></div>
        <p>${counts.done} dari ${counts.all} tugas selesai</p>
      </div>`;
    }
    $("#todo-progress").innerHTML = prog;

    // Daftar
    const filter = state.ui.todoFilter;
    const filtered = all.filter((t) =>
      filter === "all" ? true : filter === "active" ? !t.done : t.done,
    );
    const list = $("#todo-list");
    if (!all.length) {
      list.innerHTML = emptyState({
        ic: "check-square",
        title: "Belum ada tugas",
        text: "Gunakan formulir di atas untuk menambahkan tugas, lengkap dengan prioritas dan tenggat.",
      });
      return;
    }
    if (!filtered.length) {
      list.innerHTML = emptyState({
        ic: "check-square",
        title:
          filter === "active"
            ? "Tidak ada tugas aktif"
            : "Belum ada tugas selesai",
        text:
          filter === "active"
            ? "Semua tugas sudah selesai. Tambahkan yang baru jika perlu."
            : "Centang tugas untuk memindahkannya ke sini.",
      });
      return;
    }
    list.innerHTML = `<ul class="todo-list">${sortedTodos(filtered)
      .map(
        (t) => `
      <li class="todo${t.done ? " is-done" : ""}">
        <input type="checkbox" id="td-${esc(t.id)}" data-action="toggle-todo" data-id="${esc(t.id)}"${t.done ? " checked" : ""}>
        <div class="todo-main">
          <label class="todo-title" for="td-${esc(t.id)}">${esc(t.title)}</label>
          <div class="todo-meta"><span class="badge prio-${t.priority}">${icon("flag")}Prioritas ${esc(PRIORITIES[t.priority].label.toLowerCase())}</span>${dueChip(t)}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="icon-btn" data-action="edit-todo" data-id="${esc(t.id)}" aria-label="Edit tugas ${esc(t.title)}">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-action="delete-todo" data-id="${esc(t.id)}" aria-label="Hapus tugas ${esc(t.title)}">${icon("trash")}</button>
        </div>
      </li>`,
      )
      .join("")}</ul>`;
  }

  function submitTodo(e) {
    e.preventDefault();
    const title = $("#t-title").value.trim();
    const err = !title
      ? "Nama tugas wajib diisi."
      : title.length > LIMITS.todo
        ? `Nama tugas maksimal ${LIMITS.todo} karakter.`
        : "";
    if (setError("t-title", err)) {
      $("#t-title").focus();
      return;
    }
    const due = $("#t-due").value;
    if (due && !isDateKey(due)) {
      toast("Format tenggat tidak valid.", "error");
      return;
    }
    state.todos.unshift({
      id: uid(),
      title,
      priority: $("#t-priority").value,
      due: due || "",
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    save("todos");
    $("#t-title").value = "";
    $("#t-due").value = "";
    toast("Tugas ditambahkan");
    renderTodo();
    $("#t-title").focus();
  }

  function openTodoEdit(id) {
    const t = state.todos.find((x) => x.id === id);
    if (!t) return;
    state.ui.editingTodo = id;
    $("#te-title").value = t.title;
    $("#te-priority").value = t.priority;
    $("#te-due").value = t.due;
    setError("te-title", "");
    openDialog($("#dlg-todo"));
    $("#te-title").focus();
  }

  function submitTodoEdit(e) {
    e.preventDefault();
    const t = state.todos.find((x) => x.id === state.ui.editingTodo);
    if (!t) {
      $("#dlg-todo").close();
      return;
    }
    const title = $("#te-title").value.trim();
    const err = !title
      ? "Nama tugas wajib diisi."
      : title.length > LIMITS.todo
        ? `Nama tugas maksimal ${LIMITS.todo} karakter.`
        : "";
    if (setError("te-title", err)) {
      $("#te-title").focus();
      return;
    }
    Object.assign(t, {
      title,
      priority: $("#te-priority").value,
      due: $("#te-due").value || "",
    });
    save("todos");
    $("#dlg-todo").close();
    toast("Perubahan tugas disimpan");
    refresh();
  }

  function toggleTodo(id, checked) {
    const t = state.todos.find((x) => x.id === id);
    if (!t) return;
    t.done = checked;
    t.completedAt = checked ? new Date().toISOString() : null;
    save("todos");
    renderTodo();
    const cb = $(`#td-${CSS.escape(id)}`);
    if (cb) cb.focus();
  }

  async function deleteTodo(id) {
    const t = state.todos.find((x) => x.id === id);
    if (!t) return;
    const ok = await confirmDialog({
      title: "Hapus tugas ini?",
      message: `“${t.title}” akan dihapus permanen.`,
      confirmText: "Hapus tugas",
      danger: true,
    });
    if (!ok) return;
    state.todos = state.todos.filter((x) => x.id !== id);
    save("todos");
    toast("Tugas dihapus");
    refresh();
  }

  /* ---------------------------------------------------------
     STATISTIK
     --------------------------------------------------------- */
  function statCard(ic, cls, label, value, sub) {
    return `<article class="card stat"><span class="stat-icon ${cls}">${icon(ic)}</span><div><p class="stat-label">${esc(label)}</p><p class="stat-value">${value}</p><p class="stat-sub">${esc(sub)}</p></div></article>`;
  }

  function renderStats() {
    const doneCount = state.todos.filter((t) => t.done).length;
    const totalTodos = state.todos.length;
    $("#stats-cards").innerHTML =
      statCard(
        "book",
        "",
        "Jumlah jurnal",
        state.journals.length,
        state.journals.length ? "jurnal tersimpan" : "Belum ada jurnal",
      ) +
      statCard(
        "smile",
        "purple",
        "Catatan mood",
        state.moods.length,
        state.moods.length ? "catatan tersimpan" : "Belum ada catatan",
      ) +
      statCard(
        "check-square",
        "teal",
        "Tugas selesai",
        totalTodos
          ? `${doneCount}<small class="muted" style="font-size:1rem;font-weight:600"> / ${totalTodos}</small>`
          : "0",
        totalTodos ? "dari total tugas" : "Belum ada tugas",
      ) +
      statCard(
        "bar-chart",
        "",
        "Penyelesaian tugas",
        totalTodos ? `${pct(doneCount, totalTodos)}%` : "—",
        totalTodos ? "tugas yang sudah selesai" : "Tambahkan tugas dulu",
      );
    renderDist();
    renderWeek();
    renderMonth();
  }

  function renderDist() {
    const box = $("#stats-dist");
    const total = state.moods.length;
    if (!total) {
      box.innerHTML = emptyState({
        ic: "smile",
        title: "Belum ada data mood",
        text: "Distribusi akan muncul setelah kamu mencatat suasana hati.",
        action: '<a class="btn btn-soft" href="#mood">Catat mood</a>',
      });
      return;
    }
    box.innerHTML =
      '<ul class="dist">' +
      MOODS.map((m) => {
        const c = state.moods.filter((e) => e.mood === m.id).length;
        const p = pct(c, total);
        return `<li style="--mc:${m.color}"><span class="dist-label">${moodFace(m.id)}${esc(m.label)}</span><span class="dist-bar" role="img" aria-label="${esc(m.label)}: ${c} catatan, ${p}%"><span style="width:${p}%"></span></span><span class="dist-val">${c} <small>(${p}%)</small></span></li>`;
      }).join("") +
      "</ul>";
  }

  function renderWeek() {
    const box = $("#stats-week");
    const note = $("#stats-week-note");
    const keys = lastNDays(7);
    const series = keys.map((k) => ({
      k,
      j: state.journals.filter((x) => localKey(x.createdAt) === k).length,
      m: state.moods.filter((x) => x.date === k).length,
      t: state.todos.filter(
        (x) => x.completedAt && localKey(x.completedAt) === k,
      ).length,
    }));
    const total = series.reduce((s, d) => s + d.j + d.m + d.t, 0);
    $("#stats-legend").hidden = !total;
    if (!total) {
      box.innerHTML = emptyState({
        ic: "bar-chart",
        title: "Belum ada aktivitas 7 hari terakhir",
        text: "Tulis jurnal, catat mood, atau selesaikan tugas untuk melihat tren mingguan.",
      });
      note.textContent = "";
      return;
    }
    const W = Math.max(280, box.clientWidth || 560),
      H = 250,
      pl = 28,
      pr = 6,
      pt = 12,
      pb = 40;
    const max = Math.max(3, ...series.flatMap((d) => [d.j, d.m, d.t]));
    const step = max <= 6 ? 1 : Math.ceil(max / 5);
    const top = Math.ceil(max / step) * step;
    const ih = H - pt - pb,
      iw = W - pl - pr,
      gw = iw / 7;
    const bw = Math.max(4, Math.min(16, (gw - 10) / 3));
    let g = "";
    for (let v = 0; v <= top; v += step) {
      const yy = pt + ih - (v / top) * ih;
      g += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}"/><text class="ax" x="${pl - 8}" y="${yy + 4}" text-anchor="end">${v}</text>`;
    }
    series.forEach((d, i) => {
      const cx = pl + gw * i + gw / 2;
      const x0 = cx - (3 * bw + 4) / 2;
      [
        ["b1", d.j, "Jurnal"],
        ["b2", d.m, "Catatan mood"],
        ["b3", d.t, "Tugas selesai"],
      ].forEach(([cls, val, label], si) => {
        if (!val) return;
        const h = Math.max(3, (val / top) * ih);
        g += `<rect class="${cls}" x="${(x0 + si * (bw + 2)).toFixed(1)}" y="${(pt + ih - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="3"><title>${esc(fmtShort(d.k))} — ${label}: ${val}</title></rect>`;
      });
      g += `<text class="ax" x="${cx}" y="${H - 20}" text-anchor="middle">${esc(dfWd.format(parseKey(d.k)))}</text><text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle" style="font-weight:500">${parseKey(d.k).getDate()}</text>`;
    });
    const sumJ = series.reduce((s, d) => s + d.j, 0),
      sumM = series.reduce((s, d) => s + d.m, 0),
      sumT = series.reduce((s, d) => s + d.t, 0);
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik batang aktivitas 7 hari terakhir: ${sumJ} jurnal, ${sumM} catatan mood, ${sumT} tugas selesai.">${g}</svg>`;

    const thisKeys = new Set(keys);
    const prevKeys = new Set(lastNDays(14).slice(0, 7));
    const wk = (set) => state.moods.filter((e) => set.has(e.date));
    const a = wk(thisKeys),
      b = wk(prevKeys);
    let txt = `7 hari terakhir: <strong>${sumJ}</strong> jurnal, <strong>${sumM}</strong> catatan mood, <strong>${sumT}</strong> tugas selesai. `;
    if (a.length) {
      txt += `Rata-rata mood: <strong>${esc(moodByAvg(avgScore(a)).label)}</strong>`;
      txt += b.length
        ? ` (minggu sebelumnya: ${esc(moodByAvg(avgScore(b)).label)}).`
        : " (belum ada catatan minggu sebelumnya untuk dibandingkan).";
    } else txt += "Belum ada catatan mood minggu ini.";
    note.innerHTML = txt;
  }

  function renderMonth() {
    const { y, m } = state.ui.statMonth;
    const cur = new Date();
    $("#stat-month-label").textContent = dfMonth.format(new Date(y, m, 1));
    $("#stat-next").disabled = y === cur.getFullYear() && m === cur.getMonth();
    const prefix = `${y}-${pad(m + 1)}`;
    const inMonth = (iso) => localKey(iso).startsWith(prefix);
    const js = state.journals.filter((j) => inMonth(j.createdAt));
    const ms = state.moods.filter((e) => e.date.startsWith(prefix));
    const created = state.todos.filter((t) => inMonth(t.createdAt));
    const done = state.todos.filter(
      (t) => t.completedAt && inMonth(t.completedAt),
    );
    const box = $("#stats-month");
    if (!js.length && !ms.length && !created.length && !done.length) {
      box.innerHTML = emptyState({
        ic: "calendar",
        title: "Belum ada data bulan ini",
        text: "Pilih bulan lain atau mulai mencatat untuk melihat ringkasannya.",
      });
      return;
    }
    const activeDays = new Set([
      ...js.map((j) => localKey(j.createdAt)),
      ...ms.map((e) => e.date),
      ...done.map((t) => localKey(t.completedAt)),
    ]).size;
    let freq = null;
    if (ms.length) {
      freq = MOODS.map((mm) => ({
        mm,
        c: ms.filter((e) => e.mood === mm.id).length,
      })).sort((a, b) => b.c - a.c)[0];
    }
    const tagCount = {};
    js.forEach((j) =>
      j.tags.forEach((t) => {
        tagCount[t] = (tagCount[t] || 0) + 1;
      }),
    );
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
    const metric = (label, value) =>
      `<div class="metric"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
    box.innerHTML = `<dl class="metrics">
        ${metric("Jurnal ditulis", js.length)}
        ${metric("Catatan mood", ms.length)}
        ${metric("Mood paling sering", freq ? `${esc(freq.mm.label)} <small>(${freq.c}×)</small>` : "—")}
        ${metric("Rata-rata mood", ms.length ? esc(moodByAvg(avgScore(ms)).label) : "—")}
        ${metric("Tugas dibuat", created.length)}
        ${metric("Tugas selesai", done.length)}
        ${metric("Hari aktif", activeDays)}
      </dl>
      ${topTags.length ? `<div class="month-tags"><h3>Tag teratas</h3><ul class="tags">${topTags.map(([t, c]) => `<li class="tag-chip">#${esc(t)} · ${c}</li>`).join("")}</ul></div>` : ""}`;
  }

  /* ---------------------------------------------------------
     NOTIFIKASI PERANGKAT
     Pengingat dijadwalkan di dalam halaman (bukan push server),
     sehingga hanya terkirim saat MindSpace terbuka di browser/PWA.
     --------------------------------------------------------- */
  const notifSupported = () => "Notification" in window;
  let notifTimer = null;
  let swRegistered = false;

  function registerSW() {
    if (
      swRegistered ||
      !("serviceWorker" in navigator) ||
      !/^https?:$/.test(location.protocol)
    )
      return;
    swRegistered = true;
    navigator.serviceWorker
      .register("sw.js")
      .catch((e) =>
        console.warn("[MindSpace] Service worker gagal didaftarkan", e),
      );
  }

  function canNotify() {
    return (
      notifSupported() &&
      Notification.permission === "granted" &&
      state.settings.notifications.enabled
    );
  }

  async function showDeviceNotification(title, body, tag, hash) {
    const opts = {
      body,
      tag,
      icon: NOTIF_ICON,
      badge: NOTIF_ICON,
      lang: "id",
      data: { hash },
    };
    try {
      if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(title, opts);
          return true;
        }
      }
      const n = new Notification(title, opts);
      n.onclick = () => {
        window.focus();
        if (ROUTES[hash.slice(1)]) location.hash = hash;
        n.close();
      };
      return true;
    } catch (e) {
      console.warn("[MindSpace] Gagal menampilkan notifikasi", e);
      return false;
    }
  }

  const REMINDERS = {
    mood() {
      if ((moodsByDate().get(todayKey()) || []).length) return null;
      return {
        title: "Waktunya check-in mood",
        body: "Bagaimana perasaanmu hari ini? Catat dalam satu menit.",
        hash: "#mood",
      };
    },
    journal() {
      const today = todayKey();
      if (state.journals.some((j) => localKey(j.createdAt) === today))
        return null;
      return {
        title: "Saatnya menulis jurnal",
        body: "Luangkan beberapa menit untuk menuliskan harimu.",
        hash: "#journal",
      };
    },
    task() {
      const today = todayKey();
      const open = state.todos.filter(
        (t) => !t.done && t.due && t.due <= today,
      );
      if (!open.length) return null;
      const late = open.filter((t) => t.due < today).length;
      const dueToday = open.length - late;
      const parts = [];
      if (dueToday) parts.push(`${dueToday} tugas bertenggat hari ini`);
      if (late) parts.push(`${late} tugas terlambat`);
      return {
        title: "Pengingat tugas",
        body: parts.join(", ") + ".",
        hash: "#todo",
      };
    },
  };

  function checkReminders() {
    if (!canNotify()) return;
    const n = state.settings.notifications;
    const now = new Date();
    const today = dateKey(now);
    const mins = now.getHours() * 60 + now.getMinutes();
    let changed = false;
    REMINDER_IDS.forEach((id) => {
      const cfg = n[id];
      if (!cfg.on || n.last[id] === today) return;
      const [h, m] = cfg.time.split(":").map(Number);
      const diff = mins - (h * 60 + m);
      if (diff < 0 || diff > CATCHUP_MINUTES) return;
      n.last[id] = today;
      changed = true;
      const msg = REMINDERS[id]();
      if (msg)
        showDeviceNotification(
          msg.title,
          msg.body,
          "mindspace-" + id,
          msg.hash,
        );
    });
    if (changed) save("settings");
  }

  function startScheduler() {
    clearInterval(notifTimer);
    notifTimer = null;
    if (!canNotify()) return;
    registerSW();
    checkReminders();
    notifTimer = setInterval(checkReminders, 30000);
  }

  async function enableNotifications() {
    if (!notifSupported()) {
      toast("Browser ini tidak mendukung notifikasi.", "error");
      return false;
    }
    if (!window.isSecureContext) {
      toast(
        "Notifikasi memerlukan HTTPS atau localhost. Jalankan lewat Live Server.",
        "error",
        7000,
      );
      return false;
    }
    let perm = Notification.permission;
    if (perm === "default") {
      try {
        perm = await Notification.requestPermission();
      } catch (e) {
        perm = Notification.permission;
      }
    }
    if (perm !== "granted") {
      toast(
        perm === "denied"
          ? "Izin notifikasi diblokir. Izinkan lewat pengaturan situs di browser, lalu coba lagi."
          : "Izin notifikasi belum diberikan.",
        "error",
        7000,
      );
      return false;
    }
    state.settings.notifications.enabled = true;
    registerSW();
    return true;
  }

  function notifStatusText() {
    if (!notifSupported()) return "Browser ini tidak mendukung notifikasi.";
    if (!window.isSecureContext) return "Memerlukan HTTPS atau localhost.";
    const p = Notification.permission;
    if (p === "denied")
      return "Izin diblokir di browser. Ubah lewat pengaturan situs.";
    if (p === "granted")
      return state.settings.notifications.enabled
        ? "Aktif. Izin sudah diberikan."
        : "Nonaktif. Izin sudah diberikan.";
    return "Belum meminta izin. Akan diminta saat diaktifkan.";
  }

  function renderNotifSettings() {
    const n = state.settings.notifications;
    const usable =
      notifSupported() &&
      window.isSecureContext &&
      Notification.permission !== "denied";
    $("#nt-enabled").checked = n.enabled && canNotify();
    $("#nt-enabled").disabled = !usable;
    $("#nt-status").textContent = notifStatusText();
    $("#nt-options").disabled = !n.enabled;
    REMINDER_IDS.forEach((id) => {
      $(`#nt-${id}-on`).checked = n[id].on;
      $(`#nt-${id}-time`).value = n[id].time;
    });
    $("#nt-test").disabled = !usable;
  }

  function commitNotif() {
    save("settings");
    flashSaved();
    renderNotifSettings();
    startScheduler();
  }

  async function sendTestNotification() {
    if (!notifSupported() || !window.isSecureContext) {
      toast("Notifikasi tidak tersedia di konteks ini.", "error");
      return;
    }
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (e) {
        /* abaikan */
      }
    }
    if (Notification.permission !== "granted") {
      renderNotifSettings();
      toast("Izin notifikasi belum diberikan.", "error");
      return;
    }
    registerSW();
    // beri waktu service worker siap sebelum mencoba
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      try {
        await navigator.serviceWorker.ready;
      } catch (e) {
        /* abaikan */
      }
    }
    const ok = await showDeviceNotification(
      "MindSpace",
      "Notifikasi uji berhasil. Pengingatmu akan tampil seperti ini.",
      "mindspace-test",
      "#dashboard",
    );
    toast(
      ok
        ? "Notifikasi uji dikirim"
        : "Gagal menampilkan notifikasi. Periksa pengaturan sistem perangkat.",
      ok ? "success" : "error",
    );
    renderNotifSettings();
  }

  /* ---------------------------------------------------------
     PENGATURAN
     --------------------------------------------------------- */
  function renderSettings() {
    const s = state.settings;
    if (document.activeElement !== $("#set-name"))
      $("#set-name").value = s.name;
    $$('input[name="set-theme"]').forEach((r) => {
      r.checked = r.value === s.theme;
    });
    $$('input[name="set-density"]').forEach((r) => {
      r.checked = r.value === s.density;
    });
    $$('input[name="set-font"]').forEach((r) => {
      r.checked = r.value === s.fontSize;
    });
    $("#set-quote").checked = s.showQuote;
    $("#set-motion").checked = s.reduceMotion;
    renderAccount();
    renderNotifSettings();
    const size = store.sizeBytes();
    $("#data-summary").textContent =
      `Tersimpan di browser ini: ${state.journals.length} jurnal, ${state.moods.length} catatan mood, ${state.todos.length} tugas` +
      (size !== null ? ` (± ${(size / 1024).toFixed(1)} KB).` : ".") +
      (store.available
        ? ""
        : " Penyimpanan browser tidak tersedia, data hanya sementara.");
  }

  let statusTimer;
  function flashSaved() {
    const el = $("#settings-status");
    el.textContent = "Tersimpan otomatis ✓";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      el.textContent = "";
    }, 2500);
  }
  function commitSettings() {
    applySettings();
    renderChrome();
    save("settings");
    flashSaved();
    renderAccount();
  }

  function buildExport() {
    return {
      app: "MindSpace",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        journals: state.journals,
        moods: state.moods,
        todos: state.todos,
        settings: state.settings,
      },
    };
  }

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(buildExport(), null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mindspace-backup-${todayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast("Data diekspor sebagai file JSON");
    } catch (e) {
      console.error(e);
      toast("Gagal mengekspor data. Coba lagi.", "error");
    }
  }

  function showImportErrors(errors) {
    const box = $("#import-report");
    const shown = errors.slice(0, 8);
    box.innerHTML = `<strong>Impor dibatalkan. Data Anda tidak diubah.</strong><ul>${shown.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>${errors.length > shown.length ? `<p style="margin-top:.5rem">…dan ${errors.length - shown.length} masalah lainnya.</p>` : ""}`;
    box.hidden = false;
  }

  async function importFile(file) {
    const box = $("#import-report");
    box.hidden = true;
    if (file.size > LIMITS.fileBytes) {
      showImportErrors(["Ukuran file melebihi 5 MB."]);
      toast("Impor dibatalkan: file terlalu besar.", "error");
      return;
    }
    showBusy("Memeriksa file…");
    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch (e) {
      hideBusy();
      showImportErrors([
        "File bukan JSON yang valid. Pastikan file berasal dari ekspor MindSpace.",
      ]);
      toast("Impor dibatalkan: JSON tidak valid.", "error");
      return;
    }
    const res = validateImport(raw);
    hideBusy();
    if (res.errors.length) {
      showImportErrors(res.errors);
      toast("Impor dibatalkan: file tidak lolos validasi.", "error");
      return;
    }
    const d = res.data;
    const choice = await confirmDialog({
      title: "Impor data dari file?",
      message: `File valid dan berisi ${d.journals.length} jurnal, ${d.moods.length} catatan mood, dan ${d.todos.length} tugas. “Gabungkan” menambahkan item baru tanpa menghapus data saat ini. “Ganti semua” menimpa seluruh data saat ini.`,
      actions: [
        { value: "merge", label: "Gabungkan", variant: "primary" },
        { value: "replace", label: "Ganti semua", variant: "danger" },
      ],
    });
    if (!choice) return;
    if (choice === "replace") {
      state.journals = d.journals;
      state.moods = d.moods;
      state.todos = d.todos;
      if (d.settings) state.settings = d.settings;
      toast(
        `Data diganti: ${d.journals.length} jurnal, ${d.moods.length} mood, ${d.todos.length} tugas`,
      );
    } else {
      const addNew = (target, items) => {
        const ids = new Set(target.map((x) => x.id));
        let n = 0;
        items.forEach((x) => {
          if (!ids.has(x.id)) {
            target.push(x);
            ids.add(x.id);
            n++;
          }
        });
        return n;
      };
      const a = addNew(state.journals, d.journals),
        b = addNew(state.moods, d.moods),
        c = addNew(state.todos, d.todos);
      toast(`Digabungkan: ${a} jurnal, ${b} mood, ${c} tugas baru`);
    }
    sortData();
    save("journals", "moods", "todos", "settings");
    applySettings();
    startScheduler();
    refresh();
  }

  async function deleteAll() {
    const ok = await confirmDialog({
      title: "Hapus seluruh data?",
      message:
        "Semua jurnal, catatan mood, tugas, dan pengaturan di browser ini akan dihapus permanen. Ekspor data lebih dulu jika ingin menyimpan cadangan.",
      danger: true,
      requireText: "HAPUS",
      actions: [{ value: "ok", label: "Hapus semua data", variant: "danger" }],
    });
    if (!ok) return;
    const removed = store.removeAll();
    state.journals = [];
    state.moods = [];
    state.todos = [];
    state.settings = newSettings();
    state.auth = null;
    startScheduler();
    state.ui.journalFilters = {
      q: "",
      mood: "",
      from: "",
      to: "",
      sort: "newest",
    };
    state.ui.todoFilter = "all";
    state.ui.moodLimit = 10;
    applySettings();
    updateBanner(false);
    $("#import-report").hidden = true;
    if (removed) toast("Seluruh data telah dihapus");
    else
      toast(
        "Data dihapus dari sesi ini, tetapi penyimpanan browser tidak dapat dibersihkan.",
        "error",
      );
    refresh();
  }

  /* ---------------------------------------------------------
     Event handling
     --------------------------------------------------------- */
  const actions = {
    "theme-toggle"() {
      state.settings.theme = effectiveTheme() === "dark" ? "light" : "dark";
      commitSettings();
      if (state.ui.route === "settings") renderSettings();
    },
    "new-journal"() {
      openJournalForm(null);
    },
    "edit-journal"(el) {
      openJournalForm(el.dataset.id);
    },
    "delete-journal"(el) {
      deleteJournal(el.dataset.id);
    },
    "view-journal"(el) {
      openJournalView(el.dataset.id);
    },
    tag(el) {
      state.ui.journalFilters.q = el.dataset.tag;
      renderJournal();
      $("#j-search").focus();
    },
    "reset-journal-filters"() {
      state.ui.journalFilters = {
        q: "",
        mood: "",
        from: "",
        to: "",
        sort: "newest",
      };
      renderJournal();
    },

    "cal-prev"() {
      const c = state.ui.cal;
      const d = new Date(c.y, c.m - 1, 1);
      state.ui.cal = { y: d.getFullYear(), m: d.getMonth() };
      renderCalendar();
    },
    "cal-next"() {
      const c = state.ui.cal;
      const d = new Date(c.y, c.m + 1, 1);
      state.ui.cal = { y: d.getFullYear(), m: d.getMonth() };
      renderCalendar();
    },
    "cal-day"(el) {
      state.ui.calSelected = el.dataset.date;
      renderCalendar(el.dataset.date);
      renderCalDetail();
    },
    "trend-range"(el) {
      state.ui.trendRange = Number(el.dataset.range);
      $$("#trend-range .seg-btn").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === el)),
      );
      renderTrend();
    },
    "mood-more"() {
      state.ui.moodLimit += 10;
      renderMoodHistory();
    },
    "delete-mood"(el) {
      deleteMood(el.dataset.id);
    },

    "todo-filter"(el) {
      state.ui.todoFilter = el.dataset.filter;
      renderTodo();
    },
    "edit-todo"(el) {
      openTodoEdit(el.dataset.id);
    },
    "delete-todo"(el) {
      deleteTodo(el.dataset.id);
    },

    "stat-prev"() {
      const c = state.ui.statMonth;
      const d = new Date(c.y, c.m - 1, 1);
      state.ui.statMonth = { y: d.getFullYear(), m: d.getMonth() };
      renderMonth();
    },
    "stat-next"() {
      const c = state.ui.statMonth;
      const d = new Date(c.y, c.m + 1, 1);
      state.ui.statMonth = { y: d.getFullYear(), m: d.getMonth() };
      renderMonth();
    },

    "sign-out"() {
      signOut();
    },
    "notif-test"() {
      sendTestNotification();
    },
    export() {
      exportData();
    },
    "import-pick"() {
      $("#import-file").click();
    },
    "delete-all"() {
      deleteAll();
    },
  };

  function bindEvents() {
    document.addEventListener("click", (e) => {
      const closer = e.target.closest("[data-close]");
      if (closer) {
        const dlg = closer.closest("dialog");
        if (dlg) dlg.close();
        return;
      }
      const el = e.target.closest("[data-action]");
      if (!el || el.tagName === "INPUT") return;
      const fn = actions[el.dataset.action];
      if (fn) fn(el, e);
    });
    // klik pada backdrop menutup dialog
    $$("dialog").forEach((dlg) =>
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg && dlg.id !== "dlg-confirm") dlg.close();
      }),
    );

    document.addEventListener("change", (e) => {
      const el = e.target;
      if (el.matches('[data-action="toggle-todo"]'))
        toggleTodo(el.dataset.id, el.checked);
    });

    window.addEventListener("hashchange", () => {
      userNavigated = true;
      route();
    });

    // Jurnal
    $("#journal-form").addEventListener("submit", submitJournal);
    updateJournalCounter = bindCounter(
      $("#j-content"),
      $("#j-content-count"),
      LIMITS.content,
    );
    $("#jv-edit").addEventListener("click", () => {
      const id = state.ui.viewingJournal;
      $("#dlg-journal-view").close();
      openJournalForm(id);
    });
    $("#jv-delete").addEventListener("click", () =>
      deleteJournal(state.ui.viewingJournal),
    );
    const f = state.ui.journalFilters;
    $("#j-search").addEventListener(
      "input",
      debounce((e) => {
        f.q = e.target.value;
        renderJournal();
      }, 150),
    );
    $("#j-filter-mood").addEventListener("change", (e) => {
      f.mood = e.target.value;
      renderJournal();
    });
    $("#j-from").addEventListener("change", (e) => {
      f.from = e.target.value;
      renderJournal();
    });
    $("#j-to").addEventListener("change", (e) => {
      f.to = e.target.value;
      renderJournal();
    });
    $("#j-sort").addEventListener("change", (e) => {
      f.sort = e.target.value;
      renderJournal();
    });
    ["j-title", "j-content", "j-tags"].forEach((id) =>
      $("#" + id).addEventListener("input", () => setError(id, "")),
    );

    // Mood
    $("#mood-form").addEventListener("submit", submitMood);
    bindCounter($("#mood-note"), $("#mood-count"), LIMITS.note);
    $("#mood-picker").addEventListener("change", () => {
      $("#mood-err").hidden = true;
    });

    // Todo
    $("#todo-form").addEventListener("submit", submitTodo);
    $("#t-title").addEventListener("input", () => setError("t-title", ""));
    $("#todo-edit-form").addEventListener("submit", submitTodoEdit);
    $("#te-title").addEventListener("input", () => setError("te-title", ""));

    // Pengaturan
    const saveName = debounce(() => {
      save("settings");
      flashSaved();
    }, 350);
    $("#set-name").addEventListener("input", (e) => {
      state.settings.name = e.target.value.trim().slice(0, LIMITS.name);
      renderChrome();
      saveName();
    });
    $$('input[name="set-theme"]').forEach((r) =>
      r.addEventListener("change", () => {
        state.settings.theme = r.value;
        commitSettings();
      }),
    );
    $$('input[name="set-density"]').forEach((r) =>
      r.addEventListener("change", () => {
        state.settings.density = r.value;
        commitSettings();
      }),
    );
    $$('input[name="set-font"]').forEach((r) =>
      r.addEventListener("change", () => {
        state.settings.fontSize = r.value;
        commitSettings();
      }),
    );
    $("#set-quote").addEventListener("change", (e) => {
      state.settings.showQuote = e.target.checked;
      commitSettings();
    });
    $("#set-motion").addEventListener("change", (e) => {
      state.settings.reduceMotion = e.target.checked;
      commitSettings();
    });
    $("#import-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (file) importFile(file);
    });

    // Notifikasi
    $("#nt-enabled").addEventListener("change", async (e) => {
      if (e.target.checked) {
        const ok = await enableNotifications();
        if (!ok) {
          e.target.checked = false;
          renderNotifSettings();
          return;
        }
      } else {
        state.settings.notifications.enabled = false;
      }
      commitNotif();
    });
    REMINDER_IDS.forEach((id) => {
      $(`#nt-${id}-on`).addEventListener("change", (e) => {
        state.settings.notifications[id].on = e.target.checked;
        commitNotif();
      });
      $(`#nt-${id}-time`).addEventListener("change", (e) => {
        const v = e.target.value;
        if (!TIME_RE.test(v)) {
          e.target.value = state.settings.notifications[id].time;
          toast("Format waktu tidak valid.", "error");
          return;
        }
        const n = state.settings.notifications;
        n[id].time = v;
        // waktu yang sudah lewat hari ini tidak memicu pengingat langsung; waktu yang akan datang boleh
        const [h, m] = v.split(":").map(Number);
        const d = new Date();
        n.last[id] =
          d.getHours() * 60 + d.getMinutes() >= h * 60 + m ? todayKey() : "";
        commitNotif();
      });
    });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        const hash =
          e.data &&
          e.data.type === "navigate" &&
          typeof e.data.hash === "string"
            ? e.data.hash
            : "";
        if (ROUTES[hash.slice(1)]) {
          userNavigated = true;
          location.hash = hash;
        }
      });
    }

    // Grafik responsif
    let lastW = window.innerWidth;
    window.addEventListener(
      "resize",
      debounce(() => {
        if (window.innerWidth === lastW) return;
        lastW = window.innerWidth;
        if (state.ui.route === "mood") renderTrend();
        if (state.ui.route === "stats") renderWeek();
      }, 200),
    );

    // Perbarui sapaan & tanggal saat tab kembali aktif
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      checkReminders();
      if (state.ui.route === "dashboard") renderDashboard();
    });
  }

  /* ---------------------------------------------------------
     Inisialisasi
     --------------------------------------------------------- */
  function init() {
    store.init();
    if (!store.available) updateBanner(true);
    loadAll();
    renderMoodPickers();
    bindEvents();
    applySettings();
    renderChrome();
    route();
    hideBusy();
    startScheduler();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
