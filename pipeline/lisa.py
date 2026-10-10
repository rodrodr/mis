"""Global Moran's I and local LISA clusters of the MIS (ideo_imp) per election.

Contiguity: rook (municipalities sharing a border arc in the simplified IBGE
2024 TopoJSON), row-standardized. Municipalities without neighbours (e.g.
Fernando de Noronha) and those absent in a given year are left out.
Inference: conditional permutation, 999 draws without replacement (PySAL
"crand" scheme), pseudo p < 0.05; each significant unit is also flagged when it
survives Benjamini-Hochberg FDR control at 0.05 across all units of the year.

Writes sitio/public/data/map/lisa.json and sitio/src/data/moran.json.
Run after build_data.py:  python3 pipeline/lisa.py
"""
from __future__ import annotations

import json
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
TOPO = ROOT / "sitio" / "public" / "data" / "geo" / "municipios.topo.json"
PANEL = ROOT / "Dataverse_Release_v3.0" / "data" / "MIS_Ideology_1994-2026.tab"
ORDER = ROOT / "sitio" / "public" / "data" / "map" / "order.json"
PERM, ALPHA, SEED = 999, 0.05, 20261009


def neighbours():
    topo = json.loads(TOPO.read_text())
    arc_owner = defaultdict(set)

    def walk(rings, gid):
        for ring in rings:
            for a in ring:
                arc_owner[a if a >= 0 else ~a].add(gid)

    for g in topo["objects"]["municipios"]["geometries"]:
        gid = int(g["id"])
        if g["type"] == "Polygon":
            walk(g["arcs"], gid)
        else:
            for poly in g["arcs"]:
                walk(poly, gid)
    nb = defaultdict(set)
    for owners in arc_owner.values():
        owners = list(owners)
        for i in owners:
            for j in owners:
                if i != j:
                    nb[i].add(j)
    return nb


def one_year(args):
    year, codes, values, nb = args
    idx = {c: i for i, c in enumerate(codes)}
    n = len(codes)
    neigh = [[idx[j] for j in nb.get(c, ()) if j in idx] for c in codes]
    has = np.array([len(x) > 0 for x in neigh])
    z = (values - values.mean()) / values.std()
    lag = np.array([z[x].mean() if x else np.nan for x in neigh])
    I_local = z * lag
    # global Moran (row-standardized, over units with neighbours)
    zz = z[has]
    I_glob = float((zz * lag[has]).sum() / (zz ** 2).sum())
    rng = np.random.default_rng(SEED + year)
    # global permutation test
    perm_I = np.empty(PERM)
    for k in range(PERM):
        zp = rng.permutation(z)
        lp = np.array([zp[x].mean() if x else np.nan for x in neigh])
        perm_I[k] = (zp[has] * lp[has]).sum() / (zp[has] ** 2).sum()
    p_glob = float((np.sum(perm_I >= I_glob) + 1) / (PERM + 1))
    # local conditional permutation: one matrix of draws without replacement,
    # reused for every unit (indices >= i shifted by one to skip unit i)
    kmax = max(len(x) for x in neigh)
    prange = rng.random((PERM, n - 1)).argsort(axis=1)[:, :kmax]
    pvals = np.full(n, np.nan)
    for i in range(n):
        k = len(neigh[i])
        if k == 0:
            continue
        draws = prange[:, :k]
        draws = draws + (draws >= i)
        sim = z[i] * z[draws].mean(axis=1)
        if I_local[i] >= 0:
            pvals[i] = (np.sum(sim >= I_local[i]) + 1) / (PERM + 1)
        else:
            pvals[i] = (np.sum(sim <= I_local[i]) + 1) / (PERM + 1)
    # Benjamini-Hochberg threshold
    pv = np.sort(pvals[~np.isnan(pvals)])
    m_tests = len(pv)
    crit = pv[pv <= ALPHA * np.arange(1, m_tests + 1) / m_tests]
    fdr_cut = crit.max() if len(crit) else 0.0
    clusters = np.full(n, -1)
    for i in range(n):
        if np.isnan(pvals[i]):
            continue
        if pvals[i] >= ALPHA:
            c = 0
        elif z[i] > 0 and lag[i] > 0:
            c = 1  # high-high (right cluster)
        elif z[i] < 0 and lag[i] < 0:
            c = 2  # low-low (left cluster)
        elif z[i] > 0:
            c = 3  # high-low outlier
        else:
            c = 4  # low-high outlier
        if c and pvals[i] <= fdr_cut:
            c += 10  # survives FDR
        clusters[i] = c
    return year, I_glob, p_glob, dict(zip(codes, clusters.tolist())), int(has.sum())


def main():
    nb = neighbours()
    d = pd.read_csv(PANEL, sep="\t", usecols=["year", "GEOCODIG_M", "ideo_imp", "national"])
    order = json.loads(ORDER.read_text())
    jobs = []
    for y, q in d.groupby("year"):
        q = q.dropna(subset=["ideo_imp"]).sort_values("GEOCODIG_M")
        jobs.append((int(y), q.GEOCODIG_M.astype(int).tolist(), q.ideo_imp.to_numpy(float), nb))
    with ProcessPoolExecutor(max_workers=min(8, len(jobs))) as ex:
        res = sorted(ex.map(one_year, jobs))
    lisa = {"years": [], "v": [], "legend": {"0": "ns", "1": "HH", "2": "LL", "3": "HL", "4": "LH",
                                             "+10": "also significant under BH-FDR 0.05"},
            "contiguity": "rook", "permutations": PERM, "alpha": ALPHA}
    moran = []
    for year, I, p, cl, n in res:
        lisa["years"].append(year)
        lisa["v"].append([None if cl.get(c, -1) < 0 else cl[c] for c in order])
        s = pd.Series([v for v in cl.values() if v >= 0])
        base, fdr = s % 10, s >= 10
        moran.append({"year": year, "arena": "general" if year % 4 == 2 else "municipal",
                      "I": round(I, 4), "p": round(p, 4), "n": n,
                      **{lab: int((base == code).sum()) for code, lab in [(1, "HH"), (2, "LL"), (3, "HL"), (4, "LH")]},
                      **{lab + "_fdr": int(((base == code) & fdr).sum()) for code, lab in [(1, "HH"), (2, "LL")]}})
        counts = base.value_counts().to_dict()
        print(f"  {year}: Moran's I = {I:.3f} (p = {p:.3f}), HH {counts.get(1, 0)}, LL {counts.get(2, 0)}")
    (ROOT / "sitio" / "public" / "data" / "map" / "lisa.json").write_text(
        json.dumps(lisa, separators=(",", ":")))
    (ROOT / "sitio" / "src" / "data" / "moran.json").write_text(json.dumps(moran, indent=1))


if __name__ == "__main__":
    main()
