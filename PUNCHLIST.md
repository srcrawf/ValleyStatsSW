# ValleyStatsSW — punch list

Started from a straight copy of ValleyStatsNS (Night Shift) at the point this
repo was created. Nothing below has been built yet — this is scope + open
questions to work from when each item gets picked up. "SW" = Southwest: this
repo expands ValleyStatsNS from an Arizona-only sports list into an
Arizona + New Mexico one, and from a Colorado/Arizona weather pair into a
five-city Southwest spread.

## 1. Light theme ("High Noon")

- The very first design round in this project explored two directions —
  "Night Shift" (dark, what got built) and "High Noon" (light) — as a
  comparison artifact. High Noon was never implemented; this revives it as a
  selectable alternate theme rather than a replacement.
- The whole site already reads its colors from `:root` CSS custom properties
  (`--ink`, `--muted`, `--faint`, `--bg`, `--panel`, `--panel-raised`,
  `--line`, plus the accent colors and the `--team-*` set added later), so
  this should mostly be: define a second palette, add a toggle control, and
  swap which palette is active — not a rewrite of every rule.
- Needs a decision on toggle placement (header icon button is the obvious
  spot) and persistence (localStorage is fine here — it's a per-viewer UI
  preference, not data that needs to be reliable or shared).
- Contrast should get the same AA pass the dark palette just got (`--faint`
  was bumped from 3.57:1 to 5.2:1 against its background this round) —
  don't assume a light palette is automatically fine just because it's
  lighter.

## 2. Standings / rankings

- Show conference standings and/or playoff seeding for tracked teams, not
  just their own schedule.
- Open question: source. The schedule endpoints currently in use
  (`site.web.api.espn.com/apis/site/v2/sports/.../teams/{id}/schedule`)
  don't carry standings — this needs a different ESPN endpoint (likely a
  `standings` endpoint per sport/league) found and verified against live
  data before writing any code, the same way the record-field bug this
  session (`record` vs `records`, `displayValue` vs `summary`) got found by
  checking the real response instead of assuming a shape.
- Scope question: standings for every tracked team, or just the ones in an
  active season at a given time (e.g. basketball standings are meaningless
  in September)?

## 3. Rivalry highlighting

- ASU vs. Arizona (Territorial Cup) is the one already fully in-scope today.
- Adding NAU brings in an in-state trio (ASU/UA/NAU all in Arizona).
- Adding NMSU and UNM brings in the Rio Grande Rivalry (NM State vs. New
  Mexico) as a second pair to flag.
- Implementation idea: a small static list of rivalry pairs (by teamKey),
  checked when rendering a game, applying a distinct border/badge style —
  similar in spirit to the existing per-team border-color coding, just
  triggered by "both teams in this matchup are a known rivalry pair"
  instead of by a single team.

## 4. Historical weather comparison

- Show something like "normal high for today is X°" next to the live
  reading, for context.
- Open-Meteo (already the weather source here) has a separate historical/
  climate API from the forecast one currently used — needs checking whether
  it covers all 5 planned cities and what its actual response shape is
  before writing extraction code (same lesson as #2).

## 5. Mobile calendar is still too crowded

- The mobile pass done earlier this session (hiding secondary chips,
  switching to ESPN's short opponent names, fixing a sport-icon padding
  overlap) wasn't enough — flagged again as still cramped on phones.
- This needs a fresh look, and should be designed for the *end state* of
  this repo (7 teams instead of 4, once NAU/UNM/NMSU are added) rather than
  patched again for today's load — more teams sharing one calendar means
  more simultaneous games per day, so whatever the fix is needs headroom.
- Options worth evaluating rather than assuming: shrinking further (smaller
  logos, no opponent name at all in the grid); collapsing a busy day to a
  "+N more" indicator that opens the existing day-detail panel; or
  rethinking the month-grid entirely for narrow widths (e.g. a per-day list
  instead of a 7-column grid below some width). Worth prototyping more than
  one option before committing, since the "just hide more stuff" move has
  already been tried once.

## 6. New weather cities

Add to the existing Parker, CO / Tempe, AZ pair:

- **Albuquerque, NM**
- **Tucson, AZ** — also directly useful for #7: this is where Arizona
  Wildcats home games actually are (Tempe is ASU's campus, not Arizona's —
  noted when this got suggested).
- **Flagstaff, AZ** — genuinely different climate/elevation than the valley
  cities, and is NAU's location once that team is added.
- **Las Cruces, NM** — NMSU's location.

Implementation notes:
- `CONFIG.locations` currently holds 2 entries with lat/long — needs 4 more
  (coordinates to look up, not guess).
- The weather UI (`.weather-grid`, the two `.weather-card`s, the
  `.forecast-tabs` location tabs) was built and styled around exactly 2
  locations side by side. Going to 6 total needs a real layout decision, not
  just adding more cards to the same grid — a scrollable row, a dropdown/
  select instead of tabs, or a smaller card design are all options worth
  weighing rather than defaulting to "just add 4 more of the same card."

## 7. New teams: UNM, NMSU, NAU — football and basketball

Track New Mexico Lobos, New Mexico State Aggies, and Northern Arizona
Lumberjacks the same way ASU and Arizona are tracked today (both football
and basketball, via `sportsFeeds`).

Open items:
- Need each school's ESPN team ID for both
  `football/college-football/teams/{id}/schedule` and
  `basketball/mens-college-basketball/teams/{id}/schedule` — 6 lookups
  total (3 schools × 2 sports), verified against live ESPN data rather than
  guessed, the same way ASU's id (9) and Arizona's (12) were already
  confirmed working.
- NAU football is FCS (Big Sky Conference), not FBS like ASU/Arizona/most of
  what this site currently tracks — needs checking whether the same
  `college-football` endpoint path actually returns FCS teams correctly, or
  whether something differs (season structure, seasontype values, available
  fields) before assuming it's a drop-in.
- Each new team needs: a `teamLogos` entry, a `--team-*` CSS color variable
  and a `.calendar-event[data-team="..."]` border-color rule (won't collide
  with existing Cardinals/ASU/Arizona/Suns colors — needs 3 more distinct
  colors picked), and an entry in the `.team-legend` HTML/CSS added this
  session.
- Directly related to #5: this is what pushes the tracked-team count from 4
  to 7, which is why the mobile crowding fix should be scoped for 7 teams,
  not patched for 4 and then re-broken again once these land.

## Not part of this list

- add-to-calendar — explicitly ruled out earlier in this project, staying
  ruled out unless that changes.
- The one remaining code nitpick from the last refinement pass (a lone
  `!important` on `.selected-day-time`) — reviewed and explicitly left as-is
  by request, not a bug, not on this list.
