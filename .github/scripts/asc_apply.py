import re
lib=api('GET',f'/v1/apps/{APP}/assetLibrary')['data']['id']; print('lib',lib)
rd=api('GET','/v1/appAssetLibraryRefData')
txt=json.dumps(rd)
open('refdata.json','w').write(txt)
print('REFLEN',len(txt))
for m in sorted(set(re.findall(r'"([A-Z_]*(?:HEADER|SEARCH|UNIVERSAL)[A-Z_]*)"',txt))): print('ENUM',m)
# show snippets around header/search
for kw in ['PRODUCT_PAGE_HEADER','SEARCH_RESULT']:
    for mm in list(re.finditer(kw,txt))[:6]: print('SNIP',kw,txt[max(0,mm.start()-300):mm.start()+400].replace('\n',' '))
vloc=api('GET',f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")['data'][0]['id']
ids={}
for fn in ['pintertag-header-3840x1646.png','pintertag-search-3840x2560.png']:
    data=open('store/creative/'+fn,'rb').read()
    r=api('POST','/v1/appAssetLibraryImages',json={'data':{'type':'appAssetLibraryImages','attributes':{'fileName':fn,'fileSize':len(data),'category':'CREATIVE_ASSETS','referenceName':fn[10:-4]},'relationships':{'assetLibrary':{'data':{'type':'appAssetLibraries','id':lib}}}}})
    if not r: continue
    im=r['data']
    for op in im['attributes']['uploadOperations']:
        h={x['name']:x['value'] for x in op.get('requestHeaders',[])}
        requests.request(op['method'],op['url'],headers=h,data=data[op['offset']:op['offset']+op['length']]).raise_for_status()
    api('PATCH',f"/v1/appAssetLibraryImages/{im['id']}",json={'data':{'type':'appAssetLibraryImages','id':im['id'],'attributes':{'uploaded':True}}})
    ids[fn]=im['id']
for i in range(30):
    st={fn:api('GET',f'/v1/appAssetLibraryImages/{i_}')['data']['attributes'] for fn,i_ in ids.items()}
    if all(a['state'] not in ('AWAITING_UPLOAD','UPLOAD_COMPLETE') for a in st.values()): break
    time.sleep(10)
for fn,a in st.items(): print('IMG',fn,a['state'],a.get('specId'),a.get('stateDetails'))
print('IDS',json.dumps(ids)); print('VLOC',vloc)
