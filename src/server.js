const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
if (process.env.NODE_ENV === 'production' && !process.env.TOKEN_SECRET) {
  console.error('TOKEN_SECRET must be set in production.');
  process.exit(1);
}
createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`TaskFlow running at http://localhost:${PORT}`);
});
