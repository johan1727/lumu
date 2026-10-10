(function () {
    'use strict';

    const CONSENT_KEY = 'lumu_cookies';
    let settingsPromise;
    let measurementId = '';
    let clarityProjectId = '';
    let googleLoaded = false;
    let clarityLoaded = false;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

    function getConsent() {
        try { return localStorage.getItem(CONSENT_KEY); }
        catch { return null; }
    }

    function loadGoogleAnalytics() {
        if (googleLoaded || !measurementId || getConsent() !== 'accepted') return;
        googleLoaded = true;
        window.gtag('js', new Date());
        window.gtag('consent', 'update', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'granted',
            personalization_storage: 'denied'
        });
        window.gtag('config', measurementId, { send_page_view: true, anonymize_ip: true });

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
        document.head.appendChild(script);
    }

    function loadClarity() {
        if (clarityLoaded || !clarityProjectId || getConsent() !== 'accepted') return;
        clarityLoaded = true;
        window.clarity = window.clarity || function () {
            (window.clarity.q = window.clarity.q || []).push(arguments);
        };
        window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityProjectId)}`;
        document.head.appendChild(script);
    }

    function loadIntegrations() {
        if (getConsent() !== 'accepted') return;
        if (!settingsPromise) {
            settingsPromise = fetch('/api/config', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
                .then((response) => response.ok ? response.json() : {})
                .then((config) => {
                    measurementId = /^G-[A-Z0-9]+$/.test(String(config.googleAnalyticsId || '')) ? config.googleAnalyticsId : '';
                    clarityProjectId = /^[a-z0-9]{6,16}$/i.test(String(config.clarityProjectId || '')) ? config.clarityProjectId : '';
                    loadGoogleAnalytics();
                    loadClarity();
                })
                .catch(() => {});
        }
        return settingsPromise;
    }

    window.updateAnalyticsConsent = function (accepted) {
        if (accepted) {
            return loadIntegrations();
        }
        if (googleLoaded) {
            window.gtag('consent', 'update', {
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                analytics_storage: 'denied',
                personalization_storage: 'denied'
            });
        }
        if (clarityLoaded && typeof window.clarity === 'function') {
            window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
        }
    };

    function addConsentBanner() {
        if (document.getElementById('cookie-banner') || document.getElementById('lumu-analytics-consent') || getConsent()) return;

        const english = String(document.documentElement.lang || '').toLowerCase().startsWith('en');
        const banner = document.createElement('section');
        banner.id = 'lumu-analytics-consent';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', english ? 'Privacy choices' : 'Preferencias de privacidad');
        banner.style.cssText = 'position:fixed;z-index:99999;inset:auto 16px 16px 16px;margin:auto;max-width:760px;padding:16px 20px;background:#fff;border:1px solid #dbe5e1;border-radius:18px;box-shadow:0 12px 40px rgba(15,23,42,.2);font:14px/1.5 system-ui,sans-serif;color:#334155';

        const copy = document.createElement('p');
        copy.style.cssText = 'margin:0 0 12px';
        copy.textContent = english
            ? 'Lumu uses optional analytics to improve price comparisons. They stay off unless you allow them.'
            : 'Lumu usa analítica opcional para mejorar las comparaciones. Permanece desactivada si no la aceptas.';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap';
        const makeButton = (label, accepted, primary) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.style.cssText = `min-height:40px;padding:8px 14px;border:1px solid ${primary ? '#047857' : '#cbd5e1'};border-radius:10px;background:${primary ? '#047857' : '#fff'};color:${primary ? '#fff' : '#334155'};font:600 14px system-ui,sans-serif;cursor:pointer`;
            button.addEventListener('click', () => {
                try { localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'rejected'); } catch {}
                banner.remove();
                window.updateAnalyticsConsent(accepted);
            });
            return button;
        };
        const policy = document.createElement('a');
        policy.href = english ? '/privacy.html' : '/privacidad.html';
        policy.textContent = english ? 'Privacy policy' : 'Política de privacidad';
        policy.style.cssText = 'color:#047857;text-decoration:underline;margin-left:auto';

        actions.append(
            makeButton(english ? 'Accept analytics' : 'Aceptar analítica', true, true),
            makeButton(english ? 'Reject' : 'Rechazar', false, false),
            policy
        );
        banner.append(copy, actions);
        document.body.appendChild(banner);
    }

    window.openLumuCookieSettings = function () {
        window.updateAnalyticsConsent(false);
        try { localStorage.removeItem(CONSENT_KEY); } catch {}
        const appBanner = document.getElementById('cookie-banner');
        if (appBanner) {
            appBanner.classList.remove('cookie-banner-hidden');
            document.body.classList.add('cookie-banner-visible');
            return;
        }
        document.getElementById('lumu-analytics-consent')?.remove();
        addConsentBanner();
    };

    if (getConsent() === 'accepted') loadIntegrations();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addConsentBanner, { once: true });
    else addConsentBanner();
})();
