# runs inside asc_meta.py (api, APP, info, ver available)
DESC="""Pintertag is your feed's art director. See how your Instagram grid will look before you post, and get a clear answer on what to post next.

PLAN YOUR NEXT 9
Add your photos and arrange your next 9 posts in a real 3-column grid. Drag to swap, crop to fit, and see the whole feed before anything goes live. Every empty slot tells you what kind of shot to post there.

BRAND AND PERSONAL
Keep two separate grids in one app: one for your own account, one for your brand. Each has its own photos, plan and calendar.

SCORE YOUR GRID
Upload a screenshot of your profile and get a grid score with one clear fix.

SCORE YOUR CAROUSEL
Get a score out of 10 for your carousel: the hook, whether the photos belong together, the flow and the ending.

PICK THE BEST FRAMES
Add up to 40 photos from a shoot. Pintertag picks the strongest frames and suggests a carousel order.

DOES IT FIT MY GRID?
Check a new photo against your feed before you post it.

PHOTO BOOTH
Turn your phone into a photo booth: a single black and white print or a 3 or 4 frame strip.

POST CALENDAR
Plan which day each post goes out and tick it off once it's shared.

YOUR PHOTOS STAY YOURS
No account, no login. Your photos and plans stay on your phone and are never uploaded.

Pintertag is free. Questions or ideas: support@pintertag.com"""
PROMO="Plan your next 9 posts, score your grid and carousels, and pick the best frames from a shoot. Your feed's art director, free."
KW="grid,preview,aesthetic,layout,carousel,photo,booth,schedule,content,creator,influencer,posts,score"
assert len(KW)<=100 and len(PROMO)<=170 and len(DESC)<=4000
def step(name,fn):
    r=fn(); print('STEP',name,'OK' if r is not None else 'FAILED')
loc=api('GET',f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")['data'][0]
step('desc',lambda: api('PATCH',f"/v1/appStoreVersionLocalizations/{loc['id']}",json={'data':{'type':'appStoreVersionLocalizations','id':loc['id'],'attributes':{'description':DESC}}}))
