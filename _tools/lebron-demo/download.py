"""Download the source snapshot. Cached files are checked against the saved lock."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / 'cache'
OUT = ROOT.parents[1] / 'assets/data/lebron'
SHOT_SHA = 'e829d4678be1e075f99e5d41a1c5f97089be446b'
HISTORY_SHA = '669f29c0fb385b407002f1871f861d7eaafcde31'

def main():
    CACHE.mkdir(exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    lock = OUT / 'sources.json'
    previous = {r['file']: r for r in json.loads(lock.read_text())['files']} if lock.exists() else {}
    sources = []
    for year in range(2003, 2026):
        for suffix in ('', '_po'):
            name = f'shotdetail{suffix}_{year}.tar.xz'
            sources.append((name, f'https://raw.githubusercontent.com/shufinskiy/nba_data/{SHOT_SHA}/datasets/{name}'))
        name = f'player_box_{year+1}.parquet'
        sources.append((name, f'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/{name}'))
    for year in range(2004, 2027):
        name = f'player_boxscores_{year}.parquet'
        sources.append((name, f'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_player_boxscores/{name}'))
    for name in ('Player Totals', 'Advanced', 'Team Totals'):
        sources.append((name+'.csv', f'https://raw.githubusercontent.com/Taleb88/NBA-Statistics-1946-Present/{HISTORY_SHA}/csv/{urllib.parse.quote(name)}.csv'))

    def get(source):
        name, url = source
        path = CACHE / name
        sample = Path('/tmp/lebron-eda-research') / name
        if not path.exists():
            if sample.exists():
                shutil.copyfile(sample, path)
            else:
                with urllib.request.urlopen(url, timeout=90) as response:
                    path.with_suffix(path.suffix+'.part').write_bytes(response.read())
                path.with_suffix(path.suffix+'.part').replace(path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if name in previous and previous[name]['sha256'] != digest:
            raise ValueError(f'{name}: checksum changed; review the source before updating the snapshot')
        print(f'{name}: {path.stat().st_size:,} bytes', flush=True)
        return {'file': name, 'url': url, 'sha256': digest, 'bytes': path.stat().st_size}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        files = list(pool.map(get, sources))
    lock.write_text(json.dumps({'cutoff': '2025-26 completed season', 'retrieved': '2026-10-25', 'files': files}, indent=2)+'\n')

if __name__ == '__main__':
    main()
