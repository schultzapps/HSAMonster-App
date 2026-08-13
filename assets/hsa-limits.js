/* ============================================================
   HSA Monster — IRS contribution limits, by tax year
   ------------------------------------------------------------
   The one place the limits live. Both the contribution-limits
   tool and the growth calculator read from here, so adding a
   year updates every page that quotes a figure — the year menus,
   the slider ceilings, the reference tables and the body copy.

   Loaded as a plain script (no modules) to match the rest of the
   site, and before the calculators that depend on it.
   ============================================================ */
(function (global) {
    'use strict';

    /* ------------------------------------------------------------
       Limits by tax year.

       The IRS publishes the following year's figures around May, so
       adding a year here is the entire change. Newest first — the
       first entry is what the year menus default to.

       The catch-up amount is set by statute at $1,000 and is not
       inflation-indexed, so unlike the limits it doesn't move year
       to year. It's stored per-year anyway so that a future change
       in the law is the same one-line edit.

       `published` is the date the IRS released that year's figures,
       used for the dateModified freshness signal on the limits page.
       ------------------------------------------------------------ */
    var YEARS = [
        { year: 2027, individualLimit: 4500, familyLimit: 9000, catchUpAmount: 1000, published: '2026-05-29' },
        { year: 2026, individualLimit: 4400, familyLimit: 8750, catchUpAmount: 1000, published: '2025-05-01' },
        { year: 2025, individualLimit: 4300, familyLimit: 8550, catchUpAmount: 1000, published: '2024-05-09' }
    ];

    /* Age-based catch-up eligibility, the same across every year above. */
    var CATCH_UP_AGE = 55;

    /* Defaults to the newest published year. The IRS releases each year's
       figures the previous May, and search interest shifts to the new year
       well before it starts — open enrollment runs in the autumn, which is
       when people are actually choosing a payroll election. Earlier years stay
       one pick away in the menu. */
    var DEFAULT_YEAR = YEARS.reduce(function (best, entry) {
        return entry.year > best ? entry.year : best;
    }, YEARS[0].year);

    /* Pay schedules, with the number of paychecks each produces in a year.
       Semi-monthly (24) and biweekly (26) are distinct on purpose — they're
       widely confused, and the two-paycheck difference is exactly the kind of
       thing that leaves someone short of the max in December. */
    var FREQUENCIES = [
        { id: 'weekly', label: 'Weekly', periods: 52 },
        { id: 'biweekly', label: 'Every 2 weeks', periods: 26 },
        { id: 'semimonthly', label: 'Twice a month', periods: 24 },
        { id: 'monthly', label: 'Monthly', periods: 12 }
    ];

    /* The limits for a tax year, falling back to the newest entry so a stale
       stored year can never leave a caller without figures to render. */
    function limitsFor(year) {
        var newest = YEARS[0];
        for (var i = 0; i < YEARS.length; i++) {
            if (YEARS[i].year === year) return YEARS[i];
            if (YEARS[i].year > newest.year) newest = YEARS[i];
        }
        return newest;
    }

    function hasYear(year) {
        return YEARS.some(function (entry) { return entry.year === year; });
    }

    /* Oldest first — the year menus and the reference tables both read upward,
       while YEARS itself stays newest-first for the default. */
    function ascending() {
        return YEARS.slice().sort(function (a, b) { return a.year - b.year; });
    }

    function periodsFor(id) {
        for (var i = 0; i < FREQUENCIES.length; i++) {
            if (FREQUENCIES[i].id === id) return FREQUENCIES[i].periods;
        }
        return 26;
    }

    global.HSALimits = {
        years: YEARS,
        catchUpAge: CATCH_UP_AGE,
        defaultYear: DEFAULT_YEAR,
        frequencies: FREQUENCIES,
        limitsFor: limitsFor,
        hasYear: hasYear,
        ascending: ascending,
        periodsFor: periodsFor
    };
})(window);
