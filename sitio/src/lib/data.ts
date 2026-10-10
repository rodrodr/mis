// Build-time data from the pipeline (sitio/src/data, written by pipeline/build_data.py).
import nationalJson from '../data/national.json';
import statesJson from '../data/states.json';
import regionsJson from '../data/regions.json';
import partiesJson from '../data/parties.json';
import partyVotesJson from '../data/party_votes.json';
import counterfactualJson from '../data/counterfactual.json';
import moranJson from '../data/moran.json';
import verificationJson from '../data/verification.json';

export type Arena = 'general' | 'municipal';
export interface YearRow {
  year: number; arena: Arena; president: string; n: number; provisional: boolean;
  mis_mean: number; mis_wmean: number; mis_sd: number; mis_q: number[]; mis_na_mean: number;
  share_left: number; share_bins: number[]; hist: number[];
  dalton_mean: number; dalton_wmean: number; pol_pi_mean: number; er_mean: number; ss_mean: number;
  range_mean: number; centrif_mean: number; enep_mean: number; enep_wmean: number; fragi_mean: number;
  conc_mean: number; maxprop_mean: number; turnout_mean: number; valid_votes: number; electorate: number;
  fem_votes: number; male_votes: number; fem_share_agg: number; fem_share_mean: number;
  misM_mean: number; misF_mean: number; gap_mean: number; misM_agg: number; misF_agg: number;
  gender_na: number; gender_imputed_mean: number; rebuilt: number;
}
export interface UnitRow {
  year: number; n: number; mis_mean: number; mis_wmean: number; dalton_mean: number; dalton_wmean: number;
  enep_mean: number; fem_share_agg: number | null; misF_agg: number | null; misM_agg: number | null;
  gap_agg: number | null; fem_votes: number;
}
export interface Party {
  year: number; num: number; sigla: string; name: string; wave: number; criteria: string;
  theta: number; se: number; imputed: number;
}

export const national = nationalJson as { hist_bins: number[]; years: YearRow[] };
export const years = national.years;
export const general = years.filter((y) => y.arena === 'general');
export const municipal = years.filter((y) => y.arena === 'municipal');
export const byYear = Object.fromEntries(years.map((y) => [y.year, y])) as Record<number, YearRow>;
export const states = statesJson as Record<string, UnitRow[]>;
export const regions = regionsJson as Record<string, UnitRow[]>;
export const parties = partiesJson as Party[];
export const partyVotes = partyVotesJson as { year: number; num: number; sigla: string; theta: number; votes: number; fem: number; male: number }[];
export const counterfactual = counterfactualJson as {
  status: string; lineage: Record<string, Record<string, number>>;
  national: { from: number; to: number; arena: Arena; n: number; d_mis_mean: number; vote_mean: number; place_mean: number; entry_mean: number; vote_wmean: number; place_wmean: number; entry_wmean: number }[];
  dalton_fixed: { year: number; base_placements: number; arena: Arena; dalton_actual: number; dalton_fixed: number }[];
};
export const moran = moranJson as { year: number; arena: Arena; I: number; p: number; n: number; HH: number; LL: number; HL: number; LH: number; HH_fdr: number; LL_fdr: number }[];
export const verification = verificationJson as { report: { var: string; n: number; r: number; max_abs_diff: number; p999_abs_diff: number; pass: boolean }[]; rows: number; municipalities: number; micro_rows: number; release: string; r_na_imp: number };

export const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul',
  SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};

const pick = <T,>(arr: T[], f: (x: T) => number, dir: 1 | -1) =>
  arr.reduce((a, b) => (dir * (f(b) - f(a)) > 0 ? b : a));

/** Derived facts used in prose; every number in the copy comes from here. */
export const facts = (() => {
  const last = years[years.length - 1];
  const genMin = pick(general, (y) => y.mis_mean, -1);
  const genMax = pick(general, (y) => y.mis_mean, 1);
  const munMin = pick(municipal, (y) => y.mis_mean, -1);
  const munMax = pick(municipal, (y) => y.mis_mean, 1);
  const munLast = municipal[municipal.length - 1];
  const munFirst = municipal[0];
  const munRebound = pick(municipal.filter((y) => y.year > munMin.year), (y) => y.mis_mean, 1);
  const genFirst = general[0];
  const munPrev = municipal[municipal.length - 2];
  const daltonMax = pick(years, (y) => y.dalton_mean, 1);
  const daltonMin = pick(years, (y) => y.dalton_mean, -1);
  const gapGen = general.map((y) => y.gap_mean);
  const gapMun = municipal.map((y) => y.gap_mean);
  const leftMax = pick(years, (y) => y.share_left, 1);
  const leftMin = pick(years, (y) => y.share_left, -1);
  const moranGen = moran.filter((m) => m.arena === 'general');
  const moranMax = pick(moran, (m) => m.I, 1);
  const moranMin = pick(moran, (m) => m.I, -1);
  const bigGap = pick(years, (y) => y.mis_mean - y.mis_wmean, 1);
  const enepDrop = { from: byYear[2016], to: byYear[2020] };
  // state movers in general elections, first to last, electorate-weighted
  const g0 = general[0].year, g1 = last.year;
  const movers = Object.entries(states)
    .map(([uf, rows]) => {
      const a = rows.find((r) => r.year === 2010), b = rows.find((r) => r.year === g1);
      return a && b ? { uf, from: a.mis_wmean, to: b.mis_wmean, d: b.mis_wmean - a.mis_wmean } : null;
    })
    .filter(Boolean) as { uf: string; from: number; to: number; d: number }[];
  movers.sort((a, b) => b.d - a.d);
  return {
    last, genMin, genMax, munMin, munMax, munLast, munPrev, munFirst, munRebound, genFirst, daltonMax, daltonMin,
    gapGenMin: Math.min(...gapGen), gapGenMax: Math.max(...gapGen),
    gapMunMin: Math.min(...gapMun), gapMunMax: Math.max(...gapMun),
    leftMax, leftMin, moranGen, moranMax, moranMin, bigGap, enepDrop, movers, g0, g1,
    municipalities: verification.municipalities, rows: verification.rows,
  };
})();
