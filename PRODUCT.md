# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro (static output) + islands without a framework, following the maestro-diseno-web kit (copied to `kit/`). Deployed to GitHub Pages, repository `rodrodr/mis`, `base: '/mis'`. **Nothing is uploaded or published until the user says so.**

Surface types (for `kit/verificar.py --tipo`):
- `/mapa/`, the municipality profile and the comparator: `app` (Operate, ≤ 100 kB critical JS gz).
- Evolution, Polarization, Gender, Methodology, Data: `datos` (Read, ≤ 50 kB on the reading path; Experience only in the signature moment).

Data pipeline in Python (`pipeline/`) reads `Dataverse_Release_v3.0/` (read-only) and writes the site's data. The build fails if any recomputed figure does not match the release.

## Users

Mixed audience. A narrative front door for journalists, students and the general public, with layers of depth for political scientists who explore, compare municipalities and download data.

- **General reader:** wants to know how and where Brazil's local electorates moved left or right since 1994.
- **Researcher:** wants trajectories for specific municipalities, spatial patterns, polarization and gender measures, and the exact method and citation.

## Product Purpose

An interactive companion to the Municipal Ideological Score (MIS) v3.0 dataset (Power & Rodrigues-Silveira; Harvard Dataverse doi:10.7910/DVN/8USPML). It shows the temporal and spatial evolution of ideology in all 5,571 Brazilian municipalities across 17 elections (1994–2026). It also covers polarization (Dalton), party-system fragmentation and candidate-gender disaggregation.

Success: a reader can understand the national story in a few minutes, find any municipality and read its profile, and a researcher can trust, cite and download every number shown.

## Positioning

It is the only municipal-level, 32-year, survey-anchored (Brazilian Legislative Survey) measure of local ideology in Brazil. The site is built by the dataset's own authors, directly from the deposited files, with every figure reproducible from the release.

## Operating Context

- Readers arrive from the BPSR 2019 article, the Dataverse deposit, academic talks, and the press.
- The site is used alongside the Dataverse files: the methodology section must agree with the Methodological Notes v3.0.
- Researchers use the site to choose cases, compare municipalities and download data.

## Capabilities and Constraints

- **Languages:** English (source language and site root `/`), Portuguese and Spanish (translations). Number formatting per locale.
- **Names:** "Municipal Ideological Score" (EN), "Índice de Ideologia Municipal" (PT), "Índice Ideológico Municipal" (ES). Acronym MIS in all three.
- **Sections:** Evolution, Map, Municipalities (search + profile + comparator), Polarization, Gender, Methodology, Data.
- **Two electoral arenas:** general elections (Federal Deputy) and municipal elections (city council) are always shown as separate series, never one line across 17 cycles.
- **Two national averages,** always labelled: the typical municipality (unweighted) and the electorate (vote-weighted).
- **Dalton:** = `pol_dalton_norm`, shown ×10 (0–10). `pol_pi` appears only in Methodology, as the legacy MIS specification.
- **Gender maps:** municipalities with < 300 female nominal votes are hatched as "few votes". A toggle aggregates to Immediate Geographic Region or state, summing votes from the microdata.
- **Included in v1:** shift-share counterfactual (vote shift vs. party re-placement; definition pending author sign-off), LISA clusters and the municipality comparator.
- **2026 is provisional:** first-round *boletins de urna* of 5 Oct 2026; `supp_pres` repeats 2024. Marked as provisional wherever 2026 appears.
- **Missing values:** not-yet-installed municipalities, missing data and not-applicable cases (DF and Fernando de Noronha have no municipal elections) are distinct states.

## Brand Commitments

- Authors visible: Timothy J. Power (University of Oxford) and Rodrigo Rodrigues-Silveira (University of Salamanca).
- A prominent citation block on every page, in APA and BibTeX:
  - Power & Rodrigues-Silveira (2019), BPSR 13(1): e0001, doi:10.1590/1981-3821201900010001;
  - the MIS v3.0 Dataverse deposit, doi:10.7910/DVN/8USPML.
- No institutional logos (none provided; must not be recreated).

## Evidence on Hand

- `Dataverse_Release_v3.0/data/`:
  - panel of 93,872 municipality-years × 61 variables;
  - gender file;
  - party microdata, 1,589,430 rows;
  - party placements, 510 party-years with standard errors.
- `Dataverse_Release_v3.0/documentation/`: Methodological Notes v3.0 (MD/PDF), codebook, summary statistics.
- `geo/raw/`: IBGE 2024 municipal and state meshes and the IBGE municipality list (immediate regions).
- No testimonials, usage figures or press coverage exist; none may be invented.

## Product Principles

1. **Every number is reproducible.** It comes from the release through the pipeline, with its source and date visible.
2. **Compare like with like.** Same arena and same kind of average, said explicitly.
3. **Story first, depth on demand.** Each narrative claim links to the map, profile or method behind it.
4. **Uncertainty and data quality are shown, not hidden.** That covers provisional 2026, imputed sex in 1996, small-vote municipalities and BLS re-placement.
5. **Three languages are first-class.** No section exists in only one language.

## Accessibility & Inclusion

WCAG 2.2 AA. Every figure has Chart · Table · Data views and keyboard access (one tab stop, arrows inside). The map works without colour alone (hatching, labels) and has an equivalent filterable table. Diverging palette validated for colour-vision deficiency. Reduced motion respected.

## Registered Exceptions

- **all-caps-body (impeccable detector):** short receipt labels (section headers, nav, control labels, stamps) are set in uppercase monospace as part of the *boletim de urna* world. Scope: labels and stamps only, never running prose. Reason: the direction contract's receipt material.
