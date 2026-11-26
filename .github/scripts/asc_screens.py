import os, sys, time, glob, hashlib, json, jwt, requests
KID=os.environ['KID']; ISS=os.environ['ISS']; KEY=open(os.environ['KEY_FILE']).read()
APP=os.environ.get('APP_ID','6839473413'); B='https://api.appstoreconnect.apple.com/v1'
def tok():
    n=int(time.time()); return jwt.encode({'iss':ISS,'iat':n,'exp':n+1100,'aud':'appstoreconnect-v1'},KEY,algorithm='ES256',headers={'kid':KID})
def api(m,u,**k):
    r=requests.request(m,u if u.startswith('http') else B+u,headers={'Authorization':'Bearer '+tok(),'Content-Type':'application/json'},**k)
    if r.status_code>=400: print(m,u,r.status_code,r.text[:800]); r.raise_for_status()
    return r.json() if r.text else {}
vs=api('GET',f'/apps/{APP}/appStoreVersions?filter[platform]=IOS&limit=10')['data']
print('versions',[(v['attributes']['versionString'],v['attributes']['appStoreState']) for v in vs])
ver=next(v for v in vs if v['attributes']['appStoreState'] in ('PREPARE_FOR_SUBMISSION','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED'))
locs=api('GET',f"/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")['data']
print('locales',[l['attributes']['locale'] for l in locs])
SETS={'APP_IPHONE_67':'iphone18promax','APP_IPHONE_61':'iphone-6.3in'}
for l in locs:
    loc=l['attributes']['locale']; pre='tr' if loc.startswith('tr') else ('en' if loc.startswith('en') else None)
    if not pre: continue
    have={s['attributes']['screenshotDisplayType']:s for s in api('GET',f"/appStoreVersionLocalizations/{l['id']}/appScreenshotSets")['data']}
    for dt,tag in SETS.items():
        files=sorted(glob.glob(f'store/screenshots/{pre}-{tag}-*.png'))
        if not files: continue
        if dt in have:
            sid=have[dt]['id']
            for s in api('GET',f'/appScreenshotSets/{sid}/appScreenshots')['data']: api('DELETE',f"/appScreenshots/{s['id']}")
        else:
            sid=api('POST','/appScreenshotSets',json={'data':{'type':'appScreenshotSets','attributes':{'screenshotDisplayType':dt},'relationships':{'appStoreVersionLocalization':{'data':{'type':'appStoreVersionLocalizations','id':l['id']}}}}})['data']['id']
        for f in files:
            data=open(f,'rb').read()
            s=api('POST','/appScreenshots',json={'data':{'type':'appScreenshots','attributes':{'fileName':os.path.basename(f),'fileSize':len(data)},'relationships':{'appScreenshotSet':{'data':{'type':'appScreenshotSets','id':sid}}}}})['data']
            for op in s['attributes']['uploadOperations']:
                h={x['name']:x['value'] for x in op.get('requestHeaders',[])}
                r=requests.request(op['method'],op['url'],headers=h,data=data[op['offset']:op['offset']+op['length']]); r.raise_for_status()
            api('PATCH',f"/appScreenshots/{s['id']}",json={'data':{'type':'appScreenshots','id':s['id'],'attributes':{'uploaded':True,'sourceFileChecksum':hashlib.md5(data).hexdigest()}}})
            print('uploaded',loc,dt,os.path.basename(f))
time.sleep(20)
for l in locs:
    for st in api('GET',f"/appStoreVersionLocalizations/{l['id']}/appScreenshotSets")['data']:
        sh=api('GET',f"/appScreenshotSets/{st['id']}/appScreenshots")['data']
        print('check',l['attributes']['locale'],st['attributes']['screenshotDisplayType'],[x['attributes']['assetDeliveryState']['state'] for x in sh])
