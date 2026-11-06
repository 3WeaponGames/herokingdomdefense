'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const files=fs.readdirSync(__dirname).filter(f=>/\.test\.js$/.test(f)).sort().map(file=>path.join(__dirname,file));
files.push(path.join(__dirname,'../testing/client.test.js'));
for(const file of files){const result=cp.spawnSync(process.execPath,[file],{stdio:'inherit'});if(result.status!==0){process.exitCode=result.status||1;break;}}
