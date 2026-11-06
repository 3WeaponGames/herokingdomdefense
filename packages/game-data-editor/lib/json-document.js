'use strict';

// A small JSON syntax tree lets value edits preserve untouched bytes, whitespace,
// number spellings and property order. It is not a second game-data format.
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const ak = Object.keys(a), bk = Object.keys(b);
    return ak.length === bk.length && ak.every(k => own(b, k) && equal(a[k], b[k]));
}
function parse(text) {
    let at = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const space = () => { while (/\s/.test(text[at] || '') && at < text.length) at++; };
    function string() {
        const start = at++;
        while (at < text.length) { const c = text[at++]; if (c === '\\') at++; else if (c === '"') return {start, end:at, value:JSON.parse(text.slice(start,at))}; }
        throw Error('Unterminated JSON string');
    }
    function value() {
        space(); const start = at, c = text[at];
        if (c === '"') return Object.assign(string(), {type:'string'});
        if (c === '{' || c === '[') {
            const object = c === '{', children = []; at++; space();
            const endChar = object ? '}' : ']';
            while (text[at] !== endChar) {
                space(); const itemStart = at; let key;
                if (object) { if (text[at] !== '"') throw Error('Invalid JSON key'); key=string(); space(); if(text[at++]!==':')throw Error('Expected colon'); }
                const node=value(); children.push({key:object?key.value:children.length,start:itemStart,end:node.end,node});
                space(); if(text[at]===endChar)break; if(text[at++]!==',')throw Error('Expected comma');
            }
            at++; return {type:object?'object':'array',start,end:at,children};
        }
        while(at<text.length&&!/[\s,\]}]/.test(text[at]))at++;
        if(at===start)throw Error('Invalid JSON value');
        return {type:'primitive',start,end:at,value:JSON.parse(text.slice(start,at))};
    }
    const tree=value();space();if(at!==text.length)throw Error('Unexpected JSON suffix');return tree;
}
function patch(text, before, after) {
    if(equal(before,after))return text;
    const tree=parse(text), eol=text.indexOf('\r\n')>=0?'\r\n':'\n';
    const match=/\r?\n([ \t]+)"/.exec(text), indent=match?match[1]:'  ';
    function encoded(value, depth) {
        const rendered=JSON.stringify(value,null,indent);
        if(rendered===undefined)throw Error('Undefined cannot be saved as JSON');
        return rendered.replace(/\n/g,eol+indent.repeat(depth));
    }
    function render(node,a,b,depth) {
        if(equal(a,b))return text.slice(node.start,node.end);
        const type=Array.isArray(b)?'array':b&&typeof b==='object'?'object':'primitive';
        if(node.type!==type || !a || typeof a!=='object')return encoded(b,depth);
        const keys=Object.keys(b), oldKeys=Object.keys(a);
        if(keys.length===oldKeys.length&&keys.every((k,i)=>k===oldKeys[i])) {
            let out='',cursor=node.start;
            node.children.forEach(child=>{out+=text.slice(cursor,child.node.start)+render(child.node,a[child.key],b[child.key],depth+1);cursor=child.node.end;});
            return out+text.slice(cursor,node.end);
        }
        const object=type==='object', open=object?'{':'[',close=object?'}':']';
        if(!keys.length)return open+close;
        const byKey=new Map(node.children.map(c=>[String(c.key),c]));
        const multiline=text.slice(node.start,node.end).indexOf('\n')>=0;
        const lead=multiline?eol+indent.repeat(depth+1):' ';
        const tail=multiline?eol+indent.repeat(depth):' ';
        const chunks=keys.map(k=>{
            const old=byKey.get(k);
            if(old) return text.slice(old.start,old.node.start)+render(old.node,a[k],b[k],depth+1);
            return (object?JSON.stringify(k)+': ':'')+encoded(b[k],depth+1);
        });
        return open+lead+chunks.join(','+lead)+tail+close;
    }
    const output=text.slice(0,tree.start)+render(tree,before,after,0)+text.slice(tree.end);
    if(!equal(JSON.parse(output.replace(/^\uFEFF/,'')),after))throw Error('JSON write verification failed');
    return output;
}
function diff(before,after,path,result) {
    path=path||[];result=result||[];
    if(equal(before,after))return result;
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&Array.isArray(before)===Array.isArray(after)&&(!Array.isArray(before)||before.length===after.length)) {
        const keys=Array.from(new Set(Object.keys(before).concat(Object.keys(after))));
        keys.forEach(k=>diff(before[k],after[k],path.concat(Array.isArray(after)?Number(k):k),result));
    } else result.push({path,before,after});
    return result;
}
module.exports={equal,parse,patch,diff};
