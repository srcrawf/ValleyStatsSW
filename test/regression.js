// ValleyStats (Night Shift) regression checks.
//
// Loads the REAL index.html with jsdom and exercises its actual functions
// (not reimplemented copies), with network calls stubbed out so it falls
// back to the page's own sample schedule/weather data. This exists because
// a real bug (ESPN's record field using different key names than the code
// assumed) shipped silently for a while — a check like this, run against a
// realistic data shape, would have caught it immediately.
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
            appendGameMeta(window.__metaEl, {
                teamKey:'asu', sport:'football', dateValue:new Date('2026-09-12T00:00:00Z'),
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

        console.log(`\n${passed} passed, ${failed} failed.`);
        process.exit(failed ? 1 : 0);
    } catch (e) {
        console.error('TEST HARNESS ERROR:', e);
        process.exit(1);
    }
}, 500);
