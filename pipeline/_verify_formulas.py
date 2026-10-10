import pandas as pd, numpy as np, warnings; warnings.filterwarnings('ignore')
pd.set_option('display.width',250); pd.set_option('display.max_columns',40)
D='/Users/rodrodr/Dropbox/Apps/mis_website/Dataverse_Release_v3.0/data/'
d=pd.read_csv(D+'MIS_Ideology_1994-2026.tab',sep='\t',low_memory=False)
m=pd.read_csv('/private/tmp/claude-501/-Users-rodrodr-Dropbox-Apps-mis-website/c5757d8c-6709-4982-b573-c908160a0647/scratchpad/micro2/MIS_Ideology_party_data_1994-2026.csv',low_memory=False)
K=['year','GEOCODIG_M']
print('main',d.shape,'munis',d.GEOCODIG_M.nunique(),'dups',d.duplicated(K).sum(),' micro',m.shape)
print(d.groupby('year').size().to_dict())
def rep(name,a,b,tol=1e-3):
    ok=pd.notna(a)&pd.notna(b); diff=(a[ok]-b[ok]).abs()
    print(f'{name:28s} n={ok.sum():6d} r={np.corrcoef(a[ok],b[ok])[0,1]:.5f} med={diff.median():.5f} p99={diff.quantile(.99):.5f} max={diff.max():.4f} share>tol={(diff>tol).mean():.4f}')
# micro recompute
mm=m[m.qtde_votos>0].copy()
mm['tv']=mm.groupby(K).qtde_votos.transform('sum'); mm['s']=mm.qtde_votos/mm.tv
g=mm.groupby(K)
R=pd.DataFrame({'tv':g.qtde_votos.sum()})
mi=mm[mm.IDEO_IMPUTED.notna()].copy(); mi['si']=mi.qtde_votos/mi.groupby(K).qtde_votos.transform('sum')
mi['c']=mi.si*mi.IDEO_IMPUTED; R['mis']=mi.groupby(K).c.sum()
mn=mm[mm.IDEOLOGY.notna()].copy(); mn['sn']=mn.qtde_votos/mn.groupby(K).qtde_votos.transform('sum'); mn['c']=mn.sn*mn.IDEOLOGY; R['mis_na']=mn.groupby(K).c.sum()
mi=mi.join(R.mis,on=K); mi['dev']=mi.si*(mi.IDEO_IMPUTED-mi.mis)**2; R['dalton']=np.sqrt(mi.groupby(K).dev.sum())
R['hhi']=g.s.apply(lambda s:(s**2).sum())
srt=mm.sort_values('s',ascending=False).groupby(K).s
R['s1']=srt.nth(0).values if False else mm.sort_values('s',ascending=False).groupby(K).s.first()
R['s2']=mm.sort_values('s',ascending=False).groupby(K).s.nth(1).reset_index().set_index(K).s if False else mm.sort_values('s',ascending=False).groupby(K).s.apply(lambda s: s.iloc[1] if len(s)>1 else 0)
big=mm[mm.s>=0.05].copy(); R['ent05']=np.exp(-big.groupby(K).apply(lambda x:(x.s*np.log(x.s)).sum()))
big['s2r']=big.s/big.groupby(K).s.transform('sum'); R['ent05r']=np.exp(-big.groupby(K).apply(lambda x:(x.s2r*np.log(x.s2r)).sum()))
pt=mm[mm.party==13].set_index(K).s; ps=mm[mm.party==45].set_index(K).s
R['ptpsdb']=np.sqrt(pt*ps)
# ER, GS, SS2 on imputed parties
def idx(x):
    s=x.si.values; th=x.IDEO_IMPUTED.values; D_=np.abs(th[:,None]-th[None,:])
    er=(s[:,None]**2*s[None,:]*D_).sum()
    gs=sum(((s*D_[j]).sum()-0)/(1-s[j]) if s[j]<1 else 0 for j in range(len(s)))
    mbar=(s*th).sum(); c=th[np.argmin(np.abs(th-mbar))]; ss2=(s*np.abs(th-c)).sum()
    q25,q75=np.percentile(th,25),np.percentile(th,75); cen=np.sqrt(s[th<=q25].sum()*s[th>=q75].sum())
    imax=np.argmax(s); cc=s*th; san=(cc[imax]-np.delete(cc,imax)).sum()
    return pd.Series({'er':er,'gs':gs,'ss2':ss2,'cen':cen,'san':san,'rng':th.max()-th.min()})
R=R.join(mi.groupby(K).apply(idx))
# pol_pi: x rescaled to [1,9] by panel min/max of imputed scores
lo,hi=mi.IDEO_IMPUTED.min(),mi.IDEO_IMPUTED.max(); mi['x']=1+8*(mi.IDEO_IMPUTED-lo)/(hi-lo)
mi['xbar']=mi.groupby(K).x.transform('mean'); mi['t']=mi.si*(mi.x-mi.xbar).abs()/5
R['pi']=(10*np.sqrt(mi.groupby(K).t.sum())).round(1)
# gender
gm=mm[mm.IDEO_IMPUTED.notna()]
gg=gm.assign(fm=gm.votes_female*gm.IDEO_IMPUTED, mm_=gm.votes_male*gm.IDEO_IMPUTED).groupby(K)[['votes_female','votes_male','fm','mm_']].sum()
R['misF']=gg.fm/gg.votes_female; R['misM']=gg.mm_/gg.votes_male
x=d.set_index(K).join(R,how='left')
rep('ideo_imp',x.ideo_imp,x.mis); rep('ideo_na',x.ideo_na,x.mis_na); rep('pol_dalton_norm',x.pol_dalton_norm,x.dalton)
rep('pol_pi (doc formula)',x.pol_pi,x.pi,0.05)
rep('enep',x.enep,1/x.hhi); rep('fragf',x.fragf,1-x.hhi); rep('max_prop',x.max_prop,x.s1); rep('conc',x.conc,x.s1+x.s2); rep('comp',x.comp,x.s1-x.s2)
rep('fragi ent>=5%',x.fragi,x.ent05); rep('fragi ent>=5% renorm',x.fragi,x.ent05r)
rep('pol_ptpsdb',x.pol_ptpsdb,x.ptpsdb); rep('pol_esteban_ray',x.pol_esteban_ray,x.er); rep('pol_gross_sigelman',x.pol_gross_sigelman,x.gs)
rep('pol_sani_sarto2',x.pol_sani_sarto2,x.ss2); rep('pol_centrif',x.pol_centrif,x.cen); rep('pol_sanisarto',x.pol_sanisarto,x.san); rep('pol_range',x.pol_range,x.rng)
rep('MIS_Female',x.MIS_Female,x.misF); rep('MIS_Male',x.MIS_Male,x.misM)
rep('turnout',x.turnout,(x.tot_votos+x.tot_brcnulo)/x.qtde_eleitores); rep('dem_vhn',x.dem_vhn,x.compet*x.turnout,0.002)
rep('close_ideopres',x.close_ideopres,x.closeness*x.ideo_pres)
r=lambda v:(v-v.min())/(v.max()-v.min()); rep('closeness',x.closeness,1-(r(x.ideopref)-r(x.ideo_pres)).abs())
rep('prop_female',x.prop_female_votes,x.votes_female/(x.votes_female+x.votes_male))
d=x.reset_index()
print('pt by year', d.groupby('year').pt.mean().to_dict())
print('dmp<9 rows', d[d.dmp<9][['year','uf','ibge_name','dmp']].to_string())
# lag t-2
L=d[K+['ideo_imp']].copy(); L['year']=L.year+2; z=d.merge(L.rename(columns={'ideo_imp':'lagchk'}),on=K,how='left'); rep('ideo_imp_lag (t-2)',z.ideo_imp_lag,z.lagchk,1e-6)
# incumbent rules
P=d[K+['pref','gov','national']]
a=P[P.national==1][K+['pref']].assign(year=lambda q:q.year+2).merge(P[P.national==0][K+['pref']],on=K,suffixes=('_gen','_mun'))
print('pref(gen t)==pref(mun t+2):', (a.pref_gen==a.pref_mun)[a.pref_gen.notna()&a.pref_mun.notna()].mean(), len(a))
b=P[P.national==0][K+['gov']].assign(year=lambda q:q.year+2).merge(P[P.national==1][K+['gov']],on=K,suffixes=('_mun','_gen'))
print('gov(mun t)==gov(gen t+2):', (b.gov_mun==b.gov_gen).mean(), len(b))
print('pref NA by year', d.groupby('year').pref.apply(lambda s:s.isna().mean()).round(3).to_dict())
# ct_ideopref = ideopref * share of pref party
sp=mm[['year','GEOCODIG_M','party','s']].rename(columns={'party':'pref','s':'sp'})
c=d.merge(sp,on=['year','GEOCODIG_M','pref'],how='left'); c['sp']=c.sp.fillna(0); rep('ct_ideopref ~ ideopref*s(pref)',c.ct_ideopref,c.ideopref*c.sp,0.005)
print('sec_round vs electorate>200k', pd.crosstab(d.sec_round,d.qtde_eleitores>200000).to_dict())
# summaries
gy=d.groupby('year')
T=pd.DataFrame({'nat':gy.national.first(),'n':gy.size(),'mean':gy.ideo_imp.mean(),'wmean':gy.apply(lambda q:np.average(q.ideo_imp,weights=q.tot_votos)),'sd':gy.ideo_imp.std(),
'dalton':gy.pol_dalton_norm.mean(),'wdalton':gy.apply(lambda q:np.average(q.pol_dalton_norm,weights=q.tot_votos)),'enep':gy.enep.mean(),'fem_mean':gy.prop_female_votes.mean(),
'fem_nat':gy.apply(lambda q:q.votes_female.sum()/(q.votes_female.sum()+q.votes_male.sum())),'nominal_cov':gy.apply(lambda q:(q.votes_female.sum()+q.votes_male.sum())/q.tot_votos.sum()),
'gap':gy.MIS_Gender_Gap.mean(),'gapNA':gy.MIS_Gender_Gap.apply(lambda s:s.isna().sum()),'imp_share':gy.gender_imputed_share.mean(),'rebuilt':gy.rebuilt_tse.sum(),'misM':gy.MIS_Male.mean(),'misF':gy.MIS_Female.mean()})
print(T.round(3).to_string())
d.to_parquet('/private/tmp/claude-501/-Users-rodrodr-Dropbox-Apps-mis-website/c5757d8c-6709-4982-b573-c908160a0647/scratchpad/main_v2.parquet') if False else None
