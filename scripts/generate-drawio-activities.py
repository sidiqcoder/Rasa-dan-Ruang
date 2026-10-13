"""Buat activity diagram native draw.io; seluruh node/konektor bisa diedit."""
from pathlib import Path
from xml.etree import ElementTree as ET
import html
import math

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "diagrams" / "drawio"
OUTPUT.mkdir(parents=True, exist_ok=True)
GREEN, GOLD, RED = "#244A3B", "#B18B50", "#A44739"


class Page:
    def __init__(self, name, width, height):
        self.name, self.width, self.height = name, width, height
        self.nodes, self.edges = {}, []

    def node(self, key, label, x, y, w=350, h=80, kind="action"):
        self.nodes[key] = dict(label=label, x=x, y=y, w=w, h=h, kind=kind)
        return key

    def edge(self, source, target, label="", exit="bottom", entry="top", points=()):
        self.edges.append(dict(source=source, target=target, label=label, exit=exit, entry=entry, points=points))

    def point(self, key, side):
        n = self.nodes[key]
        return {"top": (n["x"] + n["w"] / 2, n["y"]), "bottom": (n["x"] + n["w"] / 2, n["y"] + n["h"]), "left": (n["x"], n["y"] + n["h"] / 2), "right": (n["x"] + n["w"], n["y"] + n["h"] / 2)}[side]

    def model(self):
        model = ET.Element("mxGraphModel", dx="1600", dy="1000", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth=str(self.width), pageHeight=str(self.height), math="0", shadow="0")
        root = ET.SubElement(model, "root")
        ET.SubElement(root, "mxCell", id="0")
        ET.SubElement(root, "mxCell", id="1", parent="0")
        for key, n in self.nodes.items():
            base = "html=1;whiteSpace=wrap;fontFamily=Arial;fontSize=17;fontColor=#29352E;strokeWidth=2;spacing=10;"
            kind = n["kind"]
            if kind == "start":
                style = base + f"ellipse;aspect=fixed;fillColor={GREEN};strokeColor={GREEN};"
            elif kind == "end":
                style = base + f"shape=doubleEllipse;aspect=fixed;fillColor={GREEN};strokeColor={GREEN};"
            elif kind == "decision":
                style = base + f"rhombus;fillColor=#F4EBD8;strokeColor={GOLD};fontStyle=1;spacing=2;"
            elif kind == "error":
                style = base + f"rounded=1;arcSize=12;fillColor=#F9EEE9;strokeColor={RED};fontSize=15;"
            elif kind == "note":
                style = base + f"shape=note;size=18;fillColor=#FFF8E7;strokeColor={GOLD};align=left;verticalAlign=top;fontSize=15;"
            elif kind == "title":
                style = base + f"text;strokeColor=none;fillColor=none;fontColor={GREEN};fontSize=28;fontStyle=1;"
            elif kind == "band":
                style = base + f"rounded=1;fillColor={GREEN};strokeColor={GREEN};fontColor=#FFFFFF;fontStyle=1;"
            elif kind == "merge":
                style = base + f"rhombus;fillColor=#FFFFFF;strokeColor={GREEN};"
            else:
                style = base + f"rounded=1;arcSize=12;fillColor=#FFFFFF;strokeColor={GREEN};"
            value = "<br>".join(html.escape(line) for line in n["label"].split("\n"))
            cell = ET.SubElement(root, "mxCell", id=key, value=value, style=style, vertex="1", parent="1")
            ET.SubElement(cell, "mxGeometry", x=str(n["x"]), y=str(n["y"]), width=str(n["w"]), height=str(n["h"]), **{"as": "geometry"})
        coords = {"top": (0.5, 0), "bottom": (0.5, 1), "left": (0, 0.5), "right": (1, 0.5)}
        for i, e in enumerate(self.edges):
            ex, ey = coords[e["exit"]]
            ix, iy = coords[e["entry"]]
            style = f"edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;strokeColor={GREEN};strokeWidth=2;fontFamily=Arial;fontSize=15;labelBackgroundColor=#FFFFFF;exitX={ex};exitY={ey};exitDx=0;exitDy=0;entryX={ix};entryY={iy};entryDx=0;entryDy=0;"
            cell = ET.SubElement(root, "mxCell", id=f"edge-{i}", value=e["label"], style=style, edge="1", parent="1", source=e["source"], target=e["target"])
            geometry = ET.SubElement(cell, "mxGeometry", relative="1", **{"as": "geometry"})
            if e["points"]:
                points = ET.SubElement(geometry, "Array", **{"as": "points"})
                for x, y in e["points"]:
                    ET.SubElement(points, "mxPoint", x=str(x), y=str(y))
        return model

    def svg(self):
        """Pratinjau dari koordinat yang sama; .drawio adalah berkas editable utama."""
        parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}"><title>{html.escape(self.name)}</title><rect width="100%" height="100%" fill="#F7F7F2"/>']
        for e in self.edges:
            start, end = self.point(e["source"], e["exit"]), self.point(e["target"], e["entry"])
            points = [start, *e["points"], end]
            if not e["points"] and start[0] != end[0] and start[1] != end[1]:
                if e["exit"] in ("left", "right"):
                    points = [start, ((start[0] + end[0]) / 2, start[1]), ((start[0] + end[0]) / 2, end[1]), end]
                else:
                    points = [start, (start[0], (start[1] + end[1]) / 2), (end[0], (start[1] + end[1]) / 2), end]
            parts.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in points)}" fill="none" stroke="{GREEN}" stroke-width="2"/>')
            before = next((p for p in reversed(points[:-1]) if p != end), start)
            dx, dy = end[0] - before[0], end[1] - before[1]
            distance = math.hypot(dx, dy)
            if distance:
                ux, uy = dx / distance, dy / distance
                parts.append(f'<polygon points="{end[0]},{end[1]} {end[0]-12*ux-5*uy},{end[1]-12*uy+5*ux} {end[0]-12*ux+5*uy},{end[1]-12*uy-5*ux}" fill="{GREEN}"/>')
            if e["label"]:
                a, b = points[0], points[1]
                x, y = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 7
                label_width = len(e["label"]) * 8 + 12
                parts.append(f'<rect x="{x-label_width/2}" y="{y-16}" width="{label_width}" height="21" fill="#F7F7F2"/>')
                parts.append(f'<text x="{x}" y="{y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="{GREEN}">{html.escape(e["label"])}</text>')
        for n in self.nodes.values():
            x, y, w, h, kind = (n[k] for k in ("x", "y", "w", "h", "kind"))
            fill = GREEN if kind in ("start", "end", "band") else "#F4EBD8" if kind == "decision" else "#F9EEE9" if kind == "error" else "#FFF8E7" if kind == "note" else "#FFFFFF"
            stroke = GOLD if kind in ("decision", "note") else RED if kind == "error" else GREEN
            if kind == "title":
                pass
            elif kind in ("start", "end"):
                parts.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
                if kind == "end":
                    parts.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2-5}" ry="{h/2-5}" fill="none" stroke="#FFFFFF" stroke-width="3"/>')
            elif kind in ("decision", "merge"):
                parts.append(f'<polygon points="{x+w/2},{y} {x+w},{y+h/2} {x+w/2},{y+h} {x},{y+h/2}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
            else:
                parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
            size = 28 if kind == "title" else 15 if kind in ("note", "error") else 17
            color = "#FFFFFF" if kind == "band" else GREEN if kind == "title" else "#29352E"
            lines = n["label"].split("\n")
            step = size * 1.25
            for i, line in enumerate(lines):
                ty = y + (h - len(lines) * step) / 2 + step * (i + 0.80)
                parts.append(f'<text x="{x+w/2}" y="{ty}" text-anchor="middle" font-family="Arial,sans-serif" font-size="{size}" fill="{color}" font-weight="{700 if kind in ("band", "title", "decision") else 400}">{html.escape(line)}</text>')
        return "\n".join(parts) + "\n</svg>\n"


def reservations():
    p = Page("Reservasi", 2080, 2220)
    n, e = p.node, p.edge
    n("title", "ACTIVITY DIAGRAM — MENU RESERVASI", 380, 15, 1150, 55, "title")
    n("start", "", 840, 85, 30, 30, "start")
    n("open", "[Operator] Buka menu Reservasi", 680, 145)
    n("load", "[Sistem] Muat pelanggan, meja/menu dan jadwal\nGET /api/reservations: hari pilihan + sehari sebelumnya", 600, 260, 510, 90)
    n("choose", "Pilih\naktivitas", 770, 390, 170, 100, "decision")
    n("band-view", "LIHAT / FILTER / DETAIL", 75, 500, 500, 45, "band")
    n("band-save", "TAMBAH / UBAH RESERVASI", 665, 500, 590, 45, "band")
    n("band-status", "HADIR / SELESAI / BATALKAN", 1325, 500, 560, 45, "band")
    n("view", "[Operator] Pilih tanggal/status/pencarian\natau klik Detail reservasi", 120, 585, 400, 85)
    n("view-process", "[Sistem] Tanggal: muat ulang dari API\nStatus/pencarian: filter data di browser\nDetail: tampilkan dari state.reservations", 105, 760, 430, 110)
    n("view-note", "Tidak ada GET /reservations/:id khusus detail.\nDaftar menyertakan pelanggan, meja dan items.\nData hari sebelumnya membantu jadwal\nlintas tengah malam.\nJika fetch gagal, tampilkan pesan error.", 105, 1050, 430, 170, "note")
    n("form", "[Operator] Isi pelanggan, meja, waktu WIB,\ndurasi, tamu, catatan dan menu opsional\nUbah: gunakan data reservasi terpilih", 680, 575, 350, 110)
    n("validate", "[Sistem] POST / PUT /api/reservations\nValidasi payload di validation.js", 680, 725, 350, 80)
    n("valid", "Input\nvalid?", 775, 845, 160, 90, "decision")
    n("input-error", "HTTP 400\nTampilkan error\nPerbaiki input", 1090, 845, 160, 90, "error")
    n("begin", "[Sistem/DB] BEGIN; lock meja urut ID\nUbah: lock reservasi; harus confirmed", 680, 990, 350, 90)
    n("rules", "[Sistem] Cek pelanggan/meja dan kapasitas\nCek overlap confirmed / seated\nUbah: abaikan ID reservasi sendiri\nBaca harga setiap menu aktif dari DB", 665, 1120, 380, 120)
    n("rules-ok", "Aturan\nlolos?", 775, 1290, 160, 90, "decision")
    n("business-error", "ROLLBACK + release\nHTTP 400/404/409\nTampilkan error", 1080, 1290, 175, 100, "error")
    n("write", "[Sistem/DB] Hitung total harga server\nINSERT / UPDATE reservasi + detail\nUpdate mengganti detail lama; coba COMMIT", 665, 1430, 380, 110)
    n("write-ok", "Operasi /\ncommit berhasil?", 770, 1580, 170, 100, "decision")
    n("sql-error", "Error driver:\nROLLBACK + release\nTampilkan pesan API", 1080, 1580, 175, 100, "error")
    n("saved", "[Sistem] Commit berhasil; finally release\nHTTP 201 (create) / 200 (update)\nTutup dialog dan refresh daftar", 665, 1730, 380, 110)
    n("save-note", "Input: tamu 1–8, durasi 30–240 menit;\nwaktu harus mendatang; qty menu 1–99.\nMenu boleh kosong, harga/total klien diabaikan.\nException setelah BEGIN menuju rollback/release.", 90, 1420, 455, 145, "note")
    n("confirm", "[Operator] Pilih status dan buka\ndialog konfirmasi", 1350, 575, 320, 85)
    n("confirmed", "Lanjut\nkonfirmasi?", 1430, 710, 160, 90, "decision")
    n("cancel-action", "[Operator] Tutup dialog\nStatus tetap", 1710, 705, 175, 90)
    n("status-load", "[Sistem/DB] PATCH /reservations/:id/status\nBEGIN; lock meja + reservasi\nBuat objek Reservation", 1335, 855, 350, 110)
    n("status-rule", "[Model] changeStatus(nextStatus)\nconfirmed → seated → completed\nconfirmed / seated → cancelled", 1335, 1015, 350, 110)
    n("status-ok", "Data / transisi\nvalid?", 1430, 1180, 160, 95, "decision")
    n("status-error", "ROLLBACK + release\n404 tidak ditemukan\n409 transisi ilegal", 1710, 1175, 175, 100, "error")
    n("status-write", "[Sistem/DB] UPDATE status\nCOMMIT; finally release koneksi", 1335, 1370, 350, 90)
    n("status-write-ok", "Operasi\nberhasil?", 1430, 1510, 160, 95, "decision")
    n("status-sql-error", "Error driver:\nROLLBACK + release\nTampilkan pesan API", 1710, 1505, 175, 105, "error")
    n("status-done", "[Sistem] HTTP 200; refresh daftar\nPembatalan menyimpan riwayat", 1335, 1740, 350, 90)
    n("merge", "", 830, 1900, 50, 45, "merge")
    n("again", "Aksi\nberikutnya?", 770, 1990, 170, 90, "decision")
    n("end", "", 835, 2130, 40, 40, "end")
    e("start", "open"); e("open", "load"); e("load", "choose")
    e("choose", "view", "Lihat/filter/detail", "left", "top", [(320, 440), (320, 560)])
    e("choose", "form", "Tambah/ubah")
    e("choose", "confirm", "Ubah status", "right", "top", [(1510, 440), (1510, 560)])
    e("view", "view-process")
    e("view-process", "merge", exit="bottom", entry="left", points=[(320, 940), (585, 940), (585, 1922)])
    e("form", "validate"); e("validate", "valid")
    e("valid", "input-error", "Tidak", "right", "left")
    e("input-error", "form", exit="top", entry="right", points=[(1170, 650), (1050, 650)])
    e("valid", "begin", "Ya"); e("begin", "rules"); e("rules", "rules-ok")
    e("rules-ok", "business-error", "Tidak", "right", "left")
    e("business-error", "form", exit="right", entry="right", points=[(1280, 1340), (1280, 630), (1050, 630)])
    e("rules-ok", "write", "Ya"); e("write", "write-ok")
    e("write-ok", "sql-error", "Tidak", "right", "left")
    e("sql-error", "form", exit="right", entry="right", points=[(1300, 1630), (1300, 610), (1050, 610)])
    e("write-ok", "saved", "Ya"); e("saved", "merge")
    e("confirm", "confirmed"); e("confirmed", "cancel-action", "Tidak", "right", "left")
    e("cancel-action", "merge", exit="right", entry="right", points=[(1930, 750), (1930, 1922), (900, 1922)])
    e("confirmed", "status-load", "Ya"); e("status-load", "status-rule"); e("status-rule", "status-ok")
    e("status-ok", "status-error", "Tidak", "right", "left")
    e("status-error", "merge", exit="right", entry="right", points=[(1950, 1225), (1950, 1940), (930, 1940), (930, 1922)])
    e("status-ok", "status-write", "Ya"); e("status-write", "status-write-ok")
    e("status-write-ok", "status-sql-error", "Tidak", "right", "left")
    e("status-sql-error", "merge", exit="right", entry="right", points=[(1970, 1557), (1970, 1960), (950, 1960), (950, 1922)])
    e("status-write-ok", "status-done", "Ya")
    e("status-done", "merge", exit="bottom", entry="right", points=[(1510, 1870), (915, 1870), (915, 1922)])
    e("merge", "again"); e("again", "end", "Tidak")
    e("again", "choose", "Ya", "left", "left", [(40, 2035), (40, 370), (720, 370), (720, 440)])
    return p


def customers():
    p = Page("Pelanggan", 1750, 1650)
    n, e = p.node, p.edge
    n("title", "ACTIVITY DIAGRAM — MENU PELANGGAN", 260, 20, 1140, 55, "title")
    n("start", "", 835, 95, 30, 30, "start")
    n("open", "[Operator] Buka menu Pelanggan", 675, 155)
    n("load", "[Sistem] Gunakan/muat GET /api/customers\nTampilkan kontak dan reservation_count", 635, 265, 430, 90)
    n("choose", "Pilih\naktivitas", 765, 410, 170, 95, "decision")
    n("band-view", "LIHAT / CARI", 75, 530, 400, 45, "band")
    n("band-save", "TAMBAH / UBAH", 570, 530, 570, 45, "band")
    n("band-delete", "HAPUS PELANGGAN", 1210, 530, 450, 45, "band")
    n("search", "[Operator] Ketik pencarian", 90, 620, 370, 80)
    n("filtered", "[Sistem] Filter daftar di browser\nCocok: tampilkan hasil\nTidak cocok: tampilkan keadaan kosong", 75, 780, 400, 110)
    n("form", "[Operator] Isi nama, telepon, email opsional\nUbah: form memakai data terpilih", 590, 620, 350, 90)
    n("request", "[Sistem] POST / PUT /api/customers\nNormalisasi dan validateCustomer", 590, 760, 350, 90)
    n("valid", "Input\nvalid?", 685, 895, 160, 90, "decision")
    n("invalid", "HTTP 400\nTampilkan error\nPerbaiki input", 965, 895, 175, 90, "error")
    n("save", "[DB] INSERT / UPDATE berparameter\nUNIQUE phone; update harus ditemukan", 575, 1035, 380, 100)
    n("saved-ok", "Simpan\nberhasil?", 680, 1175, 170, 95, "decision")
    n("save-error", "409 telepon duplikat\n404 ID tidak ada\n500 error internal", 965, 1175, 175, 110, "error")
    n("done", "[Sistem] HTTP 201 / 200\nTutup dialog; muat ulang pelanggan/reservasi", 575, 1320, 380, 95)
    n("delete-confirm", "[Operator] Klik Hapus\nKonfirmasi tindakan", 1220, 620, 330, 80)
    n("confirmed", "Lanjut\nhapus?", 1305, 755, 160, 95, "decision")
    n("cancel", "Tutup dialog\nData tetap", 1500, 755, 165, 90)
    n("delete", "[Sistem/DB] DELETE /api/customers/:id\nValidasi ID; DELETE dengan foreign key", 1205, 920, 350, 100)
    n("deleted", "Hapus\nberhasil?", 1305, 1080, 160, 95, "decision")
    n("delete-error", "409 punya riwayat\n404 ID tidak ada\n500 error internal\nData tidak dihapus", 1500, 1070, 170, 125, "error")
    n("delete-done", "[Sistem] HTTP 204\nMuat ulang daftar pelanggan", 1205, 1320, 350, 90)
    n("notes", "Nama wajib, max 100 karakter.\nTelepon: 8–15 digit, boleh diawali +.\nEmail opsional, max 150 karakter.\nPelanggan ber-riwayat tidak dapat dihapus.", 75, 1050, 400, 150, "note")
    n("merge", "", 825, 1470, 50, 45, "merge")
    n("end", "", 830, 1570, 40, 40, "end")
    e("start", "open"); e("open", "load"); e("load", "choose")
    e("choose", "search", "Lihat/cari", "left", "top", [(275, 457), (275, 595)])
    e("choose", "form", "Tambah/ubah")
    e("choose", "delete-confirm", "Hapus", "right", "top", [(1385, 457), (1385, 595)])
    e("search", "filtered")
    e("filtered", "merge", exit="bottom", entry="left", points=[(275, 940), (520, 940), (520, 1492)])
    e("form", "request"); e("request", "valid")
    e("valid", "invalid", "Tidak", "right", "left")
    e("invalid", "form", exit="top", entry="right", points=[(1052, 665)])
    e("valid", "save", "Ya"); e("save", "saved-ok")
    e("saved-ok", "save-error", "Tidak", "right", "left")
    e("save-error", "form", exit="right", entry="right", points=[(1170, 1230), (1170, 645), (970, 645), (970, 665)])
    e("saved-ok", "done", "Ya"); e("done", "merge")
    e("delete-confirm", "confirmed"); e("confirmed", "cancel", "Tidak", "right", "left")
    e("cancel", "merge", exit="right", entry="right", points=[(1690, 800), (1690, 1492)])
    e("confirmed", "delete", "Ya"); e("delete", "deleted")
    e("deleted", "delete-error", "Tidak", "right", "left")
    e("delete-error", "merge", exit="right", entry="right", points=[(1710, 1132), (1710, 1515), (930, 1515), (930, 1492)])
    e("deleted", "delete-done", "Ya")
    e("delete-done", "merge", exit="bottom", entry="right", points=[(1380, 1450), (910, 1450), (910, 1492)])
    e("merge", "end")
    return p


def reports():
    p = Page("Laporan", 1630, 2060)
    n, e = p.node, p.edge
    n("title", "ACTIVITY DIAGRAM — MENU LAPORAN", 210, 20, 1120, 55, "title")
    n("start", "", 750, 95, 30, 30, "start")
    n("open", "[Operator] Buka menu Laporan", 590, 160)
    n("period", "[Operator] Pilih tanggal awal/akhir\nKlik Tampilkan / gunakan periode awal", 565, 285, 400, 90)
    n("request", "[Sistem] GET /api/reports?from=...&to=...\nvalidateDateRange(from, to)", 565, 420, 400, 90)
    n("valid", "Rentang\nvalid?", 685, 560, 160, 95, "decision")
    n("date-error", "HTTP 400\nTampilkan pesan\nPerbaiki tanggal", 1040, 555, 215, 100, "error")
    n("query", "[DB] GROUP BY DATE(start_at)\nHitung reservasi, selesai, batal, tamu, pendapatan", 535, 710, 460, 100)
    n("query-ok", "Query\nberhasil?", 685, 865, 160, 95, "decision")
    n("db-error", "Pesan API / koneksi\nTampilkan error\nCoba muat ulang", 1040, 860, 215, 100, "error")
    n("data", "[Sistem] Simpan state.report\nTampilkan periode dan kartu summary", 565, 1010, 400, 90)
    n("has-rows", "Ada data\nharian?", 685, 1140, 160, 95, "decision")
    n("table", "[Sistem] Tampilkan tabel rekap harian", 270, 1290, 380, 80)
    n("empty", "[Sistem] Tampilkan 'Belum ada data'\nSummary tetap ditampilkan (nol)", 930, 1290, 390, 90)
    n("rows-merge", "", 740, 1390, 50, 45, "merge")
    n("choose", "Pilih\naksi laporan", 680, 1470, 170, 95, "decision")
    n("csv", "[Operator] Klik Unduh CSV\n[Sistem] Blob dari state.report\nUnduh file laporan-...csv", 110, 1605, 375, 110)
    n("print", "[Operator] Klik Cetak\n[Sistem] window.print()\nPilih printer / Save as PDF / batalkan", 560, 1605, 400, 110)
    n("new-period", "[Operator] Ubah periode\nTampilkan ulang laporan", 1040, 1605, 330, 90)
    n("merge", "", 740, 1850, 50, 45, "merge")
    n("end", "", 745, 1960, 40, 40, "end")
    n("rules-note", "Laporan menurut tanggal kedatangan.\nPendapatan hanya status completed.\nTamu tidak memasukkan cancelled.\nData kosong tetap boleh diunduh/dicetak.", 80, 810, 370, 160, "note")
    n("api-note", "Menu web: CSV browser dan cetak/PDF.\nAPI tambahan: /api/reports/export\nformat=csv atau json (attachment server).\nJSON bukan tombol pada menu web.\nBelum ada state.report: tombol ekspor/cetak\nmenampilkan pesan 'Tampilkan laporan dahulu'.", 1100, 995, 425, 170, "note")
    e("start", "open"); e("open", "period"); e("period", "request"); e("request", "valid")
    e("valid", "date-error", "Tidak", "right", "left")
    e("date-error", "period", exit="top", entry="right", points=[(1147, 330), (985, 330)])
    e("valid", "query", "Ya"); e("query", "query-ok")
    e("query-ok", "db-error", "Tidak", "right", "left")
    e("db-error", "period", exit="right", entry="right", points=[(1540, 910), (1540, 310), (1000, 310), (1000, 330)])
    e("query-ok", "data", "Ya"); e("data", "has-rows")
    e("has-rows", "table", "Ya", "left", "top", [(460, 1187), (460, 1270)])
    e("has-rows", "empty", "Tidak", "right", "top", [(1125, 1187), (1125, 1270)])
    e("table", "rows-merge", exit="bottom", entry="left", points=[(460, 1412)])
    e("empty", "rows-merge", exit="bottom", entry="right", points=[(1125, 1412)])
    e("rows-merge", "choose")
    e("choose", "csv", "Unduh CSV", "left", "top", [(297, 1517), (297, 1580)])
    e("choose", "print", "Cetak / PDF")
    e("choose", "new-period", "Ubah periode", "right", "top", points=[(1205, 1517), (1205, 1580)])
    e("new-period", "period", exit="right", entry="left", points=[(1580, 1650), (1580, 125), (490, 125), (490, 330)])
    e("csv", "merge", exit="bottom", entry="left", points=[(297, 1872)])
    e("print", "merge")
    e("choose", "merge", "Selesai melihat", "right", "right", [(900, 1517), (900, 1550), (1460, 1550), (1460, 1872)])
    e("merge", "end")
    return p


def save(pages, filename):
    mxfile = ET.Element("mxfile", host="app.diagrams.net", agent="Rasa & Ruang / generator lokal", type="device", compressed="false")
    for i, page in enumerate(pages):
        diagram = ET.SubElement(mxfile, "diagram", id=f"activity-{page.name.lower()}", name=page.name)
        diagram.append(page.model())
    ET.indent(mxfile, space="  ")
    ET.ElementTree(mxfile).write(filename, encoding="utf-8", xml_declaration=True)


pages = [reservations(), customers(), reports()]
for page in pages:
    # Judul cabang sudah berada pada decision edge; hindari dekorasi memotong alur.
    page.nodes = {key: node for key, node in page.nodes.items() if node["kind"] != "band"}
save(pages, OUTPUT / "Activity-Reservasi-Pelanggan-Laporan.drawio")
save(pages, OUTPUT / "Activity-Reservasi-Pelanggan-Laporan.xml")
for page in pages:
    save([page], OUTPUT / f"Activity-{page.name}.drawio")
    (OUTPUT / f"Activity-{page.name}.svg").write_text(page.svg(), encoding="utf-8")
print("Native XML draw.io dibuat: 3 halaman gabungan + 3 file terpisah + SVG pratinjau.")
