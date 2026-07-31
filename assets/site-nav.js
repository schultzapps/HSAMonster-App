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

        /* If a page ever ships the class in its markup (e.g. to start
           collapsed), leave it alone rather than clearing it on load. */
        if (navbar.classList.contains('scrolled')) return;

        var sync = function () {
            var scrolled = window.scrollY > 50;
            if (scrolled === navbar.classList.contains('scrolled')) return;

            navbar.classList.toggle('scrolled', scrolled);

            /* The hamburger menu is deliberately left alone here. It expands
               the bar itself rather than floating over the page, so it stays
               valid across the threshold — and closing it on scroll made the
               menu impossible to scroll through on a phone, since dragging
               inside a menu taller than the screen moved the page too. */
            var open = navbar.querySelector('.nav-dropdown.open');
            if (open && !navbar.querySelector('.nav-links.active')) {
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
