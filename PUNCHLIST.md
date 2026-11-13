# ValleyStatsSW — punch list

Started from a straight copy of ValleyStatsNS (Night Shift) at the point this
repo was created. "SW" = Southwest: this repo expands ValleyStatsNS from an
Arizona-only sports list into an Arizona + New Mexico one, and from a
Colorado/Arizona weather pair into a seven-city Southwest spread.

**All 8 items below are done.** This file is kept as a record of what was
built and the open questions each item raised along the way, in case any of
those decisions need revisiting later (e.g. real logos/branding, tuning the
standings display once more of the season has been played).

**Update (#8, #9):** NMSU and NAU were added back by request (#8), then
UNM plus a new team, Wyoming (#9).

**Update:** UNM, NMSU, and NAU (item #7's new teams) were later removed from
sports tracking by request — the calendar/today's-games/standings had gotten
cluttered with 7 teams sharing one view. Item #7 below is left as a record of
that work in case it's ever added back; item #6 (the weather cities for
Albuquerque, Flagstaff, and Las Cruces) was explicitly kept, since the ask
was to declutter the sports side, not drop the weather coverage.

**Update:** Glendale was later dropped from item #6's weather cities by
request (weather-card, forecast tab, and its `CONFIG.locations` entry all
removed) — 6 cities remain: Parker, Tempe, Tucson, Albuquerque, Flagstaff,
and Las Cruces.

## 1. Light theme ("High Noon") — done

- Added as a selectable alternate to the default dark "Night Shift" palette,
  not a replacement — a header icon button (`#theme-toggle`) flips
  `<html data-theme="light">`, persisted to `localStorage`
  (`valleyStats.theme`) and applied by a tiny inline `<head>` script before
  first paint, so a saved light preference doesn't flash dark first.
- Every color in the stylesheet already read from `:root` custom properties
  except a handful of hardcoded literals (`.panel`'s background gradient,
  the alert/live banner colors, and several `rgba(12,16,22,X)` "recessed
  well" backgrounds like the weekday header strip and calendar cells) —
  those were pulled out into their own variables (`--panel-grad-1/2`,
  `--alert-bg/border/ink`, `--live-bg/border/ink`, `--well`) so the light
  theme actually covers the whole page rather than leaving dark patches.
- Contrast was computed (not eyeballed) for the light palette the same way
  the dark `--faint` fix was validated earlier — `--ink`, `--muted`,
  `--faint`, and the four accent colors (`--teal`, `--coral`, `--yellow`,
  `--blue`) were all checked against every background they render on
  (`--bg`, `--panel`, `--well`) and darkened until each cleared 4.5:1.

## 2. Standings / rankings — done

- Verified endpoint (not guessed):
  `https://site.api.espn.com/apis/v2/sports/{football|basketball}/
  {college-football|mens-college-basketball}/standings?season=YYYY&group=
  <conference id>&seasontype=2`. Win-loss lives at `standings.entries[].stats[]`,
  matched by `{name:"overall"}` (season) and `{name:"vsconf"}` (conference-only).
- **`seasontype=2` must be passed explicitly** — verified that an FCS group
  (Northern Arizona's Big Sky) silently returns all-zero stats without it,
  with no error to signal the problem. Always included now.
- Conference group ids were looked up per team via `teams/{id}` →
  `.groups.id` (not guessed) for all 5 college teams, both sports. Arizona
  State and Arizona share a group in both sports (both are Big 12 since the
  2024 realignment) — football: asu/ua=4, unm=17, nmsu=12, nau=20;
  basketball: asu/ua=8, unm=44, nmsu=11, nau=5. Stored at
  `CONFIG.standingsGroups`.
- Scope decision: shows only tracked *college* teams (asu, ua, unm, nmsu,
  nau) — the Cardinals (NFL) and Suns (NBA) use entirely different ESPN
  standings endpoints that weren't part of this pass, so they're left out of
  the standings strip for now rather than guessing at an unverified shape.
- The "basketball standings are meaningless before the season starts"
  scoping question resolved itself naturally: the fetch returns no
  `standings` key at all for a season that hasn't tipped off, and that
  team/sport is simply omitted from the display rather than shown as a fake
  "0-0" — no separate season-awareness logic needed.
- Renders as a compact strip (`#standings-strip`) under the team legend:
  logo, team + sport, conference and overall record. Cached 6 hours
  (standings don't move faster than that) and refreshed once per page load,
  not on the 15-minute weather/scores poll.

## 3. Rivalry highlighting — done

- Matched by the opponent's ESPN team id (`game.opponentTeamId`, newly
  exposed from `normalizeGame`), not by opponent display-name text — names
  vary by feed ("Arizona Wildcats" vs "Arizona").
- Pairs flagged: ASU vs. Arizona (Territorial Cup), NM State vs. New Mexico
  (Rio Grande Rivalry), and both Arizona-vs-NAU in-state matchups.
- Shows a small trophy badge next to the team name and a subtle gold outline
  on the game box, in the calendar grid, the day-detail panel, and today's
  games — wherever a game already renders.

## 4. Historical weather comparison — done

- Verified there's no dedicated "climate normals" endpoint on Open-Meteo.
  The separate `climate-api.open-meteo.com` host serves downscaled
  IPCC/CMIP6 climate-model projections for research use, not day-of-year
  averages — not what "normal" means here, so it was skipped in favor of
  the Historical Weather API (`archive-api.open-meteo.com/v1/archive`),
  which returns real past daily data in the same `daily`/`daily_units`
  shape as the forecast API already in use.
- "Normal" is computed client-side: one request per location covering the
  last 10 full calendar years (`temperature_2m_max/min` only, to keep the
  payload lean), averaging the days within 3 days of today's month/day
  across those years.
- Shows as a 4th "NORMAL" reading in each weather card's meta row, next to
  HIGH/LOW/WIND. Cached 30 days (normals barely move day to day) and
  refreshed at most once per page load — this is a heavier request than the
  live forecast call, so it deliberately isn't on the 15-minute poll.

## 5. Mobile calendar crowding — done

- Scoped for the *end state* (7 teams sharing one calendar, not the 4 this
  repo started with): each day now caps inline calendar-event boxes at 2
  (`MAX_INLINE_CALENDAR_EVENTS`) and shows a "+N more" indicator for the
  rest, leaning on the day-detail panel that already opens on tap/click for
  the whole cell — no new click target needed, and no cap to revisit as more
  teams get added later, since the mechanism doesn't hardcode a team count.

## 6. New weather cities — done

All 7 planned Southwest cities are in `CONFIG.locations`: Parker CO, Tempe
AZ, Glendale AZ, Tucson AZ (also fixes Wildcats venue accuracy — Tempe is
ASU's campus, not Arizona's), Albuquerque NM, Flagstaff AZ (NAU's location),
and Las Cruces NM (NMSU's location).

- The weather row was rebuilt as a horizontally-scrolling, snap-to card row
  (`.weather-grid { display:flex; overflow-x:auto; scroll-snap-type:x
  proximity; }`) instead of a CSS grid hardcoded to exactly 2 columns — this
  was the "real layout decision" this item flagged, and it's why cities
  7 through 4 (then 7) didn't need another layout rewrite each time.
  `.forecast-tabs` got the same scrolling treatment.
- `loadAlerts`/the alert-banner place label used to be hardcoded to just
  `parker`/`tempe` — generalized to iterate all of `CONFIG.locations`, so
  weather alerts now cover every city automatically.

## 7. New teams: UNM, NMSU, NAU — football and basketball — done

New Mexico Lobos, New Mexico State Aggies, and Northern Arizona Lumberjacks
are tracked the same way ASU and Arizona are, via `sportsFeeds`.

- ESPN team ids verified against live data (not guessed): New Mexico = 167,
  New Mexico State = 166, Northern Arizona = 2464 — each confirmed via a
  real, non-empty schedule response with valid dates and competitors.
- Confirmed Northern Arizona's FCS status (Big Sky Conference) doesn't need
  a different endpoint — the same `college-football/teams/{id}/schedule`
  path returns real, well-formed data for it, including a game against
  Arizona (id 12) that served as a nice cross-check.
- Each team has a `teamLogos` entry, a `--team-*` CSS color (chosen to stay
  visually distinct from the existing red/orange cluster — Lobos wine
  `#b8285f`, Aggies gold `#c17817`, Lumberjacks blue `#2b6cb0`, since NAU's
  actual colors are blue/gold), a `.calendar-event[data-team]` border rule,
  and a `.team-legend` entry.
- This is what pushed the tracked-team count from 4 to 7, which is why the
  mobile crowding fix (#5) was designed for 7 rather than patched for 4.

## 8. NMSU and NAU back, opponent records, and a cleanup pass — done

- **NMSU re-added** (football + men's basketball) by request. ESPN id 166,
  Conference USA: standings group 12 (football) / 11 (basketball), both
  re-verified via `teams/166` → `.groups.id`. Color restored to the Aggies
  gold `#c17817` chosen in #7.
- **NAU re-added** (football + men's basketball) by request. ESPN id 2464,
  Big Sky: group 20 (football) / 5 (basketball), re-verified from its live
  schedule feed. Lumberjacks blue `#2b6cb0` from #7. ASU-vs-NAU and
  Arizona-vs-NAU rivalry flags (#3) restored. UNM stays untracked.
- **Opponent overall record under the opponent's logo**, on each team's
  next game only — the same place the followed team's own record shows. ESPN's schedule feed never carries the opponent's
  record, so it's read from the opponent's own schedule feed
  (`site.web.api.espn.com/.../teams/{id}/schedule` → `team.recordSummary`).
  The plain `teams/{id}` endpoint has the record too, but ESPN blocks it
  from browser pages (CORS) — it failed silently on the live site, so don't
  switch back to it. Cached 6 hours (`valleyStats.opponentRecords.v2`).
- **Fewer lookups:** only each team's next opponent is fetched (~8
  requests) instead of ~100 for every opponent on every full season.
- **Records only under the logos, only on the next game** (by request):
  both the followed team's and the opponent's. The inline record chip under
  the TV line was removed from calendar boxes (it duplicated the logo
  caption on the next game and was the only record on later games); in the
  day panel / today's games it's skipped wherever the logo already shows it.
- **Short TV labels:** only the first channel ESPN lists is shown; the full
  list is in a hover tooltip (fixes "TV Suns Live/Arizona's Fam…").
- **Rivalries vs untracked opponents:** `RIVAL_OPPONENT_IDS` flags NMSU vs
  New Mexico (167, Rio Grande Rivalry) and vs UTEP (2638, Battle of I-10).
- **Seasons roll over automatically** (`currentSeasons()`): football flips
  in March, basketball in August; the "2026–27 season" label follows.
- **Sample schedule refreshed** with real upcoming games (all 5 teams, from
  the live feed on Nov 11, 2026), each row carrying its own opponent logo,
  league and ESPN id. (NAU: basketball only — no upcoming football game
  could be confirmed from the feed at the time.) Rows dated before today are now dropped, so an old
  list empties out instead of showing past games as upcoming. Also fixed:
  sample home games used to swap the two logos.
- **Not done — records in the phone-width calendar:** measured at 375px a
  calendar box is ~35px wide and the logo pair alone already needs ~52px, so
  a record caption can't fit. Tapping the day opens the panel, which shows
  them.
- Tests: 125 checks (`test/regression.js`), including the new ones above
  and a fix for a date-dependent check that broke once Oct 3 became a past
  week.

## 9. UNM + Wyoming, and the missing-logo fix — done

- **UNM re-added** (football + men's basketball): ESPN id 167, Mountain
  West — group 17 (football) / 44 (basketball), verified from its live
  schedule feed. Lobos wine `#b8285f` from #7.
- **Wyoming added** (new): ESPN id 2751, also Mountain West 17 / 44.
  Color `#9c6b45` — a brown that stays visible on the dark background
  (their real brown, `#492f24`, disappears) and doesn't collide with the
  Aggies gold.
- Rivalries: NMSU vs UNM is now a tracked-vs-tracked pair (Rio Grande
  Rivalry); Wyoming vs Colorado State (id 36) flagged as the Border War.
- Sample schedule: two basketball games each for UNM and Wyoming (no
  upcoming football game could be confirmed from the feeds).
- **Missing-logo fix:** ESPN sends an *empty* logo URL for schools it has
  no artwork for (Embry-Riddle, id 111226). `safeImageUrl('')` resolved
  that to the page's own URL, so the `<img>` showed as broken. Logos now go
  through `teamLogoNode()`: an empty URL or an image that fails to load
  becomes a round initials badge ("ER"). The badge rule is
  `.matchup-logos .opponent-placeholder` — a plain `.opponent-placeholder`
  loses to `.calendar-event span` and gets clipped.
- Tests: 133 checks.

## Verification

All of the above is covered by `test/regression.js` (jsdom, loads the real
`index.html`) — 57 checks as of that pass (133 as of #9), including the new-this-round
config/endpoint/parsing checks (standings field extraction, rivalry
matching, the historical-normal averaging math, the theme toggle actually
changing computed styles, the calendar-cap "+N more" behavior, and that
every planned weather city/team config entry is present and wired to a
matching DOM element). Run with `node test/regression.js` after
`npm install jsdom --no-save`.

## Not part of this list

- add-to-calendar — explicitly ruled out earlier in this project, staying
  ruled out unless that changes.
- Cardinals (NFL) and Suns (NBA) standings — different ESPN endpoint family
  than the college standings verified for this pass; left out rather than
  guessing at an unverified shape. Worth a future pass if wanted.
- The one remaining code nitpick from an earlier refinement pass (a lone
  `!important` on `.selected-day-time`) — reviewed and explicitly left as-is
  by request, not a bug, not on this list.
