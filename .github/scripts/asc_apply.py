DESC="""Pintertag is your feed's art director. See how your Instagram grid will look before you post, and get a clear answer on what to post next. No account, no login: open it and start.

PLAN YOUR NEXT 9
Add your photos and arrange your next 9 posts in a real 3-column grid. Drag to swap, crop to fit, and see the whole feed before anything goes live. Every empty slot tells you what kind of shot to post there.

BRAND AND PERSONAL
Keep two separate grids in one app: one for your own account, one for your brand. Each has its own photos, plan and calendar.

SCORE YOUR GRID
Add a screenshot of your profile and get a grid score with one clear fix.

SCORE YOUR CAROUSEL
Get a score out of 10 for your carousel: the hook, whether the photos belong together, the flow and the ending.

PICK THE BEST FRAMES
Add up to 40 photos from a shoot. Pintertag picks the strongest frames and suggests a carousel order.

DOES IT FIT MY GRID?
Check a new photo against your feed before you post it.

PHOTO BOOTH
Turn your phone into a photo booth: a single black and white print or a 3 or 4 frame strip.

POST CALENDAR AND REMINDERS
Pick the day and time for each post and story. Pintertag sends you a reminder when it's time, then you share it through your phone's share menu. Pintertag never posts for you and never asks for your Instagram password.

YOUR PHOTOS STAY YOURS
Everything works offline. Your photos and plans stay on your phone and are never uploaded. No ads, no tracking.

Pintertag is free. Questions or ideas: support@pintertag.com

Pintertag is an independent app and is not affiliated with, endorsed or sponsored by Instagram or Meta."""
NOTES="""Pintertag is a feed planner for Instagram creators and small brands: it helps decide what to post before posting. There is no account or login; every feature works right away and offline.

How to test (about 2 minutes):
1. First launch: tap "Start with your photos" and add a few photos from the library.
2. Grid tab: drag to swap posts, tap a post to crop. Turn on "What goes where" to see what each slot should be. The Brand / Personal switch keeps two separate grids.
3. The # button (Tools): Carousel & shoot (carousel score, best of your shoot), Your Instagram grid (score from a profile screenshot), Booth, Fits my grid.
4. Calendar tab: give a post a day and time. The app schedules a local notification reminder for that time; iOS asks for notification permission only at this step.
5. Sharing and saving use the iOS share sheet. The app never posts on its own and never asks for an Instagram login.
6. Booth uses the camera (permission asked only when the booth opens) and makes a 3 or 4 frame strip.

Native features: iOS share sheet, local notification reminders, photo library and camera, haptics, full offline use (airplane mode works).
Data: photos and plans are stored only on the device; Settings > Your data downloads or deletes them. Only anonymous usage counts are sent (which feature was used, per day), not linked to anyone. No ads, no tracking, no in-app purchases.
Pintertag is not affiliated with Instagram or Meta."""
loc=api('GET',f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")['data'][0]
print('DESC', api('PATCH',f"/v1/appStoreVersionLocalizations/{loc['id']}",json={'data':{'type':'appStoreVersionLocalizations','id':loc['id'],'attributes':{'description':DESC}}}) is not None, len(DESC))
rd=api('GET',f"/v1/appStoreVersions/{ver['id']}/appStoreReviewDetail")['data']
print('NOTES', api('PATCH',f"/v1/appStoreReviewDetails/{rd['id']}",json={'data':{'type':'appStoreReviewDetails','id':rd['id'],'attributes':{'notes':NOTES}}}) is not None, len(NOTES))
