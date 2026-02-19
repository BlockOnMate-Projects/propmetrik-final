import subprocess, json, re

result = subprocess.run(
    ['psql', 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
     '-t', '-c', "SELECT content::text FROM valuation_reports WHERE id = '2dd37218-f5e7-4d59-babc-42ecf63bad1c'"],
    capture_output=True, text=True
)
data = json.loads(result.stdout.strip())
sections = data.get('sections', [])
print(f"Total sections: {len(sections)}")
for i, s in enumerate(sections):
    txt = json.dumps(s)
    if 'eric' in txt.lower() or 'danso' in txt.lower():
        for m in re.finditer(r'(?i)(.{0,40})(eric|danso)(.{0,40})', txt):
            print(f"  [{i}] {s.get('title','')}: ...{m.group(1)}{m.group(2)}{m.group(3)}...")
