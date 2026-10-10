import pandas as pd, numpy as np, warnings; warnings.filterwarnings('ignore')
D='/Users/rodrodr/Dropbox/Apps/mis_website/Dataverse_Release_v3.0/data/'
d=pd.read_csv(D+'MIS_Ideology_1994-2026.tab',sep='\t',low_memory=False,usecols=['year','GEOCODIG_M','ideo_na','enep','fragi','pol_sanisarto','national'])
m=pd.read_csv('micro2/MIS_Ideology_party_data_1994-2026.csv',low_memory=False)
K=['year','GEOCODIG_M']
def rep(n,a,b,tol=1e-3):
    ok=a.notna()&b.notna(); df=(a[ok]-b[ok]).abs(); print(f'{n:34s} r={np.corrcoef(a[ok],b[ok])[0,1]:.5f} med={df.median():.5f} p99={df.quantile(.99):.4f} max={df.max():.4f} share>tol={(df>tol).mean():.4f}')
mm=m[m.qtde_votos>0].copy()
g=mm.groupby(K)
R=pd.DataFrame({'enep_pv':1/g.prop_votos.apply(lambda s:(s**2).sum())})
R['na_unnorm']=mm.assign(c=mm.prop_votos*mm.IDEOLOGY).groupby(K).c.sum()
R['na_idcontr']=g.id_contr_na.sum()
n=mm[mm.IDEOLOGY.notna()]; R['na_ren']=n.groupby(K).apply(lambda x:(x.qtde_votos*x.IDEOLOGY).sum()/x.qtde_votos.sum())
b=mm[mm.prop_votos>=0.05]; R['ent_pv']=np.exp(-b.groupby(K).apply(lambda x:(x.prop_votos*np.log(x.prop_votos)).sum()))
mm['s']=mm.qtde_votos/mm.groupby(K).qtde_votos.transform('sum'); b=mm[mm.s>=0.05]; R['ent_s']=np.exp(-b.groupby(K).apply(lambda x:(x.s*np.log(x.s)).sum()))
def san(x, col):
    s=x[col].values; th=x.IDEO_IMPUTED.values; ok=~np.isnan(th); s,th=s[ok],th[ok]
    if len(s)==0: return np.nan
    i=np.argmax(s); c=s*th; return (c[i]-np.delete(c,i)).sum()
R['san_pv']=g.apply(lambda x:san(x,'prop_votos'))
x=d.set_index(K).join(R)
rep('ideo_na vs renormalized',x.ideo_na,x.na_ren); rep('ideo_na vs sum(prop*IDEOLOGY)',x.ideo_na,x.na_unnorm); rep('ideo_na vs sum id_contr_na',x.ideo_na,x.na_idcontr)
rep('enep vs 1/sum(prop_votos^2)',x.enep,x.enep_pv,0.01); rep('fragi ent prop_votos',x.fragi,x.ent_pv,0.01); rep('fragi ent s',x.fragi,x.ent_s,0.01); rep('pol_sanisarto prop_votos',x.pol_sanisarto,x.san_pv,0.01)
x['dna']=(x.ideo_na-x.na_ren).abs(); print(x.groupby('year').dna.agg(['median','max',lambda s:(s>0.01).mean()]).round(4).to_string())
x['df']=(x.fragi-x.ent_s).abs(); print('fragi big diffs by year',x.groupby('year').df.apply(lambda s:(s>0.1).mean()).round(3).to_dict())
print(x[x.df>1].reset_index()[['year','GEOCODIG_M','fragi','ent_s','ent_pv']].head(8).to_string())
