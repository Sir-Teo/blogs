"""Reproduce the article's figures from checksummed public source archives.
NBA box scores are primary. ESPN logs and historical season totals audit them.
"""
import csv, gzip, hashlib, io, json, tarfile, unicodedata
from collections import defaultdict
from pathlib import Path
import pyarrow.parquet as pq

ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'cache'
OUT=ROOT.parents[1]/'assets/data/lebron'
FIELDS={'pts':'points','ast':'assists','trb':'rebounds_total','fg':'field_goals_made','fga':'field_goals_attempted','fg3':'three_pointers_made','fg3a':'three_pointers_attempted','ft':'free_throws_made','fta':'free_throws_attempted','stl':'steals','blk':'blocks','tov':'turnovers'}
ESPN={**FIELDS,'trb':'rebounds','fg3':'three_point_field_goals_made','fg3a':'three_point_field_goals_attempted'}
ALIASES={'GS':'GSW','NY':'NYK','NO':'NOP','NOH':'NOP','NOK':'NOP','UTAH':'UTA','WSH':'WAS','NJ':'BKN','NJN':'BKN','PHO':'PHX','SA':'SAS'}
ZONES=['Restricted area','Other paint','Mid-range','Three-pointer','Backcourt']
def team(s): return ALIASES.get(s,s)
NAME_ALIASES={'AJ Green':'A.J. Green','Brandon Boston':'Brandon Boston Jr.','GG Jackson':'GG Jackson II','Jeff Dowtin Jr.':'Jeff Dowtin','Jimmy Butler III':'Jimmy Butler','Kevin Knox II':'Kevin Knox','Robert Williams III':'Robert Williams','Trey Jemison III':'Trey Jemison','Xavier Tillman':'Xavier Tillman Sr.'}
def canonical(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode()
    return NAME_ALIASES.get(s,s)
def num(x): return None if x in ('','NA',None,'--') else float(x)
def dump(name,obj): (OUT/name).write_text(json.dumps(obj,separators=(',',':'),allow_nan=False)+'\n')
def sums(rows):
    r={k:round(sum(x[k] for x in rows if x[k] is not None),5) for k in [*FIELDS,'mp']}
    r['g']=len(rows)
    r['ts']=r['pts']/(2*(r['fga']+.44*r['fta'])) if r['fga'] else None
    return r

def main():
    sources=json.loads((OUT/'sources.json').read_text())
    for src in sources['files']:
        assert hashlib.sha256((CACHE/src['file']).read_bytes()).hexdigest()==src['sha256'],src['file']
    games=[]; seasons=[]; league_games={}; meta={}; league_box={}; shot_games={}; shots=[]; recent=defaultdict(list); peers={}
    audit={'excluded_espn':[],'espn_differences':[],'espn_missing':[], 'shot_gaps':[], 'missing_box':[], 'season_checks':[], 'league_checks':[]}
    for y in range(2003,2026):
        year=y+1
        for phase,suffix,prefix in [('rs','','002'),('po','_po','004')]:
            league_zones=[[0,0] for _ in ZONES]; bron_zones=[[0,0] for _ in ZONES]; seasonshots=[]; seen=set()
            with tarfile.open(CACHE/f'shotdetail{suffix}_{y}.tar.xz') as tar:
                file=next(m for m in tar.getmembers() if m.name.endswith('.csv'))
                for r in csv.DictReader(io.TextIOWrapper(tar.extractfile(file))):
                    gid=str(r['GAME_ID']).zfill(10)
                    if not gid.startswith(prefix): continue
                    date=r['GAME_DATE']; date=f'{date[:4]}-{date[4:6]}-{date[6:]}'
                    home,away=team(r['HTM']),team(r['VTM'])
                    league_games[(year,date,home,away)]=(gid,phase)
                    meta[gid]={'date':date,'home':home,'away':away,'phase':phase}
                    zone=r['SHOT_ZONE_BASIC']; z=0 if zone=='Restricted Area' else 1 if zone=='In The Paint (Non-RA)' else 2 if zone=='Mid-Range' else 4 if zone=='Backcourt' else 3
                    made=int(r['SHOT_MADE_FLAG']); three=int(r['SHOT_TYPE']=='3PT Field Goal')
                    if r['PLAYER_ID']!='2544':
                        league_zones[z][0]+=1;league_zones[z][1]+=made
                        continue
                    key=(gid,r['GAME_EVENT_ID']); assert key not in seen,key; seen.add(key)
                    bron_zones[z][0]+=1;bron_zones[z][1]+=made
                    s=[int(r['LOC_X']),int(r['LOC_Y']),made,three,date,gid,int(r['GAME_EVENT_ID']),int(r['PERIOD']),int(r['MINUTES_REMAINING'])*60+int(r['SECONDS_REMAINING']),z]
                    seasonshots.append(s);shots.append([year,phase]+s)
                    e=shot_games.setdefault(gid,{'year':year,'phase':phase,'date':date,'fga':0,'fg':0,'fg3':0})
                    e['fga']+=1;e['fg']+=made;e['fg3']+=made*three
            dump(f'shots-{year}-{phase}.json',seasonshots)
            seasons.append({'year':year,'phase':phase,'zones':bron_zones,'leagueZones':league_zones})
        rows=pq.read_table(CACHE/f'player_boxscores_{year}.parquet').to_pylist()
        seen=set(); allrows=[]; totals=defaultdict(float); bronze={}
        for r in rows:
            gid=str(r['game_id']).zfill(10)
            if not gid.startswith(('002','004')): continue
            if not r['minutes']: continue
            assert gid in meta,('No game metadata',gid)
            m=meta[gid];a=team(r['team_tricode']);b=m['away'] if r['side']=='home' else m['home']
            key=(gid,r['person_id']);assert key not in seen,key;seen.add(key)
            box={k:num(r[v]) for k,v in FIELDS.items()}
            assert all(v is not None for v in box.values()),('Missing stats',key)
            parts=r['minutes'].split(':');box['mp']=int(parts[0])+(int(parts[1])/60 if len(parts)>1 else 0)
            assert box['pts']==2*box['fg']+box['fg3']+box['ft'],key
            box.update(year=year,phase=m['phase'],date=m['date'],game=gid,team=a,opp=b,home=r['side']=='home',name=canonical(r['first_name']+' '+r['family_name']),pid=r['person_id'])
            allrows.append(box);totals[(gid,a)]+=box['pts']
            league_box.setdefault((year,m['phase']),[]).append(box)
            if year>=2025 and m['phase']=='rs': recent[box['name']].append(box)
            if r['person_id']==2544: bronze[gid]=box
        for gid,box in bronze.items():
            box=box.copy();box['win']=totals[(gid,box['team'])]>totals[(gid,box['opp'])]
            games.append(box)
            sg=shot_games.get(gid)
            if not sg or any(box[k]!=sg[k] for k in ['fga','fg','fg3']):
                audit['shot_gaps'].append({'game':gid,'date':box['date'],'box':{k:box[k] for k in ['fga','fg','fg3']},'shots':{k:sg[k] for k in ['fga','fg','fg3']} if sg else None})
        # All participants in each LeBron playoff game, to verify series leaders.
        for r in allrows:
            if r['game'] in bronze and r['phase']=='po': peers.setdefault(r['game'],[]).append(r)
        espn_seen=set()
        for r in pq.read_table(CACHE/f'player_box_{year}.parquet').to_pylist():
            if str(r['athlete_id'])!='1966' or r['did_not_play'] or not r['minutes']: continue
            a,b=team(r['team_abbreviation']),team(r['opponent_team_abbreviation'])
            home,away=(a,b) if r['home_away']=='home' else (b,a)
            match=league_games.get((year,str(r['game_date']),home,away))
            if not match:
                audit['excluded_espn'].append({'date':str(r['game_date']),'team':a,'opp':b,'points':r['points']});continue
            gid,_=match;espn_seen.add(gid);box=bronze[gid]
            differences={k:[box[k],num(r[v])] for k,v in ESPN.items() if box[k]!=num(r[v])}
            if differences:audit['espn_differences'].append({'game':gid,'date':box['date'],'nba_espn':differences})
        audit['espn_missing'] += [{'game':gid,'date':r['date']} for gid,r in bronze.items() if gid not in espn_seen]
        print('Parsed',year,flush=True)
    games.sort(key=lambda r:r['date'])
    found={g['game'] for g in games}
    audit['missing_box']=[v|{'game':k} for k,v in shot_games.items() if k not in found]
    for s in seasons:
        rows=[r for r in games if r['year']==s['year'] and r['phase']==s['phase']]
        s.update(sums(rows));s['age']=s['year']-1985;s['team']=rows[0]['team'] if rows else None
        s['leagueTS']=sums(league_box[(s['year'],s['phase'])])['ts']
    # Complete historical NBA/BAA seasons only. TOT replaces traded-player stints.
    groups=defaultdict(list); labels={}
    for r in csv.DictReader((CACHE/'Player Totals.csv').open()):
        if r['lg'] in ('NBA','BAA') and int(r['season'])<=2024:
            key='historical:'+r['player_id'];labels[key]=canonical(r['player']);groups[(key,int(r['season']))].append(r)
    players=defaultdict(list)
    for (key,year),rs in groups.items():
        total=next((r for r in rs if r['tm']=='TOT'),None);chosen=[total] if total else rs
        row={'year':year,'age':int(chosen[0]['age']) if num(chosen[0]['age']) is not None else None,'g':int(sum(float(r['g']) for r in chosen))}
        for k in [*FIELDS,'mp']:
            col={'fg3':'x3p','fg3a':'x3pa'}.get(k,k);values=[num(r[col]) for r in chosen]
            row[k]=sum(values) if all(v is not None for v in values) else None
        players[key].append(row)
    for name,rs in recent.items():
        matches=[k for k,v in labels.items() if v==name]
        if len(matches)>1:
            # Resolve historical namesakes only with a unique overlapping season.
            matches=[k for k in matches if any(s['year']==2024 for s in players[k])]
        assert len(matches)<=1,('Ambiguous historical identity',name,matches)
        key=matches[0] if matches else 'nba:'+str(rs[0]['pid']);labels[key]=name
        last=max(players[key],key=lambda x:x['year']) if players[key] else None
        for year in (2025,2026):
            yr=[r for r in rs if r['year']==year]
            if not yr:continue
            players[key].append(sums(yr)|{'year':year,'age':last['age']+year-last['year'] if last and last['age'] is not None else None})
    lbjkey=next(k for k,v in labels.items() if v=='LeBron James')
    for s in seasons:
        if s['phase']!='rs' or s['year']>2024:continue
        oldrow=next(r for r in players[lbjkey] if r['year']==s['year'])
        diffs={k:[s[k],oldrow[k]] for k in ['g',*FIELDS] if s[k]!=oldrow[k]}
        audit['season_checks'].append({'year':s['year'],'differences':diffs})
    for year in range(2004,2025):
        rs=[r for r in csv.DictReader((CACHE/'Team Totals.csv').open()) if int(r['season'])==year and r['lg']=='NBA' and r['abbreviation']!='NA']
        nba=sums(league_box[(year,'rs')]);diffs={}
        for k in ['pts','fga','fta','fg']:
            oldval=sum(float(r[k]) for r in rs)
            if oldval!=nba[k]:diffs[k]=[nba[k],oldval]
        audit['league_checks'].append({'year':year,'differences':diffs})
    players[lbjkey]=[{k:s[k] for k in ['year','age','g',*FIELDS,'mp']} for s in seasons if s['phase']=='rs']
    career=[]
    for key,rs in players.items():
        rs.sort(key=lambda x:x['year']);totals={k:sum(r[k] or 0 for r in rs) for k in ['g','pts','ast','trb']}
        career.append({'id':key,'name':labels[key],'seasons':rs,**totals})
    keep=set()
    for metric in ['pts','ast','trb']:keep.update(p['id'] for p in sorted(career,key=lambda p:p[metric],reverse=True)[:40])
    comparison=[dict(p,scatter=p['id'] in keep) for p in career if p['id'] in keep or p['name']=='Larry Bird']
    finals=[]
    for year in range(2004,2027):
        gs=[g for g in games if g['year']==year and g['phase']=='po' and g['game'][7]=='4']
        if not gs:continue
        totals=defaultdict(lambda:defaultdict(float))
        for g in gs:
            for p in peers[g['game']]:
                for k in ['pts','ast','trb','stl','blk']:totals[p['name']][k]+=p[k]
        finals.append({'year':year,'players':[{'name':n,**v} for n,v in totals.items()]})
    with (OUT/'player-seasons.csv').open('w') as f:
        writer=csv.DictWriter(f,fieldnames=['player_id','name','year','age','g',*FIELDS,'mp'],extrasaction='ignore');writer.writeheader()
        for p in sorted(career,key=lambda p:p['name']):
            for r in p['seasons']:writer.writerow({'player_id':p['id'],'name':p['name'],**r})
    with (OUT/'games.csv').open('w') as f:
        writer=csv.DictWriter(f,fieldnames=list(games[0]));writer.writeheader();writer.writerows(games)
    with gzip.GzipFile(filename=str(OUT/'shots.csv.gz'),mode='wb',mtime=0) as z:
        with io.TextIOWrapper(z) as f:
            writer=csv.writer(f);writer.writerow(['year','phase','x','y','made','three','date','game','event','period','clock_seconds','zone']);writer.writerows(shots)
    audit.update(games=len(games),shots=len(shots),players=len(career),regular=sums([g for g in games if g['phase']=='rs']),playoffs=sums([g for g in games if g['phase']=='po']))
    dump('audit.json',audit)
    dump('overview.json',{'cutoff':'2025–26','seasons':seasons,'players':comparison,'zones':ZONES,'games':games,'finals':finals})
    print(json.dumps(audit,indent=2))

if __name__=='__main__':main()
