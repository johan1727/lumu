const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './e2e', testMatch: 'local-ui.spec.js', workers: 1, reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:3101', serviceWorkers: 'block' },
    projects: [
        { name: 'desktop-local', use: { ...devices['Desktop Chrome'], viewport:{width:1440,height:900} } },
        { name: 'mobile-local', use: { ...devices['Pixel 5'], viewport:{width:375,height:812}, deviceScaleFactor:1 } },
        { name:'tablet-local',use:{...devices['Desktop Chrome'],viewport:{width:768,height:1024}} }
    ],
    webServer: { command: 'node test/static-server.js', url: 'http://127.0.0.1:3101', reuseExistingServer: false }
});
