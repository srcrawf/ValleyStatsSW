// ValleyStats (Southwest) regression checks.
//
// Loads the REAL index.html with jsdom and exercises its actual functions
// (not reimplemented copies), with network calls stubbed out so it falls
// back to the page's own sample schedule/weather data. This exists because
// a real bug (ESPN's record field using different key names than the code
// assumed) shipped silently for a while — a check like this, run against a
// realistic data shape, would have caught it immediately.
//
// This repo started as a copy of ValleyStatsNS (see PUNCHLIST.md) and is
// expanding scope — more weather cities, more teams — so this file has
// diverged from NS's copy and picks up checks specific to that expansion
// as each punch-list item lands.
//
// Usage:
//   npm install jsdom --no-save   (if not already installed)
//   node test/regression.js
//
// Exits 0 if every check passes, 1 otherwise (so it's CI/pre-push friendly).

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const indexPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: undefined,
    url: 'https://example.test/',
    beforeParse(window) {
        // Keep the sandbox offline and deterministic — the page falls back
        // to its built-in sample schedule/weather, which is all these
        // checks need.
        window.fetch = () => Promise.reject(new Error('network disabled in test'));
    }
});
const { window } = dom;

let passed = 0;
let failed = 0;

function run(expr) {
    return window.eval(expr);
}

function check(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        passed++;
        console.log(`PASS - ${label}`);
    } else {
        failed++;
        console.log(`FAIL - ${label}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
    }
}

setTimeout(() => {
    try {
        // --- opponentName: strips the perspective prefix for display ---
        check('opponentName strips "vs "',
            run(`opponentName({opponent:'vs Northern Arizona Lumberjacks'})`),
            'Northern Arizona Lumberjacks');
        check('opponentName strips "@ "',
            run(`opponentName({opponent:'@ Texas A&M Aggies'})`),
            'Texas A&M Aggies');

        // --- sportMark ---
        check('sportMark football', run(`sportMark('football')`), '\u{1F3C8}');
        check('sportMark basketball', run(`sportMark('basketball')`), '\u{1F3C0}');
        check('sportMark unknown sport returns nothing', run(`sportMark('golf')`), '');

        // --- didWin ---
        check('didWin via winner flag', run(`didWin({score:[{winner:true},{winner:false}]})`), true);
        check('didWin via score fallback', run(`didWin({score:[{score:35},{score:7}]})`), true);

        // --- logoPair: home always on the right, divider always reads "at" ---
        run(`
            window.__homeGame = { team:'Arizona Wildcats', opponent:'vs Northern Arizona Lumberjacks',
                opponentLogo:'https://example.test/opp.png', logo:'https://example.test/own.png', teamKey:'ua', sport:'football',
                dateValue:new Date('2026-09-05T00:00:00Z') };
            window.__awayGame = { team:'Arizona State', opponent:'@ Texas A&M',
                opponentLogo:'https://example.test/opp2.png', logo:'https://example.test/own2.png', teamKey:'asu', sport:'football',
                dateValue:new Date('2026-09-12T00:00:00Z') };
            window.__homePairImgs = [...logoPair(window.__homeGame).querySelectorAll('img')].map(i => i.alt);
            window.__divider = logoPair(window.__homeGame).querySelector('.logo-divider').textContent;
        `);
        check('home game: away logo left, home logo right',
            run('window.__homePairImgs'),
            ['Northern Arizona Lumberjacks logo', 'Arizona Wildcats logo']);
        check('divider always reads "at"', run('window.__divider'), 'at');

        // --- computeOwnRecord: derived from season results, scoped "as of" a date ---
        run(`
            const d1 = new Date('2026-09-05T00:00:00Z');
            const d2 = new Date('2026-09-12T00:00:00Z');
            games = [
                { teamKey:'asu', sport:'football', state:'post', dateValue:d1, score:[{score:70},{score:7}] },
                { teamKey:'asu', sport:'football', state:'post', dateValue:d2, score:[{score:10},{score:20}] }
            ];
        `);
        check('computeOwnRecord tallies from played games, scoped to a date',
            run(`computeOwnRecord('asu', 'football', new Date('2026-09-05T00:00:00Z'))`), '1-0');
        check('computeOwnRecord picks up the later loss once its date is included',
            run(`computeOwnRecord('asu', 'football', new Date('2026-09-12T00:00:00Z'))`), '1-1');
        check('computeOwnRecord returns empty string before any games are played',
            run(`computeOwnRecord('suns', 'basketball', new Date('2026-10-01T00:00:00Z'))`), '');

        // --- recentForm ---
        run(`
            games = [
                { teamKey:'ua', sport:'football', state:'post', dateValue:new Date('2026-09-05T00:00:00Z'), score:[{score:20},{score:10}] },
                { teamKey:'ua', sport:'basketball', state:'post', dateValue:new Date('2026-09-06T00:00:00Z'), score:[{score:99},{score:1}] }
            ];
            window.__form = recentForm({ teamKey:'ua', sport:'football', dateValue:new Date('2026-09-19T00:00:00Z') });
        `);
        check('recentForm only counts the same team+sport, excludes basketball',
            run(`window.__form.querySelectorAll('i').length`), 1);

        // --- appendGameMeta: the shared helper used by the day panel and today's-games list ---
        run(`
            games = [
                { teamKey:'asu', sport:'football', state:'post', dateValue:new Date('2026-09-05T00:00:00Z'), score:[{score:70},{score:7}] }
            ];
            window.__metaEl = document.createElement('div');
            // A finished game: its record isn't under the logo (logoPair only
            // shows records on games that haven't been played), so the
            // inline record chip is where it appears.
            appendGameMeta(window.__metaEl, {
                teamKey:'asu', sport:'football', state:'post', dateValue:new Date('2026-09-12T00:00:00Z'),
                broadcast:'ABC', venue:'College Station, TX'
            });
        `);
        check('appendGameMeta renders broadcast, computed record, and venue',
            run(`window.__metaEl.textContent.includes('ABC') && window.__metaEl.textContent.includes('1-0') && window.__metaEl.textContent.includes('College Station')`),
            true);
        check('appendGameMeta omits a "TBD" broadcast rather than showing it literally',
            run(`(() => { const el2 = document.createElement('div'); appendGameMeta(el2, { teamKey:'asu', sport:'football', dateValue:new Date(), broadcast:'TBD' }); return el2.textContent.includes('TBD'); })()`),
            false);

        // --- the old ESPN-per-event "record" field is gone; nothing should depend on it ---
        check('normalizeGame no longer returns a raw "record" field (computeOwnRecord replaced it everywhere)',
            run(`(() => {
                const fakeEvent = { id:'1', date:'2026-09-12T17:00:00Z',
                    competitions:[{ status:{type:{state:'pre'}}, venue:{address:{city:'Tempe',state:'AZ'}},
                    competitors:[
                        { team:{id:'9', displayName:'Arizona State', shortDisplayName:'Arizona State'}, homeAway:'home' },
                        { team:{id:'99', displayName:'Opponent', shortDisplayName:'Opp'}, homeAway:'away' }
                    ]}] };
                const g = normalizeGame(fakeEvent, { teamId:'9', teamKey:'asu', team:'Arizona State', sport:'football' });
                return 'record' in g;
            })()`),
            false);

        // --- gameday-weather chip was removed for individual games ---
        check('gameWeatherChip function was removed', run(`typeof gameWeatherChip`), 'undefined');

        // --- mobile calendar declutter: secondary chips hidden under 520px ---
        run(`
            window.__cssText = document.querySelector('style') ? document.querySelector('style').textContent
                : Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\\n');
        `);
        const cssText = fs.readFileSync(indexPath, 'utf8');
        const mobileBlock = (cssText.match(/@media \(max-width:520px\)[^]*?\n/) || [''])[0];
        check('mobile media query hides secondary chips in the calendar box',
            ['broadcast-tag', 'team-record', 'venue-tag', 'logo-record', 'form-strip']
                .every(cls => mobileBlock.includes(`.calendar-event .${cls}`)),
            true);

        // --- .sport-mark must not escape to the page corner in contexts
        // without their own positioning container. The base rule positions
        // it absolute (for the calendar box's corner badge, contained by
        // .calendar-event's position:relative); .today-game has no
        // equivalent container, so without an override the badge escapes
        // all the way up to .shell and renders pinned to the top-right of
        // the whole page instead of next to the team name. This exact bug
        // shipped and only became visible once "today" actually had a game.
        run(`
            window.__todayMarkEl = document.createElement('article');
            window.__todayMarkEl.className = 'today-game';
            const strongEl = document.createElement('strong');
            const markEl = document.createElement('span');
            markEl.className = 'sport-mark';
            strongEl.appendChild(markEl);
            window.__todayMarkEl.appendChild(strongEl);
            document.body.appendChild(window.__todayMarkEl);
        `);
        check('.today-game .sport-mark does not escape to the page corner',
            run(`window.getComputedStyle(document.querySelector('.today-game .sport-mark')).position`),
            'static');

        // --- SW expansion: Tucson weather location (Glendale was also
        // added in this pass but later removed by request — see the
        // "Glendale was removed" guard further down). ---
        check('CONFIG.locations includes tucson with coordinates and a state abbreviation',
            run(`(() => {
                const t = CONFIG.locations.tucson;
                return !!(t && typeof t.latitude === 'number' && typeof t.longitude === 'number' && t.stateAbbr === 'AZ');
            })()`),
            true);
        check('every CONFIG.locations entry has a matching weather card and forecast tab in the DOM',
            run(`Object.keys(CONFIG.locations).every(key =>
                document.querySelector(\`[data-weather="\${key}"]\`) && document.querySelector(\`[data-location="\${key}"]\`))`),
            true);
        check('loadAlerts watches every configured location, not just parker/tempe',
            run(`(() => {
                const src = loadAlerts.toString();
                return !src.includes("alertPoints = { parker") && src.includes('alertPoints = locations');
            })()`),
            true);
        check('alert place labels are looked up from CONFIG.locations rather than a hardcoded parker/tempe ternary',
            run(`(() => {
                const src = loadAlerts.toString();
                return !/alert\\.place === 'parker' \\? 'Parker, CO' : 'Tempe, AZ'/.test(src) && src.includes('CONFIG.locations[alert.place]');
            })()`),
            true);

        // --- weather row now scrolls horizontally instead of a fixed 2-up
        // grid, so it scales past 2 cards without another layout rewrite
        // (flagged in PUNCHLIST.md #6 as needing a "real layout decision"). ---
        check('.weather-grid is a horizontally-scrolling row, not a fixed-column grid',
            run(`window.getComputedStyle(document.querySelector('.weather-grid')).display`),
            'flex');
        check('.weather-and-today no longer hardcodes exactly 2 weather columns',
            !cssText.includes('.weather-and-today { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)) 220px;'),
            true);

        // --- the 3 remaining Southwest weather cities (Albuquerque, Flagstaff, Las Cruces) ---
        check('CONFIG.locations includes all 3 remaining Southwest cities',
            run(`['albuquerque', 'flagstaff', 'lascruces'].every(k =>
                CONFIG.locations[k] && typeof CONFIG.locations[k].latitude === 'number' && typeof CONFIG.locations[k].longitude === 'number')`),
            true);
        check('all 6 remaining CONFIG.locations entries have a matching weather card and forecast tab',
            run(`Object.keys(CONFIG.locations).length === 6 && Object.keys(CONFIG.locations).every(key =>
                document.querySelector(\`[data-weather="\${key}"]\`) && document.querySelector(\`[data-location="\${key}"]\`))`),
            true);
        check('Glendale was removed from weather tracking (reduce clutter) and does not creep back in',
            run(`!('glendale' in CONFIG.locations) && !document.querySelector('[data-weather="glendale"]') && !document.querySelector('[data-location="glendale"]')`),
            true);

        // --- UNM, NMSU, and NAU were tracked for a while (PUNCHLIST.md #7),
        // all removed to reduce clutter, then NMSU alone was added back by
        // request (PUNCHLIST.md #8). Guard against UNM/NAU creeping back in
        // and check NMSU is fully wired. ---
        check('UNM is still not tracked in sportsFeeds',
            run(`!sportsFeeds.some(f => f.teamKey === 'unm')`),
            true);
        check('NAU is tracked in both football and basketball, ESPN id 2464',
            run(`['football','basketball'].every(sp => sportsFeeds.some(f => f.teamKey === 'nau' && f.sport === sp && f.teamId === '2464'))`),
            true);
        check('NMSU is tracked in both football and basketball, ESPN id 166',
            run(`['football','basketball'].every(sp => sportsFeeds.some(f => f.teamKey === 'nmsu' && f.sport === sp && f.teamId === '166'))`),
            true);
        check('teamLogos has NMSU and NAU but no UNM entry',
            run(`('nmsu' in teamLogos) && ('nau' in teamLogos) && !('unm' in teamLogos)`),
            true);
        check('CONFIG.standingsGroups covers ASU/UA/NMSU/NAU with the verified group ids (NMSU C-USA 12/11, NAU Big Sky 20/5)',
            run(`CONFIG.standingsGroups.football.nmsu === '12' && CONFIG.standingsGroups.basketball.nmsu === '11' &&
                CONFIG.standingsGroups.football.nau === '20' && CONFIG.standingsGroups.basketball.nau === '5' &&
                ['football', 'basketball'].every(sport => Object.keys(CONFIG.standingsGroups[sport]).sort().join(',') === 'asu,nau,nmsu,ua')`),
            true);
        check('NAU has a legend entry, a team color and a standings label',
            run(`!!document.querySelector('.team-legend [data-team="nau"]') && STANDINGS_TEAM_LABEL.nau === 'Lumberjacks'`) && /--team-nau:#2b6cb0/.test(html),
            true);
        check('every sports feed carries an ESPN league path (used for opponent-record lookups)',
            run(`sportsFeeds.every(f => /^(football|basketball)[/][a-z-]+$/.test(f.league))`),
            true);

        // --- rivalry highlighting: matched by the opponent's ESPN team id,
        // not by display-name text (which varies by feed). Only the
        // Territorial Cup (ASU vs Arizona) remains now that UNM/NMSU/NAU
        // are no longer tracked — the Rio Grande and in-state Arizona-trio
        // pairs that depended on them were removed along with those teams. ---
        run(`
            window.__territorialCup = { teamKey: 'asu', opponentTeamId: '12' };
            window.__notARivalry = { teamKey: 'asu', opponentTeamId: '99999' };
        `);
        check('isRivalryGame flags ASU vs Arizona (Territorial Cup)', run(`isRivalryGame(window.__territorialCup)`), true);
        check('isRivalryGame does not flag an unrelated matchup', run(`isRivalryGame(window.__notARivalry)`), false);
        check('RIVALRY_PAIRS does not reference the untracked UNM key',
            run(`!RIVALRY_PAIRS.flat().includes('unm')`),
            true);
        check('ASU vs NAU and Arizona vs NAU are flagged as in-state rivalries',
            run(`[isRivalryGame({ teamKey: 'asu', opponentTeamId: '2464' }), isRivalryGame({ teamKey: 'nau', opponentTeamId: '12' })]`),
            [true, true]);
        check('NMSU vs New Mexico (id 167) is flagged — Rio Grande Rivalry',
            run(`isRivalryGame({ teamKey: 'nmsu', opponentTeamId: '167' })`), true);
        check('NMSU vs UTEP (id 2638) is flagged — Battle of I-10',
            run(`isRivalryGame({ teamKey: 'nmsu', opponentTeamId: '2638' })`), true);
        check('a non-NMSU team playing UTEP is not flagged',
            run(`isRivalryGame({ teamKey: 'asu', opponentTeamId: '2638' })`), false);

        // --- dedupeMutualGames: when two tracked teams play each other,
        // each side's own ESPN feed independently returns that same game —
        // this collapses the pair back down to a single calendar entry. ---
        run(`
            // Same real-world game (shared eventId), one copy from each
            // team's own feed — ASU hosting Arizona.
            window.__mutualHome = {
                sport: 'football', teamKey: 'asu', opponentTeamId: '12',
                opponent: 'vs Arizona Wildcats', calendarDate: '2026-11-28', eventId: '401520000'
            };
            window.__mutualAway = {
                sport: 'football', teamKey: 'ua', opponentTeamId: '9',
                opponent: '@ Arizona State', calendarDate: '2026-11-28', eventId: '401520000'
            };
            window.__unrelated = {
                sport: 'football', teamKey: 'asu', opponentTeamId: '99999',
                opponent: 'vs Some Non-Tracked Team', calendarDate: '2026-11-14', eventId: '401599999'
            };
            window.__dedupedByEventId = dedupeMutualGames([window.__mutualHome, window.__mutualAway, window.__unrelated]);
            // Same matchup again but with no eventId (e.g. sample/fallback
            // data) — must still collapse via the sport+date+team-pair
            // fallback key.
            window.__mutualHomeNoId = { sport: 'football', teamKey: 'asu', opponentTeamId: '12', opponent: 'vs Arizona Wildcats', calendarDate: '2026-11-28', eventId: '' };
            window.__mutualAwayNoId = { sport: 'football', teamKey: 'ua', opponentTeamId: '9', opponent: '@ Arizona State', calendarDate: '2026-11-28', eventId: '' };
            window.__dedupedByPair = dedupeMutualGames([window.__mutualAwayNoId, window.__mutualHomeNoId]);
        `);
        check('a game between two tracked teams collapses from two feed copies down to one',
            run(`window.__dedupedByEventId.length`), 2);
        check('games against a non-tracked opponent are left alone (only mutual tracked-vs-tracked pairs are collapsed)',
            run(`window.__dedupedByEventId.some(g => g === window.__unrelated)`), true);
        check(`the kept entry is the home team's perspective ("vs", not "@")`,
            run(`window.__dedupedByEventId.find(g => g.opponentTeamId === '12' || g.opponentTeamId === '9')?.opponent`), 'vs Arizona Wildcats');
        check('dedup still collapses a mutual pair that has no eventId, via the sport+date+team-pair fallback key',
            run(`window.__dedupedByPair.length`), 1);

        // --- mobile/crowding fix: a busy day caps inline calendar-event boxes
        // and points to the existing tap-for-detail panel instead, so this
        // scales to any number of same-day games (regardless of how many
        // teams are tracked at any given time) rather than needing another
        // pass per team added. Uses synthetic team keys, decoupled from
        // whichever teams are actually configured. Uses today's own date
        // (not a hardcoded one) so this cell is never in a since-trimmed
        // past week — see the past-week-trimming tests further below. ---
        run(`
            const busyDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            games = ['fakea', 'fakeb', 'fakec', 'faked'].map((key, i) => ({
                teamKey: key, sport: 'football', calendarDate: busyDay,
                dateValue: new Date(), state: 'pre',
                team: key.toUpperCase(), opponent: \`vs Test Opponent \${i}\`,
                opponentShort: \`Test \${i}\`, time: 'TBD'
            }));
            renderGames('all');
            updateCalendarMonth();
            window.__busyCell = document.querySelector(\`.calendar-cell[data-date="\${busyDay}"]\`);
        `);
        check('a busy day caps inline calendar events at MAX_INLINE_CALENDAR_EVENTS',
            run(`window.__busyCell.querySelectorAll('.calendar-event').length`), 2);
        check('overflow games beyond the cap show a "+N more" indicator instead of just disappearing',
            run(`window.__busyCell.querySelector('.calendar-event-more')?.textContent`), '+2 more');

        // --- finished games move out of the calendar grid and into the
        // recent-results recap instead; a month left with nothing but
        // finished games drops out of the calendar entirely, so navigation
        // advances forward rather than still offering an empty past month.
        // Uses today's own date (computed at test-run time, not a hardcoded
        // 2026 date) so this stays valid regardless of when the suite runs
        // and specifically isolates "finished games are hidden" from the
        // separate past-week-trimming behavior tested further below —
        // today is always in the current, never-trimmed week. ---
        run(`
            window.__todayKeyForCalendar = new Intl.DateTimeFormat('en-CA', {
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date());
            window.__pastFinished = {
                teamKey: 'asu', sport: 'football', calendarDate: window.__todayKeyForCalendar,
                dateValue: new Date(), state: 'post',
                team: 'Arizona State', opponent: 'vs Morgan State', opponentShort: 'Morgan State',
                time: '8:00 PM', status: 'Final', scoreText: 'ASU 48, Morgan State 7',
                score: [{ name: 'Arizona State', score: 48, winner: true }, { name: 'Morgan State', score: 7, winner: false }]
            };
            window.__upcomingSameDay = {
                teamKey: 'ua', sport: 'football', calendarDate: window.__todayKeyForCalendar,
                dateValue: new Date(), state: 'pre',
                team: 'Arizona Wildcats', opponent: 'vs Test Opponent', opponentShort: 'Test Opp', time: 'TBD'
            };
            games = [window.__pastFinished, window.__upcomingSameDay];
            renderGames('all');
            updateCalendarMonth();
            window.__mixedCell = document.querySelector(\`.calendar-cell[data-date="\${window.__todayKeyForCalendar}"]\`);
        `);
        check('finished games are hidden from the calendar grid (only the still-upcoming game on the same day renders inline)',
            run(`window.__mixedCell.querySelectorAll('.calendar-event').length`), 1);
        check('the one calendar-event box that does render is the upcoming game, not the finished one',
            run(`window.__mixedCell.querySelector('.calendar-event strong')?.textContent`), 'Arizona Wildcats');

        run(`
            games = [window.__pastFinished];
            renderGames('all');
        `);
        check('a day whose only game has already finished shows no calendar cell at all for that month (the month has nothing left to show)',
            run(`document.querySelector(\`.calendar-cell[data-date="\${window.__todayKeyForCalendar}"]\`)`), null);
        check('the schedule instead shows the "no games match" message rather than an empty calendar',
            run(`document.querySelector('#schedule .empty')?.textContent`), 'No games match the selected filter.');

        run(`
            selectCalendarDay(window.__todayKeyForCalendar);
            window.__panelText = document.querySelector('#selected-day-games').textContent;
        `);
        check('the selected-day panel does not resurface a finished game on a day the calendar grid already hid it',
            run(`window.__panelText.includes('No games scheduled')`), true);

        run(`
            window.__augFinished = {
                teamKey: 'asu', sport: 'football', calendarDate: '2026-08-15',
                dateValue: new Date('2026-08-15T00:00:00Z'), state: 'post',
                team: 'Arizona State', opponent: 'vs Old Opponent', opponentShort: 'Old Opp',
                time: 'TBD', status: 'Final', scoreText: 'ASU 20, Old Opp 10'
            };
            window.__octUpcoming = {
                teamKey: 'asu', sport: 'football', calendarDate: '2026-10-10',
                dateValue: new Date('2026-10-10T00:00:00Z'), state: 'pre',
                team: 'Arizona State', opponent: 'vs Future Opponent', opponentShort: 'Future Opp', time: 'TBD'
            };
            games = [window.__augFinished, window.__octUpcoming];
            renderGames('all');
            updateCalendarMonth();
            window.__monthTitles = [...document.querySelectorAll('#schedule .month-title')].map(t => t.textContent);
        `);
        check('a month whose only games have all finished drops out of the calendar entirely (advances forward)',
            run(`window.__monthTitles.includes('AUGUST 2026')`), false);
        check('a month that still has an upcoming game keeps its section',
            run(`window.__monthTitles.includes('OCTOBER 2026')`), true);

        // --- past-week trimming within a month's own grid: full weeks that
        // ended before the current week are dropped (offset cells and all),
        // so the current week becomes the grid's first content row instead
        // of leaving empty past weeks stacked above it. "Now" is frozen for
        // this check (real Date restored immediately after) so the trim
        // math is deterministic regardless of when the suite actually runs. ---
        run(`
            window.__RealDate = Date;
            class FixedDate extends window.__RealDate {
                constructor(...args) {
                    if (args.length === 0) return super('2026-09-19T12:00:00');
                    return super(...args);
                }
                static now() { return new window.__RealDate('2026-09-19T12:00:00').getTime(); }
            }
            Date = FixedDate; // frozen "now": Saturday, September 19 2026
            games = [{
                teamKey: 'asu', sport: 'football', calendarDate: '2026-09-06',
                dateValue: new window.__RealDate('2026-09-06T00:00:00'), state: 'pre',
                team: 'Arizona State', opponent: 'vs Early September Opponent', opponentShort: 'Early Sep', time: 'TBD'
            }, {
                teamKey: 'asu', sport: 'football', calendarDate: '2026-09-24',
                dateValue: new window.__RealDate('2026-09-24T00:00:00'), state: 'pre',
                team: 'Arizona State', opponent: 'vs Late September Opponent', opponentShort: 'Late Sep', time: 'TBD'
            }];
            renderGames('all');
            updateCalendarMonth();
            window.__trimmedGrid = document.querySelector('#schedule section .month-grid');
            window.__earlySepCell = document.querySelector('.calendar-cell[data-date="2026-09-06"]');
            window.__currentWeekSundayCell = document.querySelector('.calendar-cell[data-date="2026-09-13"]');
            window.__lateSepCell = document.querySelector('.calendar-cell[data-date="2026-09-24"]');
            // 7 weekday-header divs come first, then day content.
            window.__firstContentCell = window.__trimmedGrid?.children[7];
            Date = window.__RealDate;
        `);
        check('a day in a fully-elapsed past week (Sept 6, two Sundays before the frozen "now") has no calendar cell at all',
            run(`window.__earlySepCell`), null);
        check(`the current week's Sunday (Sept 13) still gets a cell even with no game of its own — the whole current week is kept`,
            run(`!!window.__currentWeekSundayCell`), true);
        check(`the current week becomes the grid's first content row — no leftover empty-placeholder cell renders before it`,
            run(`window.__firstContentCell?.dataset.date`), '2026-09-13');
        check('a day in a later week (Sept 24) still renders normally',
            run(`!!window.__lateSepCell`), true);

        // --- daysBetween: the helper the trim above relies on — plain
        // whole-day counting, and specifically safe across a US DST
        // transition (spring-forward is March 8, 2026), which is exactly
        // the kind of off-by-one bug this local-noon normalization avoids. ---
        check('daysBetween counts whole days between two local dates',
            run(`daysBetween(new Date(2026, 8, 5), new Date(2026, 8, 19))`), 14);
        check('daysBetween returns 0 for the same date', run(`daysBetween(new Date(2026, 8, 5), new Date(2026, 8, 5))`), 0);
        check('daysBetween is unaffected by a DST transition falling inside the range',
            run(`daysBetween(new Date(2026, 2, 1), new Date(2026, 2, 31))`), 30);

        // --- recent-results recap: grouped per team (mirrors the standings
        // strip), separate from the calendar grid that just hid these. ---
        run(`
            games = [window.__pastFinished];
            renderGames('all');
            window.__asuResultsCard = document.querySelector('#recent-results .results-team[data-team="asu"]');
            window.__cardinalsResultsCard = document.querySelector('#recent-results .results-team[data-team="cardinals"]');
        `);
        check('renderRecentResults shows a card for the team with its finished result (opponent name)',
            run(`window.__asuResultsCard?.querySelector('.result-opponent')?.textContent`), 'Morgan State');
        check('the result row is styled as a win, distinct from a loss',
            run(`window.__asuResultsCard?.querySelector('.result-row')?.classList.contains('result-win')`), true);
        check('a team with no finished games yet shows a plain "no results" message instead of an empty card',
            run(`window.__cardinalsResultsCard?.querySelector('.results-empty')?.textContent`), 'No results yet this season.');
        run(`
            renderGames('basketball');
            window.__cardinalsResultsCardFiltered = document.querySelector('#recent-results .results-team[data-team="cardinals"]');
        `);
        check('recent results respects the sport filter — a football-only team gets no card under the Basketball filter',
            run(`window.__cardinalsResultsCardFiltered`), null);
        run(`renderGames('all');`);
        check('the sport-mark in a recent-results row stays in normal inline flow rather than escaping to the page corner',
            run(`getComputedStyle(document.querySelector('#recent-results .result-row .sport-mark')).position`), 'static');

        // --- recent-results cap: only the 3 most recent finished games per
        // team render, so the card doesn't keep growing as a season's worth
        // of results piles up. ---
        run(`
            games = [1, 2, 3, 4, 5].map(n => ({
                teamKey: 'asu', sport: 'football', calendarDate: \`2026-09-0\${n}\`,
                dateValue: new Date(2026, 8, n), state: 'post',
                team: 'Arizona State', opponent: \`vs Week \${n} Opponent\`, opponentShort: \`Week \${n}\`,
                time: 'TBD', status: 'Final', scoreText: \`ASU \${10 + n}, Week \${n} Opp \${n}\`
            }));
            renderGames('all');
            window.__cappedRows = [...document.querySelectorAll('#recent-results .results-team[data-team="asu"] .result-opponent')]
                .map(el2 => el2.textContent);
        `);
        check('RECENT_RESULTS_PER_TEAM is 3', run(`RECENT_RESULTS_PER_TEAM`), 3);
        check('a team with 5 finished games only shows the 3 most recent, not all 5',
            run(`window.__cappedRows.length`), 3);
        check('the 3 shown are the most recent ones, newest first (Week 5, 4, 3 — not the older Week 1/2)',
            run(`window.__cappedRows`), ['Week 5', 'Week 4', 'Week 3']);

        // --- light theme ("High Noon") toggle ---
        check('page starts in the default Night Shift (dark) theme',
            run(`document.documentElement.dataset.theme`), undefined);
        run(`document.querySelector('#theme-toggle').click();`);
        check('clicking the theme toggle switches the root to data-theme="light"',
            run(`document.documentElement.dataset.theme`), 'light');
        check('the light palette actually changes the --bg custom property value',
            run(`window.getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`), '#f5f2ea');
        check('toggle button reflects the light state via aria-pressed',
            run(`document.querySelector('#theme-toggle').getAttribute('aria-pressed')`), 'true');
        run(`document.querySelector('#theme-toggle').click();`);
        check('clicking again switches back to Night Shift (data-theme removed)',
            run(`document.documentElement.dataset.theme`), undefined);
        check('every hardcoded dark-only panel/well color was moved to a theme variable',
            !/rgba\(12,16,22|#0e141c|#1c232d/.test(cssText),
            true);

        // --- conference standings ---
        check('extractStandingsRecord reads a verified ESPN stat shape (name/displayValue)',
            run(`extractStandingsRecord([{ name: 'overall', type: 'total', displayValue: '12-2' }], ['overall'])`),
            '12-2');
        check('extractStandingsRecord falls back through a list of candidate stat names',
            run(`extractStandingsRecord([{ name: 'conference', displayValue: '7-2' }], ['vsconf', 'conference'])`),
            '7-2');
        check('extractStandingsRecord returns empty string rather than throwing when stats are missing',
            run(`extractStandingsRecord(undefined, ['overall'])`),
            '');
        check('every tracked college team has a display label for the standings strip',
            run(`Object.keys(COLLEGE_TEAM_ID_BY_KEY).every(k => typeof STANDINGS_TEAM_LABEL[k] === 'string')`),
            true);
        run(`renderStandings([{ teamKey: 'asu', sport: 'football', overall: '2-0', conference: '1-0' }]);`);
        check('renderStandings renders a team entry with its conference and overall record',
            run(`document.querySelector('#standings-strip').textContent.includes('Conf 1-0') &&
                 document.querySelector('#standings-strip').textContent.includes('Overall 2-0') &&
                 document.querySelector('#standings-strip').textContent.includes('Sun Devils')`),
            true);
        run(`renderStandings([]);`);
        check('renderStandings shows a plain-language message rather than a blank strip when nothing is available',
            run(`document.querySelector('.standings-empty') !== null`),
            true);
        check('standings always request seasontype=2 explicitly (verified: FCS group standings silently zero out without it)',
            run(`fetchGroupStandings.toString().includes('seasontype=2')`),
            true);

        // --- historical "normal" weather comparison ---
        check('dayOfYearFromMonthDay orders month-days correctly within a year',
            run(`dayOfYearFromMonthDay('01-01') < dayOfYearFromMonthDay('06-15') && dayOfYearFromMonthDay('06-15') < dayOfYearFromMonthDay('12-31')`),
            true);
        check('isWithinDayWindow matches a nearby date',
            run(`isWithinDayWindow('09-10', '09-12', 3)`),
            true);
        check('isWithinDayWindow rejects a date outside the window',
            run(`isWithinDayWindow('01-01', '09-12', 3)`),
            false);
        check('isWithinDayWindow handles year-boundary wraparound (Dec 30 is close to Jan 2)',
            run(`isWithinDayWindow('12-30', '01-02', 3)`),
            true);
        check('computeNormalFromArchive averages only the days within the window, ignoring the rest',
            run(`(() => {
                const data = {
                    daily: {
                        time: ['2020-09-10', '2020-09-12', '2020-01-01', '2021-09-12'],
                        temperature_2m_max: [90, 100, 40, 96],
                        temperature_2m_min: [70, 74, 20, 72]
                    }
                };
                // 09-10, 09-12, and 09-12 (next year) are within 3 days of
                // 09-12; 01-01 is not, and must be excluded from the average.
                return computeNormalFromArchive(data, '09-12');
            })()`),
            { high: 95, low: 72 });
        check('computeNormalFromArchive returns null when nothing in range matches (rather than NaN/0)',
            run(`computeNormalFromArchive({ daily: { time: ['2020-01-01'], temperature_2m_max: [40], temperature_2m_min: [20] } }, '09-12')`),
            null);
        check('the historical endpoint is the Historical Weather API (archive-api), not the Climate API — verified the Climate API serves model projections, not day-of-year normals',
            run(`(() => {
                const src = fetchHistoricalNormal.toString();
                return src.includes('archive-api.open-meteo.com') && !src.includes('climate-api.open-meteo.com');
            })()`),
            true);
        run(`
            document.querySelector('[data-weather="tempe"] .weather-meta').querySelectorAll('.normal-high').forEach(n => n.remove());
            renderHistoricalNormals({ tempe: { high: 91, low: 68 } });
        `);
        check('renderHistoricalNormals appends a normal-high reading to the matching weather card',
            run(`document.querySelector('[data-weather="tempe"] .normal-high')?.textContent.includes('91')`),
            true);
        run(`renderHistoricalNormals({ tempe: { high: 91, low: 68 } });`);
        check('renderHistoricalNormals does not duplicate the reading on a second call',
            run(`document.querySelectorAll('[data-weather="tempe"] .normal-high').length`),
            1);

        // --- light theme: no hardcoded white icon colors left ---
        // .weather-symbol (the 10-day forecast icons) and .rain-drops were
        // hardcoded to #fff — invisible against High Noon's near-white
        // panels, which is exactly what only shows up once the light theme
        // actually exists. Both should read from a theme variable instead.
        check('.weather-symbol (10-day forecast icons) uses a theme-aware color, not hardcoded white',
            !/\.weather-symbol\s*\{[^}]*color:#fff/.test(cssText),
            true);
        check('.rain-drops uses a theme-aware color, not hardcoded white',
            !/\.rain-drops i\s*\{[^}]*background:#fff/.test(cssText),
            true);

        // --- header mountain mark, sitting between the title and the theme toggle ---
        check('a mountain-mark SVG sits between the "& Scoreboard" title and the theme toggle',
            run(`(() => {
                const h1 = document.querySelector('.brand-row h1');
                const mark = document.querySelector('.brand-row .mountain-mark');
                const toggle = document.querySelector('#theme-toggle');
                if (!h1 || !mark || !toggle) return false;
                // DOCUMENT_POSITION_FOLLOWING (4) means "comes after" in source order
                const afterH1 = !!(h1.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING);
                const beforeToggle = !!(mark.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING);
                return afterH1 && beforeToggle;
            })()`),
            true);
        check('the mountain mark uses the flat currentColor-fill style the cactus brand mark uses (no stroke)',
            run(`(() => {
                const mark = document.querySelector('.mountain-mark');
                const path = mark?.querySelector('path');
                return mark?.getAttribute('viewBox') === '0 0 24 24' && path?.getAttribute('fill') === 'currentColor' && !path?.getAttribute('stroke');
            })()`),
            true);
        check('the mountain mark is colored blue (distinct from the teal cactus) via a theme-aware variable',
            (cssText.match(/\.mountain-mark\s*\{[^}]*\}/) || [''])[0].includes('var(--blue)'),
            true);

        // --- selected-day panel: sport indicator + opponent-name prominence ---
        // renderSelectedDayGames previously had no sport-mark at all (unlike
        // buildCalendarEvent and renderTodayGames, which both already showed
        // one), and no context split the opponent's name out from the rest
        // of the muted meta text so it could be styled more prominently.
        run(`
            // A date a week from now, so this check doesn't break once a
            // hardcoded date drifts into a past week the calendar trims away.
            const testDayDate = new Date(Date.now() + 7 * 86400000);
            const testDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(testDayDate);
            games = [{
                teamKey: 'asu', sport: 'football', calendarDate: testDay,
                dateValue: new Date(testDay + 'T19:00:00Z'), state: 'pre',
                team: 'Arizona State', opponent: 'vs Test Rival',
                opponentShort: 'Test Rival', time: 'TBD'
            }];
            renderGames('all');
            updateCalendarMonth();
            selectCalendarDay(testDay);
            window.__selectedGame = document.querySelector('#selected-day-games .selected-day-game');
            window.__calEvent = document.querySelector(\`.calendar-cell[data-date="\${testDay}"] .calendar-event\`);
        `);
        check('renderSelectedDayGames now shows a football/basketball sport indicator (previously only buildCalendarEvent and renderTodayGames did)',
            run(`!!window.__selectedGame?.querySelector('.sport-mark')`), true);
        check('the selected-day sport-mark stays in normal inline flow rather than escaping to the page corner (.selected-day-game has no position:relative to contain the base absolute rule)',
            run(`getComputedStyle(window.__selectedGame.querySelector('.sport-mark')).position`), 'static');
        check('renderSelectedDayGames opponent name is a separately styleable .opponent-name span',
            run(`window.__selectedGame?.querySelector('.opponent-name')?.textContent`), 'Test Rival');
        check('buildCalendarEvent opponent name is a separately styleable .opponent-name span',
            run(`window.__calEvent?.querySelector('.opponent-name')?.textContent`), 'Test Rival');

        // --- today's-games list: opponent name isolated from the trailing time ---
        run(`
            const todayKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            games = [{
                teamKey: 'ua', sport: 'basketball', calendarDate: todayKey,
                dateValue: new Date(), state: 'pre', team: 'Arizona',
                opponent: '@ Test Away Opp', opponentShort: 'Test Away', time: 'TBD'
            }];
            renderGames('all');
            window.__todayGame = document.querySelector('#today-games-list .today-game');
        `);
        check('renderTodayGames opponent name is a separately styleable .opponent-name span',
            run(`window.__todayGame?.querySelector('.opponent-name')?.textContent`), 'Test Away Opp');
        check('renderTodayGames still shows the game time alongside the opponent name on one line',
            run(`[...window.__todayGame.children].find(c => c.tagName === 'SPAN' && c.classList.length === 0)?.textContent.includes('TBD')`), true);
        check('a finished/live game keeps its plain score-recap string rather than splitting out an opponent-name span (it is a score recap, not an identifying name label)',
            run(`(() => {
                games = [{
                    teamKey: 'ua', sport: 'basketball', calendarDate: new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
                    dateValue: new Date(), state: 'post', team: 'Arizona',
                    opponent: '@ Test Away Opp', opponentShort: 'Test Away', time: 'TBD',
                    score: [{ score: 70 }, { score: 7 }]
                }];
                renderGames('all');
                const g = document.querySelector('#today-games-list .today-game');
                return !g.querySelector('.opponent-name') && g.textContent.includes('Final');
            })()`), true);

        // --- opponent-name is visually bumped up from the surrounding muted
        // meta text (same font-family/weight as team names) in every context,
        // via the scoped two-class overrides required to beat the existing
        // generic .calendar-event/.today-game/.selected-day-game span rule. ---
        check('.opponent-name gets the prominent Sora/600 treatment in all three contexts (scoped to beat the generic span rule)',
            ['calendar-event', 'today-game', 'selected-day-game'].every(ctx => {
                const block = (cssText.match(new RegExp(`\\.${ctx} \\.opponent-name[^{]*\\{[^}]*\\}`)) || [''])[0];
                return block.includes('Sora') && block.includes('font-weight:600');
            }),
            true);
        check('.opponent-name still reads clearly less prominent than the followed team name (muted color, not --ink)',
            run(`getComputedStyle(window.__selectedGame.querySelector('.opponent-name')).color`) !==
            run(`getComputedStyle(window.__selectedGame.querySelector('strong')).color`),
            true);


        // --- Round 8 (PUNCHLIST.md #8) ---
        // Records under the logos only on each team's NEXT game — later games show none.
        run(`
            const dA = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 1 * 86400000));
            const dB = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 3 * 86400000));
            games = [
                { teamKey:'ua', sport:'football', state:'post', dateValue:new Date(Date.now() - 5 * 86400000), calendarDate:'2000-01-01', score:[{score:30},{score:10}], team:'Arizona Wildcats', opponent:'vs X' },
                { teamKey:'ua', sport:'football', state:'pre', calendarDate:dA, dateValue:new Date(Date.now() + 1 * 86400000), team:'Arizona Wildcats', opponent:'vs Next Opp', time:'7:00 PM', logo:'https://example.test/ua.png' },
                { teamKey:'ua', sport:'football', state:'pre', calendarDate:dB, dateValue:new Date(Date.now() + 3 * 86400000), team:'Arizona Wildcats', opponent:'@ Later Opp', time:'7:00 PM', logo:'https://example.test/ua.png' }
            ];
            renderGames('all');
            updateCalendarMonth();
            window.__laterBox = document.querySelector(\`.calendar-cell[data-date="\${dB}"] .calendar-event\`);
        `);
        check('a later (not-next) game shows no records under either logo',
            run(`window.__laterBox ? window.__laterBox.querySelectorAll('.logo-record').length : -1`),
            0);
        check('a later game also has no inline record chip in the calendar box',
            run(`window.__laterBox ? window.__laterBox.querySelectorAll('.team-record').length : -1`),
            0);

        // Opponent record under the opponent's logo; own record not repeated below the TV line.
        run(`
            const d8 = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 2 * 86400000));
            games = [
                { teamKey:'asu', sport:'basketball', state:'post', dateValue:new Date(Date.now() - 3 * 86400000), calendarDate:'2000-01-01', score:[{score:80},{score:60}], team:'Arizona State', opponent:'vs Old Opp' },
                { teamKey:'asu', sport:'basketball', state:'pre', calendarDate:d8, dateValue:new Date(Date.now() + 2 * 86400000),
                  team:'Arizona State', opponent:'@ Record Opp', opponentShort:'Record Opp', opponentRecord:'7-3', time:'7:00 PM',
                  broadcast:'Spectrum Sports Net/Suns Live', logo:'https://example.test/a.png', opponentLogo:'https://example.test/b.png' }
            ];
            renderGames('all');
            updateCalendarMonth();
            window.__r8 = document.querySelector(\`.calendar-cell[data-date="\${d8}"] .calendar-event\`);
        `);
        check('opponent record shows under the opponent logo on an upcoming game',
            run(`[...window.__r8.querySelectorAll('.logo-with-record')].map(c => c.querySelector('img').alt + '=' + c.querySelector('.logo-record').textContent).sort().join(' ')`),
            'Arizona State logo=1-0 Record Opp logo=7-3');
        check('the followed team record is not repeated as an inline chip below the TV line in the calendar box',
            run(`window.__r8.querySelectorAll('.team-record').length`), 0);
        check('appendGameMeta skips the inline record for a next game, whose logo already shows it',
            run(`(() => { const m = document.createElement('div'); appendGameMeta(m, games[1]); return !!m.querySelector('.team-record'); })()`),
            false);
        check('TV label shows only the first channel, with the full list in a tooltip',
            run(`[window.__r8.querySelector('.broadcast-tag').textContent, window.__r8.querySelector('.broadcast-tag').title]`),
            ['TV Spectrum Sports Net', 'Spectrum Sports Net/Suns Live']);
        check('a single-channel TV label has no redundant tooltip',
            run(`broadcastTag({ broadcast: 'ESPN2' }).hasAttribute('title')`), false);

        // Opponent records come from the opponent's schedule feed (CORS-safe), not teams/{id}.
        check('opponent records use the schedule endpoint on site.web.api.espn.com, not the CORS-blocked teams/{id}',
            run(`(() => { const src = loadOpponentRecords.toString(); return src.includes('site.web.api.espn.com') && src.includes('/schedule?') && src.includes('recordSummary') && !src.includes('site.api.espn.com/apis/site/v2'); })()`),
            true);
        check('loadOpponentRecords requests only near-term opponents, once each',
            run(`(async () => {
                const calls = [];
                const realFetch = window.fetch;
                window.fetch = (url) => { calls.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({ team: { recordSummary: '4-2' } }) }); };
                for (const k of Object.keys(opponentRecords)) delete opponentRecords[k];
                games = [
                    { teamKey:'asu', sport:'basketball', state:'pre', league:'basketball/mens-college-basketball', opponentTeamId:'111', dateValue:new Date(Date.now() + 86400000), calendarDate:'2099-01-01', opponent:'vs A' },
                    { teamKey:'ua', sport:'basketball', state:'pre', league:'basketball/mens-college-basketball', opponentTeamId:'111', dateValue:new Date(Date.now() + 2 * 86400000), calendarDate:'2099-01-02', opponent:'vs A' },
                    { teamKey:'asu', sport:'basketball', state:'pre', league:'basketball/mens-college-basketball', opponentTeamId:'222', dateValue:new Date(Date.now() + 90 * 86400000), calendarDate:'2099-03-01', opponent:'vs B' }
                ];
                await loadOpponentRecords();
                window.fetch = realFetch;
                window.__lazyCalls = calls.length;
                window.__lazyRecord = games[0].opponentRecord;
            })()`) && null, null);

        // Seasons roll over on their own.
        check('currentSeasons: Nov 2026 is football 2026 / basketball 2027 ("2026–27 season")',
            run(`(() => { const s = currentSeasons(new Date(2026, 10, 11)); return [s.football, s.basketball, s.label]; })()`),
            [2026, 2027, '2026–27 season']);
        check('currentSeasons: Jan 2027 is still football 2026 (bowls/playoffs) and basketball 2027',
            run(`(() => { const s = currentSeasons(new Date(2027, 0, 15)); return [s.football, s.basketball]; })()`),
            [2026, 2027]);
        check('currentSeasons: Aug 2027 rolls to football 2027 / basketball 2028',
            run(`(() => { const s = currentSeasons(new Date(2027, 7, 1)); return [s.football, s.basketball]; })()`),
            [2027, 2028]);
        check('CONFIG seasons are derived, not hardcoded',
            run(`CONFIG.footballSeason === currentSeasons().football && CONFIG.basketballSeason === currentSeasons().basketball`),
            true);

        // Fallback schedule.
        check('sample-schedule rows dated before today are dropped instead of showing as upcoming',
            run(`[isStaleFallback({ date: '2000-01-01' }), isStaleFallback({ date: '2999-01-01' }), isStaleFallback({ date: '2000-01-01', state: 'post' })]`),
            [true, false, false]);
        check('sample schedule includes NMSU in both sports',
            run(`['football','basketball'].every(sp => fallbackGamesRaw.some(g => g.teamKey === 'nmsu' && g.sport === sp))`),
            true);
        check('a hydrated home sample game keeps its own logo on its own side (no own/opponent logo swap)',
            run(`(() => { const g = hydrateFallback({ teamKey:'ua', sport:'football', team:'Arizona Wildcats', opponent:'vs Utah Utes', opponentLogo:'https://example.test/utah.png', date:'2999-01-01' }); return [g.logo === teamLogos.ua, g.opponentLogo]; })()`),
            [true, 'https://example.test/utah.png']);
        check('NMSU uses the gold team color chosen in PUNCHLIST.md #7',
            /--team-nmsu:#c17817/.test(html), true);

        setTimeout(() => {
            check('loadOpponentRecords looks up only next-game opponents (one shared opponent = one request; a later game\'s opponent is skipped)',
                window.__lazyCalls, 1);
            check('the fetched record is applied to the game', window.__lazyRecord, '4-2');
            console.log(`\n${passed} passed, ${failed} failed.`);
            process.exit(failed ? 1 : 0);
        }, 300);
        return;
        console.log(`\n${passed} passed, ${failed} failed.`);
        process.exit(failed ? 1 : 0);
    } catch (e) {
        console.error('TEST HARNESS ERROR:', e);
        process.exit(1);
    }
}, 500);
