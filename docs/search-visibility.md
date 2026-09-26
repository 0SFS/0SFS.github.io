# Getting 0SFS found on Google

The goal: a Google search for `0sfs` shows https://0sfs.github.io/ as the first result, without ads.

This page says where that stands, what was changed on the site and on GitHub, and where to post when 0SFS is ready for public release. Everything here was checked on 25 and 26 September 2026.

## What is done and what is left

Done on 26 September 2026:

- The site's tags, headings, `robots.txt` and sitemap ([On the site](#on-the-site), steps 2 to 6), in commit b6bb380e. They go live with the next `npm run deploy`.
- The repository's description and topics, the organization's name, description, website and [profile README](https://github.com/0SFS/.github/blob/main/profile/README.md), the README's first link, and FOSS Earth's README ([On GitHub](#on-github)).

Left to do:

- **Search Console and Bing Webmaster Tools** ([step 1](#on-the-site)). They need your Google and Microsoft accounts.
- **Your own GitHub profile, and every post under [Where to post](#where-to-post)**, wait until 0SFS is ready for the public, so that people who find it that way get a finished simulator.

## Where it stood

Before the changes of 26 September:

- **Google itself had not been checked.** The site had no Search Console verification file or tag, so there was no record of what Google had indexed or which searches showed the site.
- **Another search engine ranked the site third for `0sfs`.** The GitHub repository was first and your [JSBSim PR #1505](https://github.com/JSBSim-Team/jsbsim/pull/1505) was second. The other results were unrelated: a ceiling fan whose model number contains 0SFS, and a stock ticker. Almost nothing else competes for `0sfs`, so the site mainly has to beat its own repository.
- **`OSFS`, with the letter O, is taken.** For `OSFS open source flight simulator` the site ranked fourth, behind two SourceForge projects with the same name ([Phoenix OSFS](https://sourceforge.net/projects/phoenixosfs/) and [Open Source Flight Simulator](https://sourceforge.net/projects/openfs/)).
- **The page never said "0SFS".** Its `<title>` and the first line of text said "OSFS — Open Source Flight Simulator", with the letter O. The digit spelling appeared only in the address.
- **The home page had no description, canonical link, preview image, site-name data, `robots.txt` or sitemap.** `/`, `/fly/` and `/rc/` were copies of one `index.html`, so all three had the same title.
- **On GitHub,** the repository's website field pointed at the site, but the repository had no description and no topics. The 0SFS organization had no display name, description or website. FOSS Earth's README linked the 0sfs repository, not the site.

## Spelling

Since the rename on 9 September 2026 the product has been called OSFS, with the letter O ([rename record](../RENAME_PLAN.md)). The address, the organization and the repository all use a zero, and people who have seen a link will type what they saw there. Google builds a result's title from the page's `<title>`, its headings, the text of links pointing at it and its `WebSite` structured data ([Title links](https://developers.google.com/search/docs/appearance/title-link)). Two spellings split those signals.

**Decided on 26 September 2026: write 0SFS, with a zero, in the title, the heading and every post, and give OSFS and "Open Source Flight Simulator" as alternate names in the structured data.** The site's title and information page, the README and the GitHub profiles now say 0SFS. The simulator, the phone controller, the Home Screen names and the other docs still say OSFS. The alternative was to keep OSFS and add 0SFS beside it, as in `OSFS (0SFS) — Open Source Flight Simulator`. That keeps the rename but still leaves `osfs` searches to the SourceForge projects.

## On the site

These are changes to this repository's `index.html`, `public/` and the build. The most useful comes first. Steps 2 to 6 are done; step 1 is yours.

1. **Set up Search Console.** Add a URL-prefix property for `https://0sfs.github.io/` at [Search Console](https://search.google.com/search-console). A domain property needs DNS records, and `github.io` doesn't let you add them. Verify with the HTML file Google offers: put it in `public/` so the build copies it to the site root, then deploy. Submit `sitemap.xml`, then use URL Inspection to request indexing of `/` and `/fly/`. Google says crawling "can take anywhere from a few days to a few weeks". There is a quota, and asking again doesn't make it faster ([Ask Google to recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)). Do the same in Bing Webmaster Tools, which can import the Search Console property.
2. **Done: the name is in the page text.** The `<title>` says `0SFS — Open Source Flight Simulator`. The first-paint title in `index.html` is an `<h1>`, since Google reads headings, and the information page's `<h1>` now includes 0SFS, which used to sit in a paragraph above it.
3. **Done: the home page's tags** in `index.html`:
   - A `<meta name="description">` of one or two sentences, which Google may show under the title.
   - `<link rel="canonical" href="https://0sfs.github.io/">`.
   - Open Graph and Twitter card tags with a preview image, so links posted to Reddit, Discord and X show a picture. The image is the README screenshot, copied to `public/preview.jpg`. Its scenery is USGS imagery, which is in the public domain.
   - `WebSite` structured data. Google uses it for the site name shown above the result, and it must be on the home page. Subdomains such as `0sfs.github.io` are supported ([Site names](https://developers.google.com/search/docs/appearance/site-names)).

     ```html
     <script type="application/ld+json">
     {
       "@context": "https://schema.org",
       "@type": "WebSite",
       "name": "0SFS",
       "alternateName": ["OSFS", "Open Source Flight Simulator"],
       "url": "https://0sfs.github.io/"
     }
     </script>
     ```
4. **Done: `/fly/` and `/rc/` have their own tags.** The build writes both from `index.html` in `closeBundle` ([vite.config.ts](../vite.config.ts)), through [pages-html.mjs](../scripts/pages-html.mjs). `/fly/` gets the title `Fly — 0SFS`, a canonical link to `https://0sfs.github.io/fly/`, and no `WebSite` data. `/rc/` gets `<meta name="robots" content="noindex">` in place of the canonical link: the phone controller is no use as a search result. The build fails if `index.html` loses a tag it rewrites.
5. **Done: `public/robots.txt` and `public/sitemap.xml`.** The sitemap lists `/` and `/fly/`. `robots.txt` only has to name it:

   ```text
   User-agent: *
   Allow: /
   Sitemap: https://0sfs.github.io/sitemap.xml
   ```
6. **Done: more words in the first paint.** JavaScript draws the information page. Before that, the HTML held two sentences, the only text on the page that didn't need JavaScript. A static paragraph now says what 0SFS is and links the repository, which gives Google text to index and to match against searches.

## On GitHub

The repository outranks the site, so the repository should send people to it. All of this is done except your own profile.

- **Done: repository description and topics.** Set with:

  ```sh
  gh repo edit 0SFS/0SFS.github.io \
    --description "0SFS: an open-source flight simulator in the browser, with JSBSim physics over real terrain. Fly at https://0sfs.github.io/" \
    --add-topic flight-simulator,flight-simulation,flightsim,jsbsim,webassembly,webgpu,babylonjs,browser-game,3d-tiles,aviation
  ```

  Topic pages are where the competitor research found most of the other simulators ([Sources](open-source-competitors.md#sources)).
- **Done: organization profile.** The display name is 0SFS, the description is "An open-source flight simulator that runs in the browser.", and the website is `https://0sfs.github.io/`. The profile README is in [0SFS/.github](https://github.com/0SFS/.github).
- **Done: README.** The title is the first link, labelled "0SFS", and goes to `https://0sfs.github.io/`. The first link used to be the badge to `/fly/`.
- **Done: FOSS Earth's README** links the site as well as the repository.
- **Not yet: your own GitHub profile** can list the site as its website once 0SFS is ready for the public.

## How to post

- **Link `https://0sfs.github.io/`, the page that should rank, and write "0SFS" next to the link and in the title.** A link to the repository helps the repository. Show HN is the one exception: its rules exclude landing pages, so link `/fly/` there ([Show HN](https://news.ycombinator.com/showhn.html)).
- **Expect posts to get 0SFS found, not ranked.** Most of these sites mark links in posts `nofollow` or `ugc`, and Google says such links "will generally not be followed" ([Qualify outbound links](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)). Their value is the people who read them, try 0SFS, and then link it from their own pages, READMEs and posts.
- **Post in each community once, follow its rules on self-promotion, and answer the comments.** Never ask anyone to upvote. Hacker News says so outright.
- **Plan on new posts, because old threads close.** Hacker News stops taking comments after about two weeks. On 25 September the threads from 14 and 19 September still had a comment box, and the February threads did not. Reddit archives posts after six months unless a subreddit turns archiving off.
- **Big sites get indexed fast.** An issue opened on GitHub at 05:13 UTC on 25 September was in another search engine's results less than a day later. GitHub, Reddit, Hacker News and YouTube are crawled all the time. A new site with no inbound links waits for Search Console.

## Where to post

### New posts at release

| Where | Why | Notes |
|---|---|---|
| [Hacker News](https://news.ycombinator.com/showhn.html), as a Show HN | Flight simulators do well there; see the [past threads](#hacker-news-threads) | Title it along the lines of `Show HN: 0SFS – an open-source flight simulator in the browser with JSBSim`. Link `/fly/`. |
| [r/flightsim](https://www.reddit.com/r/flightsim/) | The hobby's main subreddit, and it takes posts about browser simulators | Recent examples: [a browser sim with volumetric clouds](https://www.reddit.com/r/flightsim/comments/1w0kh7b/browserbased_flight_sim_with_volumetric_clouds/) (28 August 2026), [a Bf 109 in the browser](https://www.reddit.com/r/flightsim/comments/1scuqlr/i_built_a_bf_109_emil_simulator_that_runs_in_your/) (5 April), [fs shallot](https://www.reddit.com/r/flightsim/comments/1rtqcnr/introducing_fs_shallot_coming_to_a_browser_near/) (14 March) and [a 2D CFD sim](https://www.reddit.com/r/flightsim/comments/1rvwjv7/cfd_based_2d_flight_sim_instantly_play_in_your/) (17 March). |
| [JSBSim Discussions](https://github.com/JSBSim-Team/jsbsim/discussions), in Show and tell | JSBSim compiled to WebAssembly, shown to the people who write flight models | You already contribute upstream. Keep it to what 0SFS does with JSBSim. |
| [Babylon.js forum](https://forum.babylonjs.com/c/demos/9), in Demos and projects, and [r/babylonjs](https://www.reddit.com/r/babylonjs/) | 0SFS renders with Babylon.js, and this is the forum's showcase | [Nanawing](https://forum.babylonjs.com/t/nanawing-a-free-no-download-browser-fpv-flying-wing-sim-babylon-js-v7-webgl2/63843), a browser flying-wing sim, was posted in both in July 2026 ([on Reddit](https://www.reddit.com/r/babylonjs/comments/1v38zhb/nanawing_a_free_nodownload_browser_fpv_flyingwing/)). |
| [r/WebGames](https://www.reddit.com/r/WebGames/) | Free games that run in a browser, with new flying games every month | Recent examples: [Skyline VR](https://www.reddit.com/r/WebGames/comments/1v0tzww/skyline_vr_an_open_world_browser_flight_game/) (19 July 2026), a free open-world flight game on github.io, and [Inflight simulator](https://www.reddit.com/r/WebGames/comments/1wchp3s/inflight_simulator_its_a_flight_simulator_except/) (10 September). |
| [r/SideProject](https://www.reddit.com/r/SideProject/) | People post what they built and ask for feedback | [EarthFS](https://www.reddit.com/r/SideProject/comments/1umbjea/earthfs_released/) (3 July 2026), a fork of Web Flight Simulator with photorealistic tiles, and [Warbirds.io](https://www.reddit.com/r/SideProject/comments/1uej01k/warbirdsio_blocky_team_dogfights/) (24 June) were posted there. |
| [r/opensource](https://www.reddit.com/r/opensource/) | Open-source releases | FlightGear's releases and its [move to GitLab](https://www.reddit.com/r/opensource/comments/1jaf3cq/open_source_flight_simulator_flightgear_switches/) (March 2025) were posted there. Lead with the license and the repository, and link the site too. |
| [r/InternetIsBeautiful](https://www.reddit.com/r/InternetIsBeautiful/) | Websites worth a visit, for a very large audience | The last simulator posted there was an [in-browser flight simulator](https://www.reddit.com/r/InternetIsBeautiful/comments/mlqn0m/inbrowser_flight_simulator/) in April 2021. The flight posts of 2026 are trackers such as Stowaway and Flight-Viz. Read the rules first. |
| [AlternativeTo](https://alternativeto.net/) | Its lists of alternatives rank for "free flight simulator" and "GeoFS alternative" searches | Add 0SFS as an application, and as an alternative to FlightGear, GeoFS and Microsoft Flight Simulator. Its [FlightGear page](https://alternativeto.net/software/flightgear/) came up in the competitor research. |
| [awesome-webgpu](https://github.com/mikbry/awesome-webgpu), under Demos | 1,987 stars and still maintained | Open a pull request. |
| [awesome-babylonjs](https://github.com/Symbitic/awesome-babylonjs), under Games or Projects | 357 stars | Open a pull request. |
| YouTube | Videos rank quickly for rare words like `0sfs` | A one- or two-minute flight titled with "0SFS", with the site in the description. |
| [FlightGear forum](https://forum.flightgear.org/viewforum.php?f=3), in Hangar talk | FlightGear runs on JSBSim, and 0SFS studies its aircraft ([FlightGear aircraft](flightgear-aircraft.md)) | Present it as JSBSim in the browser, not as a FlightGear rival. |

Left out: [r/threejs](https://www.reddit.com/r/threejs/) has had several posts about browser flight simulators in 2026, among them [Web Flight Simulator's](https://www.reddit.com/r/threejs/comments/1qs72z7/i_built_a_web_flight_simulator_with_threejs_and/), but 0SFS doesn't use Three.js, so a post there would be off topic. r/GeoFS and r/FlightGear are about their own simulators, and no post in either introduced another one.

### Threads still open for replies

Reply only where 0SFS answers the question someone asked.

| Thread | Date | Why |
|---|---|---|
| [What sim do i get as a beginner?](https://www.reddit.com/r/flightsim/comments/1uvuvmp/what_sim_do_i_get_as_a_beginner/) | 14 July 2026 | Asks for a first simulator; 0SFS is free and needs no install. |
| [Which Flight sim is better, FSX:SE or FlightGear?](https://www.reddit.com/r/flightsim/comments/1u9kr9m/which_flight_sim_is_better_fsx/) | 18 June 2026 | Compares free and cheap simulators. |
| [Google Earth flight simulator is back](https://www.reddit.com/r/flightsim/comments/1u6ffrj/google_earth_flight_simulator_is_back/) | 15 June 2026 | About Google Earth's flight simulator, which runs only in Google Earth on the web. 0SFS is another way to fly real scenery in a browser. |
| [Any good free/open source flight sims similar to how Microsoft Flight Sim (FSX era) used to be?](https://www.reddit.com/r/flightsim/comments/1nhaxqr/any_good_freeopen_source_flight_sims_similar_to/) | 15 September 2025 | Asks for exactly this. The answers were FlightGear, Falcon BMS and DCS. At over a year old it is probably archived. Open it and look for a reply box. |

### Hacker News threads

Aeronaut has never been posted on Hacker News: no story or comment names it or links its repository. The browser simulator the competitor research found there is Web Flight Simulator. All of these threads are closed except the first. They show which titles and projects did well.

| Date | Points | Comments | Thread |
|---|---:|---:|---|
| 14 Sep 2026 | 446 | 205 | [Show HN: I made a flight simulator, except you're just a passenger](https://news.ycombinator.com/item?id=49693971), open until about 28 September |
| 15 Jun 2026 | 150 | 49 | [Google Flight Simulator](https://news.ycombinator.com/item?id=48540945), Google Earth's flight simulator |
| 14 Feb 2026 | 3 | 0 | [Show HN: Photorealistic flight simulator in 1 HTML file](https://news.ycombinator.com/item?id=47013731) |
| 9 Feb 2026 | 13 | 4 | [I Built a Browser Flight Simulator Using Three.js and CesiumJS](https://news.ycombinator.com/item?id=46948113), Web Flight Simulator. Commenters told the author to repost it as a Show HN. |
| 1 Feb 2026 | 2 | 1 | [Show HN: Multiplayer flight SIM over San Francisco using Google 3D Tiles](https://news.ycombinator.com/item?id=46849665) |
| 30 Jul 2023 | 439 | 178 | [Linux Air Combat: free, lightweight and open-source combat flight simulator](https://news.ycombinator.com/item?id=36934029) |
| 12 Feb 2023 | 163 | 17 | [Simple Physics-based Flight Simulation with C++](https://news.ycombinator.com/item?id=34761502), OpenGL Flightsim |
| 10 Sep 2022 | 38 | 23 | [A flight simulator that runs in the browser](https://news.ycombinator.com/item?id=32788339), fpvsim |
| 15 Feb 2022 | 68 | 9 | [GeoFS – a flight simulator based on Cesium WebGL Virtual Globe](https://news.ycombinator.com/item?id=30345760) |
| 11 Feb 2022 | 308 | 80 | [YSFlight – A free flight simulator where anything is possible](https://news.ycombinator.com/item?id=30299850) |
| 28 Jul 2021 | 373 | 71 | [Orbiter Space Flight Simulator is now open source](https://news.ycombinator.com/item?id=27982671) |

## Checking progress

- In Search Console, open Performance and filter by the query `0sfs` to see the site's average position and clicks.
- Search `0sfs` on Google in a private window, signed out, now and then. `site:0sfs.github.io` shows which pages Google has indexed.
- Add the date and the site's position to this page each time, so the effect of each change can be seen.

## What not to do

- Don't buy links, submit to link directories, or paste the same text into many places. Google's [spam policies](https://developers.google.com/search/docs/essentials/spam-policies) demote sites that do.
- Don't request indexing of the same page again and again. It doesn't speed anything up.
