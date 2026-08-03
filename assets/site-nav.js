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

    /* Tapping the page outside the bar closes the hamburger menu. The open
       drawer covers a good part of a phone screen, and without this the only
       way out is the hamburger itself.

       Each page's inline script owns the hamburger toggle; this only ever
       removes the classes, so the two don't fight. */
    function initDismissOnOutsideClick() {
        var navbar = document.querySelector('.navbar');
        if (!navbar) return;

        var links = navbar.querySelector('.nav-links');
        var button = navbar.querySelector('.mobile-menu-btn');
        if (!links || !button) return;

        var close = function () {
            links.classList.remove('active');
            button.classList.remove('active');
            /* An open Tools accordion inside the drawer would otherwise still
               be expanded the next time the menu opens. */
            var open = navbar.querySelector('.nav-dropdown.open');
            if (open) {
                open.classList.remove('open');
                var toggle = open.querySelector('.nav-dropdown-toggle');
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }
        };

        /* The whole navbar is excluded, not just the drawer: the hamburger
           sits outside .nav-links, so testing against the drawer alone would
           catch the button's own click as it bubbles and close the menu in the
           same gesture that opened it. */
        document.addEventListener('click', function (e) {
            if (!links.classList.contains('active')) return;
            if (navbar.contains(e.target)) return;
            close();
        });

        /* Safari on iOS doesn't emit click for taps on non-interactive
           elements, so a tap on plain page content would never dismiss it. */
        document.addEventListener('touchend', function (e) {
            if (!links.classList.contains('active')) return;
            if (navbar.contains(e.target)) return;
            close();
        }, { passive: true });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && links.classList.contains('active')) close();
        });
    }

    function init() {
        /* Before the dropdown guard below: pages without a Tools menu still
           need the scrolled state. */
        initScrollState();
        initDismissOnOutsideClick();

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
