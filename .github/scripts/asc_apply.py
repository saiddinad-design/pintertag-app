rd=api('GET',f"/v1/appStoreVersions/{ver['id']}/appStoreReviewDetail")
a=(rd or {}).get('data') and rd['data']['attributes']
print('REVIEW', a and {k:(bool(v) if k=='contactPhone' else v) for k,v in a.items() if k!='notes'}, a and len(a.get('notes') or ''))
