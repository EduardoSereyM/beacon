"""
BEACON PROTOCOL — Genera las marginales objetivo de la ponderación (Censo 2024, 18 años o más)
================================================================================================
Descarga el cuadro oficial D1 del Censo 2024 (INE), calcula las proporciones de la población de
18 años o más por zona, sexo y grupo de edad, y escribe app/core/weighting/data/targets_censo2024.json
con la fuente, el método y el SHA-256 del archivo, para que cualquiera pueda reproducirlo.

Uso (desde backend/):  python scripts/build_weighting_targets.py

Solo librería estándar. El archivo descargado es un dato no confiable: se lee, no se ejecuta.

Supuestos (se publican en la ficha metodológica):
  - El censo agrupa por quinquenios: el grupo «15 a 19» se reparte a 18+ con 2/5 (18 y 19 años).
  - Zonas: Norte (Arica y Parinacota a Coquimbo), Centro (Valparaíso, O'Higgins, Maule),
    Metropolitana, Sur (Ñuble a Magallanes). Se agrupa para que cada categoría tenga
    suficientes votantes; con 16 regiones la compuerta de celdas rara vez se cumpliría.
  - El censo reporta hombres y mujeres; Beacon usa «Masculino» y «Femenino».
"""

import hashlib
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path

URL = "https://censo2024.ine.gob.cl/wp-content/uploads/2025/03/D1_Poblacion-censada-por-sexo-y-edad-en-grupos-quinquenales.xlsx"
PAGE = "https://censo2024.ine.gob.cl/estadisticas/"
OUT = Path(__file__).resolve().parent.parent / "app/core/weighting/data/targets_censo2024.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

ZONES = {
    "Norte": {"15", "1", "2", "3", "4"},
    "Centro": {"5", "6", "7"},
    "Metropolitana": {"13"},
    "Sur": {"16", "8", "9", "14", "10", "11", "12"},
}
ADULT_SHARE_15_19 = 2 / 5     # 18 y 19 años dentro del quinquenio 15 a 19
AGE_BANDS = {
    "18-34": ["15 a 19", "20 a 24", "25 a 29", "30 a 34"],
    "35-54": ["35 a 39", "40 a 44", "45 a 49", "50 a 54"],
    "55+": ["55 a 59", "60 a 64", "65 a 69", "70 a 74", "75 a 79", "80 a 84", "85 o más"],
}
ADULT_GROUPS = [g for bands in AGE_BANDS.values() for g in bands]


def read_sheet(workbook: zipfile.ZipFile, index: int, shared: list[str]) -> list[dict[str, str]]:
    root = ET.fromstring(workbook.read(f"xl/worksheets/sheet{index}.xml"))
    rows = []
    for row in root.iter(f"{{{NS['m']}}}row"):
        cells = {}
        for cell in row.findall("m:c", NS):
            value = cell.find("m:v", NS)
            if value is None:
                continue
            column = re.match(r"[A-Z]+", cell.get("r")).group()
            cells[column] = shared[int(value.text)] if cell.get("t") == "s" else value.text
        if cells:
            rows.append(cells)
    return rows


def adult(group: str, value: int) -> float:
    return value * ADULT_SHARE_15_19 if group == "15 a 19" else float(value)


def normalize(counts: dict[str, float]) -> dict[str, float]:
    total = sum(counts.values())
    shares = {key: round(value / total, 6) for key, value in counts.items()}
    last = list(shares)[-1]
    shares[last] = round(shares[last] + (1 - sum(shares.values())), 6)   # que sumen exactamente 1
    return shares


def main() -> None:
    request = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (compatible; BeaconTargetsBuilder/1.0)"})
    raw = urllib.request.urlopen(request, timeout=60).read()  # noqa: S310 - URL fija y oficial
    workbook = zipfile.ZipFile(BytesIO(raw))
    shared = [
        "".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t"))
        for si in ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("m:si", NS)
    ]
    table = read_sheet(workbook, 4, shared)   # hoja «3»: grupos de edad quinquenales por región

    by_zone: dict[str, float] = {zone: 0.0 for zone in ZONES}
    by_sex = {"Masculino": 0.0, "Femenino": 0.0}
    by_age: dict[str, float] = {band: 0.0 for band in AGE_BANDS}
    seen_regions: set[str] = set()
    for row in table:
        code, group = row.get("A", ""), row.get("C", "")
        if code in ("", "0") or group not in ADULT_GROUPS or not row.get("D", "").isdigit():
            continue
        seen_regions.add(code)
        total, men, women = (adult(group, int(row[col])) for col in ("D", "E", "F"))
        zone = next(name for name, codes in ZONES.items() if code in codes)
        by_zone[zone] += total
        by_sex["Masculino"] += men
        by_sex["Femenino"] += women
        by_age[next(band for band, groups in AGE_BANDS.items() if group in groups)] += total

    assert len(seen_regions) == 16, f"se esperaban 16 regiones, hay {len(seen_regions)}"
    assert abs(sum(by_zone.values()) - sum(by_age.values())) < 1e-6
    assert abs(sum(by_zone.values()) - sum(by_sex.values())) < 1e-6

    output = {
        "version": "censo2024-18plus-v1",
        "source": "INE, Censo de Población y Vivienda 2024, cuadro D1 «Población censada por sexo y edad en grupos quinquenales» (publicado el 27-mar-2025)",
        "source_url": URL,
        "source_page": PAGE,
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "generated_on": date.today().isoformat(),
        "universe": "Población censada de 18 años o más (el quinquenio 15-19 se reparte 2/5)",
        "adult_population": round(sum(by_zone.values())),
        "counts": {
            "zone": {k: round(v) for k, v in by_zone.items()},
            "sex": {k: round(v) for k, v in by_sex.items()},
            "age": {k: round(v) for k, v in by_age.items()},
        },
        "marginals": {"zone": normalize(by_zone), "sex": normalize(by_sex), "age": normalize(by_age)},
    }
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output["marginals"], ensure_ascii=False, indent=2))
    print("población 18+:", output["adult_population"])


if __name__ == "__main__":
    main()
