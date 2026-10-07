"""Measure alpha frames without changing any generated image pixels."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
art_root = root / 'public' / 'artwork'
prompts = json.loads((art_root / 'generation-prompts.json').read_text(encoding='utf-8'))['prompts']
tables = {'cities': {}, 'fleet': {}, 'props': {}}
props = {'crew', 'crane', 'airdrop'}
profile_path = art_root / 'side-profile-prompts.json'
profiles = {p['id']: p for p in json.loads(profile_path.read_text(encoding='utf-8'))['prompts']} if profile_path.exists() else {}

def divider(projection, nominal, radius, path):
    gaps = [n for n in range(max(0, nominal-radius), min(len(projection), nominal+radius+1)) if not projection[n]]
    assert gaps, f'{path}: overlapping subjects near {nominal}'
    return min(gaps, key=lambda n: abs(n-nominal))

def measure_profile(path, paired, top_anchor=False):
    """Measure rows without editing pixels; anchor loaded/empty bodies together."""
    with Image.open(path) as im:
        assert im.mode == 'RGBA', f'{path} must retain alpha'
        width, height = im.size
        alpha = im.getchannel('A').point(lambda v: 255 if v > 32 else 0)
        columns, rows = alpha.getprojection()
        xs = [0] + [divider(columns, round(i*width/3), round(width*.06), path) for i in (1, 2)] + [width]
        ys = [0, divider(rows, round(height/2), round(height*.2), path), height] if paired else [0, height]
        boxes = []
        for top, bottom in zip(ys, ys[1:]):
            row = []
            for left, right in zip(xs, xs[1:]):
                box = alpha.crop((left, top, right, bottom)).getbbox()
                assert box, f'{path}: empty sprite'
                x, y, end_x, end_y = box
                row.append([left+x, top+y, end_x-x, end_y-y])
            boxes.append(row)
        art = {'size': [width, height], 'frames': boxes[0]}
        if paired:
            empty = {'size': [width, height], 'frames': boxes[1]}
            # Separate clipping boxes keep tall virtual frames from revealing
            # a neighbouring row while both cargo states use identical scales.
            art['clips'] = [box[:] for box in boxes[0]]
            empty['clips'] = [box[:] for box in boxes[1]]
            for i, (a, b) in enumerate(zip(boxes[0], boxes[1])):
                left = min(a[0], b[0])
                right = max(a[0]+a[2], b[0]+b[2])
                h = max(a[3], b[3])
                # Hanging air cargo extends below the aircraft; align its
                # rotor instead of the crate so unloading keeps flight level.
                art['frames'][i] = [left, a[1] if top_anchor else a[1]+a[3]-h, right-left, h]
                empty['frames'][i] = [left, b[1] if top_anchor else b[1]+b[3]-h, right-left, h]
            art['empty'] = empty
        return art

def measure(path, count):
    with Image.open(path) as im:
        assert im.mode == 'RGBA', f'{path} must retain alpha'
        width, height = im.size
        alpha = im.getchannel('A').point(lambda value: 255 if value > 32 else 0)
        columns = alpha.getprojection()[0]
        cuts = [0]
        # Uneven spacing needs a genuinely clear divider, not equal thirds.
        for i in range(1, count):
            nominal = round(i * width / count)
            radius = round(width / count * .12)
            gaps = [x for x in range(nominal-radius, nominal+radius+1) if not columns[x]]
            assert gaps, f'{path}: overlapping subjects near frame {i}'
            cuts.append(min(gaps, key=lambda x: abs(x-nominal)))
        cuts.append(width)
        frames = []
        for i in range(count):
            left, right = cuts[i], cuts[i+1]
            box = alpha.crop((left, 0, right, height)).getbbox()
            assert box, f'{path} frame {i} is empty'
            x, y, end_x, end_y = box
            frames.append([x + left, y, end_x - x, end_y - y])
        return {'size': [width, height], 'frames': frames}

for spec in prompts:
    ident, kind = spec['id'], spec['kind']
    if ident.endswith('-empty'):
        continue
    path = art_root / kind / (ident + '.png')
    if not path.exists():
        continue
    table = tables['props' if ident in props else kind]
    if ident in profiles:
        table[ident] = measure_profile(path, profiles[ident].get('empty', False), ident in {'helicopter', 'tiltrotor'})
        continue
    table[ident] = measure(path, 3 if kind == 'fleet' and ident not in {'crane', 'airdrop'} else 1)
    empty_path = path.with_name(ident + '-empty.png')
    if empty_path.exists():
        art = table[ident]
        empty = measure(empty_path, len(art['frames']))
        for i, (a, b) in enumerate(zip(art['frames'], empty['frames'])):
            sa, sb = art['size'], empty['size']
            x = min(a[0]/sa[0], b[0]/sb[0])
            y = min(a[1]/sa[1], b[1]/sb[1])
            right = max((a[0]+a[2])/sa[0], (b[0]+b[2])/sb[0])
            bottom = max((a[1]+a[3])/sa[1], (b[1]+b[3])/sb[1])
            for obj in (art, empty):
                w, h = obj['size']
                obj['frames'][i] = [round(value, 6) for value in [x*w, y*h, (right-x)*w, (bottom-y)*h]]
        art['empty'] = empty

lines = ['// Measured alpha bounds; generated by scripts/measure-artwork.py.']
for name, table in [('CITY_ART', tables['cities']), ('FLEET_ART', tables['fleet']), ('PROP_ART', tables['props'])]:
    lines.append('export const ' + name + '=' + json.dumps(table, separators=(',', ':')) + ';')
lines.append("export const ILLUSTRATION_ASSETS=[...Object.keys(CITY_ART).map(id=>'artwork/cities/'+id+'.png'),...Object.entries(FLEET_ART).flatMap(([id,art])=>['artwork/fleet/'+id+'.png',...(art.empty?['artwork/fleet/'+id+'-empty.png']:[])]),...Object.keys(PROP_ART).map(id=>'artwork/fleet/'+id+'.png')];")
(art_root / 'manifest.js').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps({key: len(value) for key, value in tables.items()}))

truck_path = root / 'public' / 'truck-art.js'
trucks = {ident: measure_profile(art_root / 'trucks' / (ident+'.png'), spec.get('empty', False)) for ident, spec in profiles.items() if spec['kind'] == 'trucks'}
if trucks:
    import re
    source = truck_path.read_text(encoding='utf-8')
    source = re.sub(r'export const TRUCK_ART=\{.*?\};', 'export const TRUCK_ART='+json.dumps(trucks, separators=(',', ':'))+';', source, count=1, flags=re.S)
    truck_path.write_text(source, encoding='utf-8')
    print(json.dumps({'trucks': len(trucks)}))
