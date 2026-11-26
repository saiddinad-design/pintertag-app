for i in range(60):
    b=api('GET',f'/v1/builds?filter[app]={APP}&filter[version]=13&limit=1')
    st=b['data'][0]['attributes']['processingState'] if b and b['data'] else 'MISSING'
    if st=='VALID': break
    time.sleep(20)
print('BUILD13',st)
if st=='VALID':
    bd=b['data'][0]
    subs=api('GET',f'/v1/reviewSubmissions?filter[app]={APP}&filter[state]=READY_FOR_REVIEW')['data']
    for s in subs:
        for it in api('GET',f"/v1/reviewSubmissions/{s['id']}/items")['data']:
            print('DEL item',it['id'], api('DELETE',f"/v1/reviewSubmissionItems/{it['id']}") is not None)
    r=api('PATCH',f"/v1/appStoreVersions/{ver['id']}/relationships/build",json={'data':{'type':'builds','id':bd['id']}})
    print('ATTACH', r is not None)
    if subs:
        r=api('POST','/v1/reviewSubmissionItems',json={'data':{'type':'reviewSubmissionItems','relationships':{'reviewSubmission':{'data':{'type':'reviewSubmissions','id':subs[0]['id']}},'appStoreVersion':{'data':{'type':'appStoreVersions','id':ver['id']}}}}})
        print('READD', r and r['data']['attributes'])
    print('NOW', api('GET',f"/v1/appStoreVersions/{ver['id']}/build")['data']['attributes']['version'])
