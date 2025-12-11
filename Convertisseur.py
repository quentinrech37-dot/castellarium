import csv
import json
import re
from pathlib import Path

# -------------------------------------------------------------------
# 1) Réglages de base
# -------------------------------------------------------------------

CSV_INPUT = r"C:\Users\Utilisateur\Desktop\Privé\CodeInformatique\AppliChateaux\immeubles_mh.csv"
JSON_OUTPUT = "chateaux.json"


# -------------------------------------------------------------------
# 2) Utilitaires pour les siècles (chiffres romains)
# -------------------------------------------------------------------

def roman(n):
    """Convertit un entier n (1 → I, 16 → XVI...)."""
    vals = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")
    ]
    res = []
    x = n
    for v, sym in vals:
        while x >= v:
            res.append(sym)
            x -= v
    return "".join(res)


ROMAN_MAP = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50,
    'C': 100, 'D': 500, 'M': 1000
}


def roman_to_int(s):
    """Convertit une chaîne de chiffres romains (XVI) en entier (16)."""
    s = s.upper().strip()
    total = 0
    prev = 0
    for ch in reversed(s):
        val = ROMAN_MAP.get(ch, 0)
        if val < prev:
            total -= val
        else:
            total += val
            prev = val
    return total if total > 0 else None


def centuries_from_years(datation_raw):
    """
    À partir d'une chaîne qui contient des années ou des siècles
    (ex : '1513;1521;1560' ou '16e siècle ; 19e s.'),
    renvoie une chaîne comme 'XVIe' ou 'XVIe–XIXe' (ou None si impossible).
    """
    if not datation_raw:
        return None

    txt = datation_raw

    # On récupère tous les nombres
    tokens = re.findall(r"\d+", txt)
    if not tokens:
        return None

    centuries = set()
    for t in tokens:
        n = int(t)
        if n <= 0:
            continue
        if n <= 30:
            # On suppose que c'est directement un siècle (16 → XVIe)
            c = n
        else:
            # Année → siècle correspondant
            c = (n - 1) // 100 + 1
        centuries.add(c)

    if not centuries:
        return None

    centuries = sorted(centuries)
    if len(centuries) == 1:
        return f"{roman(centuries[0])}e"
    return f"{roman(centuries[0])}e–{roman(centuries[-1])}e"


def clean_siecles_from_text(s):
    """
    Extrait des siècles à partir d'un texte du type 'XVIe s. ; XIXe s.'
    et renvoie 'XVIe–XIXe'.
    """
    if not s:
        return None
    txt = s.strip()
    if not txt:
        return None

    # On cherche des groupes de chiffres romains
    matches = re.findall(r"\b([IVXLCDM]+)\b", txt, flags=re.IGNORECASE)
    if not matches:
        # Aucun chiffre romain détecté → on tente le parsing numérique général
        return centuries_from_years(txt)

    centuries = set()
    for m in matches:
        val = roman_to_int(m)
        if val:
            centuries.add(val)

    if not centuries:
        return None

    centuries = sorted(centuries)
    if len(centuries) == 1:
        return f"{roman(centuries[0])}e"
    return f"{roman(centuries[0])}e–{roman(centuries[-1])}e"


def compute_siecles(row):
    """
    Calcule un champ 'siecles' propre, en chiffres romains,
    à partir de :
    - Format_abrege_du_siecle_de_construction
    - Siecle_de_la_campagne_principale_de_construction
    - Siecle_de_campagne_secondaire_de_construction
    - Datation_de_l_edifice (années)
    """
    abr = (row.get("Format_abrege_du_siecle_de_construction") or "").strip()
    if abr:
        txt = clean_siecles_from_text(abr)
        if txt:
            return txt

    princ = (row.get("Siecle_de_la_campagne_principale_de_construction") or "").strip()
    secon = (row.get("Siecle_de_campagne_secondaire_de_construction") or "").strip()
    combined = ";".join(part for part in [princ, secon] if part)
    if combined:
        txt = clean_siecles_from_text(combined)
        if txt:
            return txt

    datation = (row.get("Datation_de_l_edifice") or "").strip()
    txt = centuries_from_years(datation)
    if txt:
        return txt

    return None


# -------------------------------------------------------------------
# 3) Filtre : quoi garder / quoi exclure ?
# -------------------------------------------------------------------

INCLUDE_KEYWORDS = [
    "château", "chateau", "château-fort", "chateau-fort",
    "manoir", "donjon",
    "fort", "forteresse", "citadelle",
    "abbaye", "abbatiale",
    "prieuré", "prieure",
    "monastère", "monastere",
    "chartreuse"
]

EXCLUDE_KEYWORDS = [
    # édifices religieux "simples"
    "église", "eglise",
    "cathédrale", "cathedrale",
    "chapelle",
    "basilique",
    "temple",
    "mosquée", "mosquee",
    "synagogue",

    # antiquité / gallo-romain
    "villa gallo-romaine",
    "site gallo-romain",
    "gallo-romain",
    "gallo romain",
    "thermes gallo-romains",
    "théâtre antique", "theatre antique",
    "amphithéâtre", "amphitheatre",
    "arènes", "arenes",

    # divers
    "dolmen", "menhir", "tumulus",
]


def is_selected_row(row):
    """
    Renvoie True si la ligne doit être gardée (château / abbaye / fort / citadelle...),
    False sinon.
    """
    denom = (row.get("Denomination_de_l_edifice") or "") + " " + \
            (row.get("Titre_editorial_de_la_notice") or "")
    denom_l = denom.lower()

    # Exclusion prioritaire
    if any(kw in denom_l for kw in EXCLUDE_KEYWORDS):
        return False

    # Inclusion si au moins un mot-clé d'inclusion apparaît
    if any(kw in denom_l for kw in INCLUDE_KEYWORDS):
        return True

    # Petit fallback sur la colonne Domaine
    domaine = (row.get("Domaine") or "").lower()
    if any(kw in domaine for kw in INCLUDE_KEYWORDS):
        return True

    return False


# -------------------------------------------------------------------
# 4) Lecture du CSV et génération du JSON
# -------------------------------------------------------------------

def parse_coords(raw):
    """Convertit '47.1234, 2.1234' en {'lat': 47.1234, 'lon': 2.1234}."""
    if not raw:
        return None
    txt = raw.strip()
    if not txt:
        return None

    try:
        parts = [p.strip() for p in txt.split(",")]
        if len(parts) != 2:
            return None
        lat = float(parts[0])
        lon = float(parts[1])
        return {"lat": lat, "lon": lon}
    except Exception:
        return None


def main():
    csv_path = Path(CSV_INPUT)
    if not csv_path.is_file():
        print(f"CSV introuvable : {csv_path}")
        return

    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        print("Colonnes détectées :")
        print(reader.fieldnames)

        results = []
        count_total = 0
        count_selected = 0

        for row in reader:
            count_total += 1

            if not is_selected_row(row):
                continue

            count_selected += 1

            ref = row.get("\ufeffReference") or row.get("Reference") or f"mh-{count_selected}"

            titre = row.get("Titre_editorial_de_la_notice") or \
                    row.get("Denomination_de_l_edifice") or \
                    "Sans titre"
            commune = row.get("Commune_forme_editoriale") or \
                      row.get("Commune_forme_index") or ""
            departement = row.get("Département") or \
                          row.get("Departement_format_numerique") or ""
            region = row.get("Région") or ""

            datation_brute = row.get("Datation_de_l_edifice") or ""
            siecles = compute_siecles(row)
            if siecles is None:
                siecles = "Datation inconnue"

            blocs = []
            if row.get("Historique"):
                blocs.append(row["Historique"].strip())
            if row.get("Description_de_l_edifice"):
                blocs.append(row["Description_de_l_edifice"].strip())
            if row.get("Observations"):
                blocs.append(row["Observations"].strip())
            resume = "\n\n".join(b for b in blocs if b)

            coords = parse_coords(row.get("coordonnees_au_format_WGS84") or "")

            results.append({
                "id": ref,
                "nom": titre,
                "commune": commune,
                "departement": departement,
                "region": region,
                "datation": datation_brute,
                "siecles": siecles,                # ← affichage propre, chiffres romains
                "resume_historique": resume or None,
                "coordonnees": coords
            })

    with open(JSON_OUTPUT, "w", encoding="utf-8") as out:
        json.dump(results, out, ensure_ascii=False, indent=2)

    print(f"\n{count_selected} édifices sélectionnés (sur {count_total} lignes).")
    print(f"Exporté dans {JSON_OUTPUT}")


if __name__ == "__main__":
    main()
