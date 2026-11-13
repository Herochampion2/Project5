const { verifyToken } = require('../auth');
const { HttpError } = require('../validate');

function requireAuth(db) {
  const findUser = db.prepare('SELECT id, name, email FROM users WHERE id = ?');
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const data = verifyToken(token);
    const user = data && findUser.get(data.sub);
    if (!user) return next(new HttpError(401, 'Authentication required'));
    req.user = user;
    next();
  };
}

module.exports = requireAuth;
