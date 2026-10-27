"""Execute the figure's actual SQL and check customer/run boundaries and cell grain."""
from pathlib import Path
import json, sqlite3, subprocess
root=Path(__file__).resolve().parents[2]
sql=subprocess.check_output(['node','-e',"process.stdout.write(require('./assets/js/fare-system-core.js').comparisonSQL)"],cwd=root,text=True)
data=json.loads((root/'assets/data/fare-system/demo.json').read_text())
db=sqlite3.connect(':memory:')
db.execute('''CREATE TABLE offers (
 customer TEXT, reporting_day TEXT, collection_run TEXT,
 route TEXT, departure TEXT, stops INT, cabin TEXT, trip TEXT,
 stay_nights INT, country_of_sale TEXT, carrier TEXT,
 product_group TEXT, total_usd_minor INT)''')
rows=[]
for cell in data['cells']:
    for carrier,product,amount in [('us','economy',cell['own']),('competitor','discount',cell['basic']),('competitor','economy',cell['standard'])]:
        rows.append(('example','2026-10-27','morning','A-B',cell['departure'],0,'economy','OW',0,'US',carrier,product,amount))
db.executemany('INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',rows)
base=next(r for r in rows if r[4]=='2026-11-17' and r[11]=='discount')
# Cheaper results in another tenant, run, trip or country must not corrupt this cell.
for index,value in [(0,'another-customer'),(2,'previous-run'),(7,'RT'),(9,'CA')]:
    extra=list(base);extra[index]=value;extra[-1]=10000
    db.execute('INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',extra)
result=db.execute(sql,{'customer':'example','day':'2026-10-27','run':'morning'}).fetchall()
selected=[r for r in result if r[1]=='2026-11-17' and r[4]=='OW' and r[6]=='US']
assert len(selected)==3
assert {(r[7],r[8]):r[9] for r in selected}=={('us','economy'):24000,('competitor','discount'):22000,('competitor','economy'):27000}
assert len(result)==122  # Two legitimate distinct cells (RT and CA) survive separately.
print('Executed the displayed SQL: customer/run isolation and trip/country/product grain pass.')
