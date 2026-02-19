import subprocess, json

result = subprocess.run(
    ['psql', 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
     '-t', '-c', "SELECT content::text FROM valuation_reports WHERE id = '2dd37218-f5e7-4d59-babc-42ecf63bad1c'"],
    capture_output=True, text=True
)
data = json.loads(result.stdout.strip())
sections = data.get('sections', [])
for i, s in enumerate(sections):
    txt = json.dumps(s)
    if 'sarah' in txt.lower() or 'mensah' in txt.lower():
        print(f"Section {i}: {s.get('title','no title')} key={s.get('key','')}")
        for k, v in s.items():
            if isinstance(v, str) and ('sarah' in v.lower() or 'mensah' in v.lower()):
                print(f"  {k} = {v[:300]}")
            elif isinstance(v, list):
                for j, item in enumerate(v):
                    if isinstance(item, dict):
                        for kk, vv in item.items():
                            if isinstance(vv, str) and ('sarah' in vv.lower() or 'mensah' in vv.lower()):
                                print(f"  [{j}].{kk} = {vv[:300]}")
                    elif isinstance(item, str) and ('sarah' in item.lower() or 'mensah' in item.lower()):
                        print(f"  [{j}] = {item[:300]}")
            elif isinstance(v, dict):
                for kk, vv in v.items():
                    if isinstance(vv, str) and ('sarah' in vv.lower() or 'mensah' in vv.lower()):
                        print(f"  {k}.{kk} = {vv[:300]}")
