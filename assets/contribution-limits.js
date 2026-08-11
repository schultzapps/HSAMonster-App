/* ============================================================
   HSA Monster — 2026 contribution limit calculator
   ------------------------------------------------------------
   A different shape from the growth/defer calculators: there's no
   projection and no chart, just the IRS limit for your situation
   and — the reason this page exists — what that works out to per
   paycheck once an employer contribution is accounted for.

   Kept separate from calculator.js deliberately. That file is a
   port of the app's HSACalculatorViewModel and shares its stored
   inputs across both projection pages; this tool has no overlap
   with those inputs and no reason to load the chart engine.
   ============================================================ */
(function () {
    'use strict';

    /* ------------------------------------------------------------
       Limits by tax year.

       The IRS publishes the following year's figures around May, so
       adding a year here is the entire change: the year menu, the
       page copy and the reference table all read from this table.
       Newest first — the first entry becomes the default.

       The catch-up amount is set by statute at $1,000 and is not
       inflation-indexed, so unlike the limits it doesn't move year
       to year. It's stored per-year anyway so that a future change
       in the law is the same one-line edit.
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

    function limitsFor(year) {
        for (var i = 0; i < YEARS.length; i++) {
            if (YEARS[i].year === year) return YEARS[i];
        }
        return YEARS[0];
    }

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

    /* Guard against an entry large enough to break the layout. Employer
       contributions above the limit are meaningful (they zero out your room),
       but nothing beyond the family limit + catch-up changes the math. */
    var MAX_EMPLOYER = 100000;

    var STORE_PREFIX = 'hsalimits_';

    var DEFAULTS = {
        year: DEFAULT_YEAR,
        coverage: 'family',
        catchUp: false,
        employerContribution: 0,
        frequency: 'biweekly'
    };

    /* ------------------------------------------------------------
       Formatting
       ------------------------------------------------------------ */
    var currencyFmt = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    });

    /* Per-paycheck figures need the cents — "$336.54" is what you'd actually
       type into a benefits portal, and rounding to dollars quietly loses up to
       a paycheck's worth of room across a year. */
    var centsFmt = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    var groupFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

    function money(value) {
        return currencyFmt.format(Math.abs(value) < 0.5 ? 0 : value);
    }

    function moneyCents(value) {
        return centsFmt.format(Math.abs(value) < 0.005 ? 0 : value);
    }

    /* ------------------------------------------------------------
       Persistence — same approach as the projection calculators, on
       its own key prefix so the two tools never overwrite each other.
       ------------------------------------------------------------ */
    function readStore(key, fallback) {
        try {
            var raw = localStorage.getItem(STORE_PREFIX + key);
            if (raw === null) return fallback;
            var parsed = JSON.parse(raw);
            return parsed === null ? fallback : parsed;
        } catch (e) {
            return fallback;
        }
    }

    function writeStore(key, value) {
        try {
            localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
        } catch (e) {
            /* Private browsing or a full quota — inputs just won't persist. */
        }
    }

    function periodsFor(id) {
        for (var i = 0; i < FREQUENCIES.length; i++) {
            if (FREQUENCIES[i].id === id) return FREQUENCIES[i].periods;
        }
        return 26;
    }

    /* ------------------------------------------------------------
       Model
       ------------------------------------------------------------ */
    function Model(state) {
        this.state = state;
    }

    /* The published limits for the selected tax year. */
    Model.prototype.limits = function () {
        return limitsFor(this.state.year);
    };

    /* The statutory limit before any catch-up. */
    Model.prototype.baseLimit = function () {
        var limits = this.limits();
        return this.state.coverage === 'family' ? limits.familyLimit : limits.individualLimit;
    };

    Model.prototype.catchUp = function () {
        return this.state.catchUp ? this.limits().catchUpAmount : 0;
    };

    /* Everything that can go into the account this year, from all sources. */
    Model.prototype.totalLimit = function () {
        return this.baseLimit() + this.catchUp();
    };

    /* Employer money counts against the same limit, so it's capped there —
       a contribution larger than the limit doesn't create negative room, it
       just leaves you with none. */
    Model.prototype.employerContribution = function () {
        return Math.min(this.state.employerContribution, this.totalLimit());
    };

    /* What's left for the employee to contribute — the number that actually
       goes into a benefits election. */
    Model.prototype.yourRoom = function () {
        return Math.max(this.totalLimit() - this.employerContribution(), 0);
    };

    Model.prototype.periods = function () {
        return periodsFor(this.state.frequency);
    };

    /* Per-paycheck figures are floored to the cent rather than rounded.

       These get typed into a benefits portal and multiplied back out by
       payroll, so a half-cent rounded up is a real overcontribution: $4,500
       over 26 paychecks is $173.0769, and electing the rounded $173.08 puts
       $4,500.08 into the account — an excess contribution subject to the 6%
       excise tax. Flooring leaves at most a few cents on the table instead,
       which is the side of the line to be on.

       Math.floor after scaling by 100 can trip on binary representation
       (a true $173.08 stored as 173.07999... would floor to $173.07), so the
       value is nudged by a rounding epsilon first. */
    function floorCents(value) {
        return Math.floor(value * 100 + 1e-6) / 100;
    }

    /* The full limit spread across the year, ignoring who funds it. Shown
       alongside the employee share so the split is visible. */
    Model.prototype.totalPerPaycheck = function () {
        return floorCents(this.totalLimit() / this.periods());
    };

    Model.prototype.yourPerPaycheck = function () {
        return floorCents(this.yourRoom() / this.periods());
    };

    /* The employer's share spread across the same schedule. Employer
       contributions rarely arrive per paycheck (a lump sum at the start of the
       plan year is common), so this is an average, not a deposit schedule.

       Taken as the remainder rather than floored independently: it's the one
       figure of the three nobody types into a form, so it absorbs the rounding
       and the three cards still visibly add up. */
    Model.prototype.employerPerPaycheck = function () {
        return this.totalPerPaycheck() - this.yourPerPaycheck();
    };

    /* True once the employer alone has consumed the entire limit. */
    Model.prototype.isMaxedByEmployer = function () {
        return this.yourRoom() <= 0 && this.state.employerContribution > 0;
    };

    /* ------------------------------------------------------------
       Animated numbers — same treatment as the projection tools so
       the figures chase the controls rather than snapping.
       ------------------------------------------------------------ */
    var reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function AnimatedValue(el, format) {
        this.el = el;
        this.format = format;
        this.current = 0;
        this.target = 0;
        this.frame = null;
    }

    AnimatedValue.prototype.set = function (value, immediate) {
        this.target = value;
        if (immediate || reduceMotion) {
            // Cancel any tween already in flight, or its next frame would
            // resume and paint over the value we're setting here.
            if (this.frame) {
                cancelAnimationFrame(this.frame);
                this.frame = null;
            }
            this.current = value;
            this.el.textContent = this.format(value);
            return;
        }
        if (this.frame) return; // already tweening toward the new target
        var self = this;
        var step = function () {
            var delta = self.target - self.current;
            // Tighter threshold than the projection charts: these figures are
            // small enough that half a dollar is a visible error.
            if (Math.abs(delta) < 0.005) {
                self.current = self.target;
                self.el.textContent = self.format(self.current);
                self.frame = null;
                return;
            }
            self.current += delta * 0.28;
            self.el.textContent = self.format(self.current);
            self.frame = requestAnimationFrame(step);
        };
        this.frame = requestAnimationFrame(step);
    };

    /* ------------------------------------------------------------
       Wiring
       ------------------------------------------------------------ */
    function init() {
        var root = document.querySelector('[data-limits-calculator]');
        if (!root) return;

        var state = {
            year: readStore('year', DEFAULTS.year),
            coverage: readStore('coverage', DEFAULTS.coverage),
            catchUp: readStore('catchUp', DEFAULTS.catchUp),
            employerContribution: readStore('employerContribution', DEFAULTS.employerContribution),
            frequency: readStore('frequency', DEFAULTS.frequency)
        };

        // A stored frequency that's no longer offered falls back to the default
        // rather than silently dividing by the wrong number of paychecks.
        if (!FREQUENCIES.some(function (f) { return f.id === state.frequency; })) {
            state.frequency = DEFAULTS.frequency;
        }

        // Likewise for a stored year that's since dropped off the table, so an
        // old visit can't pin the page to limits that are no longer listed.
        if (!YEARS.some(function (y) { return y.year === state.year; })) {
            state.year = DEFAULTS.year;
        }

        var model = new Model(state);

        var $ = function (id) { return document.getElementById(id); };

        var limitValueEl = $('limit-value');
        var limitCaptionEl = $('limit-caption');
        var breakdownEl = $('limit-breakdown');
        var baseRowValue = $('row-base-value');
        var baseRowLabel = $('row-base-label');
        var catchUpRow = $('row-catchup');
        var catchUpRowValue = $('row-catchup-value');
        var employerRow = $('row-employer');
        var employerRowValue = $('row-employer-value');
        var yourRoomValue = $('row-room-value');
        var paycheckSection = $('paycheck-results');
        var statTotalValue = $('stat-total-value');
        var statEmployerValue = $('stat-employer-value');
        var statYoursValue = $('stat-yours-value');
        var statYoursTitle = $('stat-yours-title');
        var paycheckNote = $('paycheck-note');
        var disclaimerEl = $('limits-disclaimer');

        var headline = new AnimatedValue(limitValueEl, money);
        var statTotal = new AnimatedValue(statTotalValue, moneyCents);
        var statYours = new AnimatedValue(statYoursValue, moneyCents);
        var statEmployer = new AnimatedValue(statEmployerValue, moneyCents);

        /* Set on the initial render so the stored inputs paint as final values
           rather than animating up from zero. */
        var firstPaint = false;

        /* --- Render --- */
        function render() {
            var total = model.totalLimit();
            var employer = model.employerContribution();
            var room = model.yourRoom();

            headline.set(total, firstPaint);
            limitCaptionEl.textContent = state.year + ' Contribution Limit' +
                (state.catchUp ? ' (with catch-up)' : '');

            // Breakdown rows
            baseRowLabel.textContent = state.coverage === 'family'
                ? 'Family coverage limit'
                : 'Self-only coverage limit';
            baseRowValue.textContent = money(model.baseLimit());

            catchUpRow.hidden = !state.catchUp;
            catchUpRowValue.textContent = '+ ' + money(model.catchUp());

            var hasEmployer = state.employerContribution > 0;
            employerRow.hidden = !hasEmployer;
            employerRowValue.textContent = '− ' + money(employer);

            yourRoomValue.textContent = money(room);

            // Per-paycheck figures
            statTotal.set(model.totalPerPaycheck(), firstPaint);
            statYours.set(model.yourPerPaycheck(), firstPaint);
            statEmployer.set(model.employerPerPaycheck(), firstPaint);
            statYoursTitle.textContent = hasEmployer ? 'Your Share / Paycheck' : 'Per Paycheck';

            // The two stats are identical without an employer contribution, so
            // the pair only earns its space once there's a split to show.
            paycheckSection.classList.toggle('single-stat', !hasEmployer);

            var note = noteText(employer);
            paycheckNote.textContent = note;
            paycheckNote.hidden = note === '';

            disclaimerEl.textContent = disclaimerText();
            renderConfigCopy();
        }

        /* Config-driven copy, so the year, limits and catch-up figures quoted
           throughout the page follow the year menu rather than being pinned to
           whatever was hardcoded in the markup. */
        function renderConfigCopy() {
            var limits = model.limits();
            var values = {
                year: String(limits.year),
                individualLimit: money(limits.individualLimit),
                familyLimit: money(limits.familyLimit),
                catchUpAmount: money(limits.catchUpAmount),
                individualCatchUp: money(limits.individualLimit + limits.catchUpAmount),
                familyCatchUp: money(limits.familyLimit + limits.catchUpAmount),
                catchUpAge: String(CATCH_UP_AGE),
                nextYear: String(limits.year + 1)
            };
            Array.prototype.forEach.call(document.querySelectorAll('[data-config]'), function (el) {
                var key = el.getAttribute('data-config');
                if (Object.prototype.hasOwnProperty.call(values, key)) {
                    el.textContent = values[key];
                }
            });
        }

        /* Freshness signal for a page whose whole value is being current.

           dateModified is derived from the newest entry in YEARS rather than
           hardcoded, so it can only ever say "this page knows about the latest
           published limits" — adding a year moves it automatically, and
           forgetting to update a date by hand can't leave a stale claim in the
           markup. The date is when the IRS published those figures, which is
           the last moment the page's substance actually changed.

           Emitted from JS because the value lives in the limits table; the
           static head schema carries everything that doesn't move. */
        function emitDateSchema() {
            // Sorted rather than indexed off the ends of YEARS, so the dates
            // stay correct however the table happens to be ordered.
            var dated = YEARS.filter(function (entry) { return entry.published; })
                .sort(function (a, b) { return a.year - b.year; });
            if (!dated.length) return;

            var node = document.createElement('script');
            node.type = 'application/ld+json';
            node.textContent = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                'url': 'https://hsamonster.com/hsa-contribution-limits.html',
                'name': dated[dated.length - 1].year + ' HSA Contribution Limits',
                'datePublished': dated[0].published,
                'dateModified': dated[dated.length - 1].published
            });
            document.head.appendChild(node);
        }

        /* Builds one reference table per year in YEARS. Rendered rather than
           hand-written so adding a year to the table at the top of this file
           adds its section here too — and so the two can't drift apart.
           The markup ships a static copy of the same tables as a no-JS
           fallback, which this replaces. */
        function renderLimitTables() {
            var host = $('limits-tables-body');
            if (!host) return;

            var html = '';
            // Oldest first, so the sections read upward in the same order as
            // the year menu.
            YEARS.slice().sort(function (a, b) { return a.year - b.year; }).forEach(function (limits) {
                var rows = [
                    { id: 'individual', label: 'Self-only', base: limits.individualLimit },
                    { id: 'family', label: 'Family', base: limits.familyLimit }
                ];
                html += '<h3>' + limits.year + ' HSA contribution limits</h3>' +
                    '<div class="table-scroll"><table class="tool-table">' +
                    '<thead><tr>' +
                    '<th scope="col">Coverage</th>' +
                    '<th scope="col">Under ' + CATCH_UP_AGE + '</th>' +
                    '<th scope="col">' + CATCH_UP_AGE + ' and older</th>' +
                    '</tr></thead><tbody>';
                rows.forEach(function (row) {
                    html += '<tr>' +
                        '<th scope="row">' + row.label + '</th>' +
                        '<td>' + money(row.base) + '</td>' +
                        '<td>' + money(row.base + limits.catchUpAmount) + '</td>' +
                        '</tr>';
                });
                html += '</tbody></table></div>';
            });
            host.innerHTML = html;
        }

        /* The note only earns its space when it has something the ledger and
           the stat cards don't already say. Restating the arithmetic in prose
           is noise, so the normal case returns nothing and the element hides. */
        function noteText(employer) {
            if (model.isMaxedByEmployer()) {
                return 'Your employer\'s ' + money(employer) + ' already covers the full ' +
                    money(model.totalLimit()) + ' limit, so you have no room left to ' +
                    'contribute yourself this year. Contributing anyway would create an ' +
                    'excess contribution subject to a 6% penalty.';
            }
            return '';
        }

        /* The year and the mid-year eligibility caveat live on the coverage
           field's hint, next to the control that sets them, so this is just
           the standing legal note. */
        function disclaimerText() {
            return 'For illustrative purposes only. Not tax, legal, or investment advice.';
        }

        function update(key, value) {
            state[key] = value;
            writeStore(key, value);
            render();
        }

        /* --- Tax year menu, built from the limits table ---
           Listed oldest first so the years read upward in the menu, while
           YEARS itself stays newest-first for the default and the tables. */
        var yearSelect = $('tax-year');
        YEARS.slice().sort(function (a, b) { return a.year - b.year; }).forEach(function (entry) {
            var opt = document.createElement('option');
            opt.value = entry.year;
            opt.textContent = String(entry.year);
            yearSelect.appendChild(opt);
        });
        yearSelect.value = state.year;
        yearSelect.addEventListener('change', function () {
            update('year', parseInt(yearSelect.value, 10));
        });

        /* --- Coverage segmented control --- */
        var coverageButtons = root.querySelectorAll('[data-coverage]');
        Array.prototype.forEach.call(coverageButtons, function (btn) {
            btn.setAttribute('aria-pressed', String(btn.getAttribute('data-coverage') === state.coverage));
            btn.addEventListener('click', function () {
                var coverage = btn.getAttribute('data-coverage');
                Array.prototype.forEach.call(coverageButtons, function (b) {
                    b.setAttribute('aria-pressed', String(b === btn));
                });
                update('coverage', coverage);
            });
        });

        /* --- Catch-up toggle --- */
        var catchUpToggle = $('catchup');
        catchUpToggle.checked = state.catchUp;
        catchUpToggle.addEventListener('change', function () {
            update('catchUp', catchUpToggle.checked);
        });

        /* --- Employer contribution (currency field) --- */
        var employerInput = $('employer');
        var showEmployer = function () {
            employerInput.value = state.employerContribution === 0
                ? ''
                : groupFmt.format(state.employerContribution);
        };
        showEmployer();

        employerInput.addEventListener('input', function () {
            var digits = employerInput.value.replace(/[^0-9]/g, '');
            var value = Math.min(digits === '' ? 0 : parseInt(digits, 10), MAX_EMPLOYER);
            employerInput.value = digits === '' ? '' : groupFmt.format(value);
            update('employerContribution', value);
        });
        employerInput.addEventListener('blur', showEmployer);

        /* --- Pay frequency menu --- */
        var frequencySelect = $('frequency');
        FREQUENCIES.forEach(function (freq) {
            var opt = document.createElement('option');
            opt.value = freq.id;
            opt.textContent = freq.label + ' (' + freq.periods + ' paychecks)';
            frequencySelect.appendChild(opt);
        });
        frequencySelect.value = state.frequency;
        frequencySelect.addEventListener('change', function () {
            update('frequency', frequencySelect.value);
        });

        /* First paint lands immediately — there's no reveal animation to wait
           on, and an animated count-up from $0 on load would just delay the
           one number the page exists to show.

           This has to run through render() rather than setting the figures
           again afterwards: a second set() can't cancel the tween the first
           one scheduled, so the queued frame would finish by overwriting the
           correct value with an animation from zero. That's what made a
           stored "self-only" choice come back showing the family limit. */
        // Built once — the tables list every year, so nothing in them changes
        // as the inputs move.
        renderLimitTables();
        emitDateSchema();

        firstPaint = true;
        render();
        firstPaint = false;

        /* Mobile "Calculate" button: scrolls the results into view, matching
           the projection calculators. Nothing to compute — it's already live. */
        var jumpBtn = $('calc-jump');
        if (jumpBtn) {
            jumpBtn.addEventListener('click', function () {
                var card = document.querySelector('.result-card');
                if (!card) return;
                var nav = document.querySelector('.navbar');
                var offset = (nav ? nav.getBoundingClientRect().height : 0) + 12;
                var top = card.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({
                    top: Math.max(top, 0),
                    behavior: reduceMotion ? 'auto' : 'smooth'
                });
                if (typeof gtag === 'function') {
                    gtag('event', 'calculator_calculate', { calculator: 'limits', app: 'hsamonster' });
                }
            });
        }

        /* Report engagement so tool traffic can be tied to installs. */
        var engaged = false;
        var reportEngagement = function () {
            if (engaged || typeof gtag !== 'function') return;
            engaged = true;
            gtag('event', 'calculator_engage', { calculator: 'limits', app: 'hsamonster' });
        };
        // Both events are needed: the segmented buttons and the select fire
        // click/change rather than input.
        root.addEventListener('input', reportEngagement);
        root.addEventListener('click', reportEngagement);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
