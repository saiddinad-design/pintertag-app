import os, sys, time, json, jwt, requests
KID=os.environ['KID']; ISS=os.environ['ISS']; KEY=open(os.environ['KEY_FILE']).read()
APP='6839473413'; B='https://api.appstoreconnect.apple.com'
def tok():
    n=int(time.time()); return jwt.encode({'iss':ISS,'iat':n,'exp':n+1100,'aud':'appstoreconnect-v1'},KEY,algorithm='ES256',headers={'kid':KID})
def api(m,u,**k):
    r=requests.request(m,u if u.startswith('http') else B+u,headers={'Authorization':'Bearer '+tok(),'Content-Type':'application/json'},**k)
    if r.status_code>=400: print('ERR',m,u,r.status_code,r.text[:1500]); return None
    return r.json() if r.text else {}
def show(t,x): print('==',t); print(json.dumps(x,indent=1)[:4000])
MODE=os.environ.get('MODE','dump')
app=api('GET',f'/v1/apps/{APP}'); show('app',app['data']['attributes'])
infos=api('GET',f'/v1/apps/{APP}/appInfos?include=primaryCategory,secondaryCategory')
show('appInfos',[(i['id'],i['attributes'],i['relationships'].get('primaryCategory',{}).get('data'),i['relationships'].get('secondaryCategory',{}).get('data')) for i in infos['data']])
info=infos['data'][0]
show('infoLocs',[(l['id'],l['attributes']) for l in api('GET',f"/v1/appInfos/{info['id']}/appInfoLocalizations")['data']])
ar=api('GET',f"/v1/appInfos/{info['id']}/ageRatingDeclaration"); show('ageRating',ar and ar['data'])
ver=api('GET',f'/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS')['data'][0]; show('version',(ver['id'],ver['attributes']))
show('verLocs',[(l['id'],l['attributes']) for l in api('GET',f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")['data']])
show('review',api('GET',f"/v1/appStoreVersions/{ver['id']}/appStoreReviewDetail"))
show('build',api('GET',f"/v1/appStoreVersions/{ver['id']}/build"))
show('price',api('GET',f'/v1/apps/{APP}/appPriceSchedule?include=manualPrices'))
show('avail',api('GET',f'/v1/apps/{APP}/appAvailabilityV2'))
if MODE=='apply':
    exec(open('.github/scripts/asc_apply.py').read())
