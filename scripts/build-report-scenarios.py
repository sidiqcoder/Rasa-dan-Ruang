"""Susun seluruh skenario yang benar-benar tereksekusi + rencana tambahan."""
from pathlib import Path
import csv
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/laporan-waterfall"
EVIDENCE = OUT / "bukti"
unit_names = re.findall(r"^ok \d+ - (.+)$", (EVIDENCE / "unit.tap").read_text(encoding="utf-8"), re.M)
integration_names = re.findall(r"^\s+ok \d+ - (.+)$", (EVIDENCE / "integration.tap").read_text(encoding="utf-8"), re.M)

# Urutan mengikuti source service.test.js, kemudian unit.test.js; harus cocok TAP.
unit_details = [
    ("Harga DB 35000; qty 2; total/unitPrice klien 1", "Total 70000; detail [17,1,2,35000]; begin/commit/release", "Positif"),
    ("Stub tables=[]", "AppError404; writes=0; rollback/release", "Negatif"),
    ("guests=5; capacity=4", "AppError400; writes=0; rollback/release", "Negatif"),
    ("Stub customers=[]", "AppError404; writes=0; rollback/release", "Negatif"),
    ("Stub conflicts=[{id:8}]", "AppError409; writes=0; rollback/release", "Negatif"),
    ("Stub missingMenu=true", "AppError404; writes=0; rollback/release", "Negatif"),
    ("guests=0", "AppError400 sebelum BEGIN; log transaksi kosong", "Negatif"),
    ("ID17 confirmed; menu1 qty3", "Total105000; UPDATE dan DELETE detail lama; commit/release", "Positif"),
    ("Update ID17; existing=[]", "AppError404; writes=0; rollback/release", "Negatif"),
    ("Update ID17; existing.status=seated", "AppError409; writes=0; rollback/release", "Negatif"),
    ("ID17 confirmed; nextStatus=seated", "{id:17,status:seated}; UPDATE; commit/release", "Positif"),
    ("ID17 confirmed; nextStatus=completed", "AppError409; tidak UPDATE; rollback/release", "Negatif"),
    ("changeStatus ID17; existing=[]", "AppError404", "Negatif"),
    ("Nama ' Dina '; phone 0812-3456-7890; repo return5", "{id:5,name:Dina,phone:081234567890,email:null}", "Positif"),
    ("Update customer999; repo return null", "AppError404", "Negatif"),
    ("DELETE stub affectedRows1 lalu0", "Sukses void; yang tidak ada AppError404", "Positif/negatif"),
    ("Nama '  Dina  '; +62 (812) 3456-7890; email kosong", "Nama Dina; +6281234567890; email null", "Positif"),
    ("name=' '", "AppError400", "Negatif"),
    ("phone='123'", "AppError400", "Negatif"),
    ("phone='081234abc'", "AppError400", "Negatif"),
    ("email='dina@'", "AppError400", "Negatif"),
    ("Payload pelanggan null", "AppError400", "Negatif"),
    ("Payload pelanggan []", "AppError400", "Negatif"),
    ("V: start2026-10-12T18:00, durasi90, notes berspasi", "Start18:00 WIB; end19:30; notes di-trim", "Positif"),
    ("V: start2026-10-12T23:30, durasi90", "End2026-10-13 01:00:00", "Batas"),
    ("V: start2026-10-10T12:00", "AppError400: harus mendatang", "Negatif"),
    ("V: start2027-02-30T12:00", "AppError400: kalender invalid", "Negatif"),
    ("V: start12/10/2026", "AppError400: format invalid", "Negatif"),
    ("V: start2026-10-12T25:00", "AppError400: jam invalid", "Negatif"),
    ("V: guests0", "AppError400", "Batas"),
    ("V: guests2.5", "AppError400: bukan integer", "Negatif"),
    ("V: guests='2'", "AppError400: bukan number", "Negatif"),
    ("V: duration29", "AppError400", "Batas"),
    ("V: duration241", "AppError400", "Batas"),
    ("V: customerId=-1", "AppError400", "Negatif"),
    ("V: menu1 qty2 dan menu1 qty3", "AppError400: menu duplikat", "Negatif"),
    ("V: menu1 qty0", "AppError400", "Batas"),
    ("V: menu1 qty100", "AppError400", "Batas"),
    ("V: items={}", "AppError400: harus array", "Negatif"),
    ("V: notes='a' sebanyak501", "AppError400", "Batas"),
    ("V: items=[]", "items kosong diterima", "Positif"),
    ("parse2028-02-29T12:00", "2028-02-29 12:00:00 WIB", "Batas"),
    ("parse2027-02-29T12:00", "Exception kalender invalid", "Batas"),
    ("from2026-10-12; to2026-10-11", "Exception rentang terbalik", "Negatif"),
    ("from=to=2026-10-11", "Rentang satu hari diterima", "Batas"),
    ("from/to undefined", "Exception tanggal invalid", "Negatif"),
    ("18:00–19:30 versus19:00–20:00", "overlaps=true", "Negatif"),
    ("18:00–19:30 versus19:30–20:30", "overlaps=false", "Batas"),
    ("18:00–21:00 versus19:00–20:00", "overlaps=true", "Negatif"),
    ("35000×2 + 10000×3", "Total100000 rupiah bulat", "Positif"),
    ("calculateTotal([])", "Total0", "Batas"),
    ("confirmed→seated→completed", "Kedua perubahan diterima", "Positif"),
    ("confirmed→cancelled", "Status cancelled", "Positif"),
    ("confirmed→completed langsung", "Exception transisi", "Negatif"),
    ("completed→confirmed", "Exception transisi", "Negatif"),
    ("cancelled→seated", "Exception transisi", "Negatif"),
    ("Callback transaction return42", "Return42; begin/commit/release", "Positif"),
    ("Callback transaction throw Error('gagal')", "Error diteruskan; begin/rollback/release", "Negatif"),
    ("Assignment status='completed' lalu transisi ilegal", "TypeError assignment; status tetapconfirmed; AppError409", "Negatif"),
    ("push completed ke transitions; ganti matriks", "TypeError; matriks tetap read-only", "Negatif"),
    ("Statusunknown, __proto__, constructor; default{}", "Status invalid AppError400; defaultconfirmed", "Negatif/positif"),
    ("parse2000-01-01T00:00; rentang2000-01-01", "Awal2000 WIB valid meskipun UTC1999", "Batas"),
    ("1999-12-31T23:59; 2101-01-01T00:00; 2100-12-31T23:59", "Dua di luar batas ditolak; akhir2100 diterima", "Batas"),
    ("Clock2026-10-12T18:00; start18:00 lalu18:01", "Sama now ditolak; satu menit setelahnya diterima", "Batas"),
    ("Report2reservasi/1completed/6tamu/revenue70000", "CSV header/harian/TOTAL persis; JSON setara fixture; inheritance valid", "Positif"),
    ("daily=[]; summary semua0", "CSV2baris: header dan TOTAL nol", "Batas"),
    ("Factory tanpaformat, json, pdf", "DefaultCSV; JSONsubclass; pdf AppError400", "Positif/negatif"),
    ("ReportExporter(text/plain,txt).export(fixture)", "Exception: serialize wajib diimplementasikan", "Negatif"),
    ("new AppError('Bentrok',409)", "instanceof Error; message/status sesuai", "Positif"),
]
assert len(unit_names) == len(unit_details) == 69
assert unit_names[0] == "service memakai harga database dan menyimpan detail dalam satu transaksi"
assert unit_names[-1] == "AppError tetap dapat ditangani sebagai Error"

integration_details = [
    ("GET health/tables/menu", "DBconnected;6meja;8menu"),
    ("POST pelanggan Dina/081234567890", "201 dan ID tersimpan"),
    ("POST telepon yang sudah ada", "409"),
    ("POST pelanggan []", "400"),
    ("PUT name=Dina ' OR 1=1 --", "200; GET mempertahankan string literal"),
    ("I: menu1×2 + menu5×2; total klien1", "201; total90000"),
    ("I: table1 kapasitas2, guests4", "400"),
    ("I: table3 start19:00 bertabrakan18:00–19:30", "409"),
    ("I: table4 menu9999", "404; COUNT reservations tetap1"),
    ("I: table3 start19:30, items=[]", "201"),
    ("2POST bersamaan table5 dan interval sama", "Status tersortir [201,409]"),
    ("PUT reservasi: menu2 qty2", "200; total84000; detail qty2"),
    ("PUT pindah table5 yang bentrok", "409; table_id3/total84000 tetap"),
    ("PATCH confirmed→completed", "409"),
    ("PATCH seated lalu completed", "200 pada kedua langkah"),
    ("PUT reservasi completed", "409"),
    ("GET reports tanggal2099-10-12", "3reservasi;1completed;revenue84000"),
    ("GET exportformatcsv", "200; MIME/filename CSV; TOTAL,3,1,0,12,84000"),
    ("GET exportformatjson", "200; JSON setara reports; attachment.json"),
    ("GET exportformatpdf", "400"),
    ("GET reports2000-01-01", "200; summary.reservations0"),
    ("POST rawJSON '{invalid' dan name33000karakter", "400 lalu413; errorstring"),
    ("GET /", "200; reservation-form ada; CSP script-src self"),
    ("DELETE customer yang punya reservasi", "409"),
    ("Table6:23:30 durasi90; buat00:30hari berikut", "Pertama201; kedua409"),
    ("Cancel reservasi table5; buat lagi slot sama", "PATCH200; POST201"),
    ("Buat customer sementara; DELETE", "204"),
    ("Rentangfrom>to dan GET /tidak-ada", "400 lalu404"),
]
assert len(integration_names) == len(integration_details) == 28

scenarios = []
def add(id_, group, name, prerequisite, data, steps, expected, status, evidence):
    scenarios.append(dict(id=id_, group=group, scenario=name, prerequisite=prerequisite, input=data, steps=steps, expected=expected, actual=status, evidence=evidence))

for i, (name, details) in enumerate(zip(unit_names, unit_details), 1):
    data, expected, kind = details
    source = "tests/service.test.js" if i <= 16 else "tests/unit.test.js"
    add(f"UT-{i:03}", "Unit/service", f"{kind}: {name}", "Node; fixture V/S dan fake clock/repository; tanpa DB", data, "Jalankan npm test; cocokkan assertion bernama sama.", expected, "LULUS (eksekusi baru)", f"{source}; bukti/unit.tap")
for i, (name, details) in enumerate(zip(integration_names, integration_details), 1):
    data, expected = details
    add(f"IT-{i:03}", "Integrasi", name, "MySQL aktif; schema di DB sementara; fixture I", data, "Jalankan npm run test:integration; subtest berurutan.", expected, "LULUS (eksekusi baru)", "tests/integration.test.js; bukti/integration.tap")

http_text = (ROOT / "rest-client.http").read_text(encoding="utf-8")
http_results = json.loads((EVIDENCE / "http.json").read_text(encoding="utf-8"))["results"]
blocks = re.split(r"^###\s+", http_text, flags=re.M)[1:]
assert len(blocks) == len(http_results) == 45
for i, (block, result) in enumerate(zip(blocks, http_results), 1):
    title = block.splitlines()[0]
    request = re.search(r"^(GET|POST|PUT|PATCH|DELETE) (.+)$", block, re.M)
    body = block.split("\n\n", 1)[1].strip() if "\n\n" in block else ""
    data = re.sub(r"\s+", " ", body) if body else "Tanpa body"
    # Hindari menganggap response assertions tambahan ada pada setiap HTTP case.
    expected = f"HTTP {result['expected']} sesuai # @expect."
    if i == 45: expected += " Script juga memeriksa summary:3reservasi/1completed/2cancelled/2tamu;revenue3×harga menu."
    assert result["passed"] and result["actual"] == result["expected"]
    line = http_text[:http_text.index("### " + title)].count("\n") + 1
    add(f"HTTP-{i:03}", "REST/API", title, "Request01–45 berurutan; variabel/ID dari named responses", data, f"Send Request {i:02}: {request[1]} {request[2]}", expected, f"LULUS; aktual HTTP {result['actual']}", f"rest-client.http:{line}; bukti/http.json")

manual = [
    ("Halaman awal dan indikator koneksi", "Server/DB aktif", "Buka / pada desktop1440×1000", "Indikator online; data dimuat", "LULUS (observasi baru)"),
    ("Navigasi Reservasi, Pelanggan, Laporan", "Server/DB aktif", "Klik tiga menu dan tampilkan laporan11Oktober", "Ketiga halaman tampil; tidak ada pageerror pada observasi", "LULUS (observasi baru)"),
    ("Buka form reservasi tanpa menyimpan", "Referensi tersedia", "Klik Buat reservasi; tutup dialog", "Dialog dapat dibuka/ditutup; tidak menambah data", "LULUS (observasi baru)"),
    ("Legenda dan teks status meja disembunyikan", "Frontend revisi terbaru", "Periksa .table-legend dan .table-availability", "Keduanya tidak ada pada DOM; kartu meja tetap tampil", "LULUS (observasi baru)"),
    ("Required field form pelanggan", "Form pelanggan terbuka", "Kosongkan nama/telepon lalu Submit", "Browser mencegah submit; server juga menolak invalid", "BELUM DIEKSEKUSI"),
    ("Email HTML invalid", "Form pelanggan terbuka", "Isi email a@ lalu Submit", "Browser menolak type=email", "BELUM DIEKSEKUSI"),
    ("Batas panjang nama/telepon/email", "Form pelanggan terbuka", "Coba melebihi100/20/150karakter", "maxlength membatasi input; backend batas sama", "BELUM DIEKSEKUSI"),
    ("UI tambah/ubah/hapus pelanggan", "Customer uji tanpa riwayat", "Tambah→ubah→hapus lewat tombol UI", "Dialog/toast/refresh benar; data tersimpan lalu terhapus", "BELUM DIEKSEKUSI"),
    ("UI hapus pelanggan ber-riwayat", "Customer punya reservasi", "KlikHapus→konfirmasi", "Pesan409; data/riwayat tetap", "BELUM DIEKSEKUSI"),
    ("Pilihan meja kapasitas kurang/bentrok", "Jadwal/tamu sudah diisi", "Pilih4tamu dan slot terisi", "Meja kurangkapasitas atau overlap disabled", "BELUM DIEKSEKUSI"),
    ("UI angka0 menu tidak dipilih", "Form reservasi terbuka", "Biarkanqty0; menu lainqty2", "Payload hanya menuqty>0; total ditampilkan", "BELUM DIEKSEKUSI"),
    ("UI reservasi create/update/hadir/selesai", "Tanggal mendatang dan customer uji", "Simpan→ubahqty→Hadir→Selesai", "UI refresh/toast; total dan status sesuai server", "BELUM DIEKSEKUSI"),
    ("Batal konfirmasi perubahan/hapus", "Dialog konfirmasi terbuka", "KlikKembali", "Tidak ada PATCH/DELETE; data tetap", "BELUM DIEKSEKUSI"),
    ("Filter status dan pencarian reservasi", "Daftar berisi berbagai status", "PilihSelesai; cari nama ada/lalu tidakada", "Hasil sesuai; keadaan kosong jika tidak cocok", "BELUM DIEKSEKUSI"),
    ("Pencarian pelanggan", "Daftar pelanggan tersedia", "Cari nama/telepon ada dan tidakada", "Filter lokal benar; keadaan kosong", "BELUM DIEKSEKUSI"),
    ("CSV tombol browser", "state.report tersedia", "KlikUnduhCSV; periksa berkas", "BOMUTF8, header, harian, TOTAL dan nilai sama laporan", "BELUM DIEKSEKUSI"),
    ("Cetak / Save as PDF", "Laporan tersedia", "KlikCetak; periksa print preview; batalkan/SavePDF", "Sidebar disembunyikan; rekap terbaca; bukan exporterPDFserver", "BELUM DIEKSEKUSI"),
    ("Ekspor/cetak sebelum laporan tersedia", "state.report belum ada", "Klik tombol ekspor/cetak", "Toast: tampilkan laporan terlebih dahulu", "BELUM DIEKSEKUSI"),
    ("Laporan periode tanpa data", "Periode kosong valid", "Tampilkan laporan lalu CSV/cetak", "Summary0; tabel kosong; ekspor tetap valid", "BELUM DIEKSEKUSI"),
    ("Mobile390×844", "Server/DB aktif", "Buka tiga menu dan dialog pada viewportmobile", "Tidak ada overflow halaman; kontrol dapat digunakan", "BELUM DIEKSEKUSI"),
    ("Escaping HTML input berbahaya", "Customer uji pada DBterisolasi", "Simpan name=<img src=x onerror=alert(1)>; bukaUI", "Tampil sebagai teks; tidak mengeksekusi script", "BELUM DIEKSEKUSI"),
    ("Server tidak terjangkau", "Lingkungan uji terpisah", "Hentikan server uji lalu lakukan requestUI", "ApiClient menampilkan pesan koneksi; tidak melaporkan sukses", "BELUM DIEKSEKUSI"),
]
for i, (name, pre, steps, expected, result) in enumerate(manual, 1):
    add(f"UI-{i:03}", "UI/manual", name, pre, "Data uji/viewport sesuai langkah", steps, expected, result, "bukti/browser.json; gambar/" if result.startswith("LULUS") else "Rencana manual; belum ada bukti eksekusi baru")

boundary = [
    ("Nama batas100/101", "Nama nonkosong sebanyak100 lalu101", "100diterima;101AppError400"),
    ("Telepon batas8/15/7/16digit", "Gunakan panjang8,15,7,16 tanpa simbol lain", "8/15diterima;7/16ditolak400"),
    ("Email batas150/151", "Susun emailvalid dengan panjang150 lalu151", "150diterima;151ditolak400"),
    ("Tamu batas1/8/9", "guests1,8,9; meja sesuai capacity", "1/8diterima jika capacity cukup;9ditolak400"),
    ("Durasi batas30/240", "duration30 lalu240", "Keduanya diterima; end sesuai durasi"),
    ("Qty batas1/99", "itemsmenuaktif qty1 lalu99", "Keduanya diterima; total benar"),
    ("Catatan batas500", "notes='a'×500", "Diterima; catatan tersimpan utuh"),
    ("Items batas30/31", "Unitvalidate:30 lalu31IDmenu unik; qty1", "30lolos validasi bentuk;31ditolak400; DB tetap harus memiliki menuaktif"),
    ("IDmax/overflow/boolean", "2147483647;2147483648;true", "Maxintegerlolos bentuk;overflow/bool400; IDtidakada404 saat lookup"),
    ("Menusecara langsung inactive", "Set active0 pada DBuji; POST referensi tersebut", "404 dan rollback; GETmenu tidakmenampilkan"),
    ("Snapshot harga setelah master berubah", "Simpanorder; UPDATEharga menu pada DBuji; GETdetail", "unit_price lama tetap; nama dari JOIN bukan snapshot; updateorder mengambil harga baru"),
    ("Batal dari seated", "Buat→seated→cancelled", "200; statuscancelled terminal; tidakmengakui revenue"),
    ("Gagal INSERT detail setelah header ditulis", "Stubdriver melempar padaINSERTorder_items", "Rollback menghapusperubahanparsial; release; error diteruskan"),
    ("Gagal commit", "Stub commit melempar exception", "Catch memanggil rollback dan finallyrelease; tidak respons sukses"),
    ("Gagal rollback", "Stub operasi dan rollback sama-sama melempar", "Finally tetaprelease; errorrollback dapatmenggantikanawal (batas saatini)"),
    ("DB tidaktersedia saat startup", "Serveruji DBport salah/servicedihentikan", "LogDatabasebelumsiap; poolditutup; exitCode1"),
    ("Port server terpakai", "Serveruji pada portyangsudahlisten", "Eventerror; loggagal; poolend; exitCode1"),
    ("Request errorinternal500", "Poolstubexecute melemparerror teknis", "HTTP500pesanumum; detailhanyalog, tidak bocor respons"),
    ("Kegagalan refreshetelah write berhasil", "PUTberhasil laluGETrefresh gagal", "PeriksaDBsebelummengulang; UIerror tidakberarti write rollback"),
]
for i, (name, data, expected) in enumerate(boundary, 1):
    add(f"BT-{i:03}", "Batas/resiliensi tambahan", name, "Lingkungan/stub/DBuji terisolasi; tidak mengubah DB aplikasi", data, "Siapkan data/stub sesuai input; jalankan fungsi/API; periksa respons dan persistensi.", expected, "BELUM DIEKSEKUSI", "Rencana tambahan; source validation/service/repository/server")

assert len(scenarios) == 69 + 28 + 45 + 22 + 19
(OUT / "TEST-SCENARIOS.json").write_text(json.dumps(scenarios, ensure_ascii=False, indent=2), encoding="utf-8")
with (OUT / "TEST-SCENARIOS.csv").open("w", encoding="utf-8-sig", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=list(scenarios[0]))
    writer.writeheader(); writer.writerows(scenarios)
summary = {
    "total": len(scenarios), "unit_service": 69, "integration": 28, "http": 45,
    "ui_manual": 22, "boundary_additional": 19,
    "executed_passed": sum(s["actual"].startswith("LULUS") for s in scenarios),
    "not_executed": sum(s["actual"].startswith("BELUM") for s in scenarios),
}
(OUT / "TEST-SUMMARY.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(f"Matriks: {len(scenarios)} skenario; {summary['executed_passed']} lulus; {summary['not_executed']} belum dieksekusi.")
