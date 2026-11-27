# Share your work

You fixed an issue, added a persona, or ran the testers on your own app: show it. A post from the person who did the work says more than one from me, and it is how the next contributor finds the project.

## What you can reuse

Everything in [assets/](../assets/) is under the same MIT license as the code. Use it in a post, a talk or an article, with a link to the repo.

- [launch-video.mp4](../assets/launch-video.mp4): the launch video, 26 seconds, with sound. [launch-video.gif](../assets/launch-video.gif) is the same without sound, for places that take no video.
- [localsend-20.mp4](../assets/localsend-20.mp4): 20 phones testing LocalSend at the same time, real screen recordings.
- [dashboard.png](../assets/dashboard.png): the map of every screen, with the path of each tester.
- [social-preview.png](../assets/social-preview.png): the card image, 1280 by 640.
- [logo.svg](../assets/logo.svg): the logo.

Your own material is better. Run with `-f record_video=true` and you get a screen recording of each phone. Look at what is on the screen before you publish it: your results are private until you decide otherwise.

## The badge

If the testers run on your app, add this to your README:

[![tested with mobile-agent-testers](https://img.shields.io/badge/tested%20with-mobile--agent--testers-18181B)](https://github.com/pierridotite/mobile-agent-testers)

```md
[![tested with mobile-agent-testers](https://img.shields.io/badge/tested%20with-mobile--agent--testers-18181B)](https://github.com/pierridotite/mobile-agent-testers)
```

## Writing the post

- Say what you built and why, in your own words. One concrete thing beats a list: a screenshot, a recording, a bug it found.
- Link your pull request and the repo.
- Say that you are a contributor. People trust a post that is clear about who writes it.
- On Reddit, read the rules of the subreddit about self-promotion before you post. Do not ask for upvotes or stars, there or anywhere else.

Starting points, to rewrite as yours:

> **Reddit.** Title: I added [what] to an open-source tool that sends AI testers through a mobile app. Body: what was missing, what you built, one thing that surprised you, the link to your pull request.

> **X.** My first pull request in mobile-agent-testers is merged: [what it does]. [One thing you learned.] [Link]

> **LinkedIn.** I contributed [what] to mobile-agent-testers, an open-source project that runs AI testers on real phone simulators. [Why it mattered to you.] [What you would build next.] [Link]

## Showcase

Posts, talks and apps tested in public. Add yours with a pull request, one line each.

Apps:

- [LocalSend](runs/localsend-20.md), 20 phones in 14 languages, by Pierre Raffalli
- [AnkiDroid and Flutter's animations sample](examples.md), by Pierre Raffalli

Posts and talks:

- Yours goes here.

## The credit line

`SUMMARY.md`, the draft issues from `scripts/draft_issues.py` and the Slack or Discord message end with one line: "Tested with mobile-agent-testers", with a link to this repository. It tells the people you share a result with where it comes from.

To remove it everywhere, set `SUMMARY_CREDIT=0` before you run `collect.sh`, `draft_issues.py` or `notify.py`.

## Citing the project

In a paper, a talk or a product page, cite the repository. The "Cite this repository" button on GitHub gives the reference, from [CITATION.cff](../CITATION.cff).

The license asks one thing: keep the copyright notice when you copy the code ([LICENSE](../LICENSE), [NOTICE](../NOTICE)). A link back is not required. It is appreciated.
