/**
 * Admin authentication middleware.
 * Checks if the user has an active admin session.
 * Redirects to login page if not authenticated.
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }
  return res.redirect('/admin/login');
}

module.exports = requireAdmin;
