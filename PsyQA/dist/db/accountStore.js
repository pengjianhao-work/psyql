"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAllAccountsFromDb = readAllAccountsFromDb;
exports.writeAllAccountsToDb = writeAllAccountsToDb;
exports.upsertAccountInDb = upsertAccountInDb;
const database_1 = require("./database");
function readAllAccountsFromDb() {
    const rows = (0, database_1.getDb)().prepare('SELECT data_json, password_hash FROM accounts').all();
    return rows.map((r) => {
        const partial = JSON.parse(r.data_json);
        return Object.assign(Object.assign({}, partial), { passwordHash: r.password_hash });
    });
}
function writeAllAccountsToDb(users) {
    const db = (0, database_1.getDb)();
    const tx = db.transaction((list) => {
        db.prepare('DELETE FROM accounts').run();
        const insert = db.prepare('INSERT INTO accounts(id, username, password_hash, data_json, created_at) VALUES(?, ?, ?, ?, ?)');
        for (const u of list) {
            const { passwordHash } = u, rest = __rest(u, ["passwordHash"]);
            insert.run(u.id, u.username, passwordHash, JSON.stringify(rest), u.createdAt);
        }
    });
    tx(users);
}
function upsertAccountInDb(user) {
    const { passwordHash } = user, rest = __rest(user, ["passwordHash"]);
    (0, database_1.getDb)()
        .prepare(`INSERT INTO accounts(id, username, password_hash, data_json, created_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         password_hash = excluded.password_hash,
         data_json = excluded.data_json`)
        .run(user.id, user.username, passwordHash, JSON.stringify(rest), user.createdAt);
}
