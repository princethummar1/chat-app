const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // 1. Get token from the 'x-auth-token' header
  const token = req.header('x-auth-token');

  // 2. Check if a token does not exist
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // 3. Verify the token if it exists
  try {
    // Decode the token using your secret key
    const decoded = jwt.verify(token, 'your_jwt_secret');
    
    // Attach the user's info from the token payload to the request object
    req.user = decoded.user;
    
    // Pass control to the next function in the chain (the route handler)
    next();
  } catch (err) {
    // If the token is not valid, send an error
    res.status(401).json({ msg: 'Token is not valid' });
  }
};