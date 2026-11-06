"""Build the site's data from the MIS v3.0 release.

Reads Dataverse_Release_v3.0/ (read-only), verifies the variables the site
exposes against the party microdata, and writes:

  sitio/src/data/*.json     small aggregates used at build time (figures, text)
  sitio/public/data/...     files fetched by the islands (map values, profiles)

Run:  python3 pipeline/build_data.py
The script exits with status 1 if a verification check fails.
"""
from __future__ import annotations

import json
import math
import re
import shutil
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REL = ROOT / "Dataverse_Release_v3.0" / "data"
SRC_DATA = ROOT / "sitio" / "src" / "data"
PUB_DATA = ROOT / "sitio" / "public" / "data"
CACHE = ROOT / "pipeline" / ".cache"
K = ["year", "GEOCODIG_M"]

# Years whose data are provisional (none since the final TSE 2026 results, November 2026)
PROVISIONAL_YEARS: set = set()
GENERAL = [1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026]
MUNICIPAL = [1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024]
YEARS = sorted(GENERAL + MUNICIPAL)
REGION = {"1": "N", "2": "NE", "3": "SE", "4": "S", "5": "CO"}
# Incumbent president at each election (Methodological Notes §5).
PRESIDENT = {1994: "Itamar", 1996: "FHC", 1998: "FHC", 2000: "FHC", 2002: "FHC",
             2004: "Lula", 2006: "Lula", 2008: "Lula", 2010: "Lula",
             2012: "Dilma", 2014: "Dilma", 2016: "Temer", 2018: "Temer",
             2020: "Bolsonaro", 2022: "Bolsonaro", 2024: "Lula", 2026: "Lula"}
FEMALE_VOTE_THRESHOLD = 300


# ---------------------------------------------------------------- helpers
def r(x, nd=4):
    """Round for JSON; NaN -> None."""
    if x is None:
        return None
    try:
        if isinstance(x, (float, np.floating)) and (math.isnan(x) or math.isinf(x)):
            return None
    except TypeError:
        pass
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        return round(float(x), nd)
    return x


def dump(obj, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def wavg(v, w):
    v, w = np.asarray(v, float), np.asarray(w, float)
    ok = ~np.isnan(v) & ~np.isnan(w) & (w > 0)
    return float((v[ok] * w[ok]).sum() / w[ok].sum()) if ok.any() else np.nan


# ---------------------------------------------------------------- load
def load():
    d = pd.read_csv(REL / "MIS_Ideology_1994-2026.tab", sep="\t", low_memory=False)
    CACHE.mkdir(parents=True, exist_ok=True)
    micro_csv = CACHE / "MIS_Ideology_party_data_1994-2026.csv"
    zpath = REL / "MIS_Ideology_party_data_1994-2026.zip"
    if not micro_csv.exists() or micro_csv.stat().st_mtime < zpath.stat().st_mtime:
        with zipfile.ZipFile(zpath) as z:
            z.extract("MIS_Ideology_party_data_1994-2026.csv", CACHE)
    m = pd.read_csv(micro_csv, low_memory=False)
    p = pd.read_csv(REL / "partidos_ano_1994_2026_completo_imputado.tab", sep="\t")
    return d, m, p


# ---------------------------------------------------------------- verify
def verify(d, m):
    """Recompute the exposed variables from the microdata; fail on mismatch."""
    mm = m[m.qtde_votos > 0].copy()
    g = mm.groupby(K)
    rec = pd.DataFrame({
        "rc_ideo_imp": g.id_contr_imp.sum(),
        "rc_enep": 1 / g.prop_votos.apply(lambda s: (s ** 2).sum()),
    })
    mm["s"] = mm.qtde_votos / g.qtde_votos.transform("sum")
    mm["mis"] = (mm.s * mm.IDEO_IMPUTED).groupby([mm.year, mm.GEOCODIG_M]).transform("sum")
    mm["dev"] = mm.s * (mm.IDEO_IMPUTED - mm.mis) ** 2
    rec["rc_dalton"] = np.sqrt(mm.groupby(K).dev.sum())
    gm = mm.assign(fm=mm.votes_female * mm.IDEO_IMPUTED, ml=mm.votes_male * mm.IDEO_IMPUTED).groupby(K)
    s = gm[["fm", "ml", "votes_female", "votes_male"]].sum()
    rec["rc_misF"] = s.fm / s.votes_female
    rec["rc_misM"] = s.ml / s.votes_male
    x = d.set_index(K).join(rec)
    checks = [("ideo_imp", "rc_ideo_imp", 0.005), ("enep", "rc_enep", 0.05),
              ("pol_dalton_norm", "rc_dalton", 0.025), ("MIS_Female", "rc_misF", 1e-3),
              ("MIS_Male", "rc_misM", 1e-3)]
    report, ok_all = [], True
    for var, col, tol in checks:
        ok = x[var].notna() & x[col].notna()
        diff = (x.loc[ok, var] - x.loc[ok, col]).abs()
        corr = float(np.corrcoef(x.loc[ok, var], x.loc[ok, col])[0, 1])
        passed = corr > 0.999 and diff.quantile(0.999) <= tol
        ok_all &= passed
        report.append({"var": var, "n": int(ok.sum()), "r": round(corr, 6),
                       "max_abs_diff": round(float(diff.max()), 5),
                       "p999_abs_diff": round(float(diff.quantile(0.999)), 5), "pass": bool(passed)})
    for row in report:
        print(f"  verify {row['var']:16s} r={row['r']:.6f} p99.9={row['p999_abs_diff']:.5f} "
              f"{'OK' if row['pass'] else 'FAIL'}")
    return ok_all, report


# ---------------------------------------------------------------- aggregates
def arena(y):
    return "general" if y in GENERAL else "municipal"


def national(d):
    rows = []
    bins = np.round(np.arange(-1.0, 1.0001, 0.05), 2)
    for y, q in d.groupby("year"):
        fv, mv = q.votes_female.sum(), q.votes_male.sum()
        hist, _ = np.histogram(q.ideo_imp.clip(-0.999, 0.999), bins=bins)
        qs = q.ideo_imp.quantile([0.1, 0.25, 0.5, 0.75, 0.9]).values
        rows.append({
            "year": int(y), "arena": arena(y), "president": PRESIDENT[y], "n": int(len(q)),
            "provisional": bool(y in PROVISIONAL_YEARS),
            "mis_mean": r(q.ideo_imp.mean()), "mis_wmean": r(wavg(q.ideo_imp, q.tot_votos)),
            "mis_sd": r(q.ideo_imp.std()), "mis_q": [r(v) for v in qs],
            "mis_na_mean": r(q.ideo_na.mean()),
            "share_left": r((q.ideo_imp < 0).mean()),
            "share_bins": [r(((q.ideo_imp >= lo) & (q.ideo_imp < hi)).mean())
                           for lo, hi in [(-2, -0.2), (-0.2, 0), (0, 0.2), (0.2, 0.4), (0.4, 2)]],
            "hist": hist.tolist(),
            "dalton_mean": r(q.pol_dalton_norm.mean() * 10, 3),
            "dalton_wmean": r(wavg(q.pol_dalton_norm, q.tot_votos) * 10, 3),
            "pol_pi_mean": r(q.pol_pi.mean(), 3),
            "er_mean": r(q.pol_esteban_ray.mean()), "ss_mean": r(q.pol_sani_sarto2.mean()),
            "range_mean": r(q.pol_range.mean()), "centrif_mean": r(q.pol_centrif.mean()),
            "enep_mean": r(q.enep.mean(), 3), "enep_wmean": r(wavg(q.enep, q.tot_votos), 3),
            "fragi_mean": r(q.fragi.mean(), 3), "conc_mean": r(q.conc.mean()),
            "maxprop_mean": r(q.max_prop.mean()), "turnout_mean": r(q.turnout.mean()),
            "valid_votes": int(q.tot_votos.sum()), "electorate": int(q.qtde_eleitores.sum()),
            "fem_votes": int(fv), "male_votes": int(mv),
            "fem_share_agg": r(fv / (fv + mv)), "fem_share_mean": r(q.prop_female_votes.mean()),
            "misM_mean": r(q.MIS_Male.mean()), "misF_mean": r(q.MIS_Female.mean()),
            "gap_mean": r(q.MIS_Gender_Gap.mean()),
            "misM_agg": r(wavg(q.MIS_Male, q.votes_male)), "misF_agg": r(wavg(q.MIS_Female, q.votes_female)),
            "gender_na": int(q.MIS_Gender_Gap.isna().sum()),
            "gender_imputed_mean": r(q.gender_imputed_share.mean()),
            "rebuilt": int(q.rebuilt_tse.sum()),
        })
    return {"hist_bins": bins.tolist(), "years": rows}


def by_unit(d, key):
    out = {}
    for (u, y), q in d.groupby([key, "year"]):
        fv, mv = q.votes_female.sum(), q.votes_male.sum()
        out.setdefault(str(u), []).append({
            "year": int(y), "n": int(len(q)),
            "mis_mean": r(q.ideo_imp.mean()), "mis_wmean": r(wavg(q.ideo_imp, q.tot_votos)),
            "dalton_mean": r(q.pol_dalton_norm.mean() * 10, 3),
            "dalton_wmean": r(wavg(q.pol_dalton_norm, q.tot_votos) * 10, 3),
            "enep_mean": r(q.enep.mean(), 3),
            "fem_share_agg": r(fv / (fv + mv)) if fv + mv > 0 else None,
            "misF_agg": r(wavg(q.MIS_Female, q.votes_female)),
            "misM_agg": r(wavg(q.MIS_Male, q.votes_male)),
            "gap_agg": r(wavg(q.MIS_Female, q.votes_female) - wavg(q.MIS_Male, q.votes_male)),
            "fem_votes": int(fv),
        })
    return out


def parties_table(p):
    rows = []
    for _, q in p.sort_values(["ANO_ELEICAO", "IDEOLOGY"]).iterrows():
        rows.append({"year": int(q.ANO_ELEICAO), "num": int(q.NUM_PART), "sigla": q.SIGLA_PARTIDO,
                     "name": q.NOME_PARTIDO, "wave": int(q.BLS_YEAR), "criteria": q.CRITERIA,
                     "theta": r(q.IDEOLOGY), "se": r(q["IDEO.SE"]), "imputed": int(q.imputed)})
    return rows


def national_party_votes(m, p):
    """National vote and gender totals per party and year (for figures G4, E7)."""
    g = m.groupby(["year", "party"]).agg(v=("qtde_votos", "sum"), vf=("votes_female", "sum"),
                                         vm=("votes_male", "sum"), th=("IDEO_IMPUTED", "first")).reset_index()
    sig = p.set_index(["ANO_ELEICAO", "NUM_PART"]).SIGLA_PARTIDO
    out = []
    for _, q in g.iterrows():
        out.append({"year": int(q.year), "num": int(q.party), "sigla": sig.get((q.year, q.party), str(q.party)),
                    "theta": r(q.th), "votes": int(q.v), "fem": int(q.vf), "male": int(q.vm)})
    return out


# ---------------------------------------------------------------- shift-share
# Party lineage between consecutive elections of the same arena: {(a, b): {num_a: num_b}}.
# Mergers and renumberings documented in the Methodological Notes v3.0 (§5, office-holder
# lineage) and TSE party registry. Numbers not listed continue under the same number.
LINEAGE = {
    (2000, 2004): {18: 22, 30: 22, 41: 14},          # PST, PGT -> PL; historical PSD -> PTB
    (2002, 2006): {18: 22, 30: 22, 41: 14, 56: 22},  # + PRONA -> PR
    (2004, 2008): {56: 22, 26: 14},                  # PRONA -> PR; PAN -> PTB
    (2006, 2010): {56: 22, 26: 14},
    (2016, 2020): {31: 19, 44: 51, 54: 65},          # PHS -> PODE; PRP -> PATRIOTA; PPL -> PCdoB
    (2018, 2022): {31: 19, 44: 51, 54: 65, 17: 44, 25: 44},  # + PSL, DEM -> UNIAO
    (2020, 2024): {17: 44, 25: 44, 14: 25, 51: 25, 19: 20, 90: 77},  # PTB, PATRIOTA -> PRD; PODE 19 -> 20; PROS -> SD
    (2022, 2026): {14: 25, 51: 25, 19: 20, 90: 77},
}


def _pair_frame(sh, a, b):
    """Party shares and scores of elections a and b, with year-a parties mapped to
    their year-b successor. Merged predecessors are summed; their score is the
    share-weighted mean, so sum(s*theta) is preserved exactly."""
    lin = LINEAGE.get((a, b), {})
    A = sh[sh.year == a].copy()
    A["party"] = A.party.map(lambda n: lin.get(n, n))
    A["c"] = A.s * A.th
    A = A.groupby(["GEOCODIG_M", "party"], as_index=False)[["s", "c"]].sum()
    A["th"] = np.where(A.s > 0, A.c / A.s.where(A.s > 0, 1), np.nan)
    B = sh[sh.year == b][["GEOCODIG_M", "party", "s", "th"]]
    x = A[["GEOCODIG_M", "party", "s", "th"]].merge(B, on=["GEOCODIG_M", "party"], how="outer",
                                                    suffixes=("0", "1"))
    x["s0"] = x.s0.fillna(0)
    x["s1"] = x.s1.fillna(0)
    return x


def shift_share(m, d):
    """Exact decomposition of the change in MIS between consecutive elections of
    the same arena into three terms (definition approved by the authors as
    experimental, 2026-10-09):
      vote  = sum over continuing parties of (s1 - s0) * mean(theta0, theta1)
      place = sum over continuing parties of mean(s0, s1) * (theta1 - theta0)
              (includes the rescaling of IDEOLOGY to [-1, 1] within each BLS wave)
      entry = sum over parties present in only one election of (s1*theta1 - s0*theta0)
    vote + place + entry = MIS_b - MIS_a, using the release's 3-decimal shares.
    """
    pairs = [(a, b) for seq in (GENERAL, MUNICIPAL) for a, b in zip(seq, seq[1:])]
    sh = m[["year", "GEOCODIG_M", "party", "prop_votos", "IDEO_IMPUTED"]].rename(
        columns={"prop_votos": "s", "IDEO_IMPUTED": "th"})
    nat, muni = [], {}
    w = d.set_index(K).tot_votos
    for a, b in pairs:
        x = _pair_frame(sh, a, b)
        both = x.th0.notna() & x.th1.notna()
        thb = (x.th0 + x.th1) / 2
        x["vote"] = np.where(both, (x.s1 - x.s0) * thb, 0.0)
        x["place"] = np.where(both, (x.s0 + x.s1) / 2 * (x.th1 - x.th0), 0.0)
        x["entry"] = np.where(both, 0.0, x.s1 * x.th1.fillna(0) - x.s0 * x.th0.fillna(0))
        t = x.groupby("GEOCODIG_M")[["vote", "place", "entry"]].sum()
        t = t[t.index.isin(d[d.year == a].GEOCODIG_M) & t.index.isin(d[d.year == b].GEOCODIG_M)]
        mis = d.set_index(K).ideo_imp
        dm = mis.xs(b, level="year").reindex(t.index) - mis.xs(a, level="year").reindex(t.index)
        resid = (t.sum(axis=1) - dm).abs()
        assert resid.quantile(0.99) < 0.01, f"shift-share does not add up {a}->{b}: {resid.max()}"
        wt = w.xs(b, level="year").reindex(t.index)
        nat.append({"from": a, "to": b, "arena": arena(b), "n": int(len(t)),
                    "d_mis_mean": r(dm.mean()), "vote_mean": r(t.vote.mean()),
                    "place_mean": r(t.place.mean()), "entry_mean": r(t.entry.mean()),
                    "vote_wmean": r(wavg(t.vote, wt)), "place_wmean": r(wavg(t.place, wt)),
                    "entry_wmean": r(wavg(t.entry, wt))})
        for code, q in t.iterrows():
            muni.setdefault(int(code), []).append([b, r(q.vote, 4), r(q.place, 4), r(q.entry, 4)])
    return nat, muni


def dalton_fixed_placements(m, p):
    """Counterfactual Dalton: each election scored with the placements of the
    previous election of the same arena (lineage applied; merged successors take
    the mean of their predecessors; parties without a predecessor keep their own
    score). Experimental; includes the per-wave rescaling caveat."""
    pairs = [(a, b) for seq in (GENERAL, MUNICIPAL) for a, b in zip(seq, seq[1:])]
    th = p.set_index(["ANO_ELEICAO", "NUM_PART"]).IDEOLOGY
    out = []
    for a, b in pairs:
        lin = LINEAGE.get((a, b), {})
        prev = th.xs(a, level=0)
        succ = {}
        for num, val in prev.items():
            succ.setdefault(lin.get(num, num), []).append(val)
        prev_b = {k: float(np.mean(v)) for k, v in succ.items()}
        q = m[(m.year == b) & (m.qtde_votos > 0)].copy()
        q["thc"] = q.party.map(prev_b).fillna(q.IDEO_IMPUTED)
        q["s"] = q.qtde_votos / q.groupby("GEOCODIG_M").qtde_votos.transform("sum")
        for col, name in [("IDEO_IMPUTED", "act"), ("thc", "cf")]:
            mu = (q.s * q[col]).groupby(q.GEOCODIG_M).transform("sum")
            q["dev_" + name] = q.s * (q[col] - mu) ** 2
        dd = q.groupby("GEOCODIG_M")[["dev_act", "dev_cf"]].sum().pipe(np.sqrt)
        out.append({"year": b, "base_placements": a, "arena": arena(b),
                    "dalton_actual": r(dd.dev_act.mean() * 10, 3),
                    "dalton_fixed": r(dd.dev_cf.mean() * 10, 3)})
    return out


# ---------------------------------------------------------------- names
_PARTICLES = {"de", "da", "do", "das", "dos", "e"}


def pt_name(s: str) -> str:
    """IBGE names arrive title-cased ("Juiz De Fora", "Alta Floresta D'Oeste");
    Portuguese particles are lower case except as the first word."""
    words = s.split(" ")
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if i > 0 and lw in _PARTICLES:
            out.append(lw)
        elif i > 0 and re.match(r"^d'", lw):
            out.append("d'" + w[2:])
        else:
            out.append(w)
    return " ".join(out)


# ---------------------------------------------------------------- per municipality
SERIES = {
    "ideo": "ideo_imp", "ideo_na": "ideo_na", "dalton": "pol_dalton_norm", "enep": "enep",
    "fragi": "fragi", "conc": "conc", "maxp": "max_prop", "turnout": "turnout",
    "fem": "prop_female_votes", "misM": "MIS_Male", "misF": "MIS_Female", "gap": "MIS_Gender_Gap",
    "fv": "votes_female", "mv": "votes_male", "gimp": "gender_imputed_share",
    "pref": "pref", "ideopref": "ideopref", "gov": "gov", "ideogov": "ideogov",
    "dmp": "dmp", "elect": "qtde_eleitores", "votes": "tot_votos", "rebuilt": "rebuilt_tse",
}


def municipality_files(d, m, ss_muni, regions, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    parts = m[m.prop_votos > 0][["GEOCODIG_M", "year", "party", "prop_votos"]]
    parts_g = dict(tuple(parts.groupby("GEOCODIG_M")))
    groups = list(d.sort_values("year").groupby("GEOCODIG_M"))

    def one(item):
        code, q = item
        first = q.iloc[-1]
        rec = {"c": int(code), "n": pt_name(first.ibge_name), "uf": first.uf,
               "rg": REGION[str(code)[0]], "ri": regions.get(int(code), {}).get("ri"),
               "y": q.year.astype(int).tolist(), "s": {}}
        for k, col in SERIES.items():
            nd = 0 if k in ("fv", "mv", "pref", "gov", "dmp", "elect", "votes", "rebuilt") else 4
            rec["s"][k] = [r(v, nd) if nd else (None if pd.isna(v) else int(v)) for v in q[col]]
        pp = parts_g.get(code)
        if pp is not None:
            # [year, party number, vote share (3 decimals, as in the release)]
            rec["p"] = [[int(y), int(n), round(float(s), 3)]
                        for _, y, n, s in pp.itertuples(index=False, name=None)]
        rec["ss"] = ss_muni.get(int(code), [])
        dump(rec, out_dir / f"{int(code)}.json")
        return 1

    with ThreadPoolExecutor(max_workers=12) as ex:
        n = sum(ex.map(one, groups))
    return n


def municipality_index(d, regions):
    last = d.sort_values("year").groupby("GEOCODIG_M").last()
    rows = []
    for code, q in last.iterrows():
        rows.append([int(code), pt_name(q.ibge_name), q.uf, REGION[str(code)[0]],
                     regions.get(int(code), {}).get("ri_code"), int(q.qtde_eleitores)])
    return rows


# ---------------------------------------------------------------- map arrays
MAP_VARS = {"ideo": ("ideo_imp", 1000), "dalton": ("pol_dalton_norm", 1000), "enep": ("enep", 100),
            "fem": ("prop_female_votes", 1000), "gap": ("MIS_Gender_Gap", 1000),
            "misF": ("MIS_Female", 1000), "misM": ("MIS_Male", 1000), "fv": ("votes_female", 1),
            "ideopref": ("ideopref", 1000), "votes": ("tot_votos", 1)}


def map_arrays(d, order):
    pos = {c: i for i, c in enumerate(order)}
    res = {}
    for key, (col, scale) in MAP_VARS.items():
        mat = []
        for y in YEARS:
            arr = [None] * len(order)
            q = d[d.year == y]
            for c, v in zip(q.GEOCODIG_M, q[col]):
                if not pd.isna(v):
                    arr[pos[c]] = int(round(float(v) * scale))
            mat.append(arr)
        res[key] = {"scale": scale, "years": YEARS, "v": mat}
    return res


# ---------------------------------------------------------------- main
def immediate_regions():
    path = ROOT / "geo" / "raw" / "localidades_municipios.json"
    if not path.exists():
        return {}, {}
    data = json.loads(path.read_text(encoding="utf-8"))
    out, names = {}, {}
    for mu in data:
        ri = mu.get("regiao-imediata") or {}
        if ri:
            out[int(mu["id"])] = {"ri": ri.get("nome"), "ri_code": int(ri["id"])}
            names[int(ri["id"])] = ri.get("nome")
    return out, names


def main():
    print("Loading release …")
    d, m, p = load()
    print(f"  panel {d.shape}, micro {m.shape}, parties {p.shape}")
    print("Verifying against microdata …")
    ok, report = verify(d, m)
    if not ok:
        print("VERIFICATION FAILED")
        sys.exit(1)
    regions, ri_names = immediate_regions()
    d["region"] = d.GEOCODIG_M.astype(str).str[0].map(REGION)
    d["ri_code"] = d.GEOCODIG_M.map(lambda c: regions.get(int(c), {}).get("ri_code"))

    print("Aggregates …")
    dump(national(d), SRC_DATA / "national.json")
    st = by_unit(d, "uf")
    dump(st, SRC_DATA / "states.json")
    dump(st, PUB_DATA / "states.json")
    dump(by_unit(d, "region"), SRC_DATA / "regions.json")
    if regions:
        dump({"names": {str(k): v for k, v in ri_names.items()}, "series": by_unit(d.dropna(subset=["ri_code"]).assign(ri_code=lambda q: q.ri_code.astype(int)), "ri_code")},
             PUB_DATA / "immediate_regions.json")
    dump(parties_table(p), SRC_DATA / "parties.json")
    pm = {}
    for _, q in p.iterrows():
        pm.setdefault(str(int(q.ANO_ELEICAO)), {})[str(int(q.NUM_PART))] = [q.SIGLA_PARTIDO, r(q.IDEOLOGY), int(q.imputed), r(q["IDEO.SE"]), q.CRITERIA, int(q.BLS_YEAR)]
    dump(pm, PUB_DATA / "parties_min.json")
    dump(national_party_votes(m, p), SRC_DATA / "party_votes.json")
    print("Shift-share …")
    ss_nat, ss_muni = shift_share(m, d)
    dump({"status": "experimental", "lineage": {f"{a}-{b}": v for (a, b), v in LINEAGE.items()}, "national": ss_nat,
          "dalton_fixed": dalton_fixed_placements(m, p)}, SRC_DATA / "counterfactual.json")
    dump({"report": report, "release": "MIS v3.0 (Dataverse doi:10.7910/DVN/8USPML)",
          "rows": int(len(d)), "municipalities": int(d.GEOCODIG_M.nunique()),
          "micro_rows": int(len(m)), "r_na_imp": round(float(d.ideo_na.corr(d.ideo_imp)), 3)},
         SRC_DATA / "verification.json")

    order = sorted(int(c) for c in d.GEOCODIG_M.unique())
    dump(municipality_index(d, regions), PUB_DATA / "municipalities.json")
    print("Map arrays …")
    arrays = map_arrays(d, order)
    for k, v in arrays.items():
        dump({"order": order if k == "ideo" else None, **v}, PUB_DATA / "map" / f"{k}.json")
    dump(order, PUB_DATA / "map" / "order.json")
    print("Municipality files …")
    mdir = PUB_DATA / "m"
    if mdir.exists():
        shutil.rmtree(mdir)
    n = municipality_files(d, m, ss_muni, regions, mdir)
    print(f"  wrote {n} municipality files")
    print("Done.")


if __name__ == "__main__":
    main()
