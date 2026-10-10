"""Register original imagegen pixels as independent runtime modules (no repainting)."""
from pathlib import Path
import json
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'public' / 'artwork' / 'living'
def silhouette_bounds(cell):
    # Find the principal silhouette rather than registering a neighboring row's
    # stray edge pixels. This only selects the original atlas viewport.
    w, h = cell.size
    alpha = list(cell.getchannel('A').getdata())
    seen = bytearray(w*h)
    components = []
    for start, value in enumerate(alpha):
        if value <= 24 or seen[start]:
            continue
        seen[start] = 1
        stack = [start]
        left, top, right, bottom, count = w, h, 0, 0, 0
        while stack:
            pos = stack.pop()
            x, y = pos % w, pos // w
            left, top, right, bottom = min(left,x), min(top,y), max(right,x+1), max(bottom,y+1)
            count += 1
            for neighbor in (pos-w if y else -1, pos+w if y<h-1 else -1, pos-1 if x else -1, pos+1 if x<w-1 else -1):
                if neighbor >= 0 and not seen[neighbor] and alpha[neighbor] > 24:
                    seen[neighbor] = 1
                    stack.append(neighbor)
        if count > 12:
            components.append((count,(left,top,right,bottom)))
    _, main = max(components)
    boxes = [main]
    for count, box in components:
        if (box[1] <= 2 or box[3] >= h-2) and box[3]-box[1] < h*.12:
            continue
        if box[1] >= main[1]-8 and box[3] <= main[3]+8 and box[0] < main[2]+22 and box[2] > main[0]-22:
            boxes.append(box)
    return (min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes))
batches = [[4, 5, 6, 7], [8, 9, 10, 11], [0, 1, 2, 3], [12, 13, 14, 15], [16, 17, 18, 19]]
frames = [None] * 20
for batch, stages in enumerate(batches):
    image = Image.open(root / f'atlas-{batch}.png')
    assert image.mode == 'RGBA' and image.getchannel('A').getextrema()[0] == 0
    w, h = image.size
    for row, stage in enumerate(stages):
        frames[stage] = []
        for col in range(5):
            cell = image.crop((round(col*w/5), round(row*h/4), round((col+1)*w/5), round((row+1)*h/4)))
            # Bounds affect the viewport only; retain every original pixel inside.
            box = silhouette_bounds(cell)
            assert box, (stage, col)
            box = (max(0, box[0]-2), max(0, box[1]-2), min(cell.width, box[2]+2), min(cell.height, box[3]+2))
            sprite = cell.crop(box)
            name = f'level-{stage+1:02d}-module-{col}.png'
            sprite.save(root / name)
            frames[stage].append({'file': 'artwork/living/' + name, 'size': list(sprite.size)})
(root / 'frames.js').write_text('// Registered imagegen sprites, original RGBA pixels and natural proportions.\nexport const LIVING_FRAMES=' + json.dumps(frames, separators=(',', ':')) + ';\n', encoding='utf-8')
print('Registered 100 independent architecture modules across 20 levels.')
