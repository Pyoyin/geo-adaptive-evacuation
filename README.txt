WEBGIS SUKABUMI HAZARD-AWARE V2

Perbaikan: boot hanya membutuhkan network + shelter; tidak lagi gagal karena hazard_risk_grid. Ada panel diagnostik. Titik awal membaca hazard/risk dari ruas jalan terdekat. Hazard-aware routing memberi penalti pada ruas berdasarkan hazard dan risk. Tsunami menggunakan elevasi edge/shelter bila tersedia.

Jalankan dari folder yang berisi index.html:
python -m http.server 8000
lalu buka http://localhost:8000

Hapus folder versi lama dan gunakan ZIP ini. Lakukan Ctrl+F5.
