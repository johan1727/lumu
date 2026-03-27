import { mountDottedSurface } from './dottedSurface';

declare global {
    interface Window {
        __LUMU_UI_CLEANUP__?: (() => void) | null;
    }
}

function mountHomeScrollReveal() {
    const body = document.body;
    if (!body.classList.contains('page-home')) return () => { };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => { };

    const targets = Array.from(document.querySelectorAll<HTMLElement>([
        'main > section',
        '#seo-guides-section',
        '#seo-guides-section .grid > a',
        '#seo-guides-section .mt-10.rounded-3xl'
    ].join(', ')));

    if (!targets.length) return () => { };

    targets.forEach((element, index) => {
        element.classList.add('scroll-reveal');
        element.style.transitionDelay = `${Math.min(index * 45, 220)}ms`;
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.14,
        rootMargin: '0px 0px -8% 0px'
    });

    targets.forEach((element) => observer.observe(element));

    return () => {
        observer.disconnect();
        targets.forEach((element) => {
            element.classList.remove('scroll-reveal', 'is-visible');
            element.style.removeProperty('transition-delay');
        });
    };
}

function safeMount() {
    try {
        const container = document.getElementById('bg-dotted-surface');

        if (window.__LUMU_UI_CLEANUP__) {
            try {
                window.__LUMU_UI_CLEANUP__();
            } catch { }
        }

        const cleanups: Array<() => void> = [];

        if (container) {
            cleanups.push(mountDottedSurface({ container }));
        }

        cleanups.push(mountHomeScrollReveal());

        window.__LUMU_UI_CLEANUP__ = () => {
            cleanups.forEach((cleanup) => {
                try {
                    cleanup();
                } catch { }
            });
        };
    } catch { }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeMount);
} else {
    safeMount();
}
