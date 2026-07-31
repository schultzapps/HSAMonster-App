/* ============================================================
   HSA Monster — shared navbar behavior
   Drives the "Tools" dropdown and the scrolled state on every
   page. Theme toggle and the mobile hamburger stay in each
   page's inline script; this owns the parts that must behave
   identically everywhere.
   ============================================================ */
(function () {
    'use strict';

    /* The navbar contracts into its floating state once the page has
       scrolled past the hero. Runs on load as well as on scroll, so a
       page restored mid-scroll (back button, #anchor) starts correct. */
    function initScrollState() {
        var navbar = document.querySelector('.navbar');
        if (!navbar) return;

        /* Interior pages (calculators, press kit, release notes) ship the
           class in their markup because they have no hero for the bar to sit
           over — it stays collapsed at every scroll position. Leave those
           alone rather than clearing the class the moment they load. */
        if (navbar.classList.contains('scrolled')) return;

        var sync = function () {
            var scrolled = window.scrollY > 50;
            if (scrolled === navbar.classList.contains('scrolled')) return;

            navbar.classList.toggle('scrolled', scrolled);

            /* Crossing the threshold swaps the bar between the full link row
               and the collapsed state. A menu left open across that swap
               would hang over the wrong layout, so reset it both ways. */
            var links = navbar.querySelector('.nav-links');
            var burger = navbar.querySelector('.mobile-menu-btn');
            if (links) links.classList.remove('active');
            if (burger) burger.classList.remove('active');

            var open = navbar.querySelector('.nav-dropdown.open');
            if (open) {
                open.classList.remove('open');
                var toggle = open.querySelector('.nav-dropdown-toggle');
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }
        };
        window.addEventListener('scroll', sync, { passive: true });
        sync();
    }

    function init() {
        /* Before the dropdown guard below: pages without a Tools menu still
           need the scrolled state. */
        initScrollState();

        var dropdowns = document.querySelectorAll('.nav-dropdown');
        if (!dropdowns.length) return;

        Array.prototype.forEach.call(dropdowns, function (dropdown) {
            var toggle = dropdown.querySelector('.nav-dropdown-toggle');
            if (!toggle) return;

            var open = function (isOpen) {
                dropdown.classList.toggle('open', isOpen);
                toggle.setAttribute('aria-expanded', String(isOpen));
            };

            toggle.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                open(!dropdown.classList.contains('open'));
            });

            // Click anywhere else closes it.
            document.addEventListener('click', function (e) {
                if (!dropdown.contains(e.target)) open(false);
            });

            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') open(false);
            });

            // Pointer users get hover-to-open; the click handler above still
            // works for touch, where hover never fires.
            if (window.matchMedia && window.matchMedia('(hover: hover) and (min-width: 769px)').matches) {
                dropdown.addEventListener('mouseenter', function () { open(true); });
                dropdown.addEventListener('mouseleave', function () { open(false); });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
