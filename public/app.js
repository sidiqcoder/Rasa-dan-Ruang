/** Antarmuka native: DOM, Fetch API, Intl, dan <dialog>, tanpa framework. */
const $ = (selector) => document.querySelector(selector);
const money = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
const statuses = {
  confirmed: "Terkonfirmasi",
  seated: "Tamu hadir",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};
const state = {
  customers: [],
  tables: [],
  menu: [],
  reservations: [],
  filter: "all",
  report: null,
  pendingAction: null,
  revision: 0,
  available: false,
};
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const code = (id) => `RSV-${String(id).padStart(4, "0")}`;
const badge = (status) =>
  `<span class="badge ${escapeHtml(status)}">${statuses[status]}</span>`;

function jakartaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}
function today() {
  const parts = jakartaParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function dateLabel(date) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${date}T00:00:00+07:00`));
}
function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
function empty(message, hint, columns) {
  return `<tr><td colspan="${columns}" class="empty-state"><strong>${escapeHtml(message)}</strong>${escapeHtml(hint)}</td></tr>`;
}
function stat(label, value, caption, icon, extra = "") {
  return `<div class="stat ${extra}"><p class="stat-label">${label}</p><span class="stat-icon" aria-hidden="true">${icon}</span><p class="stat-value">${value}</p><p class="stat-caption">${caption}</p></div>`;
}

class ApiClient {
  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(`/api${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
      });
    } catch {
      throw new Error(
        "Server tidak terjangkau. Periksa koneksi lalu muat ulang halaman.",
      );
    }
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
    return data;
  }
}
const api = new ApiClient();

let toastTimer;
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.toggle("error", error);
  $("#toast").hidden = false;
  toastTimer = setTimeout(
    () => {
      $("#toast").hidden = true;
    },
    error ? 8000 : 4000,
  );
}
function formError(selector, message) {
  $(selector).textContent = message;
  $(selector).hidden = !message;
}
function setBusy(form, busy) {
  form.querySelector('button[type="submit"]').disabled = busy;
}

function renderReservations() {
  const rows = state.reservations;
  const active = rows.filter((row) => row.status !== "cancelled");
  $("#reservation-stats").innerHTML =
    stat("Total reservasi", rows.length, "Pada tanggal yang dipilih", "▦") +
    stat(
      "Tamu yang diharapkan",
      active.reduce((sum, row) => sum + row.guests, 0),
      "Tidak termasuk pembatalan",
      "♧",
    ) +
    stat(
      "Tamu hadir",
      rows.filter((row) => row.status === "seated").length,
      "Reservasi sedang dilayani",
      "◷",
    ) +
    stat(
      "Pendapatan selesai",
      money(
        rows
          .filter((row) => row.status === "completed")
          .reduce((sum, row) => sum + row.total, 0),
      ),
      "Dari reservasi berstatus selesai",
      "↗",
      "revenue",
    );
  $("#nav-count").textContent = rows.filter((row) =>
    ["confirmed", "seated"].includes(row.status),
  ).length;
  $("#list-count").textContent = rows.length;
  $("#list-date-caption").textContent = dateLabel($("#reservation-date").value);
  const search = $("#reservation-search").value.toLowerCase().trim();
  const filtered = rows.filter(
    (row) =>
      (state.filter === "all" || row.status === state.filter) &&
      `${row.customer_name} ${row.customer_phone} ${code(row.id)}`
        .toLowerCase()
        .includes(search),
  );
  $("#reservation-result-count").textContent =
    `${filtered.length} dari ${rows.length} reservasi`;
  $("#reservation-rows").innerHTML = filtered.length
    ? filtered
        .map((row) => {
          const actions = [
            `<button class="text-button" data-action="detail" data-id="${row.id}">Detail</button>`,
          ];
          if (row.status === "confirmed") {
            actions.push(
              `<button class="text-button" data-action="edit" data-id="${row.id}">Ubah</button>`,
            );
            actions.push(
              `<button class="text-button" data-action="seated" data-id="${row.id}">Hadir</button>`,
            );
          }
          if (row.status === "seated")
            actions.push(
              `<button class="text-button" data-action="completed" data-id="${row.id}">Selesai</button>`,
            );
          if (["confirmed", "seated"].includes(row.status))
            actions.push(
              `<button class="text-button danger" data-action="cancelled" data-id="${row.id}">Batalkan</button>`,
            );
          return `<tr><td><div class="customer-cell"><span class="avatar">${escapeHtml(initials(row.customer_name))}</span><span><strong>${escapeHtml(row.customer_name)}</strong><small>${escapeHtml(row.customer_phone)} · ${code(row.id)}</small></span></div></td><td><strong>${escapeHtml(row.table_name)}</strong><small>${row.guests} tamu · ${escapeHtml(row.area)}</small></td><td><strong>${row.start_at.slice(11, 16)} – ${row.end_at.slice(11, 16)}</strong><small>${row.start_at.slice(0, 10) === row.end_at.slice(0, 10) ? "Waktu Indonesia Barat" : `Hingga ${row.end_at.slice(0, 10)}`}</small></td><td><strong>${money(row.total)}</strong><small>${row.items.reduce((sum, item) => sum + item.quantity, 0)} porsi / minuman</small></td><td>${badge(row.status)}</td><td><div class="row-actions">${actions.join("")}</div></td></tr>`;
        })
        .join("")
    : empty(
        search || state.filter !== "all"
          ? "Tidak ada hasil yang cocok"
          : "Meja siap, tamu berikutnya?",
        "Buat reservasi baru atau pilih tanggal dan filter lain.",
        6,
      );
  renderTables();
}

function renderTables() {
  const point = `${$("#reservation-date").value} ${$("#table-time").value || "18:00"}:00`;
  $("#table-grid").innerHTML = state.tables
    .map((table) => {
      const reservation = (state.schedule || state.reservations).find(
        (row) =>
          row.table_id === table.id &&
          ["confirmed", "seated"].includes(row.status) &&
          row.start_at <= point &&
          row.end_at > point,
      );
      const status =
        reservation?.status === "seated"
          ? "seated"
          : reservation
            ? "reserved"
            : "available";
      const label =
        status === "available"
          ? "Tersedia"
          : status === "reserved"
            ? "Dipesan"
            : "Tamu hadir";
      return `<div class="table-card ${status}" role="group" aria-label="${escapeHtml(`${table.name}: ${label}`)}"><i class="table-status-dot" aria-hidden="true"></i><div class="table-drawing" aria-hidden="true"></div><strong>${escapeHtml(table.name)}</strong><p>${table.capacity} kursi · ${escapeHtml(table.area)}</p></div>`;
    })
    .join("");
}

function renderCustomers() {
  $("#customer-count").textContent = state.customers.length;
  const search = $("#customer-search").value.toLowerCase().trim();
  const rows = state.customers.filter((customer) =>
    `${customer.name} ${customer.phone} ${customer.email || ""}`
      .toLowerCase()
      .includes(search),
  );
  $("#customer-rows").innerHTML = rows.length
    ? rows
        .map(
          (customer) =>
            `<tr><td><div class="customer-cell"><span class="avatar">${escapeHtml(initials(customer.name))}</span><strong>${escapeHtml(customer.name)}</strong></div></td><td>${escapeHtml(customer.phone)}</td><td>${escapeHtml(customer.email || "—")}</td><td>${customer.reservation_count} reservasi</td><td><div class="row-actions"><button class="text-button" data-action="edit-customer" data-id="${customer.id}">Ubah</button><button class="text-button danger" data-action="delete-customer" data-id="${customer.id}">Hapus</button></div></td></tr>`,
        )
        .join("")
    : empty(
        "Belum ada pelanggan yang cocok",
        "Tambahkan pelanggan untuk mulai membuat reservasi.",
        5,
      );
}

function renderMenu() {
  $("#menu-grid").innerHTML = state.menu
    .map(
      (item) =>
        `<article class="menu-card"><div class="menu-card-icon" aria-hidden="true">${item.category === "Minuman" ? "♨" : item.category === "Camilan" ? "◈" : "◒"}</div><h2>${escapeHtml(item.name)}</h2><span class="menu-category">${escapeHtml(item.category)}</span><p class="menu-price">${money(item.price)}</p></article>`,
    )
    .join("");
}

async function loadCustomers(selectedId) {
  state.customers = await api.request("/customers");
  renderCustomers();
  const previous = selectedId || $("#booking-customer").value;
  $("#booking-customer").innerHTML =
    '<option value="">Pilih pelanggan…</option>' +
    state.customers
      .map(
        (customer) =>
          `<option value="${customer.id}">${escapeHtml(customer.name)} · ${escapeHtml(customer.phone)}</option>`,
      )
      .join("");
  $("#booking-customer").value = previous;
}

async function loadReservations() {
  const revision = ++state.revision;
  const date = $("#reservation-date").value;
  $("#reservation-rows").innerHTML = empty(
    "Memuat reservasi…",
    "Mengambil data dari database.",
    6,
  );
  // Juga ambil sehari sebelumnya agar reservasi lintas tengah malam terdeteksi di kondisi meja.
  const previous = new Date(`${date}T00:00:00+07:00`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const parts = jakartaParts(previous);
  const from = `${parts.year}-${parts.month}-${parts.day}`;
  const rows = await api.request(`/reservations?from=${from}&to=${date}`);
  if (revision !== state.revision) return;
  state.schedule = rows;
  state.reservations = rows.filter((row) => row.start_at.slice(0, 10) === date);
  renderReservations();
  renderTables();
}

async function refresh() {
  await Promise.all([loadReservations(), loadCustomers()]);
  if (location.hash === "#reports") await loadReport();
}

function openCustomer(customer = null) {
  const form = $("#customer-form");
  form.reset();
  form.elements.id.value = customer?.id || "";
  form.elements.name.value = customer?.name || "";
  form.elements.phone.value = customer?.phone || "";
  form.elements.email.value = customer?.email || "";
  $("#customer-dialog-title").textContent = customer
    ? "Ubah pelanggan"
    : "Tambah pelanggan";
  formError("#customer-error", "");
  $("#customer-dialog").showModal();
}

function renderTableOptions() {
  const form = $("#reservation-form");
  const current = form.elements.tableId.value;
  const guests = Number(form.elements.guests.value);
  const start = `${form.elements.date.value} ${form.elements.time.value}:00`;
  const utcStart = new Date(start.replace(" ", "T") + "+07:00");
  if (!Number.isFinite(utcStart.getTime())) return;
  const endDate = new Date(
    utcStart.getTime() + Number(form.elements.duration.value) * 60000,
  );
  const endParts = jakartaParts(endDate);
  const end = `${endParts.year}-${endParts.month}-${endParts.day} ${endParts.hour}:${endParts.minute}:00`;
  const schedule = form.schedule || [];
  form.elements.tableId.innerHTML =
    '<option value="">Pilih meja…</option>' +
    state.tables
      .map((table) => {
        const conflict = schedule.some(
          (row) =>
            row.table_id === table.id &&
            row.id !== Number(form.elements.id.value) &&
            ["confirmed", "seated"].includes(row.status) &&
            row.start_at < end &&
            row.end_at > start,
        );
        const tooSmall = table.capacity < guests;
        return `<option value="${table.id}" ${conflict || tooSmall ? "disabled" : ""}>${escapeHtml(table.name)} · ${table.capacity} kursi · ${escapeHtml(table.area)}${conflict ? " — Jadwal terisi" : tooSmall ? " — Kapasitas kurang" : ""}</option>`;
      })
      .join("");
  const match = [...form.elements.tableId.options].find(
    (option) => option.value === current && !option.disabled,
  );
  form.elements.tableId.value = match ? current : "";
}

async function loadBookingSchedule() {
  const form = $("#reservation-form");
  const date = form.elements.date.value;
  if (!date) return;
  const before = new Date(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(before.getTime())) return;
  before.setUTCDate(before.getUTCDate() - 1);
  const parts = jakartaParts(before);
  const after = new Date(`${date}T00:00:00+07:00`);
  after.setUTCDate(after.getUTCDate() + 1);
  const end = jakartaParts(after);
  const schedule = await api.request(
    `/reservations?from=${parts.year}-${parts.month}-${parts.day}&to=${end.year}-${end.month}-${end.day}`,
  );
  if (form.elements.date.value !== date) return;
  form.schedule = schedule;
  renderTableOptions();
}

async function openReservation(reservation = null) {
  const form = $("#reservation-form");
  form.reset();
  form.schedule = [];
  form.elements.id.value = reservation?.id || "";
  $("#reservation-dialog-title").textContent = reservation
    ? `Ubah ${code(reservation.id)}`
    : "Buat reservasi";
  form.elements.customerId.value = reservation?.customer_id || "";
  const next = jakartaParts(
    new Date(
      Math.ceil((Date.now() + 30 * 60000) / (30 * 60000)) * (30 * 60000),
    ),
  );
  form.elements.date.value =
    reservation?.start_at.slice(0, 10) ||
    ($("#reservation-date").value > today()
      ? $("#reservation-date").value
      : `${next.year}-${next.month}-${next.day}`);
  form.elements.time.value =
    reservation?.start_at.slice(11, 16) ||
    (form.elements.date.value === today()
      ? `${next.hour}:${next.minute}`
      : "18:00");
  if (reservation) {
    form.elements.duration.value =
      (new Date(reservation.end_at.replace(" ", "T") + "+07:00") -
        new Date(reservation.start_at.replace(" ", "T") + "+07:00")) /
      60000;
    form.elements.guests.value = reservation.guests;
    form.elements.notes.value = reservation.notes;
  }
  form.elements.date.min = today();
  $("#booking-items").innerHTML = state.menu
    .map((item) => {
      const quantity =
        reservation?.items.find((row) => row.menu_item_id === item.id)
          ?.quantity || 0;
      return `<div class="booking-item"><label for="quantity-${item.id}">${escapeHtml(item.name)}<small>${money(item.price)}</small></label><input id="quantity-${item.id}" data-menu-id="${item.id}" type="number" min="0" max="99" value="${quantity}" aria-label="Jumlah ${escapeHtml(item.name)}"></div>`;
    })
    .join("");
  formError("#booking-error", "");
  renderTableOptions();
  form.elements.tableId.value = reservation?.table_id || "";
  updateTotal();
  $("#reservation-dialog").showModal();
  try {
    await loadBookingSchedule();
    if (reservation) form.elements.tableId.value = reservation.table_id;
  } catch (error) {
    formError("#booking-error", error.message);
  }
}

function selectedItems() {
  return [...$("#booking-items").querySelectorAll("input")]
    .filter((input) => Number(input.value) > 0)
    .map((input) => ({
      menuItemId: Number(input.dataset.menuId),
      quantity: Number(input.value),
    }));
}
function updateTotal() {
  const total = selectedItems().reduce(
    (sum, item) =>
      sum +
      state.menu.find((menu) => menu.id === item.menuItemId).price *
        item.quantity,
    0,
  );
  $("#booking-total").textContent = money(total);
}

function showDetail(reservation) {
  $("#detail-title").textContent = code(reservation.id);
  $("#detail-content").innerHTML =
    `<dl class="detail-grid"><div><dt>Pelanggan</dt><dd>${escapeHtml(reservation.customer_name)}</dd></div><div><dt>Telepon</dt><dd>${escapeHtml(reservation.customer_phone)}</dd></div><div><dt>Meja</dt><dd>${escapeHtml(reservation.table_name)} · ${reservation.guests} tamu</dd></div><div><dt>Status</dt><dd>${badge(reservation.status)}</dd></div><div><dt>Mulai (WIB)</dt><dd>${reservation.start_at.slice(0, 16)}</dd></div><div><dt>Selesai (WIB)</dt><dd>${reservation.end_at.slice(0, 16)}</dd></div></dl><h2>Pesanan</h2><table class="detail-items"><tbody>${reservation.items.length ? reservation.items.map((item) => `<tr><td>${escapeHtml(item.name)}<small>${item.quantity} × ${money(item.unit_price)}</small></td><td class="align-right">${money(item.quantity * item.unit_price)}</td></tr>`).join("") : "<tr><td>Belum ada menu dipesan.</td></tr>"}</tbody></table><p class="detail-note">${escapeHtml(reservation.notes || "Tidak ada catatan tambahan.")}</p><div class="order-total"><span>Total</span><strong>${money(reservation.total)}</strong></div>`;
  $("#detail-dialog").showModal();
}

function confirmAction(message, action) {
  state.pendingAction = action;
  $("#confirm-message").textContent = message;
  formError("#confirm-error", "");
  $("#confirm-dialog").showModal();
}

async function loadReport() {
  const from = $("#report-from").value;
  const to = $("#report-to").value;
  const report = await api.request(`/reports?from=${from}&to=${to}`);
  state.report = report;
  $("#report-period").textContent = `${dateLabel(from)} — ${dateLabel(to)}`;
  $("#report-stats").innerHTML =
    stat(
      "Total reservasi",
      report.summary.reservations,
      `${report.summary.cancelled} reservasi dibatalkan`,
      "▦",
    ) +
    stat(
      "Jumlah tamu",
      report.summary.guests,
      "Tidak termasuk pembatalan",
      "♧",
    ) +
    stat(
      "Reservasi selesai",
      report.summary.completed,
      "Pelayanan telah selesai",
      "✓",
    ) +
    stat(
      "Pendapatan",
      money(report.summary.revenue),
      "Dari reservasi berstatus selesai",
      "↗",
      "revenue",
    );
  $("#report-rows").innerHTML = report.daily.length
    ? report.daily
        .map(
          (row) =>
            `<tr><td>${dateLabel(row.date)}</td><td>${row.reservations}</td><td>${row.completed}</td><td>${row.cancelled}</td><td>${row.guests}</td><td class="align-right"><strong>${money(row.revenue)}</strong></td></tr>`,
        )
        .join("")
    : empty(
        "Belum ada data pada periode ini",
        "Pilih periode lain atau tambahkan reservasi.",
        6,
      );
}

function exportReport() {
  if (!state.report) return toast("Tampilkan laporan terlebih dahulu.", true);
  const report = state.report;
  const lines = [
    [
      "Tanggal",
      "Reservasi",
      "Selesai",
      "Dibatalkan",
      "Tamu",
      "Pendapatan (IDR)",
    ],
    ...report.daily.map((row) => [
      row.date,
      row.reservations,
      row.completed,
      row.cancelled,
      row.guests,
      row.revenue,
    ]),
    [
      "TOTAL",
      report.summary.reservations,
      report.summary.completed,
      report.summary.cancelled,
      report.summary.guests,
      report.summary.revenue,
    ],
  ];
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + lines.map((line) => line.join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `laporan-${report.from}-${report.to}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function navigate() {
  const page = ["reservations", "customers", "menu", "reports"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "reservations";
  document.querySelectorAll(".page").forEach((element) => {
    element.hidden = element.id !== `page-${page}`;
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.page === page;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  $("#breadcrumb").textContent = {
    reservations: "Reservasi",
    customers: "Pelanggan",
    menu: "Daftar menu",
    reports: "Laporan",
  }[page];
  if (page === "reports" && state.available)
    loadReport().catch((error) => toast(error.message, true));
}

$("#new-reservation").addEventListener("click", () => openReservation());
$("#new-customer").addEventListener("click", () => openCustomer());
$("#quick-customer").addEventListener("click", () => openCustomer());
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      $(`#${button.dataset.close}`).close(),
    ),
  );
document.querySelectorAll(".filter-tab").forEach((button) =>
  button.addEventListener("click", () => {
    state.filter = button.dataset.status;
    document
      .querySelectorAll(".filter-tab")
      .forEach((tab) => tab.classList.toggle("active", tab === button));
    renderReservations();
  }),
);
$("#reservation-date").addEventListener("change", () => {
  if ($("#reservation-date").value)
    loadReservations().catch((error) => toast(error.message, true));
});
$("#table-time").addEventListener("change", renderTables);
$("#reservation-search").addEventListener("input", renderReservations);
$("#customer-search").addEventListener("input", renderCustomers);
$("#booking-items").addEventListener("input", updateTotal);
for (const name of ["time", "duration", "guests"])
  $("#reservation-form").elements[name].addEventListener(
    "input",
    renderTableOptions,
  );
$("#booking-date").addEventListener("change", () =>
  loadBookingSchedule().catch((error) =>
    formError("#booking-error", error.message),
  ),
);
window.addEventListener("hashchange", navigate);

$("#customer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const data = {
    name: form.elements.name.value,
    phone: form.elements.phone.value,
    email: form.elements.email.value,
  };
  setBusy(form, true);
  formError("#customer-error", "");
  try {
    const customer = await api.request(`/customers${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    await loadCustomers(customer.id);
    $("#customer-dialog").close();
    await loadReservations();
    toast(
      id ? "Data pelanggan diperbarui." : "Pelanggan berhasil ditambahkan.",
    );
  } catch (error) {
    formError("#customer-error", error.message);
  } finally {
    setBusy(form, false);
  }
});

$("#reservation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const data = {
    customerId: Number(form.elements.customerId.value),
    tableId: Number(form.elements.tableId.value),
    guests: Number(form.elements.guests.value),
    startAt: `${form.elements.date.value}T${form.elements.time.value}`,
    duration: Number(form.elements.duration.value),
    notes: form.elements.notes.value,
    items: selectedItems(),
  };
  setBusy(form, true);
  formError("#booking-error", "");
  try {
    await api.request(`/reservations${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    $("#reservation-dialog").close();
    $("#reservation-date").value = form.elements.date.value;
    await refresh();
    toast(id ? "Reservasi diperbarui." : "Reservasi berhasil dibuat.");
  } catch (error) {
    formError("#booking-error", error.message);
  } finally {
    setBusy(form, false);
  }
});

$("#reservation-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const reservation = state.reservations.find(
    (row) => row.id === Number(button.dataset.id),
  );
  if (!reservation) return;
  if (button.dataset.action === "detail") return showDetail(reservation);
  if (button.dataset.action === "edit") return openReservation(reservation);
  const nextStatus = button.dataset.action;
  confirmAction(
    `Ubah ${code(reservation.id)} atas nama ${reservation.customer_name} menjadi “${statuses[nextStatus]}”?${nextStatus === "cancelled" ? " Riwayat reservasi tetap disimpan." : ""}`,
    async () => {
      await api.request(`/reservations/${reservation.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await refresh();
      toast("Status reservasi diperbarui.");
    },
  );
});

$("#customer-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const customer = state.customers.find(
    (row) => row.id === Number(button.dataset.id),
  );
  if (button.dataset.action === "edit-customer") return openCustomer(customer);
  confirmAction(
    `Hapus pelanggan ${customer.name}? Pelanggan yang memiliki riwayat reservasi tidak dapat dihapus.`,
    async () => {
      await api.request(`/customers/${customer.id}`, { method: "DELETE" });
      await loadCustomers();
      toast("Pelanggan dihapus.");
    },
  );
});

$("#confirm-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    await state.pendingAction();
    $("#confirm-dialog").close();
    state.pendingAction = null;
  } catch (error) {
    formError("#confirm-error", error.message);
  } finally {
    setBusy(form, false);
  }
});

$("#report-filter").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  try {
    await loadReport();
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(form, false);
  }
});
$("#export-report").addEventListener("click", exportReport);
$("#print-report").addEventListener("click", () => {
  if (!state.report) return toast("Tampilkan laporan terlebih dahulu.", true);
  window.print();
});

async function init() {
  const date = today();
  $("#reservation-date").value = date;
  $("#report-from").value = `${date.slice(0, 7)}-01`;
  $("#report-to").value = date;
  const parts = jakartaParts();
  $("#table-time").value = `${parts.hour}:${parts.minute}`;
  navigate();
  try {
    await api.request("/health");
    [state.tables, state.menu] = await Promise.all([
      api.request("/tables"),
      api.request("/menu"),
    ]);
    await refresh();
    renderMenu();
    state.available = true;
    $("#connection").innerHTML = "<i></i> Database terhubung";
    $("#connection").classList.add("online");
    navigate();
  } catch (error) {
    $("#connection").innerHTML = "<i></i> Koneksi bermasalah";
    $("#connection").classList.add("offline");
    $("#reservation-rows").innerHTML = empty(
      "Data belum dapat dimuat",
      `${error.message} Muat ulang halaman setelah server siap.`,
      6,
    );
    $("#new-reservation").disabled = true;
    $("#new-customer").disabled = true;
    toast(error.message, true);
  }
}
init();
