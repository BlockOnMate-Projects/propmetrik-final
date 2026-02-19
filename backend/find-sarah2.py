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
        print(f"=== Section {i}: {s.get('title','no title')} ===")
        # Just print the substrings around the match
        import re
        for m in re.finditer(r'(?i)(.{0,60})(sarah|mensah)(.{0,60})', txt):
            print(f"  ...{m.group(1)}{m.group(2)}{m.group(3)}...")

# Also check valuer name in DB
result2 = subprocess.run(
    ['psql', 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
     '-t', '-c', "SELECT first_name, last_name, display_name FROM valuers WHERE id = (SELECT valuer_id FROM valuations WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649')"],
    capture_output=True, text=True
)
print(f"\nValuer in DB: {result2.stdout.strip()}")
