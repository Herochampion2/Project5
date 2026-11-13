const { openDatabase } = require('./db');
const { ran } = openDatabase();
console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date.');
