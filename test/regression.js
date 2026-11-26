// ValleyStats (Southwest) regression checks.
//
// Loads the REAL index.html with jsdom and exercises its actual functions
// with network calls stubbed out.
//
// Usage:
//   npm install jsdom --no-save   (if not already installed)
//   node test/regression.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const rootDir = path.join(__dirname, '..');
const indexPath = path.join(rootDir, 'index.html');
const swPath = path.join(rootDir, 'sw.js');
const manifestPath = path.join(rootDir, 'manifest.webmanifest');
const html = fs.readFileSync(indexPath, 'utf8');
const swSrc = fs.readFileSync(swPath, 'utf8');
const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: undefined,
    url: 'https://example.test/',
    beforeParse(window) {
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
        // --- Core helpers ---
        check('opponentName strips "vs "',
            run(`opponentName({opponent:'vs Northern Arizona Lumberjacks'})`),
            'Northern Arizona Lumberjacks');
        check('opponentName strips "@ "',
            run(`opponentName({opponent:'@ Texas A&M Aggies'})`),
            'Texas A&M Aggies');

        check('sportMark football', run(`sportMark('football')`), '\u{1F3C8}');
        check('sportMark basketball', run(`sportMark('basketball')`), '\u{1F3C0}');
        check('sportMark unknown sport returns nothing', run(`sportMark('golf')`), '');

        check('didWin via winner flag', run(`didWin({score:[{winner:true},{winner:false}]})`), true);
        check('didWin via score fallback', run(`didWin({score:[{score:35},{score:7}]})`), true);

        // --- logoPair: home always on the right, divider always reads "at" ---
        run(`
            window.__homeGame = { team:'Arizona Wildcats', opponent:'vs Northern Arizona Lumberjacks',
                opponentLogo:'https://example.test/opp.png', logo:'https://example.test/own.png', teamKey:'ua', sport:'football',
                dateValue:new Date('2026-09-05T00:00:00Z') };
            window.__homePairImgs = [...logoPair(window.__homeGame).querySelectorAll('img')].map(i => i.alt);
            window.__divider = logoPair(window.__homeGame).querySelector('.logo-divider').textContent;
        `);
        check('home game: away logo left, home logo right',
            run('window.__homePairImgs'),
            ['Northern Arizona Lumberjacks logo', 'Arizona Wildcats logo']);
        check('divider always reads "at"', run('window.__divider'), 'at');

        // --- computeOwnRecord ---
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

        // --- recentForm: "Last 5" with colored circles ONLY (no W/L letters) ---
        run(`
            games = [
                { teamKey:'ua', sport:'football', state:'post', dateValue:new Date('2026-09-05T00:00:00Z'), score:[{score:20},{score:10}] },
                { teamKey:'ua', sport:'football', state:'post', dateValue:new Date('2026-09-12T00:00:00Z'), score:[{score:10},{score:24}] },
                { teamKey:'ua', sport:'basketball', state:'post', dateValue:new Date('2026-09-06T00:00:00Z'), score:[{score:99},{score:1}] }
            ];
            window.__form = recentForm({ teamKey:'ua', sport:'football', dateValue:new Date('2026-09-19T00:00:00Z') });
        `);
        check('recentForm only counts the same team+sport, excludes basketball',
            run(`window.__form.querySelectorAll('.form-strip i').length`), 2);
        check('recentForm labels the indicator "Last 5"',
            run(`window.__form.querySelector('.form-label')?.textContent`), 'Last 5');
        check('recentForm uses colored circles only (no W/L text inside dots)',
            run(`[...window.__form.querySelectorAll('.form-strip i')].map(n => [n.className, n.textContent])`),
            [['w', ''], ['l', '']]);

        // --- Weather WMO snow/fog fixes ---
        check('snow WMO codes (71, 73, 75, 85, 86) map to snowing icon, not rainy',
            run(`[71, 73, 75, 77, 85, 86].every(c => weatherIconName(c) === 'snowing')`), true);
        check('fog WMO codes (45, 48) map to foggy icon',
            run(`[45, 48].every(c => weatherIconName(c) === 'foggy')`), true);
        check('rain WMO codes (51, 61, 63, 80) map to rainy icon',
            run(`[51, 61, 63, 80].every(c => weatherIconName(c) === 'rainy')`), true);
        check('weatherDescriptions covers snow, heavy rain, and freezing fog codes',
            run(`!!weatherDescriptions[73] && !!weatherDescriptions[85] && !!weatherDescriptions[63] && !!weatherDescriptions[48]`), true);

        // --- Weather cache & no fake hardcoded "Live" temperatures ---
        check('cold-start weather card starts with Loading status and placeholder temp, not fake "Live"',
            run(`document.querySelector('[data-weather="tempe"] [data-weather-status]').textContent === 'Loading' &&
                 document.querySelector('[data-weather="tempe"] .temperature').textContent.startsWith('--')`), true);
        run(`
            writeWeatherCache({ tempe: { current: { temperature_2m: 78, apparent_temperature: 77, weather_code: 0, wind_speed_10m: 6, wind_direction_10m: 180 },
                daily: { time: ['2026-11-25'], temperature_2m_max: [81], temperature_2m_min: [54], precipitation_probability_max: [0], weather_code: [0], sunrise: ['2026-11-25T07:09'], sunset: ['2026-11-25T17:22'] },
                hourly: { time: ['2026-11-25T14:00'], temperature_2m: [78], precipitation_probability: [0], weather_code: [0] } } });
            renderLiveWeather('tempe', readWeatherCache().cities.tempe, 'cached');
        `);
        check('weather cache round-trips and renders with Cached status badge',
            run(`document.querySelector('[data-weather="tempe"] [data-weather-status]').textContent === 'Cached' &&
                 document.querySelector('[data-weather="tempe"] .temperature').textContent.startsWith('78')`), true);

        // --- All-cities glance grid + on-click 10-day detail (no horizontal bars) ---
        check('all 6 CONFIG.locations entries render in the glance grid and 10-day panel is hidden by default',
            run(`Object.keys(CONFIG.locations).length === 6 &&
                 Object.keys(CONFIG.locations).every(key => document.querySelector(\`[data-weather="\${key}"]\`)) &&
                 document.querySelector('#city-detail-panel').hidden === true`),
            true);
        check('clicking a city card opens 10-day detail with no horizontal temp bars, and clicking again closes it',
            run(`(() => {
                const card = document.querySelector('[data-weather="tempe"]');
                card.click();
                const opened = !document.querySelector('#city-detail-panel').hidden;
                const noBars = document.querySelectorAll('#forecast-list .temp-bar-track').length === 0;
                const hasDay = document.querySelectorAll('#forecast-list .forecast-day').length > 0;
                card.click();
                const closed = document.querySelector('#city-detail-panel').hidden;
                return [opened, noBars, hasDay, closed];
            })()`),
            [true, true, true, true]);
        check('Glendale stays removed from weather tracking',
            run(`!('glendale' in CONFIG.locations) && !document.querySelector('[data-weather="glendale"]') && !document.querySelector('[data-location="glendale"]')`),
            true);
        check('loadAlerts watches every visible configured location',
            run(`(() => { const src = loadAlerts.toString(); return src.includes('Object.entries(locations).filter') && src.includes('isCityShown'); })()`),
            true);
        check('loadWeather batches visible cities into one comma-separated Open-Meteo call',
            run(`(() => { const src = loadWeather.toString(); return src.includes("join(',')") && src.includes('isCityShown'); })()`),
            true);

        // --- Teams, standings groups, and rivalries ---
        check('UNM (167), Wyoming (2751), NAU (2464), and NMSU (166) are tracked in both sports',
            run(`[['unm','167'],['wyo','2751'],['nau','2464'],['nmsu','166']].every(([k,id]) =>
                ['football','basketball'].every(sp => sportsFeeds.some(f => f.teamKey === k && f.sport === sp && f.teamId === id)))`),
            true);
        check('CONFIG.standingsGroups covers all 6 college teams with verified group ids',
            run(`CONFIG.standingsGroups.football.nmsu === '12' && CONFIG.standingsGroups.basketball.nmsu === '11' &&
                CONFIG.standingsGroups.football.nau === '20' && CONFIG.standingsGroups.basketball.nau === '5' &&
                CONFIG.standingsGroups.football.unm === '17' && CONFIG.standingsGroups.basketball.unm === '44' &&
                CONFIG.standingsGroups.football.wyo === '17' && CONFIG.standingsGroups.basketball.wyo === '44' &&
                ['football', 'basketball'].every(sport => Object.keys(CONFIG.standingsGroups[sport]).sort().join(',') === 'asu,nau,nmsu,ua,unm,wyo')`),
            true);
        check('every sports feed carries an ESPN league path',
            run(`sportsFeeds.every(f => /^(football|basketball)[/][a-z-]+$/.test(f.league))`),
            true);
        check('all 8 teams have legend entries and CSS team color tokens',
            run(`['cardinals','suns','asu','ua','nau','nmsu','unm','wyo'].every(k => !!document.querySelector('#team-legend [data-team="' + k + '"]'))`) &&
            ['cardinals','suns','asu','ua','nau','nmsu','unm','wyo'].every(k => new RegExp(`--team-${k}:`).test(html)),
            true);

        check('isRivalryGame flags Territorial Cup, Rio Grande, Battle of I-10, Border War, and AZ in-state games',
            run(`[
                isRivalryGame({ teamKey: 'asu', opponentTeamId: '12' }),
                isRivalryGame({ teamKey: 'nmsu', opponentTeamId: '167' }),
                isRivalryGame({ teamKey: 'unm', opponentTeamId: '166' }),
                isRivalryGame({ teamKey: 'nmsu', opponentTeamId: '2638' }),
                isRivalryGame({ teamKey: 'wyo', opponentTeamId: '36' }),
                isRivalryGame({ teamKey: 'asu', opponentTeamId: '2464' }),
                isRivalryGame({ teamKey: 'asu', opponentTeamId: '99999' })
            ]`),
            [true, true, true, true, true, true, false]);

        // --- dedupeMutualGames ---
        run(`
            const mHome = { sport:'football', teamKey:'asu', opponentTeamId:'12', opponent:'vs Arizona Wildcats', calendarDate:'2026-11-28', eventId:'401520000' };
            const mAway = { sport:'football', teamKey:'ua', opponentTeamId:'9', opponent:'@ Arizona State', calendarDate:'2026-11-28', eventId:'401520000' };
            const other = { sport:'football', teamKey:'asu', opponentTeamId:'99999', opponent:'vs Other', calendarDate:'2026-11-14', eventId:'401599999' };
            window.__deduped = dedupeMutualGames([mHome, mAway, other]);
        `);
        check('dedupeMutualGames collapses mutual tracked games and keeps the home perspective',
            run(`[window.__deduped.length, window.__deduped.find(g => g.eventId === '401520000').opponent]`),
            [2, 'vs Arizona Wildcats']);

        // --- Scorebug card, Agenda/Calendar toggle, Mobile Dot Calendar, Mobile Bottom Nav ---
        run(`
            const busyDay = todayKeyInGameTz();
            games = ['asu', 'ua', 'suns', 'wyo'].map((key, i) => ({
                teamKey: key, sport: 'basketball', calendarDate: busyDay,
                dateValue: new Date(Date.now() + (i + 1) * 3600000), state: 'pre',
                team: TEAM_LABEL[key], opponent: \`vs Test Opp \${i}\`, opponentShort: \`Test \${i}\`,
                time: '7:00 PM', broadcast: 'ESPN/ESPN+', venue: 'Tucson, AZ',
                logo: teamLogos[key], opponentLogo: 'https://example.test/opp.png'
            }));
            renderGames('all');
            window.__busyCell = document.querySelector(\`.calendar-cell[data-date="\${busyDay}"]\`);
        `);
        check('busy calendar day caps inline events at 2 with "+2 more" and renders mobile dot indicators',
            run(`[
                window.__busyCell.querySelectorAll('.calendar-event').length,
                window.__busyCell.querySelector('.calendar-event-more')?.textContent,
                window.__busyCell.querySelectorAll('.calendar-dots i').length
            ]`),
            [2, '+2 more', 4]);
        check('Agenda view renders Broadcast Scorebug cards with real img logos and short TV badge',
            run(`(() => {
                applyScheduleViewMode('agenda');
                const card = document.querySelector('#agenda-view .scorebug-card');
                const tv = card?.querySelector('.broadcast-tag');
                return [!document.querySelector('#agenda-view').hidden, document.querySelector('#calendar-wrap').hidden,
                        card?.querySelectorAll('img.team-logo').length, tv?.textContent, tv?.title];
            })()`),
            [true, true, 2, 'ESPN', 'ESPN/ESPN+']);
        check('switching to Calendar view shows calendar wrap and hides agenda view',
            run(`(() => {
                applyScheduleViewMode('calendar');
                return [document.querySelector('#agenda-view').hidden, !document.querySelector('#calendar-wrap').hidden];
            })()`),
            [true, true]);
        check('page defaults to Calendar view with Weather visible at top (never hidden on mobile)',
            run(`[scheduleViewMode, document.querySelector('#main-content').dataset.mobileTab, !document.querySelector('#calendar-wrap').hidden, document.querySelector('#agenda-view').hidden]`),
            ['calendar', 'weather', true, true]);
        check('Agenda view paginates to 6 games initially with a Show more button',
            run(`(() => {
                const base = Date.now() + 86400000;
                const ten = Array.from({ length: 10 }, (_, i) => ({
                    teamKey:'asu', sport:'basketball', calendarDate:'2099-01-' + String(i + 1).padStart(2, '0'),
                    dateValue: new Date(base + i * 86400000), state:'pre', team:'Arizona State',
                    opponent:'vs Opp ' + i, opponentShort:'Opp ' + i, time:'7:00 PM', broadcast:'ESPN', logo:teamLogos.asu, opponentLogo:''
                }));
                agendaLimit = AGENDA_PAGE_SIZE;
                renderAgendaList(ten);
                const beforeCount = document.querySelectorAll('#agenda-view .scorebug-card').length;
                const moreBtn = document.querySelector('#agenda-view .agenda-more-btn');
                const moreText = moreBtn?.textContent;
                moreBtn?.click();
                const afterCount = document.querySelectorAll('#agenda-view .scorebug-card').length;
                return [beforeCount, moreText, afterCount];
            })()`),
            [6, 'Show more games (4 remaining)', 10]);
        check('mobile bottom quick-jump bar switches active button and aria-current',
            run(`(() => {
                setMobileTab('standings');
                return [
                    document.querySelector('#main-content').dataset.mobileTab,
                    document.querySelector('[data-mobile-nav="standings"]').getAttribute('aria-current'),
                    document.querySelector('[data-mobile-nav="weather"]').getAttribute('aria-current')
                ];
            })()`),
            ['standings', 'page', null]);

        // --- Finished games move out of calendar/agenda into Recent Results ---
        run(`
            const todayKey = todayKeyInGameTz();
            window.__fin = {
                teamKey: 'asu', sport: 'football', calendarDate: todayKey,
                dateValue: new Date(), state: 'post',
                team: 'Arizona State', opponent: 'vs Morgan State', opponentShort: 'Morgan State',
                time: '8:00 PM', status: 'Final', scoreText: 'ASU 48, Morgan State 7',
                score: [{ name: 'Arizona State', score: 48, winner: true }, { name: 'Morgan State', score: 7, winner: false }]
            };
            games = [window.__fin];
            renderGames('all');
        `);
        check('finished games appear in Recent Results and are excluded from the calendar',
            run(`[
                document.querySelector('#recent-results .results-team[data-team="asu"] .result-opponent')?.textContent,
                document.querySelector('#recent-results .results-team[data-team="asu"] .result-row')?.classList.contains('result-win'),
                document.querySelector('#schedule .empty')?.textContent
            ]`),
            ['Morgan State', true, 'No games match the selected filter.']);

        // --- Past-week trimming & DST-safe daysBetween ---
        check('daysBetween counts whole days accurately across US DST spring-forward',
            run(`[daysBetween(new Date(2026, 8, 5), new Date(2026, 8, 19)), daysBetween(new Date(2026, 2, 1), new Date(2026, 2, 31))]`),
            [14, 30]);

        // --- Theme toggle (OLED Dark default vs Daylight Light) ---
        check('page starts in OLED dark Broadcast theme by default',
            run(`document.documentElement.dataset.theme`), undefined);
        run(`document.querySelector('#theme-toggle').click();`);
        check('theme toggle switches to Daylight light theme (#eef1f5) and updates aria-pressed',
            run(`[
                document.documentElement.dataset.theme,
                window.getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
                document.querySelector('#theme-toggle').getAttribute('aria-pressed')
            ]`),
            ['light', '#eef1f5', 'true']);
        run(`document.querySelector('#theme-toggle').click();`);
        check('clicking theme toggle again returns to OLED dark theme',
            run(`document.documentElement.dataset.theme`), undefined);

        // --- Standings & Historical Normals ---
        check('extractStandingsRecord reads verified ESPN stat shape',
            run(`extractStandingsRecord([{ name: 'overall', displayValue: '12-2' }], ['overall'])`), '12-2');
        check('standings requests pass seasontype=2 explicitly',
            run(`fetchGroupStandings.toString().includes('seasontype=2')`), true);
        check('computeNormalFromArchive averages only days within window (including year wraparound)',
            run(`(() => {
                const data = { daily: { time: ['2020-09-10','2020-09-12','2020-01-01','2021-09-12'],
                    temperature_2m_max: [90,100,40,96], temperature_2m_min: [70,74,20,72] } };
                return [isWithinDayWindow('12-30', '01-02', 3), computeNormalFromArchive(data, '09-12')];
            })()`),
            [true, { high: 95, low: 72 }]);

        // --- Missing-logo initials fallback ---
        check('missing or broken logo URL becomes an initials placeholder badge',
            run(`(() => {
                const wrap = document.createElement('div');
                const img = teamLogoNode('https://example.test/missing.png', 'Embry Riddle (AZ) Eagles');
                wrap.appendChild(img);
                img.dispatchEvent(new window.Event('error'));
                return [wrap.firstChild.className, wrap.firstChild.textContent, teamLogoNode('', 'UTEP Miners').textContent];
            })()`),
            ['opponent-placeholder', 'ER', 'UM']);

        // --- Settings panel team & city toggles ---
        check('settings panel lists all 8 teams and 6 cities, locks last remaining city, and resets',
            run(`(() => {
                localStorage.removeItem(PREFS_KEY); prefs = readPrefs(); renderSettingsPanel();
                const tCount = document.querySelectorAll('#settings-teams input').length;
                const cBoxes = [...document.querySelectorAll('#settings-cities input')];
                cBoxes.slice(0, -1).forEach(b => { b.checked = false; b.dispatchEvent(new window.Event('change', { bubbles: true })); });
                const locked = cBoxes[cBoxes.length - 1].disabled;
                document.querySelector('#settings-reset').click();
                return [tCount, cBoxes.length, locked, prefs.hiddenCities.length];
            })()`),
            [8, 6, true, 0]);

        // --- Round 11: 7 PM Eastern (T00:00Z) vs real TBD (timeValid:false) ---
        run(`
            window.__tbdFeed = { sport:'football', league:'football/college-football', team:'Arizona Wildcats', teamId:'12', teamKey:'ua' };
            window.__mkEvent = (date, timeValid, shortDetail) => ({
                id: 'x' + date, date, timeValid,
                competitions: [{ timeValid, status: { type: { state: 'pre', shortDetail } },
                    competitors: [ { homeAway:'away', team:{ id:'12', displayName:'Arizona Wildcats', shortDisplayName:'Arizona' } },
                                   { homeAway:'home', team:{ id:'2306', displayName:'Kansas State Wildcats', shortDisplayName:'Kansas St' } } ] }]
            });
        `);
        check('7:00 PM Eastern start (T00:00Z, timeValid:true) lands on Mountain day & 5:00 PM, not TBD',
            run(`(() => { const g = normalizeGame(__mkEvent('2026-11-22T00:00Z', true, '11/21 - 7:00 PM EST'), __tbdFeed); return [g.calendarDate, g.time]; })()`),
            ['2026-11-21', '5:00 PM']);
        check('genuinely unscheduled game (timeValid:false) stays TBD on its Eastern date',
            run(`(() => { const g = normalizeGame(__mkEvent('2027-02-06T05:00Z', false, 'TBD'), __tbdFeed); return [g.calendarDate, g.time]; })()`),
            ['2027-02-06', 'TBD']);
        check('normalizeGame uses GAME_TIME_ZONE for timed calendarDate (prevents travel timezone split)',
            run(`normalizeGame.toString().includes('calendarParts(date, GAME_TIME_ZONE)')`), true);

        // --- Seasons rollover ---
        check('currentSeasons rolls football in March and basketball in August',
            run(`[currentSeasons(new Date(2026, 10, 11)).label, currentSeasons(new Date(2027, 0, 15)).football, currentSeasons(new Date(2027, 7, 1)).basketball]`),
            ['2026–27 season', 2026, 2028]);

        // --- PWA Service Worker & Manifest checks ---
        check('sw.js uses valleystats-sw-v4 cache name and guards res.ok before caching',
            swSrc.includes("CACHE_NAME = 'valleystats-sw-v4'") && swSrc.includes('if (res && res.ok)'), true);
        check('Recent results separates football and basketball per college team (FB / BB tags)',
            run(`(() => {
                games = [
                    { teamKey:'asu', sport:'football', state:'post', dateValue:new Date('2026-11-21T20:00:00Z'), calendarDate:'2026-11-21', team:'Arizona State', opponent:'vs Okla St', opponentShort:'Okla St', status:'Final', score:[{score:31,winner:true},{score:17,winner:false}] },
                    { teamKey:'asu', sport:'basketball', state:'post', dateValue:new Date('2026-11-24T20:00:00Z'), calendarDate:'2026-11-24', team:'Arizona State', opponent:'vs LSU', opponentShort:'LSU', status:'Final', score:[{score:92,winner:false},{score:94,winner:true}] }
                ];
                renderRecentResults('all');
                const cards = [...document.querySelectorAll('#recent-results .results-team[data-team="asu"]')];
                return cards.map(c => [c.dataset.sport, c.querySelector('.results-sport-tag')?.textContent]);
            })()`),
            [['basketball', '· BB'], ['football', '· FB']]);

        // --- Live & Final score upgrades ---
        check('CONFIG.livePollIntervalMs is 60 seconds and adaptive polling detects live games',
            run(`(() => {
                games = [{ teamKey:'suns', sport:'basketball', state:'in', calendarDate: todayKeyInGameTz(),
                    dateValue: new Date(), team:'Phoenix Suns', opponent:'vs Lakers', status:'Q3 4:12',
                    score:[{name:'PHX',score:84},{name:'LAL',score:81}] }];
                const liveList = getLiveOrImminentGames();
                return [CONFIG.livePollIntervalMs, liveList.length];
            })()`),
            [60000, 1]);
        check('Final scorebug highlights winning row and shows FINAL · W / FINAL · L pill',
            run(`(() => {
                const winCard = buildScorebugCard({
                    teamKey:'asu', sport:'football', state:'post', calendarDate: todayKeyInGameTz(),
                    dateValue: new Date(), team:'Arizona State', opponent:'vs Oklahoma State', status:'Final',
                    score:[{name:'ASU',score:31,winner:true},{name:'OKST',score:17,winner:false}],
                    logo:teamLogos.asu, opponentLogo:''
                });
                return [
                    winCard.querySelector('.scorebug-final')?.textContent,
                    winCard.querySelector('.scorebug-final')?.classList.contains('is-win'),
                    winCard.querySelectorAll('.matchup-row.is-winner').length,
                    winCard.querySelectorAll('.matchup-row.is-loser').length
                ];
            })()`),
            ['Final · W', true, 1, 1]);
        check('renderTodayGames surfaces yesterday finals under "Yesterday’s finals"',
            run(`(() => {
                const yKey = todayKeyInGameTz(new Date(Date.now() - 86400000));
                games = [{
                    teamKey:'ua', sport:'basketball', state:'post', calendarDate: yKey,
                    dateValue: new Date(Date.now() - 86400000), team:'Arizona Wildcats', opponent:'vs UConn',
                    status:'Final', score:[{name:'UA',score:84,winner:true},{name:'UConn',score:78,winner:false}],
                    logo:teamLogos.ua, opponentLogo:''
                }];
                renderTodayGames();
                return [
                    document.querySelector('#today-games-list .today-subhead')?.textContent,
                    document.querySelectorAll('#today-games-list .is-recent-final').length
                ];
            })()`),
            ['Yesterday’s finals', 1]);
        check('manifest.webmanifest uses Southwest description and #000000 OLED theme color',
            manifestJson.description.includes('Southwest') && manifestJson.theme_color === '#000000', true);

        // --- Lazy opponent record lookup ---
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
            window.__lazyCalls = calls.filter(u => String(u).includes('/schedule?')).length;
            window.__lazyRecord = opponentRecords['basketball/mens-college-basketball|111'];
        })()`);

        setTimeout(() => {
            check('loadOpponentRecords requests only next-game opponents, once each',
                window.__lazyCalls, 1);
            check('fetched opponent record is stored', window.__lazyRecord, '4-2');
            console.log(`\n${passed} passed, ${failed} failed.`);
            process.exit(failed ? 1 : 0);
        }, 300);
    } catch (e) {
        console.error('TEST HARNESS ERROR:', e);
        process.exit(1);
    }
}, 400);
