vloc='48e08252-8be6-45df-b4ae-bfc7c1ee8f89'
for pt,img in [('PRODUCT_PAGE_HEADER_ASSET','77000019-7aa1-8505-803a-fc28434721bd'),('APP_STORE_SEARCH_RESULTS_ASSET','95c00019-7aa1-8505-8017-ae8d31334955')]:
    r=api('POST','/v1/appAssetLibraryPlacements',json={'data':{'type':'appAssetLibraryPlacements','attributes':{'placementType':pt,'placementGroup':'DEFAULT_PROFILE'},'relationships':{'image':{'data':{'type':'appAssetLibraryImages','id':img}},'appStoreVersionLocalization':{'data':{'type':'appStoreVersionLocalizations','id':vloc}}}}})
    print('PLACE',pt, r and r['data']['attributes']['state'])
pl=api('GET',f'/v1/appStoreVersionLocalizations/{vloc}/placements?limit=50')
from collections import Counter
print('ALL',Counter((p['attributes']['placementType'],p['attributes']['placementGroup']) for p in pl['data']))
