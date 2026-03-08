const bcrypt = require("bcryptjs");

const plainPassword = "12345";   // change if you want
const hash = bcrypt.hashSync(plainPassword, 10);

console.log(hash);
