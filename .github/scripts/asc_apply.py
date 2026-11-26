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
Photos stay on your phone. A free account is optional and only backs up your plan if you want it.

Pintertag is free. Questions or ideas: support@pintertag.com"""
PROMO="Plan your next 9 posts, score your grid and carousels, and pick the best frames from a shoot. Your feed's art director, free."
KW="grid,preview,aesthetic,layout,carousel,photo,booth,schedule,content,creator,influencer,posts,score"
assert len(KW)<=100 and len(PROMO)<=170 and len(DESC)<=4000
def step(name,fn):
    try: r=fn(); print('STEP',name,'OK' if r is not None else 'FAILED')
    except Exception as e: print('STEP',name,'EXC',e)
loc=api('GET',f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")['data'][0]
step('version-loc',lambda: api('PATCH',f"/v1/appStoreVersionLocalizations/{loc['id']}",json={'data':{'type':'appStoreVersionLocalizations','id':loc['id'],'attributes':{'description':DESC,'keywords':KW,'promotionalText':PROMO,'supportUrl':'https://pintertag.com/support/','marketingUrl':'https://pintertag.com/'}}}))
il=api('GET',f"/v1/appInfos/{info['id']}/appInfoLocalizations")['data'][0]
step('info-loc',lambda: api('PATCH',f"/v1/appInfoLocalizations/{il['id']}",json={'data':{'type':'appInfoLocalizations','id':il['id'],'attributes':{'subtitle':'Grid score & feed art director','privacyPolicyUrl':'https://pintertag.com/privacy/'}}}))
step('category',lambda: api('PATCH',f"/v1/appInfos/{info['id']}",json={'data':{'type':'appInfos','id':info['id'],'relationships':{'primaryCategory':{'data':{'type':'appCategories','id':'PHOTO_AND_VIDEO'}},'secondaryCategory':{'data':{'type':'appCategories','id':'PRODUCTIVITY'}}}}}))
step('copyright',lambda: api('PATCH',f"/v1/appStoreVersions/{ver['id']}",json={'data':{'type':'appStoreVersions','id':ver['id'],'attributes':{'copyright':'2026 Said Mohamed Ibrahim'}}}))
step('content-rights',lambda: api('PATCH',f'/v1/apps/{APP}',json={'data':{'type':'apps','id':APP,'attributes':{'contentRightsDeclaration':'DOES_NOT_USE_THIRD_PARTY_CONTENT'}}}))
# age rating: everything none / no
arid=info['id']; cur=api('GET',f'/v1/appInfos/{arid}/ageRatingDeclaration')['data']['attributes']
skip={'kidsAgeBand','ageRatingOverride','ageRatingOverrideV2','koreaAgeRatingOverride','gracRatingClassificationNumber','developerAgeRatingInfoUrl'}
attrs={}
for k in cur:
    if k in skip: continue
    for v in ('NONE',False):
        r=requests.patch(f'{B}/v1/ageRatingDeclarations/{arid}',headers={'Authorization':'Bearer '+tok(),'Content-Type':'application/json'},json={'data':{'type':'ageRatingDeclarations','id':arid,'attributes':{k:v}}})
        if r.status_code<400: attrs[k]=v; break
    else: print('age attr failed',k,r.text[:300])
print('STEP age-rating set',attrs)
# build
b=api('GET',f'/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=1&filter[processingState]=VALID')
if b and b['data']:
    bd=b['data'][0]; print('build',bd['attributes']['version'],bd['attributes'].get('usesNonExemptEncryption'))
    if bd['attributes'].get('usesNonExemptEncryption') is None:
        step('encryption',lambda: api('PATCH',f"/v1/builds/{bd['id']}",json={'data':{'type':'builds','id':bd['id'],'attributes':{'usesNonExemptEncryption':False}}}))
    step('attach-build',lambda: api('PATCH',f"/v1/appStoreVersions/{ver['id']}/relationships/build",json={'data':{'type':'builds','id':bd['id']}}))
# review details (phone left for owner)
rd={'contactFirstName':'Said','contactLastName':'Ibrahim','contactEmail':'support@pintertag.com','demoAccountRequired':False,
 'notes':"No login is needed. Every feature works without an account. A free account (email one-time code, no password) is optional and only backs up the user's plan. Account deletion: Settings > Delete account. Photos stay on the device; the camera is used only for the photo booth and the photo library only when the user adds photos. No ads, no tracking, no in-app purchases."}
step('review-detail',lambda: api('POST','/v1/appStoreReviewDetails',json={'data':{'type':'appStoreReviewDetails','attributes':rd,'relationships':{'appStoreVersion':{'data':{'type':'appStoreVersions','id':ver['id']}}}}}))
# price: free
pp=api('GET',f'/v1/apps/{APP}/appPricePoints?filter[territory]=USA&limit=200')
free=next((p for p in (pp or {}).get('data',[]) if float(p['attributes']['customerPrice'])==0),None)
if free:
    step('price-free',lambda: api('POST','/v1/appPriceSchedules',json={'data':{'type':'appPriceSchedules','relationships':{'app':{'data':{'type':'apps','id':APP}},'baseTerritory':{'data':{'type':'territories','id':'USA'}},'manualPrices':{'data':[{'type':'appPrices','id':'${p0}'}]}}},'included':[{'type':'appPrices','id':'${p0}','attributes':{'startDate':None},'relationships':{'appPricePoint':{'data':{'type':'appPricePoints','id':free['id']}}}}]}))
# availability: all territories
ts=api('GET','/v1/territories?limit=200')['data']
inc=[{'type':'territoryAvailabilities','id':'${t%d}'%i,'attributes':{'available':True},'relationships':{'territory':{'data':{'type':'territories','id':t['id']}}}} for i,t in enumerate(ts)]
step('availability',lambda: api('POST','/v2/appAvailabilities',json={'data':{'type':'appAvailabilities','attributes':{'availableInNewTerritories':True},'relationships':{'app':{'data':{'type':'apps','id':APP}},'territoryAvailabilities':{'data':[{'type':'territoryAvailabilities','id':x['id']} for x in inc]}}},'included':inc}))
print('territories',len(ts))
