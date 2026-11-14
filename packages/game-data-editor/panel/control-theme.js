'use strict';
const fs=require('fs'),path=require('path'),style=fs.readFileSync(path.join(__dirname,'control-theme.css'),'utf8');
module.exports=css=>css+'\n'+style;
module.exports.style=style;
