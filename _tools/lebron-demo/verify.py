"""Independent snapshot checks and relational audits. Standard library only."""
import csv
import gzip
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'assets/data/lebron'
overview = json.loads((DATA / 'overview.json').read_text())
audit = json.loads((DATA / 'audit.json').read_text())
games = list(csv.DictReader((DATA / 'games.csv').open()))
assert len(games) == 1924
assert len({r['game'] for r in games}) == len(games)
for phase, count, pts, ast, reb in [('rs', 1622, 43440, 12016, 12095), ('po', 302, 8521, 2168, 2695)]:
    rows = [r for r in games if r['phase'] == phase]
    assert len(rows) == count
    assert [sum(float(r[k]) for r in rows) for k in ['pts', 'ast', 'trb']] == [pts, ast, reb]
    assert all(r['game'].startswith('002' if phase == 'rs' else '004') for r in rows)
assert not audit['missing_box']
assert len(audit['season_checks']) == 21
assert not any(r['differences'] for r in audit['season_checks'])
assert all(abs(new-old) <= 2 for r in audit['league_checks'] for new,old in r['differences'].values())
assert len(audit['espn_missing']) == 1 and len(audit['espn_differences']) == 2

shots = list(csv.DictReader(gzip.open(DATA / 'shots.csv.gz', 'rt')))
assert len(shots) == 37667
assert len({(r['game'], r['event']) for r in shots}) == len(shots)
located = Counter(r['game'] for r in shots)
gap = {r['game']: int(float(r['fga'])) - located[r['game']] for r in games if int(float(r['fga'])) != located[r['game']]}
assert gap == {'0021500141': 1, '0021600488': 1}
assert sum(int(r['made']) for r in shots) == sum(float(g['fg']) for g in games)
assert sum(int(r['made']) * int(r['three']) for r in shots) == sum(float(g['fg3']) for g in games)
for s in overview['seasons']:
    rows = [g for g in games if int(g['year']) == s['year'] and g['phase'] == s['phase']]
    assert len(rows) == s['g']
    assert sum(float(g['pts']) for g in rows) == s['pts']
    ss = json.loads((DATA / f"shots-{s['year']}-{s['phase']}.json").read_text())
    assert len(ss) == sum(z[0] for z in s['zones'])
    assert sum(r[2] for r in ss) == sum(z[1] for z in s['zones'])
    if s['g']:
        assert abs(s['ts'] - s['pts'] / (2*(s['fga']+.44*s['fta']))) < 1e-10
assert sum(s['ts'] > s['leagueTS'] for s in overview['seasons'] if s['phase'] == 'rs') == 22

assert len({p['id'] for p in overview['players']}) == len(overview['players'])
assert len({p['name'] for p in overview['players']}) == len(overview['players'])
players = {p['name']: p for p in overview['players']}
for name, pts in [('Michael Jordan',32292), ('Kareem Abdul-Jabbar',38387), ('Wilt Chamberlain',31419), ('Magic Johnson',17707), ('LeBron James',43440)]:
    assert players[name]['pts'] == pts, name
for name in ['Larry Bird', 'Bill Russell', "Shaquille O'Neal", 'Karl Malone', 'Kobe Bryant', 'Tim Duncan']:
    assert name in players  # Required figure inputs, including the non-scatter cohort.
assert sum(p['scatter'] for p in players.values()) == 94
assert sum(sorted((s['pts'] for s in players['Michael Jordan']['seasons']), reverse=True)[:7]) == 18907
assert sum(sorted((s['pts'] for s in players['LeBron James']['seasons']), reverse=True)[:7]) == 15848
assert players['Magic Johnson']['ast'] == 10141
assert players['Patrick Ewing']['pts'] == 24815
assert players['Patrick Ewing']['g'] == 1183
assert [p['name'] for p in players.values() if p['pts']>=40000 and p['ast']>=10000 and p['trb']>=10000] == ['LeBron James']
series = next(f for f in overview['finals'] if f['year'] == 2016)['players']
bron = next(p for p in series if p['name'] == 'LeBron James')
for key, expected in [('pts',208),('trb',79),('ast',62),('stl',18),('blk',16)]:
    assert bron[key] == expected == max(p[key] for p in series)
    assert sum(p[key] == expected for p in series) == 1
rows = list(csv.DictReader((DATA/'player-seasons.csv').open()))
assert len({(r['player_id'],r['year']) for r in rows}) == len(rows)
assert len({r['player_id'] for r in rows if r['name']=='Johnny Davis'}) == 2
print('PASS: source cross-checks, career totals, 1,924 games, 37,667 shots, 46 season/phase files, figure cohorts, and 2016 Finals leaders.')
