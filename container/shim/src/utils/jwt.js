import jwt from "jsonwebtoken";

function findJWT(req) {
  const jwtQuery = req.query.jwt;

  let jwtHeader = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    jwtHeader = authHeader.replace("Bearer ", "");
  }

  return jwtQuery || jwtHeader;
}

export function getKnownPeers(req) {
  const reqJwt = findJWT(req);
  if (reqJwt) {
    const jwtObject = jwt.decode(reqJwt);
    const knownPeers = jwtObject.knownPeers;
    return knownPeers;
  }
  return null;
}
