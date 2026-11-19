'use strict';
// Runs in system Node >=22.13; Creator's bundled Node predates node:sqlite.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function readRows(db) {
  const rows = db.prepare('SELECT key, value FROM data ORDER BY key').all().map(row => [row.key, row.value]);
  if (rows.some(row => row.some(value => typeof value !== 'string'))) throw Error('Unsupported Simulator save format. No data was changed.');
  return rows;
}
function operate(request, dependencies) {
  const DatabaseSync = dependencies && dependencies.DatabaseSync || require('node:sqlite').DatabaseSync;
  if (!['inspect', 'reset'].includes(request.action)) throw Error('Unknown Simulator save action.');
  const file = path.resolve(request.file);
  if (!path.isAbsolute(request.file) || path.basename(file).toLowerCase() !== 'jsb.sqlite' || fs.realpathSync(file).toLowerCase() !== file.toLowerCase()) throw Error('Choose the Simulator jsb.sqlite save file directly.');
  if (!Array.isArray(request.prefixes) || !request.prefixes.length || request.prefixes.some(value => typeof value !== 'string' || !value)) throw Error('Missing game save namespace.');
  const header = Buffer.alloc(16), descriptor = fs.openSync(file, 'r');
  try { fs.readSync(descriptor, header, 0, 16, 0); } finally { fs.closeSync(descriptor); }
  if (header.toString() !== 'SQLite format 3\0') throw Error('This is not a Simulator SQLite save.');
  const db = new DatabaseSync(file, {readOnly:request.action === 'inspect', timeout:1000});
  let transaction = false;
  try {
    if (request.action === 'reset') { db.exec('BEGIN IMMEDIATE'); transaction = true; }
    const storage = readRows(db), revision = hash(JSON.stringify(storage));
    const progress = storage.filter(row => request.prefixes.some(prefix => row[0].startsWith(prefix)));
    const state = {file, revision, records:progress.length, total:storage.length};
    if (request.action === 'inspect') return state;
    if (request.confirm !== 'RESET' || revision !== request.revision) throw Error('The Simulator save changed. Refresh and review the reset again.');
    if (!progress.length) { db.exec('ROLLBACK'); transaction = false; return Object.assign(state, {removed:0,message:'This Simulator player is already at the beginning.'}); }
    const directory = path.resolve(request.backupRoot);
    fs.mkdirSync(directory, {recursive:true});
    const backup = path.join(directory, 'simulator-player-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.json');
    const data = JSON.stringify({version:1,kind:'simulator-progress-backup',time:new Date().toISOString(),file,prefixes:request.prefixes,storage},null,2);
    fs.writeFileSync(backup,data,{flag:'wx'});
    if (fs.readFileSync(backup,'utf8') !== data) throw Error('Save backup verification failed.');
    const remove = db.prepare('DELETE FROM data WHERE key = ?');
    progress.forEach(row => remove.run(row[0]));
    db.exec('COMMIT'); transaction = false;
    return Object.assign(state,{removed:progress.length,backup,message:'Simulator progress reset. Press Play to start the tutorial and Stage 1.'});
  } finally { if (transaction) db.exec('ROLLBACK'); db.close(); }
}
if (require.main === module) {
  let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', part => input += part);
  process.stdin.on('end', () => {try {process.stdout.write(JSON.stringify({ok:true,value:operate(JSON.parse(input))}));} catch(error) {process.stdout.write(JSON.stringify({ok:false,error:error.message}));process.exitCode = 1;}});
}
module.exports = {operate};
