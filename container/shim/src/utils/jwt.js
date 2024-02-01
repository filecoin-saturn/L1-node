import jwt from "jsonwebtoken";

export function findJWT(req) {
  const jwtQuery = req.variables.arg_jwt;

  let jwtHeader = "";
  const authHeader = req.variables.http_authorization;
  if (authHeader) {
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
