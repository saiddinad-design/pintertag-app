r=api('PATCH',f"/v1/appStoreVersions/{ver['id']}",json={'data':{'type':'appStoreVersions','id':ver['id'],'attributes':{'releaseType':'MANUAL'}}})
print('RELEASE', r and r['data']['attributes']['releaseType'])
print('BUILD', api('GET',f"/v1/appStoreVersions/{ver['id']}/build")['data']['attributes']['version'])
subs=api('GET',f'/v1/reviewSubmissions?filter[app]={APP}&filter[state]=READY_FOR_REVIEW')['data']
print('SUBS',[s['id'] for s in subs])
if subs and r:
    s=subs[0]; items=api('GET',f"/v1/reviewSubmissions/{s['id']}/items")['data']; print('ITEMS',len(items))
    x=api('PATCH',f"/v1/reviewSubmissions/{s['id']}",json={'data':{'type':'reviewSubmissions','id':s['id'],'attributes':{'submitted':True}}})
    print('SUBMIT', x and x['data']['attributes'])
time.sleep(10)
print('STATE', api('GET',f"/v1/appStoreVersions/{ver['id']}")['data']['attributes']['appStoreState'])
