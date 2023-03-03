const fs = require("fs");
const crypto = require("crypto");

const badbits = {};
const data = JSON.parse(fs.readFileSync("/etc/nginx/denylist.json"));

data.forEach((entry) => (badbits[entry.anchor] = true));

function filterCID(req) {
	const vars = req.variables;
	const cid = vars.cid_path.split("/")[2];

	const hashedCID = crypto.createHash("sha256").update(cid).digest("hex");
	req.log(cid);
	req.log(hashedCID);

	if (badbits[hashedCID]) {
		req.return(403);
	} else {
		req.return(200);
	}
}

export default { filterCID };
