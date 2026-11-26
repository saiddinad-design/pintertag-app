S=['alcoholTobaccoOrDrugUseOrReferences','contests','gamblingSimulated','gunsOrOtherWeapons','medicalOrTreatmentInformation','profanityOrCrudeHumor','sexualContentGraphicAndNudity','sexualContentOrNudity','horrorOrFearThemes','matureOrSuggestiveThemes','violenceCartoonOrFantasy','violenceRealisticProlongedGraphicOrSadistic','violenceRealistic']
Bo=['advertising','datingAndRelationships','gambling','healthOrWellnessTopics','lootBox','messagingAndChat','parentalControls','ageAssurance','sharedLocation','socialMedia','unrestrictedWebAccess','userGeneratedContent']
a={**{k:'NONE' for k in S},**{k:False for k in Bo}}
arid=info['id']
r=api('PATCH',f'/v1/ageRatingDeclarations/{arid}',json={'data':{'type':'ageRatingDeclarations','id':arid,'attributes':a}})
if r is None:
    a['socialMediaAgeRestricted']=False
    r=api('PATCH',f'/v1/ageRatingDeclarations/{arid}',json={'data':{'type':'ageRatingDeclarations','id':arid,'attributes':a}})
print('STEP age', 'OK' if r else 'FAILED')
print('rating', api('GET',f'/v1/apps/{APP}/appInfos')['data'][0]['attributes'].get('appStoreAgeRating'))
