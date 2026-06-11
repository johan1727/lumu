-- Migration: annual billing rows for plan_prices
-- Pricing convention: 10x monthly (2 months free vs paying monthly).
-- NOTE: verify these amounts match the Stripe annual payment links
-- (personal_vip_annual / b2b_annual) before promoting the annual plan in UI.

INSERT INTO plan_prices (plan_code, country_code, currency, amount, billing_period, is_active)
VALUES
    ('personal_vip', 'MX', 'MXN', 390.00,    'year', true),
    ('personal_vip', 'US', 'USD', 39.99,     'year', true),
    ('personal_vip', 'CL', 'CLP', 39000.00,  'year', true),
    ('personal_vip', 'CO', 'COP', 159000.00, 'year', true),
    ('personal_vip', 'AR', 'ARS', 49000.00,  'year', true),
    ('personal_vip', 'PE', 'PEN', 149.00,    'year', true),
    ('b2b',          'MX', 'MXN', 1990.00,   'year', true),
    ('b2b',          'US', 'USD', 199.00,    'year', true),
    ('b2b',          'CL', 'CLP', 199000.00, 'year', true),
    ('b2b',          'CO', 'COP', 799000.00, 'year', true),
    ('b2b',          'AR', 'ARS', 249000.00, 'year', true),
    ('b2b',          'PE', 'PEN', 799.00,    'year', true)
ON CONFLICT DO NOTHING;
