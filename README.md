# Rasa & Ruang — Sistem Pemesanan Restoran

Aplikasi praktik sertifikasi untuk **mengelola pemesanan meja, menyimpan pelanggan dan pesanan menu, serta memberikan laporan pemesanan**. Frontend memakai HTML/CSS/JavaScript native, backend Node.js/Express, dan penyimpanan MySQL/MariaDB.

README ini memuat cakupan sembilan unit kompetensi, lokasi bukti, instalasi, REST Client, testing dan debugging. Baca juga [spesifikasi](docs/SPESIFIKASI.md), [kontrak kode](docs/DOKUMENTASI-KODE.md), [audit awal](docs/LAPORAN-AUDIT-KOMPETENSI.md), dan [hasil pelengkapan](docs/HASIL-PELENGKAPAN.md).

## Instalasi dan menjalankan aplikasi

Persyaratan: **Node.js minimal 22.9.0**, npm, serta MySQL/MariaDB yang berjalan. Verifikasi memakai Windows/PowerShell, Node 24.3.0, npm 11.18.0, MariaDB 10.4.32 dari XAMPP. Minimum Node mengikuti flag `--env-file-if-exists` yang tersedia sejak 22.9.0. [Dokumentasi CLI Node.js](https://nodejs.org/download/release/v22.23.0/docs/api/cli.html#--env-file-if-existsfile).

1. Buka PowerShell di root proyek dan aktifkan MySQL melalui XAMPP/layanan Anda.
2. Pasang dependency yang dikunci lockfile dan buat konfigurasi lokal:

```powershell
node --version
npm --version
npm ci
Copy-Item .env.example .env
```

Penyalinan `.env` hanya untuk instalasi baru; gunakan konfigurasi yang sudah ada bila sebelumnya telah dibuat. Contoh:

```dotenv
PORT=3001
HOST=127.0.0.1
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=restoran_sertifikasi
```

Sesuaikan dengan database lokal. root tanpa password adalah contoh XAMPP. `.env` tidak dimasukkan ke paket pengumpulan.

```powershell
npm run db:setup
npm start
```

Buka **http://127.0.0.1:3001**. Endpoint **/api/health** harus menghasilkan `{"status":"ok","database":"connected"}`. Hentikan server dengan Ctrl+C. Gunakan `npm run dev` untuk watch/restart saat source berubah.

Opsional: `npm run seed:demo` menambahkan empat reservasi hari ini jika belum ada reservasi. `db:setup` membuat database, lima tabel, enam meja dan delapan menu tanpa menghapus data lama. Seed boleh memakai waktu historis melalui clock demo; input baru dari aplikasi tetap wajib mendatang.

| Perintah | Fungsi dan kebutuhan |
| --- | --- |
| `npm start` / `npm run dev` | Server normal/watch; database aplikasi sudah disiapkan. |
| `npm run debug` | Inspector localhost:9229; database dan port aplikasi tersedia. |
| `npm run db:setup` | Setup schema/referensi; akun DB boleh membuat database/tabel. |
| `npm run seed:demo` | Data contoh; schema sudah siap. |
| `npm run check` | Syntax check seluruh source JS; tidak mengubah database. |
| `npm test` | Unit model/validasi/repository/service/exporter; tanpa DB. |
| `npm run test:coverage` | Unit test beserta coverage; tanpa DB. |
| `npm run test:integration` | HTTP + DB sementara; izin CREATE/DROP DB uji. |
| `npm run test:http` | Rehearsal file .http di DB sementara; tidak perlu npm start. |
| `npm run dependency:report` | Inventaris lisensi/deprecation dan notices dari paket terpasang. |
| `npm audit` | Advisory dependency registry; membutuhkan jaringan. |
| `npm run docs:generate` | Laporan/lampiran Word, PPT, Word audit; dependency dev terpasang. |
| `npm run package:submission` | ZIP source/pengumpulan; jalankan sesudah dokumen dibuat. |

## Fitur dan aturan bisnis

| Fitur | Yang tersedia | Cara melihat |
| --- | --- | --- |
| Pelanggan | Tambah, daftar/cari, ubah, hapus tanpa riwayat. | Halaman Pelanggan; request HTTP 05–08, 29–31. |
| Reservasi | Pelanggan, meja, tanggal/jam WIB, durasi, tamu, catatan. | Form reservasi; HTTP 09–14. |
| Pesanan | Menu opsional, quantity, snapshot harga, total server. | Detail/GET reservasi. |
| Jadwal/kapasitas | Tolak kapasitas kurang, bentrok, termasuk lintas hari/concurrent. | HTTP 11–12; tes integrasi. |
| Pelayanan | confirmed → seated → completed, atau cancelled. | Tombol UI; HTTP 15–19, 23–27. |
| Laporan | Filter tanggal kedatangan, harian/total, tamu, selesai, batal, revenue. | Halaman Laporan; HTTP 20/45. |
| Ekspor | CSV UI; CSV/JSON server; cetak/Simpan PDF browser. | HTTP 21–22 atau tombol laporan. |
| Antarmuka | Kondisi meja, pencarian/filter, dialog, responsif. | Browser; bukti historis pada BUKTI-BROWSER.md. |

Aturan input dan konsistensi:

- Name wajib, maksimal 100 karakter. Phone 8–15 digit dengan `+` opsional setelah spasi/tanda kurung/hubung dihapus; unik. Email opsional ≤150 dan valid bila diisi.
- ID integer positif; guests 1–8 dan ≤capacity meja; duration 30–240 menit; notes ≤500.
- startAt `YYYY-MM-DDTHH:mm` WIB; tahun kalender 2000–2100; **start > now**. Laporan memakai from/to tanggal valid, from ≤ to.
- items wajib array, boleh kosong, ≤30 menu berbeda. Quantity 1–99; menu aktif; menu duplikat ditolak.
- Total dihitung dari harga database, bukan harga/total klien. unit_price menyimpan snapshot; update reservasi mengambil ulang harga saat perubahan.
- Hanya confirmed boleh diubah rinciannya. completed/cancelled terminal. Status pelayanan mengikuti tindakan operator; tidak ada validasi jam aktual untuk menandai hadir/selesai.
- Interval `[start,end)` bentrok bila `start_baru < end_lama AND end_baru > start_lama`. Jadwal bersebelahan boleh. confirmed/seated memblokir slot; completed/cancelled membebaskannya.
- Laporan berdasarkan **tanggal kedatangan**. Revenue hanya completed; tamu cancelled dikecualikan. Hari kosong tidak memiliki baris; summary kosong nol.

Sistem ditujukan untuk satu operator lokal. Login, pembayaran, stok, pajak, notifikasi, layar CRUD referensi meja/menu tidak termasuk skenario wajib. Referensi disiapkan SQL. Reservasi tidak memiliki DELETE API agar riwayat laporan terpelihara.

## Arsitektur dan database

```text
Browser / REST Client → Express API → Service + Model → Repository → MySQL/MariaDB
                             ↓
                  ReportExporter → CSV / JSON
```

```text
public/                  HTML/CSS/JS, ApiClient, form, render, CSV, print
src/app.js               Route, middleware, error handler, createApp(pool)
src/server.js            Startup, cek DB, listen dan shutdown
src/database.js          Konfigurasi satu pool mysql2/promise
src/validation.js        Tipe/input, WIB, kalender, interval
src/errors.js            AppError extends Error
src/models/Reservation.js Private status, transisi, total
src/services/            Aturan bisnis dan transaksi
src/repositories/        CRUD, JOIN dan laporan
src/reports/             Base exporter serta subclass CSV/JSON
database/schema.sql      Tabel, relasi, index dan referensi awal
tests/                   Unit, service unit, integrasi
rest-client.http         45 request dengan payload dan chaining ID
.vscode/                 Debugger dan rekomendasi REST Client
scripts/                 Setup, seed, check, lisensi, HTTP, dokumen, ZIP
docs/                    Spesifikasi, kontrak, laporan, bukti, notices
pengumpulan/             Artefak hasil generate
```

| Tabel | Fungsi |
| --- | --- |
| customers | Kontak, phone UNIQUE; satu pelanggan banyak reservasi. |
| restaurant_tables | Nama, capacity, area; satu meja banyak reservasi berbeda waktu. |
| menu_items | Nama, kategori, price integer, active. |
| reservations | FK customer/table, start/end WIB, guests/status/notes/total. |
| order_items | FK reservation/menu, quantity/unit_price; pasangan reservation-menu unik. |

InnoDB, PK/FK/UNIQUE menjaga integritas. SQL memakai placeholder. Transaksi mengunci meja dalam urutan ID, memeriksa konflik, menyimpan reservasi dan seluruh items, lalu commit; error memicu rollback dan akhirnya release. Index jadwal/tanggal tersedia; manfaat kecepatan belum diukur. Lock semua enam meja dipertahankan untuk correctness pada skala praktik.

Diagram komponen/class, ERD, property/method dan pemetaan kebutuhan → kode → tes tersedia di [SPESIFIKASI.md](docs/SPESIFIKASI.md). Parameter/return/error ada di [DOKUMENTASI-KODE.md](docs/DOKUMENTASI-KODE.md).

## Bukti setiap unit kompetensi

### J.620100.009.01 — Menggunakan Spesifikasi Program

Termasuk kebutuhan, diagram, tabel/property, metode pengembangan dan implementasi yang mengacu spesifikasi. [SPESIFIKASI.md](docs/SPESIFIKASI.md) menjelaskan input/output, diagram komponen/class/ERD dan ID kebutuhan yang terkait modul serta tes. Pada pelengkapan ini digunakan **iteratif dengan regresi**: audit baseline → perubahan kecil → unit/integrasi → dokumen → paket. Riwayat metode awal yang tidak tercatat tidak direka ulang.

Cara menunjukkan: buka K-04 (bentrok), diagram/alur interval, `RestaurantService.saveReservation`, lalu tes integrasi simultaneous/lintas hari. Diagram dan aturan dapat digunakan sebagai dasar memahami kode.

### J.620100.016.01 — Guidelines & Best Practices

Termasuk penamaan, format, modularitas, readability, maintainability dan bebas syntax error. Bukti: [GUIDELINES.md](docs/GUIDELINES.md), ES modules, PascalCase class, camelCase method, pemisahan layer, validasi server, parameter SQL, error handler dan dependency lock. Komentar menjelaskan tujuan/invariant; frontend meng-escape data pengguna.

Cara memeriksa: `npm run check`, baca pembagian modul dan jalankan tes. Check adalah pemeriksaan sintaks, **bukan linter**; tidak diklaim ada ESLint/formatter otomatis yang belum dipasang.

### J.620100.017.02 — Pemrograman Terstruktur

Termasuk tipe data, sequence, if, loop, fungsi, run dan penanganan error. Bukti: integer/text/validateReservation, percabangan kapasitas/status/input, for menu, map/reduce total/laporan, try/catch/finally transaksi. Number integer untuk ID/rupiah/tamu, string untuk kontak/tanggal SQL, array items, Set duplikasi dan Date durasi.

Cara memeriksa: `npm run check`, `npm test`, HTTP 11/35–38. JavaScript berjalan melalui Node.js dan tidak memerlukan compiler native terpisah.

### J.620100.018.02 — OOP

Termasuk class/property/method, encapsulation, akses, inheritance, polymorphism dan overriding. Bukti: `Reservation.#status` privat dengan getter public hanya-baca; perubahan melalui changeStatus; matriks transisi privat/frozen. `AppError extends Error` menunjukkan inheritance. CSV/JSON mewarisi ReportExporter dan override serialize; API menggunakan kontrak export(report) yang sama sehingga perilaku mengikuti subclass. Service menerima repository/clock untuk dependency injection.

Cara memeriksa: buka model/exporter, jalankan unit assignment status dan overriding, lalu HTTP 21/22. JavaScript memakai public default dan private `#`; tidak ada modifier protected native setara Java. serialize adalah titik ekstensi terdokumentasi. Overloading deklarasi method bernama sama tidak dipaksakan karena bukan kebutuhan aplikasi atau pola native bahasa.

### J.620100.019.02 — Library Pre-existing

Termasuk identifikasi reuse, efisiensi/perawatan, kompatibilitas, lisensi, dependency dan tidak deprecated. Express menangani HTTP, mysql2 DB, node:test/assert pengujian, docx/PptxGenJS dokumen, archiver ZIP. [LIBRARY-DAN-LISENSI.md](docs/LIBRARY-DAN-LISENSI.md) membandingkan reuse dengan implementasi sendiri; inventaris direct/transitive dan notice tersimpan di docs.

Cara memeriksa: `npm ls --depth=0`, `npm run dependency:report`, `npm audit`, serta tes aplikasi/pengemasan. Archiver diperbarui ke 8.0.0 dengan ZipArchive untuk menghapus rantai glob deprecated audit awal. Verifikasi: 0 deprecated pada lockfile dan 0 advisory terlapor; keduanya pemeriksaan berbeda dan hasil registry dapat berubah.

### J.620100.021.02 — Akses Basis Data

Termasuk INSERT/UPDATE/DELETE/SELECT, driver, integritas dan index. Repository menyediakan CRUD pelanggan, JOIN reservasi/menu, GROUP BY/COUNT/SUM report; service menyimpan reservasi/items dalam satu transaksi. Schema mempunyai PK/FK/UNIQUE dan index.

Cara memeriksa: HTTP 05/06/07/30 untuk CRUD; 28 untuk perlindungan FK. Integrasi membuktikan rollback menu tidak ada, update gagal mempertahankan data, dan dua request slot sama menghasilkan satu 201/satu 409. Lihat schema.sql untuk index; jangan mengklaim benchmark yang belum dijalankan.

### J.620100.023.02 — Dokumentasi Kode

Termasuk inventaris modul/class, parameter, return, exception, algoritma, komentar dan dokumen terpisah yang diperbarui. Bukti: README, SPESIFIKASI, GUIDELINES, DOKUMENTASI-KODE, LAPORAN, LIBRARY-DAN-LISENSI, PANDUAN-DEMO, JSDoc dan lampiran source.

Cara memeriksa: cocokkan payload HTTP dan method dengan kontrak dokumentasi. Setelah perubahan, perbarui dokumen, jalankan tes, `npm run docs:generate`, lalu pengemasan. Audit awal dipertahankan sebagai baseline dengan tautan tindak lanjut.

### J.620100.025.02 — Debugging

Termasuk memahami spesifikasi, reproduksi, stack/log/debugger, akar masalah, perbaikan dan verifikasi. Bukti historis: error querySelector pada null karena event.currentTarget setelah await; perbaikan menyimpan form. Pelengkapan memperbaiki bypass state, batas tahun WIB dan start sama dengan now dengan regresi.

Cara menunjukkan: gunakan konfigurasi `.vscode/launch.json`, pasang breakpoint service/transaction, kirim HTTP lalu periksa Variables/Watch. Petunjuk lengkap pada bagian Debugging. HTTP 400/409 yang diharapkan adalah validasi benar, bukan syntax error. Bukti browser lama ditandai historis.

### J.620100.033.02 — Unit Testing

Termasuk tools/prosedur, data normal/edge/error, assertion, eksekusi, evaluasi dan laporan. unit.test.js menguji model/validasi/transaksi/exporter; service.test.js memakai repository/koneksi stub dan clock tetap. Assertion penting memeriksa AppError/status. Unit tidak membutuhkan database.

Cara memeriksa: `npm test`, coverage, integrasi dan rehearsal HTTP; lihat TAP/JSON hasil. Integrasi dan REST Client adalah pengujian tambahan, **bukan unit test**. Fungsi/property internal diuji langsung melalui unit/debugger, bukan diberi endpoint buatan untuk menjalankan source.

## API dan REST Client

Prefix `/api`; error JSON `{"error":"pesan"}`. Sukses 200/201, DELETE sukses 204 tanpa body. Error: 400 input/rentang/format, 404 data/endpoint, 409 konflik/FK/transisi, 413 body >32 KB, 500 internal.

| Method | Path | Fungsi / input |
| --- | --- | --- |
| GET | /health | Cek DB. |
| GET / POST | /customers | Daftar / tambah name, phone, email opsional. |
| PUT / DELETE | /customers/:id | Ubah kontak lengkap / hapus tanpa riwayat. |
| GET | /tables | Referensi meja. |
| GET | /menu | Menu aktif. |
| GET | /reservations?from=YYYY-MM-DD&to=YYYY-MM-DD | Reservasi dan items sesuai tanggal kedatangan. |
| POST | /reservations | customerId, tableId, startAt, duration, guests, items, notes opsional. |
| PUT | /reservations/:id | Ganti rincian confirmed. |
| PATCH | /reservations/:id/status | Payload status: seated/completed/cancelled sesuai alur. |
| GET | /reports?from=YYYY-MM-DD&to=YYYY-MM-DD | from/to, daily dan summary. |
| GET | /reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv | Berkas Content-Disposition; format csv/default atau json. |

### Langsung mencoba rest-client.http

1. Pasang extension **REST Client oleh Huachao Mao**, ID `humao.rest-client`, di VS Code; workspace sudah merekomendasikannya.
2. Jalankan `npm run db:setup`, kemudian `npm start`.
3. Buka [rest-client.http](rest-client.http). Sesuaikan `@baseUrl` bila port berbeda.
4. Klik **Send Request** berurutan 01–45. Named response otomatis mengisi ID pelanggan/reservasi/menu/meja; tidak perlu copy ID.
5. Bandingkan status dengan judul/komentar. `# @expect` dipakai runner proyek sebagai assertion; extension tidak otomatis menguji komentar ini.
6. Gunakan **Save Response Body** pada ekspor CSV/JSON.

Sintaks named request, variabel dan JSONPath mengikuti [dokumentasi REST Client](https://github.com/Huachao/vscode-restclient).

Tanggal default besok menurut UTC, pukul 18:00 WIB, agar tidak tergantung timezone komputer. Phone dibuat acak. Untuk tanggal tertentu ubah `@date` menjadi tanggal mendatang. Jika bentrok dengan data Anda, pilih tanggal kosong dan ulang dari awal. Alur yang dilanjutkan pada hari berbeda perlu dimulai lagi.

| Request | Cakupan dan hasil yang diharapkan |
| --- | --- |
| 01–04 | Health, HTML, meja, menu: 200. |
| 05–08 | Create/list/update pelanggan dan duplikat: 201/200/409. |
| 09–14 | Reservasi, harga server, kapasitas/conflict/menu invalid, update. |
| 15–19 | Lompatan status ditolak; hadir/selesai sukses; edit selesai ditolak. |
| 20–22 | Report, CSV, JSON dengan data yang sama. |
| 23–28 | Cancel/rebook, status terminal, pelanggan dengan riwayat. |
| 29–31 | Pelanggan sementara: create 201, delete 204, delete ulang 404. |
| 32–44 | Input/tanggal/menu/rentang/endpoint/ID invalid; tahun 2000 WIB valid. |
| 45 | Tambahan alur ini: 3 reservasi, 1 completed, 2 cancelled, 2 tamu, revenue 3 × harga menu pertama. |

Request manual memakai **database aplikasi**. Pelanggan utama dan tiga reservasi uji menjadi riwayat; pelanggan sementara dihapus dan slot pengganti dibatalkan. Report periode dapat berisi data lain, sehingga totalnya gabungan. `npm run test:http` menggunakan database sementara agar bisa memeriksa file yang sama tanpa mengubah data aplikasi.

## Pengujian otomatis dan membaca hasil

```powershell
npm run check
npm test
npm run test:coverage
npm run test:integration
npm run test:http
```

Verifikasi pelengkapan 12?13 Oktober 2026:

| Pemeriksaan | Hasil | Bukti |
| --- | --- | --- |
| Sintaks | 20 berkas lulus. | npm run check. |
| Unit/service unit | 69 lulus, 0 gagal. | [bukti-unit.tap](docs/bukti-unit.tap). |
| Integrasi | 28 skenario lulus; runner 29 termasuk satu induk. | [bukti-integrasi.tap](docs/bukti-integrasi.tap). |
| Rehearsal .http | 45/45 status benar; total laporan benar. | [bukti-http.json](docs/bukti-http.json). |
| Dependency audit | 0 advisory terlapor. | [bukti-dependency.json](docs/bukti-dependency.json). |
| Dependency inventory | 138 tercatat, 0 deprecated lockfile. | [DEPENDENCY-LICENSES.json](docs/DEPENDENCY-LICENSES.json). |

Unit mencakup normalisasi, kalender/batas tahun, tipe/rentang, start > now, private state, transisi terminal, total server, transaksi/release, overriding dan service. Stub/clock membuat hasil deterministik. Integrasi memakai DB `restoran_test_<pid>_<timestamp>`, rehearsal memakai `restoran_http_<pid>_<timestamp>`; masing-masing membuat schema/port sementara dan membersihkan DB miliknya. Akun harus boleh CREATE/DROP DB uji. Keduanya tidak perlu npm start.

Rehearsal menjalankan subset sintaks REST Client yang dipakai file ini. Penggunaan extension editor tetap dicoba lewat Send Request. Hasil unit dan integrasi berbeda dari pemeriksaan UI visual.

Coverage unit: 83,92% baris, 98,35% cabang, 84,31% fungsi. Integrasi: 95,15% baris, 86,50% cabang, 93,67% fungsi. Hanya source yang dimuat suite; tidak mencakup semua frontend/startup dan tidak dijumlahkan menjadi coverage total. Baca uncovered pada akhir TAP; coverage tinggi tidak menjamin seluruh spesifikasi diuji. [Node.js Test Runner](https://nodejs.org/docs/latest-v24.x/api/test.html).

Merekam ulang setelah perubahan:

```powershell
node --test --test-reporter=tap --experimental-test-coverage tests/unit.test.js tests/service.test.js | Set-Content -Encoding utf8 docs/bukti-unit.tap
node --env-file-if-exists=.env --test --test-reporter=tap --experimental-test-coverage tests/integration.test.js | Set-Content -Encoding utf8 docs/bukti-integrasi.tap
npm run test:http
npm run dependency:report
npm audit --json | Set-Content -Encoding utf8 docs/bukti-dependency.json
```

Periksa `$LASTEXITCODE` setelah setiap Node/npm dan ringkasan fail 0. Hasil lama tidak membuktikan revisi yang belum diuji. Perbarui hasil tertulis bila jumlah tes/behavior berubah.

## Debugging

### Server dan breakpoint VS Code

1. Siapkan DB; hentikan npm start/dev lama yang memakai port aplikasi.
2. Run and Debug → **Restoran: debug server** → F5. Konfigurasi [.vscode/launch.json](.vscode/launch.json) memuat .env jika tersedia.
3. Pasang breakpoint pada saveReservation setelah validasi, pemeriksaan kapasitas/conflict atau hitung total.
4. Kirim HTTP 09/11/12. Lihat input, table.capacity, conflicts, pricedItems, total di Variables/Watch.
5. F10 Step Over, F11 Step Into, Shift+F11 keluar fungsi, F5 lanjut. Tunggu operasi async yang di-step selesai.
6. Pasang breakpoint transaction untuk mengamati begin/commit/rollback/finally release. Aktifkan caught exceptions bila ingin berhenti ketika AppError dilempar.

Alternatif: terminal `npm run debug`, lalu pilih **Restoran: attach npm run debug** → F5. Inspector localhost:9229. Pakai satu proses melalui launch atau attach; jangan menjalankan dua server pada port sama. [Dokumentasi debugger VS Code](https://code.visualstudio.com/docs/nodejs/nodejs-debugging).

### Debugging unit test

Pilih **Restoran: debug unit test**, pasang breakpoint model/validation/service, F5; tanpa DB. Menjalankan satu kasus saja:

```powershell
node --test --test-name-pattern="status privat" tests/unit.test.js
node --test --test-name-pattern="kapasitas kurang" tests/service.test.js
```

Nama tersedia pada source dan TAP. Clock tetap membantu memeriksa kasus batas waktu tanpa menunggu jam tertentu.

### Browser, logging dan prosedur investigasi

Tekan F12: **Console** untuk error JS, **Network** untuk payload/status/response `/api`. Bandingkan response dengan UI. Detail DB internal ada di terminal server, bukan response pengguna. Log internal memakai timestamp UTC ISO plus method/path; waktu bisnis tetap WIB.

Urutan debugging: identifikasi kebutuhan yang dilanggar → reproduksi dengan input tetap → baca stack/log/breakpoint → cari akar masalah → perbaiki → regresi terkait → integrasi bila SQL/API berubah → sinkronkan docs. Jangan berhenti pada perubahan pesan error saja.

| Gejala | Akar masalah | Perbaikan/bukti |
| --- | --- | --- |
| querySelector null setelah await laporan. | event.currentTarget tidak tersedia setelah dispatch. | Simpan form sebelum await; BUKTI-BROWSER historis. |
| confirmed langsung completed lewat assignment. | status publik. | #status/getter dan frozen transitions; unit regresi. |
| 2000-01-01 00:00 WIB ditolak. | Tahun UTC 1999. | Validasi tahun kalender WIB; unit/integrasi. |
| start sama now diterima. | Perbandingan hanya <. | Penolakan <=; clock tetap di unit. |

| Masalah operasional | Pemeriksaan/tindakan |
| --- | --- |
| bad option --env-file-if-exists | Cek node --version; minimal 22.9.0. |
| ECONNREFUSED | Jalankan DB; cocokkan host/port. |
| Access denied | Cek user/password/izin DB. |
| Unknown database/tabel | db:setup; pastikan DB_NAME sama. |
| EADDRINUSE | Hentikan server lama atau ubah PORT/baseUrl. |
| Breakpoint tidak berhenti | Cek source workspace, proses debugger dan request mencapai method. |
| Variabel HTTP belum tersedia/literal | Jalankan named request pendahulu; pastikan response sukses mempunyai id; hover variabel. |
| Create kedua slot sama 409 | Konflik yang benar; ikuti urutan atau batalkan slot aktif. |
| Delete pelanggan 409 | FK riwayat; gunakan pelanggan sementara untuk DELETE sukses. |
| Revenue nol | Status harus completed dan tanggal kedatangan masuk periode. |
| CREATE/DROP tes ditolak | Gunakan izin DB sementara; tidak perlu menghapus DB aplikasi. |

## Library, dokumen dan paket

[LIBRARY-DAN-LISENSI.md](docs/LIBRARY-DAN-LISENSI.md) menjelaskan reuse, versi, kompatibilitas dan notice. Runtime: Express/mysql2. Tooling: docx/PptxGenJS/archiver. Fetch/Intl/DOM dan node:test adalah komponen bawaan, bukan npm tambahan.

| Dokumen | Isi |
| --- | --- |
| [SPESIFIKASI](docs/SPESIFIKASI.md) | Kebutuhan, metode, diagram, ketertelusuran. |
| [GUIDELINES](docs/GUIDELINES.md) | Pedoman source/error/SQL/testing/docs. |
| [DOKUMENTASI-KODE](docs/DOKUMENTASI-KODE.md) | Kontrak parameter/return/error dan algoritma. |
| [LAPORAN](docs/LAPORAN.md) | Laporan pengembangan peserta. |
| [AUDIT](docs/LAPORAN-AUDIT-KOMPETENSI.md) | Baseline dengan catatan tindak lanjut. |
| [HASIL-PELENGKAPAN](docs/HASIL-PELENGKAPAN.md) | Perubahan, uji baru, batas tersisa. |
| [PANDUAN-DEMO](docs/PANDUAN-DEMO.md) | Urutan praktik. |
| [BUKTI-BROWSER](docs/BUKTI-BROWSER.md) | Pemeriksaan UI 11 Oktober 2026, historis. |
| [Diagram dan presentasi](docs/diagrams/README.md) | PPT 21 slide dengan urutan delapan Instruksi Kerja, use case, activity dan ERD; SVG serta source editable. |
| [Dokumen sistem](docs/PANDUAN-DOKUMEN-SISTEM.md) | Dokumen Word mengikuti contoh, dengan delapan gambar diagram, alur kode, function/OOP, debugging dan pengujian. |
| [Laporan Waterfall terbaru](docs/laporan-waterfall/README.md) | Enam BAB sesuai format laporan contoh; 31 skenario error/pemulihan, 183 test scenario dan bukti eksekusi terbaru. |
| [Inventory](docs/DEPENDENCY-LICENSES.json) / [notices](docs/THIRD-PARTY-NOTICES.txt) | Lisensi dependency direct/transitive dan notice langsung. |

```powershell
npm run ppt:generate
npm run docs:system
npm run docs:generate
npm run package:submission
```

`ppt:generate` membuat ulang PPT dan tiga diagram SVG saja. `docs:generate` juga memakai generator PPT yang sama, sehingga presentasi terbaru tetap mengikuti urutan delapan unit. Diagram di dalam PPT dapat diedit sebagai bentuk/teks; source PlantUML/Mermaid dan penjelasan keterkaitan endpoint tersedia di docs/diagrams. Isi identitas peserta pada sampul sebelum pengumpulan.

| Hasil | Isi |
| --- | --- |
| pengumpulan/01-Kode-Sumber.zip | Source, SQL, tes, README, .http, .vscode dan docs; tanpa node_modules/.env/data DB. |
| pengumpulan/02-Lampiran-Koding.docx | Source yang dapat dibaca/cetak. |
| pengumpulan/03-Laporan-Pengembangan.docx | Laporan editable; isi identitas peserta. |
| pengumpulan/04-Presentasi.pptx | 21 slide demo dengan delapan Instruksi Kerja berurutan; use case, activity, ERD dan catatan presenter. |
| pengumpulan/05-Laporan-Audit-Kompetensi.docx | Baseline audit dengan catatan hasil pelengkapan. |
| pengumpulan/06-Dokumen-Pemesanan-Restoran.docx | Dokumen sistem berdasarkan contoh, dengan use case, activity, ERD dan lima sequence diagram yang sudah terisi. |
| pengumpulan/07-Laporan-Proyek-Waterfall.docx | Laporan baru M. Sidiq Firdaus, NPM 2315061118; Waterfall, error/pemulihan dan test scenario lengkap. |
| pengumpulan/Paket-Pengumpulan.zip | Semua dokumen dan ZIP source, beserta BACA-SAYA. |

Folder docs/audit-2026-10-12 adalah snapshot sebelum pelengkapan. Bukti terbaru: docs/bukti-*.tap, bukti-http.json, HASIL-PELENGKAPAN. Skrip verify.mjs sudah disesuaikan; hasil pengulangan ditulis ke docs/verification-latest agar baseline tidak tertimpa. Jalankan node --env-file-if-exists=.env docs/audit-2026-10-12/verify.mjs bila membutuhkan snapshot verifikasi baru.

## Urutan demonstrasi

1. Tunjukkan kebutuhan, diagram, kode dan tes yang terkait.
2. Start server, cek health, tambah pelanggan.
3. Buat reservasi mendatang/menu; tunjukkan harga server.
4. Coba kapasitas kurang/slot bentrok dan jelaskan transaksi.
5. Update pesanan, hadir, selesai, lalu laporan.
6. Ekspor CSV/JSON server dan cetak/PDF browser.
7. Tunjukkan private state, inheritance dan polymorphism exporter.
8. Debug request dengan breakpoint service/transaction.
9. Jalankan unit/integrasi/rehearsal; jelaskan output/coverage.
10. Tunjukkan dokumentasi/lisensi dan paket sesuai revisi.

Hierarki reservasi buatan, autentikasi, CRUD referensi tambahan dan optimasi lock tidak dipaksakan karena memerlukan kebutuhan/pengujian tersendiri. Alur utama dipertahankan.
