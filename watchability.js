/* Pure ESPN normalization, fact extraction, scoring, and ranking. No I/O or UI. */
(function (root) {
    'use strict';
    const EXTRACTION_VERSION = 1;
    const RULES_VERSION = 1;
    const POLICY = Object.freeze({ recommendation: 3, threeStars: 5 });
    const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

    // This small rendering contract deliberately retains competition/team names;
    // every property is allowlisted, so raw ESPN payloads cannot escape this boundary.
    function normalizeGame(game) {
        const comp = game.competitions?.[0];
        const status = game.status || comp?.status;
        const normalizeStatus = value => ({ type: {
            state: value?.type?.state ?? null,
            completed: value?.type?.completed ?? null,
            shortDetail: value?.type?.shortDetail ?? ''
        } });
        return {
            id: String(game.id), date: game.date || comp?.date || null,
            season: { type: number(game.season?.type) }, status: normalizeStatus(status),
            competitions: comp ? [{ status: normalizeStatus(comp.status || status), competitors: (comp.competitors || []).map(team => ({
                homeAway: team.homeAway, score: number(team.score),
                team: { displayName: team.team?.displayName || 'TBD', abbreviation: team.team?.abbreviation || 'TBD', logo: team.team?.logo || '' },
                records: [{ type: 'total', summary: team.records?.find(record => record.type === 'total')?.summary ?? null }],
                linescores: Array.isArray(team.linescores) ? team.linescores.map(quarter => ({ value: number(quarter.value) })) : null
            })) }] : []
        };
    }

    function normalizeScoreboard(data) {
        return {
            week: { number: data.week?.number }, season: { year: data.season.year, type: data.season.type },
            events: data.events.map(normalizeGame),
            leagues: (data.leagues || []).filter(league => league.calendar).map(league => ({
                season: { year: league.season?.year }, calendar: league.calendar.map(period => ({
                    value: period.value, entries: (period.entries || []).map(entry => ({ value: entry.value }))
                }))
            }))
        };
    }

    function normalizePlays(summary) {
        let drives = summary?.drives?.previous || summary?.drives;
        if (drives && !Array.isArray(drives)) drives = Object.values(drives).filter(drive => drive && typeof drive === 'object');
        if (!Array.isArray(drives)) return null;
        const plays = drives.flatMap(drive => drive.plays || []);
        if (!plays.length) return null;
        return plays.map(play => ({ home: number(play.homeScore), away: number(play.awayScore), period: number(play.period?.number) }));
    }

    function extractPlayMetrics(summary) {
        const plays = normalizePlays(summary);
        const missing = !plays ? 'Play history unavailable' : plays.some(play => play.home === null || play.away === null || play.period === null) ? 'Play history incomplete' : null;
        if (missing) return { leadChanges: null, lateLeadChange: null, lastQ4Score: null,
            erasedDeficitSecondHalf: null, erasedDeficitFourthQuarter: null, comebackFacts: null, unavailable: missing };
        let previousLeader = null, leadChanges = 0, previousHome = 0, previousAway = 0, lastQ4Score = null;
        const leader = (home, away) => home > away ? 'home' : away > home ? 'away' : 'tie';
        const comebackFacts = Object.fromEntries(['home', 'away'].map(side => [side, {
            secondHalfDeficit: 0, fourthQuarterDeficit: 0, erasedSecondHalfDeficit: 0, erasedFourthQuarterDeficit: 0
        }]));
        for (const play of plays) {
            const currentLeader = leader(play.home, play.away);
            if (currentLeader !== 'tie') {
                if (previousLeader && previousLeader !== currentLeader) leadChanges++;
                previousLeader = currentLeader;
            }
            if (play.period === 4 && (play.home !== previousHome || play.away !== previousAway)) {
                lastQ4Score = { before: { home: previousHome, away: previousAway }, after: { home: play.home, away: play.away },
                    previousLeader: leader(previousHome, previousAway), newLeader: currentLeader };
            }
            previousHome = play.home;
            previousAway = play.away;
            for (const side of ['home', 'away']) {
                const deficit = side === 'home' ? play.away - play.home : play.home - play.away;
                const facts = comebackFacts[side];
                if (play.period >= 3) {
                    facts.secondHalfDeficit = Math.max(facts.secondHalfDeficit, deficit);
                    if (deficit <= 0) facts.erasedSecondHalfDeficit = facts.secondHalfDeficit;
                }
                if (play.period >= 4) {
                    facts.fourthQuarterDeficit = Math.max(facts.fourthQuarterDeficit, deficit);
                    if (deficit <= 0) facts.erasedFourthQuarterDeficit = facts.fourthQuarterDeficit;
                }
            }
        }
        return { leadChanges, lastQ4Score, lateLeadChange: !!lastQ4Score && lastQ4Score.previousLeader !== 'tie' &&
            lastQ4Score.newLeader !== 'tie' && lastQ4Score.previousLeader !== lastQ4Score.newLeader,
            erasedDeficitSecondHalf: Math.max(...Object.values(comebackFacts).map(facts => facts.erasedSecondHalfDeficit)),
            erasedDeficitFourthQuarter: Math.max(...Object.values(comebackFacts).map(facts => facts.erasedFourthQuarterDeficit)),
            comebackFacts, unavailable: null };
    }

    function preGameRecord(team, won, tie) {
        const record = team?.records?.find(record => record.type === 'total')?.summary;
        if (typeof record !== 'string' || !/^\d+-\d+(?:-\d+)?$/.test(record)) return { display: null, differential: null };
        let [wins, losses, ties = 0] = record.split('-').map(Number);
        if (tie) ties = Math.max(0, ties - 1);
        else if (won) wins = Math.max(0, wins - 1);
        else losses = Math.max(0, losses - 1);
        // Preserve the shipped tie display, including a trailing zero after a tie.
        const display = tie && record.split('-').length === 3 && Number(record.split('-')[2]) > 0 ? `${wins}-${losses}-${ties}` :
            ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
        return { display, differential: wins - losses };
    }

    function extractMetrics(game, playMetrics = extractPlayMetrics(null), summaryAvailability = 'not-requested') {
        const comp = game.competitions?.[0];
        const home = comp?.competitors?.find(team => team.homeAway === 'home');
        const away = comp?.competitors?.find(team => team.homeAway === 'away');
        const homeScore = number(home?.score), awayScore = number(away?.score);
        const scoresKnown = homeScore !== null && awayScore !== null;
        const status = game.status?.type || comp?.status?.type;
        const completed = status?.state === 'post' && status.completed !== false;
        const homeRecord = completed && scoresKnown ? preGameRecord(home, homeScore > awayScore, homeScore === awayScore) : { display: null, differential: null };
        const awayRecord = completed && scoresKnown ? preGameRecord(away, awayScore > homeScore, homeScore === awayScore) : { display: null, differential: null };
        return { completed, homeScore, awayScore,
            finalMargin: completed && scoresKnown ? Math.abs(homeScore - awayScore) : null,
            combinedScore: completed && scoresKnown ? homeScore + awayScore : null,
            overtime: Array.isArray(home?.linescores) && home.linescores.length ? home.linescores.length > 4 : null,
            homeRecordDifferential: homeRecord.differential, awayRecordDifferential: awayRecord.differential,
            homeRecord: homeRecord.display, awayRecord: awayRecord.display,
            ...playMetrics, summaryAvailability };
    }

    // Each rule owns its named inputs, numerical thresholds, and weight. Adding or
    // changing a scoring rule does not require ESPN payloads or renderer changes.
    const RULES = [
        ['close', ['finalMargin'], { maxMargin: 8 }, 1, (m, t) => m.finalMargin <= t.maxMargin],
        ['very-close', ['finalMargin'], { maxMargin: 2 }, 1, (m, t) => m.finalMargin <= t.maxMargin],
        ['overtime', ['overtime', 'finalMargin'], { overtime: true, minMargin: 1 }, 1, (m, t) => m.overtime === t.overtime && m.finalMargin >= t.minMargin],
        ['comeback', ['erasedDeficitSecondHalf'], { minErasedDeficit: 15, earliestPeriod: 3 }, 1, (m, t) => m.erasedDeficitSecondHalf >= t.minErasedDeficit],
        ['strong-comeback', ['erasedDeficitFourthQuarter'], { minErasedDeficit: 8, earliestPeriod: 4 }, 1, (m, t) => m.erasedDeficitFourthQuarter >= t.minErasedDeficit],
        ['shootout', ['combinedScore', 'finalMargin'], { minCombined: 55, maxMargin: 10 }, 1, (m, t) => m.combinedScore >= t.minCombined && m.finalMargin <= t.maxMargin],
        ['super-shootout', ['combinedScore', 'finalMargin'], { minCombined: 64, maxMargin: 10 }, 1, (m, t) => m.combinedScore >= t.minCombined && m.finalMargin <= t.maxMargin],
        ['late-lead-change', ['lateLeadChange'], { directSwitchOnLastQ4Score: true }, 1, m => m.lateLeadChange],
        ['lead-changes', ['leadChanges'], { minChanges: 5 }, 1, (m, t) => m.leadChanges >= t.minChanges],
        ['many-lead-changes', ['leadChanges'], { minChanges: 7 }, 1, (m, t) => m.leadChanges >= t.minChanges],
        ['record-lead-changes', ['leadChanges'], { minChanges: 10 }, 1, (m, t) => m.leadChanges >= t.minChanges],
        ['playoff-teams', ['homeRecordDifferential', 'awayRecordDifferential'], { minDifferential: 2 }, 1, (m, t) => m.homeRecordDifferential >= t.minDifferential && m.awayRecordDifferential >= t.minDifferential],
        ['losing-teams', ['homeRecordDifferential', 'awayRecordDifferential'], { maxDifferential: -4 }, -1, (m, t) => m.homeRecordDifferential <= t.maxDifferential && m.awayRecordDifferential <= t.maxDifferential]
    ];
    function evaluate(metrics) {
        const rules = RULES.map(([id, keys, threshold, weight, test]) => {
            const inputs = Object.fromEntries(keys.map(key => [key, metrics[key] ?? null]));
            const applicable = metrics.completed && Object.values(inputs).every(value => value !== null);
            const matched = applicable ? !!test(metrics, threshold) : null;
            return { id, inputs, threshold: { ...threshold }, weight, applicable, matched,
                points: matched ? weight : 0, explanation: !metrics.completed ? 'Game not completed' : !applicable ? 'Required data unavailable' : matched ? 'Condition met' : 'Condition not met' };
        });
        const points = rules.reduce((total, rule) => total + rule.points, 0);
        const watchable = metrics.completed && points >= POLICY.recommendation;
        return { rulesVersion: RULES_VERSION, rules, points, watchable, reasons: rules.filter(rule => rule.points !== 0).map(rule => rule.id),
            recommendation: { eligible: metrics.completed, threshold: POLICY.recommendation, points, decision: watchable } };
    }

    function rankWeek(games) {
        const completed = games.filter(item => item.metrics.completed);
        const maximum = completed.length ? Math.max(...completed.map(item => item.evaluation.points)) : null;
        return games.map(item => {
            const { points, watchable } = item.evaluation;
            const tiedForFirst = item.metrics.completed && points === maximum;
            const stars = !watchable ? 0 : points >= POLICY.threeStars ? 3 : tiedForFirst ? 1 : 0;
            return { ...item, ranking: {
                rank: item.metrics.completed ? 1 + completed.filter(other => other.evaluation.points > points).length : null,
                weeklyMaximum: maximum, tiedForFirst, stars,
                explanation: !watchable ? 'Not recommended; no stars' : points >= POLICY.threeStars ? `At least ${POLICY.threeStars} points; 3 stars` :
                    tiedForFirst ? 'Tied for weekly maximum below 5 points; 1 star' : 'Recommended below 5 points and below weekly maximum; no stars'
            } };
        }).sort((a, b) => Number(b.metrics.completed) - Number(a.metrics.completed) || b.evaluation.points - a.evaluation.points);
    }
    const api = { EXTRACTION_VERSION, RULES_VERSION, normalizeGame, normalizeScoreboard, extractPlayMetrics, extractMetrics, evaluate, rankWeek, preGameRecord };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Watchability = api;
})(globalThis);
