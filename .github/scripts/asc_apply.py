av=api('GET',f'/v1/apps/{APP}/appAvailabilityV2')
avid=av['data']['id'] if av else APP
url=f'/v2/appAvailabilities/{avid}/territoryAvailabilities?limit=200&include=territory'
tas=api('GET',url)
chn=[t for t in tas['data'] if t['relationships']['territory']['data']['id']=='CHN']
print('found',len(tas['data']),[ (t['id'],t['attributes']) for t in chn])
for t in chn:
    r=api('PATCH',f"/v1/territoryAvailabilities/{t['id']}",json={'data':{'type':'territoryAvailabilities','id':t['id'],'attributes':{'available':False}}})
    print('STEP china-off', 'OK' if r else 'FAILED', r and r['data']['attributes'])
