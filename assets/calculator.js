/* ============================================================
   HSA Monster — web calculators
   ------------------------------------------------------------
   Direct port of the iOS app's HSACalculatorViewModel so the web
   and the app produce identical numbers from identical inputs.
   Two modes, one engine:
     'growth' — project HSA balance + tax savings vs. a taxable
                brokerage (the app's "Invest" tab)
     'defer'  — value of leaving an unreimbursed expense balance
                invested (the app's "Defer" tab)
   No dependencies; the chart is hand-rolled SVG.
   ============================================================ */
(function () {
    'use strict';

    /* ------------------------------------------------------------
       Config — mirrors HSACalculatorConfig.default (2026 values).
       In the app these come from Remote Config so IRS limit changes
       ship without a release; on the web they're updated here.
       ------------------------------------------------------------ */
    var CONFIG = {
        year: 2026,
        individualLimit: 4400,
        familyLimit: 8750,
        federalBrackets: [10, 12, 22, 24, 32, 35, 37],
        ficaRate: 7.65,
        maxStateTaxRate: 13
    };

    /* Annual drag applied to the taxable comparison's gains, modeling tax owed
       on dividends/realized gains that the HSA avoids entirely. ~10% reflects a
       typical diversified taxable portfolio (~0.7% annual tax cost). */
    var TAXABLE_DRAG = 0.10;

    /* Upper bound for entered dollar amounts, guarding against layout/chart
       breakage from an unrealistically large entry. */
    var MAX_AMOUNT = 10000000;

    /* Defaults. The app seeds the balance fields from live account data; on the
       web there's nothing to read, so the deferred amount starts at a round
       figure that makes the chart meaningful on first paint. */
    var DEFAULTS = {
        coverage: 'family',
        startingBalance: 0,
        annualContribution: null, // null => track the annual max
        federalBracket: 24,
        stateTaxRate: 5,
        expectedReturn: 7,
        yearsInvested: 25,
        inflationRate: 2.5,
        includeFICA: true,
        reimbursableAmount: 5000
    };

    var STORE_PREFIX = 'hsacalc_';

    /* ------------------------------------------------------------
       Formatting
       ------------------------------------------------------------ */
    var currencyFmt = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    });

    var groupFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

    function money(value) {
        // -0 formats as "-$0"; normalize it away.
        return currencyFmt.format(Math.abs(value) < 0.5 ? 0 : value);
    }

    function signedMoney(value) {
        return (value > 0 ? '+' : '') + money(value);
    }

    function percent(value, digits) {
        return value.toFixed(digits === undefined ? 1 : digits) + '%';
    }

    /* ------------------------------------------------------------
       Persistence — the web analogue of the app's @AppStorage.
       Inputs are shared across both calculators, as they are in the
       app, so switching pages keeps your assumptions.
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

    /* ------------------------------------------------------------
       Model — the projection math, ported 1:1 from Swift.
       ------------------------------------------------------------ */
    function Model(state) {
        this.state = state;
    }

    Model.prototype.maxContribution = function () {
        return this.state.coverage === 'family' ? CONFIG.familyLimit : CONFIG.individualLimit;
    };

    /* The contribution actually used: tracks the annual max until the user
       moves the slider, then holds their number (clamped to the new limit when
       coverage changes). Mirrors adjustContributionForNewMax(). */
    Model.prototype.annualContribution = function () {
        var max = this.maxContribution();
        if (this.state.annualContribution === null) return max;
        return Math.min(this.state.annualContribution, max);
    };

    /* Combined marginal rate as a fraction (e.g. 0.3665). Includes FICA when
       contributions are made pre-tax through payroll. */
    Model.prototype.combinedTaxRate = function () {
        var fica = this.state.includeFICA ? CONFIG.ficaRate : 0;
        return (this.state.federalBracket + this.state.stateTaxRate + fica) / 100;
    };

    /* Immediate income-tax reduction from this year's contribution. */
    Model.prototype.annualTaxSavings = function () {
        return this.annualContribution() * this.combinedTaxRate();
    };

    /* Total income tax saved across all contribution years. */
    Model.prototype.totalTaxSaved = function () {
        return this.annualTaxSavings() * this.state.yearsInvested;
    };

    /* Total dollars contributed over the projection window (excludes starting balance). */
    Model.prototype.totalContributed = function () {
        return this.annualContribution() * this.state.yearsInvested;
    };

    /* Inflation-adjusted ("real") return via the Fisher equation:
       real = (1 + nominal) / (1 + inflation) − 1 */
    Model.prototype.fisherRealReturn = function (nominal) {
        var inflation = this.state.inflationRate / 100;
        return (1 + nominal) / (1 + inflation) - 1;
    };

    Model.prototype.realReturn = function () {
        return this.fisherRealReturn(this.state.expectedReturn / 100) * 100;
    };

    /* Core compound-growth loop. Contributions are added at the start of each
       year, then the whole balance grows at the given real return. The series
       starts at year 0 (the starting balance, before any contribution/growth).

       The projection runs in real terms, so a flat contribution here already
       represents one that keeps pace with inflation — which is how the IRS has
       historically adjusted the limit. No separate escalation is needed. */
    Model.prototype.projection = function (startingBalance, annualContribution, annualReturn) {
        var balance = startingBalance;
        var points = [{ year: 0, value: balance }];
        var years = Math.max(this.state.yearsInvested, 1);
        for (var year = 1; year <= years; year++) {
            balance += annualContribution;
            balance *= (1 + annualReturn);
            points.push({ year: year, value: balance });
        }
        return points;
    };

    /* Year-by-year projected HSA balance, contributions growing tax-free. */
    Model.prototype.hsaSeries = function () {
        return this.projection(
            this.state.startingBalance,
            this.annualContribution(),
            this.fisherRealReturn(this.state.expectedReturn / 100)
        );
    };

    /* Year-by-year taxable brokerage comparison: after-tax contributions, a drag
       on nominal gains, then deflated to real dollars. */
    Model.prototype.taxableSeries = function () {
        var combined = this.combinedTaxRate();
        var afterTaxContribution = this.annualContribution() * (1 - combined);
        var afterTaxStart = this.state.startingBalance * (1 - combined);
        // Tax is levied on nominal gains, so apply the drag before deflating.
        var nominalAfterDrag = (this.state.expectedReturn / 100) * (1 - TAXABLE_DRAG);
        return this.projection(afterTaxStart, afterTaxContribution, this.fisherRealReturn(nominalAfterDrag));
    };

    /* The reimbursable amount left invested, tax-free, with no new contributions. */
    Model.prototype.deferredSeries = function () {
        return this.projection(
            this.state.reimbursableAmount,
            0,
            this.fisherRealReturn(this.state.expectedReturn / 100)
        );
    };

    function lastValue(series) {
        return series.length ? series[series.length - 1].value : 0;
    }

    /* The series value at a given year, falling back to the last point when the
       year is out of range. */
    function valueAt(series, year) {
        for (var i = 0; i < series.length; i++) {
            if (series[i].year === year) return series[i].value;
        }
        return lastValue(series);
    }

    /* ------------------------------------------------------------
       Chart — inline SVG line + area, matching the app's styling
       (accent line with a fading area fill, dashed muted comparison).
       ------------------------------------------------------------ */
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var PAD_TOP = 10;
    var PAD_BOTTOM = 2;

    function Chart(svg, gradientId) {
        this.svg = svg;
        this.gradientId = gradientId;
        this.build();
    }

    Chart.prototype.build = function () {
        var defs = document.createElementNS(SVG_NS, 'defs');
        var grad = document.createElementNS(SVG_NS, 'linearGradient');
        grad.setAttribute('id', this.gradientId);
        grad.setAttribute('x1', '0');
        grad.setAttribute('y1', '0');
        grad.setAttribute('x2', '0');
        grad.setAttribute('y2', '1');
        var stopTop = document.createElementNS(SVG_NS, 'stop');
        stopTop.setAttribute('offset', '0%');
        stopTop.setAttribute('stop-color', 'var(--accent-primary)');
        stopTop.setAttribute('stop-opacity', '0.5');
        var stopBottom = document.createElementNS(SVG_NS, 'stop');
        stopBottom.setAttribute('offset', '100%');
        stopBottom.setAttribute('stop-color', 'var(--accent-primary)');
        stopBottom.setAttribute('stop-opacity', '0');
        grad.appendChild(stopTop);
        grad.appendChild(stopBottom);
        defs.appendChild(grad);
        this.svg.appendChild(defs);

        this.area = document.createElementNS(SVG_NS, 'path');
        this.area.setAttribute('class', 'chart-area');
        this.area.setAttribute('fill', 'url(#' + this.gradientId + ')');

        this.taxableLine = document.createElementNS(SVG_NS, 'path');
        this.taxableLine.setAttribute('class', 'chart-line-taxable');

        this.line = document.createElementNS(SVG_NS, 'path');
        this.line.setAttribute('class', 'chart-line-hsa');

        this.rule = document.createElementNS(SVG_NS, 'line');
        this.rule.setAttribute('class', 'chart-rule chart-hidden');

        this.dot = document.createElementNS(SVG_NS, 'circle');
        this.dot.setAttribute('class', 'chart-dot chart-hidden');
        this.dot.setAttribute('r', '5');

        // Comparison first so the accent series paints over it, as in the app.
        this.svg.appendChild(this.taxableLine);
        this.svg.appendChild(this.area);
        this.svg.appendChild(this.line);
        this.svg.appendChild(this.rule);
        this.svg.appendChild(this.dot);
    };

    /* Catmull-Rom through the data points, emitted as cubic Béziers — the web
       equivalent of the app's .catmullRom interpolation. Control points are
       clamped to the plot box so a smoothed curve can't overshoot out of frame. */
    function smoothPath(pts, top, bottom) {
        if (!pts.length) return '';
        if (pts.length < 3) {
            return pts.map(function (p, i) {
                return (i ? 'L' : 'M') + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
            }).join(' ');
        }
        var clamp = function (y) { return Math.min(Math.max(y, top), bottom); };
        var d = 'M' + pts[0].x.toFixed(2) + ' ' + pts[0].y.toFixed(2);
        for (var i = 0; i < pts.length - 1; i++) {
            var p0 = pts[i - 1] || pts[i];
            var p1 = pts[i];
            var p2 = pts[i + 1];
            var p3 = pts[i + 2] || p2;
            var c1x = p1.x + (p2.x - p0.x) / 6;
            var c1y = clamp(p1.y + (p2.y - p0.y) / 6);
            var c2x = p2.x - (p3.x - p1.x) / 6;
            var c2y = clamp(p2.y - (p3.y - p1.y) / 6);
            d += ' C' + c1x.toFixed(2) + ' ' + c1y.toFixed(2) +
                 ' ' + c2x.toFixed(2) + ' ' + c2y.toFixed(2) +
                 ' ' + p2.x.toFixed(2) + ' ' + p2.y.toFixed(2);
        }
        return d;
    }

    /**
     * @param {Array}  series   primary (accent) series
     * @param {Array}  compare  optional dashed comparison series
     * @param {number} yMax     y-domain maximum
     * @param {number} xMax     x-domain maximum (years)
     * @param {number} reveal   0–1 scale applied to plotted values
     */
    Chart.prototype.render = function (series, compare, yMax, xMax, reveal) {
        var rect = this.svg.getBoundingClientRect();
        var w = rect.width;
        var h = rect.height;
        if (!w || !h) return;

        this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        this.width = w;
        this.height = h;

        var top = PAD_TOP;
        var bottom = h - PAD_BOTTOM;
        var domainMax = Math.max(yMax, 1);
        var domainX = Math.max(xMax, 1);

        var toPoint = function (p) {
            return {
                x: (p.year / domainX) * w,
                y: bottom - ((p.value * reveal) / domainMax) * (bottom - top)
            };
        };

        var pts = series.map(toPoint);
        this.points = pts;
        this.plotTop = top;
        this.plotBottom = bottom;

        var linePath = smoothPath(pts, top, bottom);
        this.line.setAttribute('d', linePath);
        this.area.setAttribute('d', linePath
            ? linePath + ' L' + pts[pts.length - 1].x.toFixed(2) + ' ' + bottom.toFixed(2) +
              ' L' + pts[0].x.toFixed(2) + ' ' + bottom.toFixed(2) + ' Z'
            : '');

        if (compare && compare.length) {
            this.taxableLine.setAttribute('d', smoothPath(compare.map(toPoint), top, bottom));
            this.taxableLine.style.display = '';
        } else {
            this.taxableLine.style.display = 'none';
        }
    };

    /* Vertical rule + point marker for the scrubbed year, matching the app. */
    Chart.prototype.highlight = function (index) {
        if (index === null || !this.points || !this.points[index]) {
            this.rule.classList.add('chart-hidden');
            this.dot.classList.add('chart-hidden');
            return;
        }
        var p = this.points[index];
        this.rule.setAttribute('x1', p.x);
        this.rule.setAttribute('x2', p.x);
        this.rule.setAttribute('y1', this.plotTop);
        this.rule.setAttribute('y2', this.plotBottom);
        this.dot.setAttribute('cx', p.x);
        this.dot.setAttribute('cy', p.y);
        this.rule.classList.remove('chart-hidden');
        this.dot.classList.remove('chart-hidden');
    };

    /* ------------------------------------------------------------
       Animated numbers — the web stand-in for .contentTransition(.numericText).
       Each update retargets the running tween from wherever it is, so dragging
       a slider reads as the value chasing your finger rather than snapping.
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
            this.current = value;
            this.el.textContent = this.format(value);
            return;
        }
        if (this.frame) return; // already tweening toward the new target
        var self = this;
        var step = function () {
            var delta = self.target - self.current;
            if (Math.abs(delta) < 0.5) {
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
       Calculator wiring
       ------------------------------------------------------------ */
    function init() {
        var root = document.querySelector('[data-calculator]');
        if (!root) return;

        var mode = root.getAttribute('data-calculator'); // 'growth' | 'defer'
        var isGrowth = mode === 'growth';

        /* --- State, seeded from storage --- */
        var state = {
            coverage: readStore('coverage', DEFAULTS.coverage),
            startingBalance: readStore('startingBalance', DEFAULTS.startingBalance),
            annualContribution: readStore('annualContribution', DEFAULTS.annualContribution),
            federalBracket: readStore('federalBracket', DEFAULTS.federalBracket),
            stateTaxRate: readStore('stateTaxRate', DEFAULTS.stateTaxRate),
            expectedReturn: readStore('expectedReturn', DEFAULTS.expectedReturn),
            yearsInvested: readStore('yearsInvested', DEFAULTS.yearsInvested),
            inflationRate: readStore('inflationRate', DEFAULTS.inflationRate),
            includeFICA: readStore('includeFICA', DEFAULTS.includeFICA),
            reimbursableAmount: readStore('reimbursableAmount', DEFAULTS.reimbursableAmount)
        };

        // A stored federal bracket that's no longer offered snaps to the nearest
        // option, and the state rate is clamped to the configured maximum.
        if (CONFIG.federalBrackets.indexOf(state.federalBracket) === -1) {
            state.federalBracket = CONFIG.federalBrackets.reduce(function (best, rate) {
                return Math.abs(rate - state.federalBracket) < Math.abs(best - state.federalBracket) ? rate : best;
            }, CONFIG.federalBrackets[0]);
        }
        state.stateTaxRate = Math.min(Math.round(state.stateTaxRate), CONFIG.maxStateTaxRate);

        var model = new Model(state);

        /* --- Elements --- */
        var $ = function (id) { return document.getElementById(id); };

        var resultValueEl = $('result-value');
        var resultCaptionEl = $('result-caption');
        var statAValue = $('stat-a-value');
        var statBValue = $('stat-b-value');
        var disclaimerEl = $('calc-disclaimer');
        var axisEndEl = $('axis-end');
        var svg = $('calc-chart');

        var headline = new AnimatedValue(resultValueEl, money);
        var statA = new AnimatedValue(statAValue, money);
        var statB = new AnimatedValue(statBValue, isGrowth ? signedMoney : money);

        var chart = new Chart(svg, 'calcGradient');

        /* --- Reveal animation: sweep the curve up from the baseline once --- */
        var reveal = reduceMotion ? 1 : 0;
        var scrubbedIndex = null;

        /* --- Render --- */
        function render() {
            var series = isGrowth ? model.hsaSeries() : model.deferredSeries();
            var compare = isGrowth ? model.taxableSeries() : null;

            // Y-domain keys off the highest point across every plotted series,
            // not the final balance: when inflation outruns the return the real
            // balance declines and peaks at year 0.
            var peak = series.reduce(function (m, p) { return Math.max(m, p.value); }, 0);
            if (compare) {
                peak = compare.reduce(function (m, p) { return Math.max(m, p.value); }, peak);
            }
            var yMax = Math.ceil(peak * 1.05);

            chart.render(series, compare, yMax, state.yearsInvested, reveal);
            chart.highlight(scrubbedIndex);

            var scrubYear = scrubbedIndex === null ? null : series[scrubbedIndex].year;

            // Headline follows the drag; otherwise it's the end of the window.
            var headlineValue = scrubYear === null ? lastValue(series) : valueAt(series, scrubYear);
            headline.set(headlineValue);
            resultCaptionEl.textContent = scrubYear === null
                ? 'Tax-Free Balance'
                : 'Year ' + scrubYear;

            if (isGrowth) {
                var years = scrubYear === null ? state.yearsInvested : scrubYear;
                statA.set(model.annualTaxSavings() * years);
                var hsaAt = scrubYear === null ? lastValue(series) : valueAt(series, scrubYear);
                var taxableAt = scrubYear === null ? lastValue(compare) : valueAt(compare, scrubYear);
                statB.set(hsaAt - taxableAt);
            } else {
                statA.set(state.reimbursableAmount);
                var deferredAt = scrubYear === null ? lastValue(series) : valueAt(series, scrubYear);
                statB.set(deferredAt - state.reimbursableAmount);
            }

            if (axisEndEl) {
                axisEndEl.textContent = 'Year ' + state.yearsInvested;
            }
            disclaimerEl.textContent = disclaimerText();
        }

        /* Assumptions footnote, worded exactly as CalculatorDisclaimer. */
        function disclaimerText() {
            var real = percent(model.realReturn());
            if (isGrowth) {
                return 'Assumes ' + money(model.annualContribution()) + '/yr for ' +
                    state.yearsInvested + ' years (' + money(model.totalContributed()) +
                    ' total) at a ' + real + ' real return. The taxable comparison uses ' +
                    'after-tax dollars and reduces annual gains by 10%. For illustrative ' +
                    'purposes only. Not tax, legal, or investment advice.';
            }
            return 'Assumes you leave your ' + money(state.reimbursableAmount) +
                ' in unreimbursed expenses invested for ' + state.yearsInvested +
                ' years at a ' + real + ' real return. Qualified reimbursements are ' +
                'tax-free with no IRS deadline. For illustrative purposes only. ' +
                'Not tax, legal, or investment advice.';
        }

        function update(key, value) {
            state[key] = value;
            writeStore(key, value);
            render();
        }

        /* --- Slider helper: paints the filled track and wires the label --- */
        function bindSlider(id, key, opts) {
            var input = $(id);
            if (!input) return null;
            var label = $(id + '-value');
            var format = (opts && opts.format) || function (v) { return String(v); };
            var parse = (opts && opts.parse) || parseFloat;

            var paint = function () {
                var min = parseFloat(input.min);
                var max = parseFloat(input.max);
                var pct = max === min ? 0 : ((parseFloat(input.value) - min) / (max - min)) * 100;
                input.style.setProperty('--fill', pct + '%');
                if (label) label.textContent = format(parse(input.value));
            };

            input.value = state[key];
            paint();

            input.addEventListener('input', function () {
                var value = parse(input.value);
                paint();
                if (opts && opts.onInput) opts.onInput(value);
                update(key, value);
            });

            return { input: input, paint: paint };
        }

        /* --- Currency field helper --- */
        function bindCurrency(id, key, onChange) {
            var input = $(id);
            if (!input) return null;

            var show = function () {
                input.value = groupFmt.format(state[key]);
            };
            show();

            input.addEventListener('input', function () {
                var digits = input.value.replace(/[^0-9]/g, '');
                var value = Math.min(digits === '' ? 0 : parseInt(digits, 10), MAX_AMOUNT);
                // Reformat with separators while preserving a sane caret position
                // (typing only ever appends at the end of a numeric field).
                input.value = digits === '' ? '' : groupFmt.format(value);
                update(key, value);
                if (onChange) onChange(value);
            });

            input.addEventListener('blur', show);

            return { show: show };
        }

        /* --- Shared inputs (both calculators) --- */
        bindSlider('years', 'yearsInvested', {
            parse: function (v) { return parseInt(v, 10); },
            format: function (v) { return v + (v === 1 ? ' year' : ' years'); }
        });
        bindSlider('return', 'expectedReturn', { format: function (v) { return percent(v); } });
        bindSlider('inflation', 'inflationRate', { format: function (v) { return percent(v); } });

        /* --- Growth-only inputs --- */
        if (isGrowth) {
            var contributionSlider = $('contribution');
            var contributionLabel = $('contribution-value');
            var maxBadge = $('contribution-max');
            var coverageButtons = root.querySelectorAll('[data-coverage]');

            var paintContribution = function () {
                var max = model.maxContribution();
                var value = model.annualContribution();
                contributionSlider.max = max;
                contributionSlider.value = value;
                var pct = max === 0 ? 0 : (value / max) * 100;
                contributionSlider.style.setProperty('--fill', pct + '%');
                contributionLabel.textContent = money(value);
                // "2026 Max" badge, shown only while pinned to the limit.
                if (maxBadge) maxBadge.hidden = Math.round(value) < max;
            };

            contributionSlider.addEventListener('input', function () {
                update('annualContribution', parseFloat(contributionSlider.value));
                paintContribution();
            });

            Array.prototype.forEach.call(coverageButtons, function (btn) {
                btn.addEventListener('click', function () {
                    var coverage = btn.getAttribute('data-coverage');
                    Array.prototype.forEach.call(coverageButtons, function (b) {
                        b.setAttribute('aria-pressed', String(b === btn));
                    });
                    state.coverage = coverage;
                    writeStore('coverage', coverage);
                    // Re-fit the contribution to the new limit: a user tracking
                    // the max follows it, and anything above the new cap drops.
                    var max = model.maxContribution();
                    if (state.annualContribution !== null && state.annualContribution > max) {
                        update('annualContribution', max);
                    }
                    paintContribution();
                    render();
                });
                btn.setAttribute('aria-pressed', String(btn.getAttribute('data-coverage') === state.coverage));
            });

            paintContribution();

            bindCurrency('starting-balance', 'startingBalance');

            // Federal bracket + state tax menus, populated from config so an IRS
            // change is a one-line edit at the top of this file.
            var federalSelect = $('federal');
            CONFIG.federalBrackets.forEach(function (rate) {
                var opt = document.createElement('option');
                opt.value = rate;
                opt.textContent = rate + '%';
                federalSelect.appendChild(opt);
            });
            federalSelect.value = state.federalBracket;
            federalSelect.addEventListener('change', function () {
                update('federalBracket', parseInt(federalSelect.value, 10));
            });

            var stateSelect = $('state-tax');
            for (var rate = 0; rate <= CONFIG.maxStateTaxRate; rate++) {
                var opt = document.createElement('option');
                opt.value = rate;
                opt.textContent = rate + '%';
                stateSelect.appendChild(opt);
            }
            stateSelect.value = state.stateTaxRate;
            stateSelect.addEventListener('change', function () {
                update('stateTaxRate', parseInt(stateSelect.value, 10));
            });

            var ficaToggle = $('fica');
            ficaToggle.checked = state.includeFICA;
            ficaToggle.addEventListener('change', function () {
                update('includeFICA', ficaToggle.checked);
            });

            var ficaRateEl = $('fica-rate');
            if (ficaRateEl) ficaRateEl.textContent = CONFIG.ficaRate.toFixed(2) + '%';
        } else {
            /* --- Defer-only input --- */
            bindCurrency('reimbursable', 'reimbursableAmount');
        }

        /* Config-driven copy (limits, tax year) rendered into the page text. */
        Array.prototype.forEach.call(document.querySelectorAll('[data-config]'), function (el) {
            var key = el.getAttribute('data-config');
            if (key === 'year') el.textContent = String(CONFIG.year);
            else if (key === 'individualLimit') el.textContent = money(CONFIG.individualLimit);
            else if (key === 'familyLimit') el.textContent = money(CONFIG.familyLimit);
        });

        /* ------------------------------------------------------------
           Scrubbing — drag (or hover) the chart to read any year.
           ------------------------------------------------------------ */
        var wrap = svg.parentNode;

        function indexForClientX(clientX) {
            var rect = svg.getBoundingClientRect();
            if (!rect.width) return null;
            var fraction = (clientX - rect.left) / rect.width;
            fraction = Math.min(Math.max(fraction, 0), 1);
            var year = Math.round(fraction * Math.max(state.yearsInvested, 1));
            return Math.min(year, Math.max(state.yearsInvested, 1));
        }

        function scrubTo(clientX) {
            var index = indexForClientX(clientX);
            if (index === scrubbedIndex) return;
            scrubbedIndex = index;
            render();
        }

        function endScrub() {
            if (scrubbedIndex === null) return;
            scrubbedIndex = null;
            render();
        }

        wrap.addEventListener('pointerdown', function (e) {
            wrap.setPointerCapture(e.pointerId);
            scrubTo(e.clientX);
        });
        wrap.addEventListener('pointermove', function (e) {
            // Hover scrubs on mouse; touch only scrubs once the finger is down,
            // so the gesture never fights a page scroll.
            if (e.pointerType === 'mouse' || e.buttons) scrubTo(e.clientX);
        });
        wrap.addEventListener('pointerup', endScrub);
        wrap.addEventListener('pointercancel', endScrub);
        wrap.addEventListener('pointerleave', endScrub);

        /* Keyboard scrubbing, so the chart's data is reachable without a pointer. */
        wrap.setAttribute('tabindex', '0');
        wrap.addEventListener('keydown', function (e) {
            var maxYear = Math.max(state.yearsInvested, 1);
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                var next = scrubbedIndex === null
                    ? (e.key === 'ArrowRight' ? 0 : maxYear)
                    : scrubbedIndex + (e.key === 'ArrowRight' ? 1 : -1);
                scrubbedIndex = Math.min(Math.max(next, 0), maxYear);
                render();
            } else if (e.key === 'Escape') {
                endScrub();
            }
        });
        wrap.addEventListener('blur', endScrub);

        /* Re-render on resize so the SVG tracks its container. */
        var resizeTimer = null;
        var onResize = function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(render, 80);
        };
        if (window.ResizeObserver) {
            new ResizeObserver(onResize).observe(wrap);
        } else {
            window.addEventListener('resize', onResize);
        }

        /* First paint, then sweep the curve up from the baseline (0.5s ease-out,
           matching the app's reveal). */
        render();
        headline.set(isGrowth ? lastValue(model.hsaSeries()) : lastValue(model.deferredSeries()), true);

        if (!reduceMotion) {
            var start = null;
            var sweep = function (ts) {
                if (start === null) start = ts;
                var t = Math.min((ts - start) / 500, 1);
                reveal = 1 - Math.pow(1 - t, 3); // ease-out cubic
                render();
                if (t < 1) requestAnimationFrame(sweep);
            };
            requestAnimationFrame(sweep);
        }

        /* Mobile "Calculate" button: scrolls the results into view. The
           projection is already live, so there's nothing to compute — this
           just delivers the payoff the button implies on a stacked layout. */
        var jumpBtn = document.getElementById('calc-jump');
        if (jumpBtn) {
            jumpBtn.addEventListener('click', function () {
                var card = document.querySelector('.result-card');
                if (!card) return;
                card.scrollIntoView({
                    behavior: reduceMotion ? 'auto' : 'smooth',
                    block: 'start'
                });
                if (typeof gtag === 'function') {
                    gtag('event', 'calculator_calculate', { calculator: mode, app: 'hsamonster' });
                }
            });
        }

        /* Report calculator engagement so tool traffic can be tied to installs. */
        var engaged = false;
        root.addEventListener('input', function () {
            if (engaged || typeof gtag !== 'function') return;
            engaged = true;
            gtag('event', 'calculator_engage', { calculator: mode, app: 'hsamonster' });
        }, { once: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
