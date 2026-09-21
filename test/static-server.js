// Static-only test server: no credentials, backend imports, or production writes.
const express = require('express');
const path = require('node:path');
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.listen(3101, '127.0.0.1');
