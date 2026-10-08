"""Measure original imagegen pixels for SVG viewports; never modify the PNGs."""
import json
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'public/artwork/world/transport'
frames = {}
for filename, names in [
    ('road-surfaces-v1.png', ['trail', 'gravel', 'road', 'boulevard', 'highway', 'superhighway']),
    ('corridors-v1.png', ['rail', 'water', 'runway']),
]:
    image = Image.open(ART / filename).convert('RGBA')
    alpha = image.getchannel('A')
    rows = [y for y in range(image.height) if sum(a > 100 for a in alpha.crop((0,y,image.width,y+1)).tobytes()) > image.width * .5]
    bands = []
    for y in rows:
        if not bands or y > bands[-1][-1] + 1: bands.append([y])
        else: bands[-1].append(y)
    assert len(bands) == len(names), (filename, [(b[0], b[-1]) for b in bands])
    for name, band in zip(names, bands):
        top, bottom = band[0], band[-1] + 1
        bounds = alpha.crop((0,top,image.width,bottom)).point(lambda a: 255 if a > 100 else 0).getbbox()
        left, right = bounds[0], bounds[2]
        frames[name] = {'file': 'artwork/world/transport/'+filename, 'source': [image.width,image.height], 'box': [left,top,right-left,bottom-top]}
image = Image.open(ART / 'airports-v1.png').convert('RGBA')
alpha = image.getchannel('A')
for column, name in enumerate(['airport','spaceport']):
    left = column * image.width // 2
    bounds = alpha.crop((left,0,left+image.width//2,image.height)).point(lambda a: 255 if a > 100 else 0).getbbox()
    frames[name] = {'file':'artwork/world/transport/airports-v1.png','source':[image.width,image.height], 'box':[left+bounds[0],bounds[1],bounds[2]-bounds[0],bounds[3]-bounds[1]]}
(ART / 'frames.js').write_text('// Measured alpha bounds; original source PNG pixels are preserved.\nexport const TRANSPORT_FRAMES = '+json.dumps(frames,indent=2)+';\n', encoding='utf8')
print(json.dumps(frames,indent=2))
