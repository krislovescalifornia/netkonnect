"""Measure settlement atlas viewports without changing any source pixels."""
import json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'public/artwork/world/settlements'
ROWS=[('rural',[0,303,543,788,1024]),('residential',[0,310,568,805,1024]),('civic',[0,272,535,781,1024]),('metropolitan',[0,282,531,765,1024]),('future',[0,280,525,772,1024])]
frames=[]
for name,bounds in ROWS:
    image=Image.open(ART/(name+'-v2.png'))
    assert image.mode=='RGBA'
    alpha=image.getchannel('A'); w,h=image.size
    for top,bottom in zip(bounds,bounds[1:]):
        x0,y0,x1,y1=alpha.crop((0,top,w,bottom)).point(lambda a:255 if a>128 else 0).getbbox()
        x0=max(0,x0-4); x1=min(w,x1+4); y0=max(top,top+y0-4); y1=min(bottom,top+y1+4)
        frames.append({'stage':len(frames),'file':'artwork/world/settlements/'+name+'-v2.png','source':[w,h],'box':[x0,y0,x1-x0,y1-y0]})
assert len(frames)==20
(ART/'frames.js').write_text('// Measured alpha bands; original atlas pixels remain unchanged.\nexport const SETTLEMENT_FRAMES='+json.dumps(frames,separators=(',',':'))+';\n',encoding='utf-8')
print('Measured all twenty settlement viewports.')
