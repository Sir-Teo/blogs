"""One fictional flight and one coherent set of counts for four technical figures."""
from pathlib import Path
from datetime import date, timedelta
import json, math, random
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'assets/data/fare-system'
observed=date(2026,10,27)
under=set(range(2,13)) | set(range(18,29))
match={1,13,14,15,16,17,29,30}
cells=[]
for day in range(1,41):
    own=24000+round(1000*(math.cos((day-21)/9)-1))
    basic=round(own*11/12) if day in under else own if day in match else own+1500
    cells.append({'day':day,'departure':str(observed+timedelta(days=day)),
                  'own':own,'basic':basic,'standard':basic+5000})
data={
 'version':8,
 'scope':'Fictional design example. Two pipeline diagrams and two dashboard concepts, computed at build time; no live application or external services.',
 'flight':{'route':'A → B','departure':'2026-11-17','observed_at':'2026-10-27T08:05:00Z',
           'reporting_day':'2026-10-27','days_out':21,'trip':'OW','cabin':'economy',
           'stops':0,'country_of_sale':'US','currency':'USD','tax_basis':'included'},
 'collection':{'dates':40,'sources':2,'watchlists':2,'customers':1,'cache_hits':20,'deadline':'08:15 UTC'},
 'cells':cells,
 'history_counts':[10,12,10,11,11,12,9,12,11,10,12,11,10,12,12,11,10,12,11,12,10,12],
 'history_denominator':40,
 'history_prices':{'dates':['Oct 23','Oct 24','Oct 25','Oct 26','Oct 27'],
                   'own':[24500,24400,24200,24100,24000],
                   'basic':[24000,23900,23800,23500,22000]},
 'published_fare':{'price':21000,'min_days':14,'tax_basis':'unreconciled',
                   'rule_coverage':'advance purchase only','availability':'unknown'},
 'benchmark':{'own_product':'economy','competitor_product':'discount','gap_over':1500}
}
# Each historical AP cell represents a comparable earlier departure, not a
# future observation of the November 17 flight. Tuesday is weekday 1.
rng=random.Random(20261027)
history=[]
effects=[100,0,200,100,200,-2500,-200]
for day in range(224):
    weekday=(day+1)%7
    for cell in cells:
        baseline=cell['basic']+(1500 if cell['day'] in (21,22,23) else 0)
        history.append({'day':day,'weekday':weekday,'ap':cell['day'],'product':'discount',
                        'amount':baseline+effects[weekday]+rng.choice([-300,-200,-100,0,100,200,300])})
peer_values=[23300,23400,23500,23600,23700,23600,23500,23400]
for i,value in enumerate(peer_values,1):
    next(r for r in history if r['day']==224-7*i and r['ap']==21)['amount']=value
data['anomaly']={'day':224,'weekday':1,'history':history,
    'scope':'A-B|OW|economy|discount|US|USD|AP21',
    'snapshot':'2026-10-27T08:10:00Z',
    'checks':[{'time':time,'amount':22000,'coverage':1,'currency':'USD','taxBasis':'included',
               'valid':True} for time in ['2026-10-27T07:35:00Z','2026-10-27T07:50:00Z','2026-10-27T08:05:00Z']]}

assert cells[20]['departure']==data['flight']['departure']
assert cells[20]['own']==24000 and cells[20]['basic']==22000 and cells[20]['standard']==27000
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'demo.json').write_text(json.dumps(data,indent=2)+'\n')
notes={
 'kind':'Calculation notes for a proposed airline pricing analysis design',
 'design_choices':['Generic names, schemas, queue/cache choices, storage keys and API paths describe the proposed build.',
  'One offer row means one itinerary, one source and one observation time; comparison rows have a separate grain.',
  'Source timestamps survive cache reuse. UTC observation time and customer reporting day remain separate.',
  'Partition customer/date and cluster by route; customer delivery and internal analytics have separate readiness policies.'],
 'calculations':['Two duplicate watchlists for one customer: 160 assignments become 80 source queries, with 20 cache hits and 60 supplier calls.',
  'Forty own-source replies contain one offer each; forty competitor replies contain two offers each: 120 rows.',
  'Any-product and cheaper-alternative comparisons select 220 against our 240. Same-group selects 270.',
  'Forecasts use the last eight matching weekdays for the same route/product/AP. A range is calibrated from 56 prior prequential absolute errors, never the current value.',
  'Twenty-two of forty dates are cheaper elsewhere; that position count is not an anomaly count. Three selected dates have repeated material deviations from their contextual baseline.',
  'Benchmark: own economy minus competitor discount must be strictly greater than USD 15. A USD 20 threshold excludes the selected date.',
  'Missing one competitor reply removes two offers: 118 rows, 39 comparable dates, and unknown competitor price for the selected departure.'],
 'limits':['All entities, prices, counts, observations and histories are fictional.',
  'Two sources summarize multiple provider-specific operations. Cache/timing/failure paths are simplified.',
  'The figures do not execute the illustrated database queries, AWS services or API endpoints.',
  'A context-matched price forecast and past-only residual band replace the two-pass frequency fence. Production ranking and notification delivery remain outside the numerical example.',
  'Published fare USD 210 is an advance-purchase example. Other restrictions, tax basis and seat availability remain unverified.']
}
(OUT/'sources.json').write_text(json.dumps(notes,indent=2)+'\n')
print('Built one fictional flight, source-query accounting and contextual anomaly history.')
