export function meRoutes(app) {
  // Protected by `authenticate` (mounted on /api). Returns the current user
  // as loaded from the database by the authentication middleware.
  app.get("/api/me", (req, res) => {
    const user = req.user;
    res.status(200).json({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    });
  });
}
