# ValleyStatsSW — punch list

Started from a straight copy of ValleyStatsNS (Night Shift) at the point this
repo was created. "SW" = Southwest: this repo expands ValleyStatsNS from an
Arizona-only sports list into an Arizona + New Mexico one, and from a
Colorado/Arizona weather pair into a seven-city Southwest spread.

**All 7 items below are done.** This file is kept as a record of what was
built and the open questions each item raised along the way, in case any of
those decisions need revisiting later (e.g. real logos/branding, tuning the
standings display once more of the season has been played).

**Update:** UNM, NMSU, and NAU (item #7's new teams) were later removed from
sports tracking by request — the calendar/today's-games/standings had gotten
cluttered with 7 teams sharing one view. Item #7 below is left as a record of
that work in case it's ever added back; item #6 (the weather cities for
Albuquerque, Flagstaff, and Las Cruces) was explicitly kept, since the ask
was to declutter the sports side, not drop the weather coverage.

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

## Verification

All of the above is covered by `test/regression.js` (jsdom, loads the real
`index.html`) — 57 checks as of this pass, including the new-this-round
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
