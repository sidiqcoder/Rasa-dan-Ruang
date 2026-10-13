"""Gambar laporan: diagram ringkas dan ringkasan hasil dari bukti aktual."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json
import re
import textwrap

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/laporan-waterfall/gambar"
OUT.mkdir(parents=True, exist_ok=True)
GREEN, GOLD, INK = "#244A3B", "#B18B50", "#29352E"
FONT = "C:/Windows/Fonts/arial.ttf"
BOLD = "C:/Windows/Fonts/arialbd.ttf"


class Figure:
    def __init__(self, width, height, title):
        self.image = Image.new("RGB", (width, height), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.text(title, (width / 2, 35), 28, bold=True)

    def text(self, value, center, size=23, bold=False, fill=INK):
        font = ImageFont.truetype(BOLD if bold else FONT, size)
        self.draw.multiline_text(center, value, font=font, fill=fill, anchor="mm", align="center", spacing=7)

    def box(self, value, x, y, w, h, fill="#F7F7F2", size=23):
        self.draw.rounded_rectangle((x, y, x + w, y + h), radius=12, fill=fill, outline=GREEN, width=3)
        self.text(value, (x + w / 2, y + h / 2), size)

    def arrow(self, points, label=""):
        self.draw.line(points, fill=GREEN, width=3)
        x, y = points[-1]; px, py = points[-2]
        dx, dy = x - px, y - py; length = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / length, dy / length
        self.draw.polygon([(x, y), (x - 12 * ux - 6 * uy, y - 12 * uy + 6 * ux), (x - 12 * ux + 6 * uy, y - 12 * uy - 6 * ux)], fill=GREEN)
        if label:
            self.text(label, ((points[0][0] + points[1][0]) / 2 + 24, (points[0][1] + points[1][1]) / 2), 20, fill=GREEN)

    def decision(self, label, x, y, w=190, h=100):
        self.draw.polygon([(x + w / 2, y), (x + w, y + h / 2), (x + w / 2, y + h), (x, y + h / 2)], fill="#F4EBD8", outline=GOLD, width=3)
        self.text(label, (x + w / 2, y + h / 2), 23, bold=True)

    def start(self, x, y):
        self.draw.ellipse((x - 12, y - 12, x + 12, y + 12), fill=GREEN)

    def end(self, x, y):
        self.draw.ellipse((x - 17, y - 17, x + 17, y + 17), fill="white", outline=GREEN, width=3)
        self.draw.ellipse((x - 11, y - 11, x + 11, y + 11), fill=GREEN)

    def save(self, filename):
        self.image.save(OUT / filename)


f = Figure(900, 850, "Tahapan Waterfall dan artefak proyek")
stages = [("1. Analisis kebutuhan", "Spesifikasi, batas fitur, aturan bisnis"), ("2. Perancangan", "Use case, activity, ERD, arsitektur"), ("3. Implementasi", "UI, API, validasi, class, transaksi"), ("4. Pengujian", "Unit/service, integrasi, HTTP, evaluasi"), ("5. Penerapan dan pemeliharaan", "Instalasi, panduan, debugging, regresi")]
for i, (title, value) in enumerate(stages):
    x, y = 60 + i * 70, 100 + i * 140
    f.box(title + "\n" + value, x, y, 520, 95, size=22)
    if i < 4: f.arrow([(x + 260, y + 95), (x + 260, y + 120), (x + 330, y + 120), (x + 330, y + 140)])
f.text("Temuan uji → perbaikan tahap terkait → verifikasi/regresi ulang", (450, 820), 21)
f.save("waterfall.png")

f = Figure(1000, 670, "Arsitektur dan hubungan kode")
f.box("Browser\nHTML/CSS/JS", 20, 110, 200, 110)
f.box("Express\nsrc/app.js", 280, 110, 200, 110)
f.box("RestaurantService\naturan bisnis", 550, 110, 280, 110)
f.arrow([(220, 165), (280, 165)], "HTTP")
f.arrow([(480, 165), (550, 165)])
f.box("validation.js\ninput/batas", 500, 320, 210, 100)
f.box("Reservation\nstatus/total", 750, 320, 220, 100)
f.arrow([(640, 220), (640, 285), (605, 285), (605, 320)])
f.arrow([(740, 220), (740, 280), (860, 280), (860, 320)])
f.box("RestaurantRepository\nCRUD, laporan, transaksi", 30, 490, 360, 110)
f.box("MySQL / MariaDB\n5 tabel relasional", 530, 490, 350, 110)
f.arrow([(380, 220), (380, 460), (210, 460), (210, 490)])
f.arrow([(550, 210), (510, 210), (510, 440), (310, 440), (310, 490)])
f.arrow([(390, 545), (530, 545)], "SQL")
f.text("Service menjalankan SQL reservasi pada koneksi callback transaksi.\nRoute baca daftar/laporan dapat langsung memakai repository.", (500, 635), 21)
f.save("arsitektur.png")

f = Figure(1000, 630, "Class domain dan exporter")
f.box("Reservation\n#status; static #transitions\n+status getter\n+changeStatus(nextStatus)\n+calculateTotal(items) static", 20, 90, 410, 230, size=23)
f.box("ReportExporter\n#contentType; #extension\n+export(report)\n+serialize(report)", 510, 90, 450, 190, size=23)
f.box("CsvReportExporter\nserialize → CSV", 450, 430, 245, 110, size=21)
f.box("JsonReportExporter\nserialize → JSON", 730, 430, 245, 110, size=21)
f.arrow([(572, 430), (572, 350), (735, 350), (735, 280)])
f.arrow([(852, 430), (852, 350), (735, 350), (735, 280)])
f.text("extends / overriding", (745, 380), 22)
f.box("AppError extends Error\nmessage, status", 20, 430, 390, 110)
f.text("Diagram ringkas; class lengkap tersedia dalam source dan SPESIFIKASI.", (500, 595), 21)
f.save("class.png")

f = Figure(1000, 680, "Struktur direktori proyek")
tree = "rasa-ruang/\n├─ public/        HTML, CSS, app.js browser\n├─ src/           server, database, app API, validasi\n│  ├─ models/     Reservation\n│  ├─ services/   RestaurantService\n│  ├─ repositories/ RestaurantRepository\n│  └─ reports/    ReportExporter CSV/JSON\n├─ database/      schema.sql\n├─ tests/         unit, service, integrasi\n├─ scripts/       setup, seed, pemeriksaan, dokumen\n├─ docs/          spesifikasi, bukti, diagram\n├─ .vscode/       debugger\n├─ rest-client.http\n└─ package.json + package-lock.json"
font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 25)
f.draw.multiline_text((45, 95), tree, font=font, fill=INK, spacing=13)
f.save("direktori.png")

# Activity menu ringkas untuk ukuran cetak; XML draw.io menyediakan alur detail.
for menu in ["Pelanggan", "Reservasi", "Laporan"]:
    f = Figure(1050, 1000, f"Activity menu {menu} — ringkasan")
    f.start(525, 95); f.arrow([(525, 107), (525, 140)])
    f.box(f"Operator membuka menu {menu}", 285, 140, 480, 75, size=25)
    f.arrow([(525, 215), (525, 260)])
    if menu == "Pelanggan":
        f.box("Muat kontak dan jumlah riwayat reservasi", 235, 260, 580, 75, size=24)
        f.arrow([(525, 335), (525, 380)])
        f.decision("Pilih aksi", 430, 380)
        labels = ["Lihat / cari", "Tambah / ubah", "Hapus"]
        actions = ["Filter daftar\ndi browser", "Isi form; validasi\nPOST / PUT pelanggan", "Konfirmasi\nDELETE pelanggan"]
        results = ["Tampilkan hasil\natau keadaan kosong", "UNIQUE telepon;\nsimpan jika valid", "FK menolak jika\nmemiliki riwayat"]
    elif menu == "Reservasi":
        f.box("Muat pelanggan, meja/menu dan jadwal", 235, 260, 580, 75, size=24)
        f.arrow([(525, 335), (525, 380)])
        f.decision("Pilih aksi", 430, 380)
        labels = ["Lihat / filter", "Tambah / ubah", "Ubah status"]
        actions = ["Filter tanggal/status\natau tampilkan detail", "Validasi; BEGIN/lock\ncek kapasitas/overlap", "Konfirmasi; BEGIN\nmodel changeStatus"]
        results = ["Tanggal: GET API\nDetail/filter: state UI", "Harga server; tulis\nreservasi dan items", "UPDATE hanya jika\ntransisi valid"]
    else:
        f.box("Pilih periode; GET reports; validasi tanggal", 235, 260, 580, 75, size=23)
        f.arrow([(525, 335), (525, 380)])
        f.decision("Hasil /\naksi", 430, 380)
        labels = ["Error", "Lihat rekap", "Ekspor/cetak"]
        actions = ["Tampilkan error\nPerbaiki / ulangi", "Query agregasi\nsimpan state.report", "Muat laporan dahulu\nCSV / cetak browser"]
        results = ["Input400; DBerror\npesan API yang aman", "Summary/tabel atau\nkeadaan data kosong", "Blob CSV / printer\natau Save as PDF"]
    for i in range(3):
        cx = 175 + i * 350
        if i == 1: f.arrow([(525, 480), (525, 550)], labels[i])
        else: f.arrow([(430 if i == 0 else 620, 430), (cx, 430), (cx, 550)], labels[i])
        f.box(actions[i], cx - 155, 550, 310, 110, size=23)
        f.arrow([(cx, 660), (cx, 705)])
        f.box(results[i], cx - 155, 705, 310, 100, size=23)
        f.arrow([(cx, 805), (cx, 865), (525, 865)]) if i != 1 else None
    f.arrow([(525, 805), (525, 930)]); f.end(525, 945)
    f.text("Gagal transaksi: rollback/release; tampilkan error dan ulangi aksi terkait." if menu == "Reservasi" else "Diagram lengkap, jalur error dan pengulangan tersedia pada native XML draw.io.", (525, 980), 20)
    f.save(f"activity-{menu.lower()}.png")

summary = json.loads((ROOT / "docs/laporan-waterfall/bukti/summary.json").read_text(encoding="utf-8"))
f = Figure(1000, 700, "Hasil verifikasi otomatis — 13 Oktober 2026")
f.box("SYNTAX\n24 berkas JS/MJS lulus", 30, 110, 450, 120, size=27)
f.box("UNIT / SERVICE\n69 pass; 0 fail", 520, 110, 450, 120, size=27)
f.box("INTEGRASI\n28 skenario pass\n29 hitungan runner termasuk induk", 30, 280, 450, 150, size=25)
f.box("REST REHEARSAL\n45/45 status sesuai\nSummary akhir benar", 520, 280, 450, 150, size=25)
f.text("Unit coverage: baris 83,92% | cabang 98,35% | fungsi 84,31%\nIntegrasi: baris 95,15% | cabang 84,43% | fungsi 93,67%\nCoverage hanya source yang dimuat, bukan seluruh aplikasi.", (500, 530), 24)
f.text("Bukti: unit.tap, integration.tap, http.json, syntax.txt\nWaktu eksekusiUTC: " + summary["executedAt"], (500, 635), 22)
f.save("hasil-uji.png")
print("Gambar laporan dibuat: Waterfall, arsitektur/class/direktori, 3 activity ringkas, hasil uji.")
